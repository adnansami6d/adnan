/* ==========================================================
   Game Bazz - গেম পেজ (home.js)

   মূল নিয়ম:
   ১. চাল ও ডাইসের লাইভ যোগাযোগ PeerJS দিয়ে (দ্রুত)।
   ২. Firebase শুধু ব্যাকআপ: খেলার অবস্থা সেভ ও ফিরে এসে রিস্টোর।
   ৩. "হোস্ট" শুধু নেটওয়ার্কের দায়িত্ব (কে PeerJS আইডি ধরে আছে)।
      গুটির রঙ (লাল/হলুদ) আলাদা, প্লেয়ারের নামে Firebase-এ বাঁধা।
      তাই হোস্ট বদলালেও কারও রঙ বদলায় না।
   ৪. শুধু যার চাল সেই ডিভাইস সিদ্ধান্ত নেয়; অন্যজন শুধু দেখে ও
      প্রতিটি ধাপের শেষে পাঠানো স্ন্যাপশট (STATE) দিয়ে নিজেকে মেলায়।
      এতে "চাল আটকে যাওয়া" সমস্যা হয় না।
   ========================================================== */

/* ==========================================================
   ১. কনফিগারেশন
   ========================================================== */
const FIREBASE_PROJECT_ID = 'tournament-2d6d4';
// ⚠️ index.js-এর মতো এখানেও আপনার সম্পূর্ণ API Key বসান
const FIREBASE_API_KEY = 'AIzaSyCNvnJsIn4-oKHLVv7-oNHCTskjE8';

const PEER_PREFIX = 'gamebazz-';
const INDEX_PAGE = 'index.html';

// localStorage-এর কী (index.js-এর সাথে মিল)
const LS_SESSIONS = 'gamebazz_sessions';
const LS_CURRENT = 'gamebazz_current';
const LS_PID = 'gamebazz_pid';           // এই ডিভাইসের প্লেয়ার পরিচয়

const SEAT_STALE_MS = 60000;             // এর বেশি অফলাইন থাকলে জায়গা অন্য কেউ নিতে পারবে
const SEAT_HEARTBEAT_MS = 20000;         // "আমি আছি" সংকেত
const PING_INTERVAL_MS = 4000;
const DEAD_AFTER_MS = 14000;             // এতক্ষণ কিছু না এলে সংযোগ মৃত ধরা হবে

const DOCS_ROOT = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const API_BASE = `https://firestore.googleapis.com/v1/${DOCS_ROOT}`;

/* ==========================================================
   ২. ছোট সাহায্যকারী ফাংশন
   ========================================================== */
const $ = (id) => document.getElementById(id);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* উপেক্ষা */ } }
function lsRemove(key) { try { localStorage.removeItem(key); } catch (e) { /* উপেক্ষা */ } }

function getSessions() {
    try { return JSON.parse(lsGet(LS_SESSIONS)) || {}; } catch (e) { return {}; }
}

function djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

// এই ডিভাইসের স্থায়ী প্লেয়ার আইডি (রঙ এর সাথেই বাঁধা থাকে)
function getMyPid() {
    let p = lsGet(LS_PID);
    if (!p) {
        p = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        lsSet(LS_PID, p);
    }
    return p;
}

function toast(message, type = '') {
    const box = $('toast-container');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' toast-' + type : '');
    t.textContent = message;
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 2800);
}

function colorName(c) { return c === 'red' ? 'লাল (Red)' : 'হলুদ (Yellow)'; }
function colorShort(c) { return c === 'red' ? 'লাল' : 'হলুদ'; }
function otherOf(c) { return c === 'red' ? 'yellow' : 'red'; }

/* ==========================================================
   ৩. Firestore REST
   ========================================================== */
async function fsRequest(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${API_BASE}${path}${sep}key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* খালি রেসপন্স */ }
    if (!res.ok) {
        const err = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        err.status = res.status;
        err.fsStatus = data && data.error && data.error.status;
        throw err;
    }
    return data;
}

function readField(field) {
    if (!field) return undefined;
    if ('stringValue' in field) return field.stringValue;
    if ('integerValue' in field) return Number(field.integerValue);
    if ('doubleValue' in field) return Number(field.doubleValue);
    if ('booleanValue' in field) return field.booleanValue;
    if ('timestampValue' in field) return field.timestampValue;
    return undefined;
}

function toFsValue(v) {
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return { integerValue: String(Math.round(v)) };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    return { nullValue: null };
}

// রুমের ডকুমেন্ট পড়া
async function fetchRoom() {
    const d = await fsRequest('GET', `/rooms/${roomId}`);
    const f = d.fields || {};
    return {
        updateTime: d.updateTime,
        roomName: readField(f.roomName) || '',
        status: readField(f.status) || 'waiting',
        redPid: readField(f.redPid) || '',
        yellowPid: readField(f.yellowPid) || '',
        redSeen: Number(readField(f.redSeen) || 0),
        yellowSeen: Number(readField(f.yellowSeen) || 0),
        gameState: readField(f.gameState) || ''
    };
}

// ডকুমেন্টের নির্দিষ্ট কিছু ফিল্ড আপডেট (বাকিগুলো অক্ষত থাকে)
function patchRoom(values, updateTime) {
    const keys = Object.keys(values);
    const mask = keys.map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    // রুম মুছে গেলে যেন নতুন করে তৈরি না হয়
    const pre = updateTime
        ? '&currentDocument.updateTime=' + encodeURIComponent(updateTime)
        : '&currentDocument.exists=true';
    const fields = {};
    keys.forEach((k) => { fields[k] = toFsValue(values[k]); });
    return fsRequest('PATCH', `/rooms/${roomId}?${mask}${pre}`, { fields });
}

function friendlyError(err) {
    if (err.status === 400) return 'API Key ঠিক নেই বা অসম্পূর্ণ। home.js-এ Key যাচাই করুন।';
    if (err.status === 403) return 'Firebase অনুমতি দিচ্ছে না। Firestore Rules চেক করুন।';
    if (err instanceof TypeError) return 'ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।';
    return 'সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।';
}

/* ==========================================================
   ৪. সাউন্ড (আগের মতোই)
   ========================================================== */
const soundDiceRoll = new Audio('dice-roll.mp3');
const soundSix = new Audio('six.mp3');
const soundMove = new Audio('move.mp3');
const eatSounds = [
    new Audio('eat1.mp3'),
    new Audio('eat2.mp3')
];
const soundHome = new Audio('home.mp3');
const soundWin = new Audio('win.mp3');
const allSounds = [soundDiceRoll, soundSix, soundMove, soundHome, soundWin, ...eatSounds];
allSounds.forEach((a) => { try { a.preload = 'auto'; } catch (e) { /* উপেক্ষা */ } });

function playAudio(audio, maxDurationMs = null) {
    if (audio) {
        audio._busyUntil = Date.now() + 1500;
        audio.muted = false;
        audio.currentTime = 0;
        audio.play().catch(e => console.log("Audio play error:", e));

        if (maxDurationMs) {
            setTimeout(() => {
                audio.pause();
                audio.currentTime = 0;
            }, maxDurationMs);
        }
    }
}

// মোবাইল ব্রাউজারে প্রথম ট্যাপে সাউন্ড "আনলক" করা, যাতে অন্যের চালের সাউন্ডও বাজে
function setupAudioUnlock() {
    const unlock = () => {
        allSounds.forEach((a) => {
            try {
                a.muted = true;
                const p = a.play();
                if (p && p.then) {
                    p.then(() => {
                        if (Date.now() < (a._busyUntil || 0)) { a.muted = false; return; }
                        a.pause(); a.currentTime = 0; a.muted = false;
                    }).catch(() => { a.muted = false; });
                } else {
                    a.pause(); a.muted = false;
                }
            } catch (e) { a.muted = false; }
        });
    };
    document.addEventListener('pointerdown', unlock, { once: true });
}

/* ==========================================================
   ৫. বোর্ডের তথ্য ও গেমের অবস্থা
   ========================================================== */
const SAFE_CELLS = [22, 93, 122, 187, 204, 133, 104, 39];

const PATHS = {
    red: [
        22, 37, 52, 67, 82, 96, 95, 94, 93, 92, 91, 106, 121, 122, 123, 124, 125, 126,
        142, 157, 172, 187, 202, 217, 218, 219, 204, 189, 174, 159, 144, 130, 131, 132,
        133, 134, 135, 120, 105, 104, 103, 102, 101, 100, 84, 69, 54, 39, 24, 9, 8, 23,
        38, 53, 68, 83, 'home-bottom'
    ],
    yellow: [
        204, 189, 174, 159, 144, 130, 131, 132, 133, 134, 135, 120, 105, 104, 103, 102,
        101, 100, 84, 69, 54, 39, 24, 9, 8, 7, 22, 37, 52, 67, 82, 96, 95, 94, 93, 92, 91,
        106, 121, 122, 123, 124, 125, 126, 142, 157, 172, 187, 202, 217, 218, 203, 188, 173, 158, 143, 'home-top'
    ]
};

let currentPlayer = 'red';
let diceValue = 0;
let hasRolled = false;
let isMoving = false;
let movingSince = 0;
let busyUntil = 0;             // ডাইস অ্যানিমেশন চলার সময়
let consecutiveSixes = 0;
let winner = null;             // 'red' | 'yellow' | null
let epoch = 1;                 // প্রতিটি রিসেটে বাড়ে
let stateV = 0;                // প্রতিটি স্ন্যাপশটে বাড়ে

const tokens = {
    'red-1': { color: 'red', pathIndex: -1, isFinished: false, initialParent: null },
    'red-2': { color: 'red', pathIndex: -1, isFinished: false, initialParent: null },
    'red-3': { color: 'red', pathIndex: -1, isFinished: false, initialParent: null },
    'red-4': { color: 'red', pathIndex: -1, isFinished: false, initialParent: null },
    'yellow-1': { color: 'yellow', pathIndex: -1, isFinished: false, initialParent: null },
    'yellow-2': { color: 'yellow', pathIndex: -1, isFinished: false, initialParent: null },
    'yellow-3': { color: 'yellow', pathIndex: -1, isFinished: false, initialParent: null },
    'yellow-4': { color: 'yellow', pathIndex: -1, isFinished: false, initialParent: null }
};

const playerLuckPenalty = { red: 0, yellow: 0 };
const playerSixCounts = { red: 0, yellow: 0 };

// রুম ও প্লেয়ারের তথ্য
let roomId = null;
let roomName = '';
let myPid = null;
let myColor = null;
let seatReady = false;
let evicted = false;

/* ==========================================================
   ৬. গুটি বসানো ও সাজানো (এক ঘরে একাধিক গুটি)
   ========================================================== */

// ঘরের (বা ত্রিভুজের) গুটিগুলোকে data-count ও data-slot দিয়ে সাজানো
function arrangeContainer(el) {
    if (!el) return;
    const isCell = el.classList.contains('cell');
    const isTri = el.classList.contains('triangle');
    const toks = Array.from(el.children).filter((c) => c.classList.contains('token'));

    if (!isCell && !isTri) {
        // বেস বক্স: গ্রিড নিজেই সাজায়
        toks.forEach((t) => t.removeAttribute('data-slot'));
        return;
    }
    if (isTri) {
        toks.forEach((t, i) => t.setAttribute('data-slot', i));
        return;
    }
    if (toks.length <= 1) {
        el.removeAttribute('data-count');
        toks.forEach((t) => t.removeAttribute('data-slot'));
        return;
    }
    el.setAttribute('data-count', Math.min(toks.length, 5));
    toks.forEach((t, i) => t.setAttribute('data-slot', i));
}

function arrangeAll() {
    document.querySelectorAll('.cell, .triangle').forEach(arrangeContainer);
}

function moveTokenToCell(tokenId, cellIdentifier) {
    const tokenElem = document.getElementById(tokenId);
    let targetElem;

    if (typeof cellIdentifier === 'number') {
        targetElem = document.getElementById(`cell-${cellIdentifier}`);
    } else {
        targetElem = document.getElementById(cellIdentifier);
    }

    if (targetElem && tokenElem) {
        const oldParent = tokenElem.parentElement;
        tokenElem.removeAttribute('data-slot');
        targetElem.appendChild(tokenElem);
        arrangeContainer(oldParent);
        arrangeContainer(targetElem);
    }
}

function sendTokenToBase(tokenId) {
    const tokenElem = document.getElementById(tokenId);
    const t = tokens[tokenId];
    if (tokenElem && t && t.initialParent) {
        const oldParent = tokenElem.parentElement;
        tokenElem.removeAttribute('data-slot');
        t.initialParent.appendChild(tokenElem);
        arrangeContainer(oldParent);
    }
}

// স্ন্যাপশট অনুযায়ী সব গুটি বসানো (অ্যানিমেশন ছাড়া)
function renderTokens() {
    Object.keys(tokens).forEach((id) => {
        const t = tokens[id];
        const el = document.getElementById(id);
        if (!el) return;
        el.removeAttribute('data-slot');
        if (t.pathIndex === -1) {
            if (t.initialParent) t.initialParent.appendChild(el);
        } else {
            const cell = PATHS[t.color][t.pathIndex];
            const target = typeof cell === 'number' ? $('cell-' + cell) : $(cell);
            if (target) target.appendChild(el);
        }
    });
    arrangeAll();
}

function setTokensBounce(tokenIds, shouldActive) {
    Object.keys(tokens).forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.classList.remove('active-turn');
            elem.style.animation = "";
        }
    });

    if (shouldActive) {
        tokenIds.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) {
                elem.classList.add('active-turn');
                elem.style.animation = "bounce 0.5s infinite alternate";
            }
        });
    }
}

function getMoveableTokens() {
    const playerTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && !tokens[id].isFinished);

    return playerTokens.filter(id => {
        const token = tokens[id];
        if (token.pathIndex === -1) {
            return diceValue === 6;
        }
        const newIndex = token.pathIndex + diceValue;
        return newIndex < PATHS[currentPlayer].length;
    });
}

function allFinished(color) {
    return Object.keys(tokens)
        .filter((id) => tokens[id].color === color)
        .every((id) => tokens[id].isFinished);
}

/* ==========================================================
   ৭. স্মার্ট ডাইস (আগের মতোই)
   ========================================================== */
function getWeightedRandom(targetValue, probability, penalty = 0) {
    let finalProbability = Math.max(0.01, probability - penalty);

    if (Math.random() < finalProbability) {
        if (Array.isArray(targetValue)) {
            return targetValue[Math.floor(Math.random() * targetValue.length)];
        }
        return targetValue;
    } else {
        const targets = Array.isArray(targetValue) ? targetValue : [targetValue];
        const remainingValues = [1, 2, 3, 4, 5, 6].filter(val => !targets.includes(val));
        return remainingValues[Math.floor(Math.random() * remainingValues.length)];
    }
}

function generateSmartDiceValue() {
    const opponent = currentPlayer === 'red' ? 'yellow' : 'red';
    const playerPenalty = playerLuckPenalty[currentPlayer] || 0;

    if (consecutiveSixes >= 2) {
        return Math.floor(Math.random() * 5) + 1;
    }

    const myTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && !tokens[id].isFinished);
    const opponentTokens = Object.keys(tokens).filter(id => tokens[id].color === opponent && !tokens[id].isFinished);

    let canEatOpponent = false;
    let eatDistance = 0;

    for (const myId of myTokens) {
        const myToken = tokens[myId];
        if (myToken.pathIndex === -1) continue;

        const myCell = PATHS[currentPlayer][myToken.pathIndex];
        if (typeof myCell !== 'number') continue;

        for (const oppId of opponentTokens) {
            const oppToken = tokens[oppId];
            if (oppToken.pathIndex === -1) continue;

            const oppCell = PATHS[opponent][oppToken.pathIndex];
            if (SAFE_CELLS.includes(oppCell) || typeof oppCell !== 'number') continue;

            for (let dist = 1; dist <= 6; dist++) {
                const targetIndex = myToken.pathIndex + dist;
                if (targetIndex < PATHS[currentPlayer].length) {
                    if (PATHS[currentPlayer][targetIndex] === oppCell) {
                        canEatOpponent = true;
                        eatDistance = dist;
                        break;
                    }
                }
            }
            if (canEatOpponent) break;
        }
        if (canEatOpponent) break;
    }

    if (canEatOpponent) {
        return getWeightedRandom(eatDistance, 0.40, playerPenalty);
    }

    const allInBase = myTokens.every(id => tokens[id].pathIndex === -1);
    if (allInBase) {
        return getWeightedRandom(6, 0.60, playerPenalty);
    }

    for (const id of myTokens) {
        const token = tokens[id];
        if (token.pathIndex >= 0) {
            const distanceToHome = (PATHS[currentPlayer].length - 1) - token.pathIndex;
            if (distanceToHome === 1 || distanceToHome === 2) {
                return getWeightedRandom(distanceToHome, 0.50, playerPenalty);
            }
        }
    }

    const myActiveTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && tokens[id].pathIndex > -1).length;
    const oppActiveTokens = Object.keys(tokens).filter(id => tokens[id].color === opponent && tokens[id].pathIndex > -1).length;

    if (myActiveTokens > oppActiveTokens) {
        if (Math.random() < Math.max(0.01, 0.08 - playerPenalty)) {
            const goodValues = [4, 5, 6];
            return goodValues[Math.floor(Math.random() * goodValues.length)];
        }
    }

    const mySixes = playerSixCounts[currentPlayer] || 0;
    const oppSixes = playerSixCounts[opponent] || 0;

    let sixProbability = 0.05;

    if (oppSixes - mySixes >= 2) {
        sixProbability = 0.90;
    }

    if (Math.random() < Math.max(0.01, sixProbability - playerPenalty)) {
        return 6;
    }

    return Math.floor(Math.random() * 6) + 1;
}

/* ==========================================================
   ৮. ডাইস দেখানো ও গড়ানো (3D অ্যানিমেশন)
   ========================================================== */
function diceIdFor(color) {
    return color === 'red' ? 'dice-bottom-left' : 'dice-top-right';
}

const DICE_ROT = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };

// গড়ানো ছাড়াই ডাইসের নির্দিষ্ট পিঠ দেখানো (রিস্টোরের সময়)
function showDiceFace(diceId, value) {
    const d = $(diceId);
    const cube = d ? d.querySelector('.cube') : null;
    const rot = DICE_ROT[value];
    if (!cube || !rot) return;
    cube.style.transition = 'none';
    cube.style.transform = `rotateX(${rot[0]}deg) rotateY(${rot[1]}deg)`;
    void cube.offsetWidth;
    cube.style.transition = '';
}

function updateDiceBouncing() {
    const redDice = $('dice-bottom-left');
    const yellowDice = $('dice-top-right');

    if (redDice) redDice.style.animation = "";
    if (yellowDice) yellowDice.style.animation = "";

    if (!hasRolled && !isMoving && !winner) {
        if (currentPlayer === 'red' && redDice) {
            redDice.style.animation = "bounce 0.6s infinite alternate";
        } else if (currentPlayer === 'yellow' && yellowDice) {
            yellowDice.style.animation = "bounce 0.6s infinite alternate";
        }
    }
}

function updateDiceControls() {
    const redDice = $('dice-bottom-left');
    const yellowDice = $('dice-top-right');
    if (!redDice || !yellowDice) return;

    const set = (dice, isTurn, isMine) => {
        dice.style.opacity = isTurn ? '1' : '0.4';
        dice.style.pointerEvents = (isTurn && isMine && !winner) ? 'auto' : 'none';
    };
    set(redDice, currentPlayer === 'red', myColor === 'red');
    set(yellowDice, currentPlayer === 'yellow', myColor === 'yellow');

    updateDiceBouncing();
    updateTurnUi();
}

// শুধু যার চাল, সেই ডিভাইস নিজে ডাইস গড়ায়; অন্যজনের কাছে মান পাঠানো হয়
async function rollDice(diceId, remoteValue = null) {
    const isRemote = remoteValue !== null;

    if (!isRemote) {
        if (winner || !partnerConnected || !myColor) return;
        if (currentPlayer !== myColor) return;
        if (diceId !== diceIdFor(currentPlayer) || hasRolled || isMoving) return;
    } else {
        while (isMoving) {
            await delay(50);
        }
    }

    const myEp = epoch;
    const rollingDiceId = isRemote ? diceIdFor(currentPlayer) : diceId;
    const diceElement = $(rollingDiceId);
    const cube = diceElement ? diceElement.querySelector('.cube') : null;

    if (diceElement) diceElement.style.animation = "";
    playAudio(soundDiceRoll);

    if (isRemote) {
        diceValue = remoteValue;
    } else {
        diceValue = generateSmartDiceValue();
        sendMsg({ type: 'DICE', diceId: rollingDiceId, value: diceValue, ep: epoch });
    }

    hasRolled = true;
    busyUntil = Date.now() + 1600;

    if (diceValue === 6) {
        consecutiveSixes++;
        playerSixCounts[currentPlayer] = (playerSixCounts[currentPlayer] || 0) + 1;
    } else {
        consecutiveSixes = 0;
    }

    const xRotations = (Math.floor(Math.random() * 4) + 4) * 360;
    const yRotations = (Math.floor(Math.random() * 4) + 4) * 360;
    const rot = DICE_ROT[diceValue] || [0, 0];

    if (cube) {
        cube.style.transform = `rotateX(${xRotations + rot[0]}deg) rotateY(${yRotations + rot[1]}deg)`;
    }

    if (diceValue === 6) {
        playAudio(soundSix, 1900);
    }

    updateTurnUi();

    if (!isRemote) {
        // ১ সেকেন্ড পর (অ্যানিমেশন শেষে) যার চাল শুধু সেই সিদ্ধান্ত নেবে
        setTimeout(() => {
            if (epoch !== myEp) return;
            resolveRoll();
        }, 1000);
    } else {
        // অন্যজনের স্ক্রিনে শুধু দেখানোর জন্য গুটি হাইলাইট (কোনো সিদ্ধান্ত নয়)
        setTimeout(() => {
            if (epoch !== myEp || !hasRolled || isMoving) return;
            const mv = getMoveableTokens();
            if (mv.length) setTokensBounce(mv, true);
        }, 1000);
    }
}

// ডাইসের পর কী হবে: চালার মতো গুটি না থাকলে চাল শেষ/আবার চাল, ১টি থাকলে নিজে চলবে
async function resolveRoll() {
    if (!hasRolled || currentPlayer !== myColor || winner) return;
    const myEp = epoch;
    const moveable = getMoveableTokens();

    if (moveable.length === 0) {
        if (diceValue === 6) {
            hasRolled = false;
            updateDiceControls();
        } else {
            switchTurn();
        }
        sendState(true);
        return;
    }

    setTokensBounce(moveable, true);

    if (moveable.length === 1) {
        await delay(300);
        if (epoch !== myEp) return;
        await handleTokenClick(moveable[0]);
    } else {
        sendState(true); // একাধিক বিকল্প: অন্যজনকেও মিলিয়ে নিই
    }
}

function switchTurn() {
    currentPlayer = currentPlayer === 'red' ? 'yellow' : 'red';
    hasRolled = false;
    consecutiveSixes = 0;
    updateDiceControls();
}

/* ==========================================================
   ৯. গুটি চালা, খাওয়া ও অ্যানিমেশন
   ========================================================== */
function setupTokenEvents() {
    Object.keys(tokens).forEach(tokenId => {
        const tokenElem = document.getElementById(tokenId);
        if (tokenElem) {
            tokenElem.addEventListener('click', () => handleTokenClick(tokenId));
        }
    });
}

// নিজের গুটিতে ক্লিক (আগে যাচাই, তারপর অন্যজনকে জানানো - এটাই আটকে যাওয়ার একটি কারণ ছিল)
async function handleTokenClick(tokenId) {
    if (!hasRolled || isMoving || winner) return;
    if (currentPlayer !== myColor) return;

    const token = tokens[tokenId];
    if (!token || token.color !== currentPlayer || token.isFinished) return;
    if (!getMoveableTokens().includes(tokenId)) return;

    sendMsg({ type: 'MOVE', tokenId: tokenId, ep: epoch });
    await performMove(tokenId, false);
}

// অন্যজনের চাল (শুধু অ্যানিমেশন, সিদ্ধান্ত নয়)
async function remoteMove(tokenId) {
    while (isMoving) {
        await delay(50);
    }
    const token = tokens[tokenId];
    if (!token || token.color !== currentPlayer || token.isFinished || !hasRolled ||
        !getMoveableTokens().includes(tokenId)) {
        requestState();
        return;
    }
    await performMove(tokenId, true);
}

async function performMove(tokenId, isRemote) {
    const token = tokens[tokenId];
    const myEp = epoch;
    let getsAnotherTurn = false;

    isMoving = true;
    movingSince = Date.now();

    try {
        setTokensBounce(Object.keys(tokens), false);
        updateDiceBouncing();

        const color = token.color;
        const path = PATHS[color];

        if (token.pathIndex === -1 && diceValue === 6) {
            token.pathIndex = 0;
            moveTokenToCell(tokenId, path[0]);
            playAudio(soundMove);
            await delay(250);
        } else if (token.pathIndex >= 0) {
            for (let i = 0; i < diceValue; i++) {
                token.pathIndex++;
                moveTokenToCell(tokenId, path[token.pathIndex]);
                playAudio(soundMove);
                await delay(250);
                if (epoch !== myEp) return;
            }
        }
        if (epoch !== myEp) return;

        if (token.pathIndex === path.length - 1) {
            // পাকা ঘরে পৌঁছেছে
            token.isFinished = true;
            moveTokenToCell(tokenId, path[token.pathIndex]);
            playAudio(soundHome);
            if (allFinished(color)) winner = color;
            getsAnotherTurn = true;
        } else {
            const extraTurn = await checkEatOrSafe(tokenId, myEp);
            if (epoch !== myEp) return;
            getsAnotherTurn = (diceValue === 6) || extraTurn;
        }
    } finally {
        isMoving = false;
    }

    if (!isRemote) {
        // চাল-দেওয়া ডিভাইসই পরের ধাপ ঠিক করে এবং স্ন্যাপশট পাঠায়
        hasRolled = false;
        if (winner) {
            updateDiceControls();
            sendState(true, false, { status: 'waiting' });
            showWinPopup(winner);
        } else {
            if (!getsAnotherTurn) switchTurn();
            else updateDiceControls();
            sendState(true);
        }
    } else {
        updateDiceBouncing();
        armStateWait();
    }
}

// অন্যজনের চালের পর স্ন্যাপশট না এলে নিজে চেয়ে নেওয়া
function armStateWait() {
    const v = stateV;
    const ep = epoch;
    setTimeout(() => {
        if (epoch === ep && stateV === v && hasRolled && partnerConnected) requestState();
    }, 2500);
}

async function checkEatOrSafe(movedTokenId, myEp) {
    const currentToken = tokens[movedTokenId];
    const currentCellId = PATHS[currentToken.color][currentToken.pathIndex];

    if (SAFE_CELLS.includes(currentCellId) || typeof currentCellId === 'string') {
        return false;
    }
    let hasEaten = false;
    for (const otherTokenId of Object.keys(tokens)) {
        const otherToken = tokens[otherTokenId];
        if (otherToken.color !== currentToken.color && otherToken.pathIndex >= 0 && !otherToken.isFinished) {
            const otherCellId = PATHS[otherToken.color][otherToken.pathIndex];
            if (currentCellId === otherCellId) {
                hasEaten = true;
                await resetTokenToBase(otherTokenId, myEp);
                if (epoch !== myEp) return hasEaten;
            }
        }
    }
    return hasEaten;
}

async function resetTokenToBase(tokenId, myEp) {
    const token = tokens[tokenId];
    const playerPath = PATHS[token.color];
    const currentPos = token.pathIndex;
    if (currentPos < 0) return;

    // গুটি খাওয়া প্লেয়ারের "ভাগ্য জরিমানা" (স্মার্ট ডাইসের অংশ)
    if (playerLuckPenalty.hasOwnProperty(token.color)) {
        playerLuckPenalty[token.color] += 0.02;
    }

    const randomEatSound = eatSounds[Math.floor(Math.random() * eatSounds.length)];
    randomEatSound.currentTime = 0;
    randomEatSound.loop = true;
    randomEatSound.play().catch(e => console.log(e));

    try {
        const stepDelay = Math.max(10, Math.min(100, Math.floor(1200 / (currentPos + 1))));
        for (let i = currentPos - 1; i >= 0; i--) {
            token.pathIndex = i;
            moveTokenToCell(tokenId, playerPath[i]);
            await delay(stepDelay);
            if (myEp !== undefined && epoch !== myEp) return;
        }
        token.pathIndex = -1;
        sendTokenToBase(tokenId);
    } finally {
        randomEatSound.pause();
        randomEatSound.currentTime = 0;
        randomEatSound.loop = false;
    }
}

/* ==========================================================
   ১০. গেমের স্ন্যাপশট (সেভ, পাঠানো, ফিরিয়ে আনা)
   ========================================================== */
function freshState(ep) {
    const t = {};
    Object.keys(tokens).forEach((id) => { t[id] = [-1, 0]; });
    return {
        ep: ep, v: 0, cp: 'red', dv: 0, hr: 0, cs: 0, t: t,
        sx: { red: 0, yellow: 0 }, pen: { red: 0, yellow: 0 }, w: null
    };
}

function buildSnapshot(bump) {
    if (bump) stateV++;
    const t = {};
    Object.keys(tokens).forEach((id) => {
        t[id] = [tokens[id].pathIndex, tokens[id].isFinished ? 1 : 0];
    });
    return {
        ep: epoch, v: stateV, cp: currentPlayer, dv: diceValue, hr: hasRolled ? 1 : 0,
        cs: consecutiveSixes, t: t,
        sx: { red: playerSixCounts.red, yellow: playerSixCounts.yellow },
        pen: { red: playerLuckPenalty.red, yellow: playerLuckPenalty.yellow },
        w: winner || null
    };
}

// শুধু বিষয়বস্তুর হ্যাশ (কার চাল, ডাইস, গুটির অবস্থান)
function stateHash(s) {
    let str = s.cp + '|' + s.dv + '|' + s.hr + '|' + (s.w || '') + '|';
    Object.keys(s.t).sort().forEach((k) => { str += k + ':' + s.t[k][0] + ',' + s.t[k][1] + ';'; });
    return djb2(str);
}

function parseState(str) {
    if (!str) return null;
    try {
        const s = JSON.parse(str);
        if (!s || typeof s !== 'object' || !s.t || !s.cp) return null;
        if (Object.keys(tokens).some((id) => !Array.isArray(s.t[id]))) return null;
        if (typeof s.ep !== 'number' || typeof s.v !== 'number') return null;
        return s;
    } catch (e) { return null; }
}

function applyState(s) {
    epoch = s.ep;
    stateV = s.v;
    currentPlayer = s.cp;
    diceValue = s.dv || 0;
    hasRolled = !!s.hr;
    consecutiveSixes = s.cs || 0;
    if (s.sx) { playerSixCounts.red = s.sx.red || 0; playerSixCounts.yellow = s.sx.yellow || 0; }
    if (s.pen) { playerLuckPenalty.red = s.pen.red || 0; playerLuckPenalty.yellow = s.pen.yellow || 0; }
    winner = s.w || null;

    Object.keys(tokens).forEach((id) => {
        const a = s.t && s.t[id];
        if (a) {
            tokens[id].pathIndex = a[0];
            tokens[id].isFinished = !!a[1];
        }
    });
    isMoving = false;

    renderTokens();
    setTokensBounce([], false);
    updateDiceControls();

    if (winner) {
        showWinPopup(winner);
        return;
    }
    hideWinPopup();

    if (hasRolled && diceValue >= 1) {
        showDiceFace(diceIdFor(currentPlayer), diceValue);
        const mv = getMoveableTokens();
        if (mv.length) {
            setTokensBounce(mv, true);
        } else if (currentPlayer === myColor) {
            const ep = epoch;
            setTimeout(() => {
                if (epoch === ep && hasRolled && currentPlayer === myColor) resolveRoll();
            }, 400);
        }
    }
}

/* ---------- Firebase-এ সেভ (ব্যাকআপ) ---------- */
let saveJson = null;
let saveSeats = false;
let saveStatus = null;
let saving = false;

function queueSave(snap, opts = {}) {
    saveJson = JSON.stringify(snap);
    if (opts.seats) saveSeats = true;
    if (opts.status) saveStatus = opts.status;
    flushSave();
}

async function flushSave() {
    if (saving) return;
    saving = true;
    try {
        while (saveJson !== null) {
            const json = saveJson; saveJson = null;
            const seats = saveSeats; saveSeats = false;
            const st = saveStatus; saveStatus = null;

            const values = { gameState: json, updatedAt: new Date() };
            if (st) values.status = st;
            if (seats && myColor) {
                // রিসেট/ম্যাচ শেষে জায়গা নতুন করে লেখা: শুধু উপস্থিত প্লেয়াররা জায়গা ধরে রাখে
                const oc = otherOf(myColor);
                values[myColor + 'Pid'] = myPid;
                values[myColor + 'Seen'] = Date.now();
                values[oc + 'Pid'] = (partnerConnected && partner.pid) ? partner.pid : '';
                values[oc + 'Seen'] = partnerConnected ? Date.now() : 0;
            }
            try {
                await patchRoom(values);
            } catch (e) {
                console.warn('Firebase সেভ ব্যর্থ:', e);
                if (e.status === 404) { saveJson = null; break; }
                if (saveJson === null) {
                    saveJson = json;
                    if (seats) saveSeats = true;
                    if (st) saveStatus = st;
                    await delay(3000);
                }
            }
        }
    } finally {
        saving = false;
    }
}

/* ==========================================================
   ১১. রুমের জায়গা (রঙ), সেশন ও লোকাল স্টোরেজ
   ========================================================== */
function saveSessionLocal() {
    const all = getSessions();
    const prev = all[roomId] || {};
    all[roomId] = { role: prev.role || 'guest', color: myColor, roomName: roomName };
    lsSet(LS_SESSIONS, JSON.stringify(all));
    lsSet(LS_CURRENT, roomId);
}

function clearSessionLocal() {
    const all = getSessions();
    delete all[roomId];
    lsSet(LS_SESSIONS, JSON.stringify(all));
    if (lsGet(LS_CURRENT) === roomId) lsRemove(LS_CURRENT);
}

// কোন রঙ আমার: আগে থেকে আমার নামে থাকলে সেটাই, নইলে খালি জায়গা, নইলে বহুক্ষণ অফলাইন কারও জায়গা
async function resolveSeat(room, preferred) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const now = Date.now();

        if (room.redPid === myPid) return 'red';
        if (room.yellowPid === myPid) return 'yellow';

        const free = [];
        if (!room.redPid) free.push('red');
        if (!room.yellowPid) free.push('yellow');

        let pick = null;
        if (free.length) {
            pick = free.includes(preferred) ? preferred : free[0];
        } else {
            const stale = [];
            if (now - room.redSeen > SEAT_STALE_MS) stale.push('red');
            if (now - room.yellowSeen > SEAT_STALE_MS) stale.push('yellow');
            if (stale.length) pick = stale.includes(preferred) ? preferred : stale[0];
        }
        if (!pick) return null;

        try {
            await patchRoom({ [pick + 'Pid']: myPid, [pick + 'Seen']: now }, room.updateTime);
            return pick;
        } catch (err) {
            const conflict = err.fsStatus === 'FAILED_PRECONDITION' || err.fsStatus === 'ABORTED' ||
                err.status === 409 || err.status === 412;
            if (!conflict) throw err;
            room = await fetchRoom(); // অন্য কেউ আগে নিয়ে নিয়েছে, আবার দেখি
        }
    }
    return null;
}

// "আমি আছি" সংকেত + জায়গা হারিয়েছি কিনা যাচাই
async function seatHeartbeat() {
    if (!seatReady || evicted || !myColor) return;
    try {
        const r = await fetchRoom();
        const holder = r[myColor + 'Pid'];
        if (holder && holder !== myPid) {
            onEvicted();
            return;
        }
        const values = {};
        values[myColor + 'Seen'] = Date.now();
        if (!holder) values[myColor + 'Pid'] = myPid;
        await patchRoom(values);
    } catch (e) { /* পরের বার চেষ্টা হবে */ }
}

function onEvicted() {
    evicted = true;
    netGen++;
    teardownNet();
    clearSessionLocal();
    showConn('আপনার জায়গা আর নেই',
        'আপনি অনেকক্ষণ অফলাইন ছিলেন, তাই অন্য কেউ এই জায়গা নিয়েছেন।', { spinner: false });
}

/* ==========================================================
   ১২. স্ক্রিনের UI (পপআপ, কার চাল, লেবেল)
   ========================================================== */
function showConn(title, msg, opts = {}) {
    const spinner = opts.spinner !== false;
    $('conn-title').textContent = title;
    $('conn-msg').textContent = msg || '';
    $('conn-spinner').hidden = !spinner;
    $('conn-retry-btn').hidden = !opts.retry;
    $('conn-overlay').hidden = false;
    updateTurnUi();
}

function hideConn() {
    $('conn-overlay').hidden = true;
    updateTurnUi();
}

function setDot(state) {
    const d = $('conn-dot');
    if (d) d.className = 'conn-dot conn-' + state;
}

function setLabels() {
    if (!myColor) return;
    $('label-bottom').textContent = `আপনি (${colorShort(myColor)})`;
    $('label-top').textContent = `বন্ধু (${colorShort(otherOf(myColor))})`;
}

function updateTurnUi() {
    const badge = $('turn-badge');
    const lb = $('label-bottom');
    const lt = $('label-top');
    if (!badge || !myColor) return;

    const overlayOpen = !$('conn-overlay').hidden;
    if (winner || !partnerConnected || overlayOpen) {
        badge.hidden = true;
    } else {
        badge.hidden = false;
        if (currentPlayer === myColor) {
            badge.textContent = '🎯 আপনার চাল';
            badge.className = 'turn-badge turn-mine';
        } else {
            badge.textContent = '⏳ বন্ধুর চাল';
            badge.className = 'turn-badge turn-opp';
        }
    }
    if (lb && lt) {
        lb.classList.toggle('active', !winner && currentPlayer === myColor);
        lt.classList.toggle('active', !winner && currentPlayer !== myColor);
    }
}

let winShownEp = -1;

function showWinPopup(color) {
    if (winShownEp === epoch) return;
    winShownEp = epoch;
    const ep = epoch;

    playAudio(soundWin);
    clearSessionLocal(); // ম্যাচ শেষ: কোন গুটি ছিলাম সেই তথ্য মুছে যায়

    setTimeout(() => {
        if (epoch !== ep) return;
        const winOverlay = $('win-overlay');
        const winMessage = $('win-message');
        if (winOverlay && winMessage) {
            winMessage.textContent = `🎉 ${colorName(color)} প্লেয়ার জয়ী হয়েছেন!`;
            winOverlay.hidden = false;
        }
    }, 500);
}

function hideWinPopup() {
    const o = $('win-overlay');
    if (o) o.hidden = true;
    winShownEp = -1;
}

/* ==========================================================
   ১৩. রিসেট / নতুন খেলা
   ========================================================== */
function doReset() {
    const fresh = freshState(epoch + 1);
    applyState(fresh);

    // কোন গুটি ছিলাম সেই তথ্য নতুন করে লেখা
    clearSessionLocal();
    saveSessionLocal();

    if (partnerConnected) sendMsg({ type: 'RESTART', state: fresh });
    queueSave(fresh, { seats: true, status: partnerConnected ? 'playing' : 'waiting' });
    toast('🔄 গেম রিসেট হয়েছে', 'success');
}

async function receiveRestart(s) {
    if (!s || s.ep < epoch) return;
    applyState(s);
    clearSessionLocal();
    saveSessionLocal();
    toast('🔄 বন্ধু গেম রিসেট করেছেন', 'success');
}

/* ==========================================================
   ১৪. নেটওয়ার্ক (PeerJS): হোস্ট/ক্লায়েন্ট, রিকানেক্ট, বার্তা
   ========================================================== */
let peer = null;
let conn = null;
let netGen = 0;
let netRole = null;            // 'host' | 'client' (শুধু নেটওয়ার্কের দায়িত্ব, রঙের সাথে সম্পর্ক নেই)
let partnerConnected = false;
let partner = { pid: null, color: null };
let lastMsgAt = 0;
let netTimer = null;
let netStartPending = false;
let mismatchCount = 0;

const PEER_OPTS = { debug: 0 };
const FATAL_PEER_ERRORS = ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'];

function peerIdFor() { return PEER_PREFIX + roomId; }

function sendMsg(obj) {
    try {
        if (conn && conn.open) {
            conn.send(obj);
            return true;
        }
    } catch (e) { console.warn('পাঠানো যায়নি', e); }
    return false;
}

function teardownNet() {
    clearTimeout(netTimer);
    try { if (conn) { conn.close(); } } catch (e) { /* উপেক্ষা */ }
    conn = null;
    try { if (peer && !peer.destroyed) peer.destroy(); } catch (e) { /* উপেক্ষা */ }
    peer = null;
    partnerConnected = false;
    voice.reset();
}

// নতুন করে নেটওয়ার্ক শুরু: আগে হোস্ট হওয়ার চেষ্টা, না পারলে ক্লায়েন্ট
function startNetwork(delayMs = 0) {
    if (evicted) return;
    clearTimeout(netTimer);
    const gen = ++netGen;
    teardownNet();
    partner = { pid: null, color: null };
    setDot('wait');
    updateDiceControls();
    if (!partnerConnected && seatReady) {
        showConn('বন্ধুর জন্য অপেক্ষা করা হচ্ছে...', 'কানেক্ট হচ্ছে, একটু অপেক্ষা করুন।', { spinner: true });
    }
    netStartPending = true;
    netTimer = setTimeout(() => {
        netStartPending = false;
        tryHost(gen);
    }, delayMs);
}

function scheduleRestart(gen, ms) {
    if (gen !== netGen) return;
    startNetwork(ms);
}

function tryHost(gen) {
    if (gen !== netGen || evicted) return;
    let p;
    try {
        p = new Peer(peerIdFor(), PEER_OPTS);
    } catch (e) {
        scheduleRestart(gen, 3000);
        return;
    }
    peer = p;
    voice.attach(p);

    p.on('open', () => {
        if (gen !== netGen) { try { p.destroy(); } catch (e) { /* উপেক্ষা */ } return; }
        netRole = 'host';
        if (!partnerConnected) {
            showConn('বন্ধুর জন্য অপেক্ষা করা হচ্ছে...', 'বন্ধু রুমে যুক্ত হলেই খেলা শুরু হবে।', { spinner: true });
        }
    });
    p.on('connection', (c) => {
        if (gen !== netGen) { try { c.close(); } catch (e) { /* উপেক্ষা */ } return; }
        acceptConnection(c, gen);
    });
    p.on('disconnected', () => {
        if (gen !== netGen) return;
        setTimeout(() => {
            try { if (gen === netGen && peer === p && !p.destroyed) p.reconnect(); } catch (e) { /* উপেক্ষা */ }
        }, 1000);
    });
    p.on('error', (err) => {
        if (gen !== netGen) return;
        if (err.type === 'unavailable-id') {
            // আইডি অন্য কেউ ধরে আছে = সে-ই হোস্ট, আমি ক্লায়েন্ট
            try { p.destroy(); } catch (e) { /* উপেক্ষা */ }
            becomeClient(gen);
            return;
        }
        if (FATAL_PEER_ERRORS.includes(err.type)) scheduleRestart(gen, 3000);
    });
}

function becomeClient(gen) {
    if (gen !== netGen || evicted) return;
    showConn('কানেক্ট হচ্ছে...', 'বন্ধুর সাথে যুক্ত হওয়া হচ্ছে।', { spinner: true });
    let p;
    try {
        p = new Peer(PEER_OPTS);
    } catch (e) {
        scheduleRestart(gen, 3000);
        return;
    }
    peer = p;
    voice.attach(p);

    p.on('open', () => {
        if (gen !== netGen) { try { p.destroy(); } catch (e) { /* উপেক্ষা */ } return; }
        netRole = 'client';
        const c = p.connect(peerIdFor(), { reliable: true, serialization: 'json' });
        conn = c;
        setupConn(c, gen);
        // ৯ সেকেন্ডে না খুললে আবার শুরু (হোস্ট হয়তো আর নেই, তখন আমিই হোস্ট হব)
        setTimeout(() => {
            if (gen === netGen && conn === c && !c.open) scheduleRestart(gen, 500);
        }, 9000);
    });
    p.on('disconnected', () => {
        if (gen !== netGen) return;
        setTimeout(() => {
            try { if (gen === netGen && peer === p && !p.destroyed) p.reconnect(); } catch (e) { /* উপেক্ষা */ }
        }, 1000);
    });
    p.on('error', (err) => {
        if (gen !== netGen) return;
        if (err.type === 'peer-unavailable') {
            scheduleRestart(gen, 1500); // হোস্ট নেই, আমি হোস্ট হওয়ার চেষ্টা করব
            return;
        }
        if (FATAL_PEER_ERRORS.includes(err.type)) scheduleRestart(gen, 3000);
    });
}

function acceptConnection(c, gen) {
    // নতুন সংযোগ সবসময় জেতে (পুরনোটা মৃত হতে পারে)
    if (conn && conn !== c) {
        try { conn.close(); } catch (e) { /* উপেক্ষা */ }
    }
    conn = c;
    setupConn(c, gen);
}

function setupConn(c, gen) {
    const onOpen = () => {
        if (gen !== netGen || conn !== c) return;
        lastMsgAt = Date.now();
        sendHello();
    };
    if (c.open) onOpen(); else c.on('open', onOpen);

    c.on('data', (d) => {
        if (conn !== c) return;
        lastMsgAt = Date.now();
        enqueue(d);
    });
    c.on('close', () => onConnClosed(c, gen));
    c.on('error', () => onConnClosed(c, gen));
}

function onConnClosed(c, gen) {
    if (conn !== c || gen !== netGen) return;
    conn = null;
    partnerConnected = false;
    partner = { pid: null, color: null };
    setDot('wait');
    voice.reset();
    updateDiceControls();
    showConn('বন্ধুর সংযোগ বিচ্ছিন্ন', 'বন্ধু ফিরে আসার জন্য অপেক্ষা করা হচ্ছে...', { spinner: true });

    // আমি ক্লায়েন্ট ছিলাম আর হোস্ট চলে গেছে: এবার আমিই হোস্টের দায়িত্ব নেওয়ার চেষ্টা করব
    // (রঙ বদলাবে না, শুধু নেটওয়ার্কের দায়িত্ব)
    if (netRole === 'client') startNetwork(1500);
}

function sendHello() {
    sendMsg({
        type: 'HELLO', room: roomId, pid: myPid, color: myColor,
        ep: epoch, v: stateV, h: stateHash(buildSnapshot(false))
    });
}

function onHello(m) {
    if (m.room !== roomId || !m.color || m.color === myColor) {
        console.warn('অবৈধ সংযোগ বাতিল');
        try { if (conn) conn.close(); } catch (e) { /* উপেক্ষা */ }
        return;
    }
    partner = { pid: m.pid, color: m.color };
    partnerConnected = true;
    mismatchCount = 0;
    setDot('on');
    hideConn();
    updateDiceControls();
    voice.onConnected(netRole);

    reconcile(m.ep, m.v);

    if (netRole === 'host' && !winner) {
        patchRoom({ status: 'playing' }).catch(() => { /* উপেক্ষা */ });
    }
}

// কার অবস্থা নতুন: নতুনটাই সবাই মেনে নেবে
function reconcile(ep, v) {
    if (ep > epoch || (ep === epoch && v > stateV)) {
        requestState();
    } else if (epoch > ep || (epoch === ep && stateV > v)) {
        sendState(false);
    }
}

function requestState() { sendMsg({ type: 'REQ_STATE' }); }

function sendState(bump = true, force = false, saveOpts = {}) {
    const snap = buildSnapshot(bump);
    sendMsg({ type: 'STATE', state: snap, force: !!force });
    if (bump) queueSave(snap, saveOpts);
    return snap;
}

async function receiveState(s, force) {
    const parsed = parseState(JSON.stringify(s));
    if (!parsed) return;
    while (isMoving) {
        await delay(50);
    }
    const newer = parsed.ep > epoch || (parsed.ep === epoch && parsed.v > stateV);
    if (newer || force) {
        applyState(parsed);
        mismatchCount = 0;
    }
}

// সংযোগ জীবিত কিনা দেখা + দুই ফোনের অবস্থা মিলছে কিনা যাচাই
function pingLoop() {
    if (!conn || !conn.open) return;
    const busy = isMoving || Date.now() < busyUntil;
    sendMsg({ type: 'PING', ep: epoch, v: stateV, h: stateHash(buildSnapshot(false)), b: busy ? 1 : 0 });

    if (Date.now() - lastMsgAt > DEAD_AFTER_MS) {
        const c = conn;
        try { c.close(); } catch (e) { /* উপেক্ষা */ }
        onConnClosed(c, netGen);
    }
}

function onPing(m) {
    const myBusy = isMoving || Date.now() < busyUntil;
    if (myBusy || m.b) return;

    if (m.ep !== epoch || m.v !== stateV) {
        reconcile(m.ep, m.v);
        mismatchCount = 0;
        return;
    }
    const mine = stateHash(buildSnapshot(false));
    if (m.h !== mine) {
        mismatchCount++;
        // দুইবার পরপর অমিল থাকলে হোস্টের অবস্থাই চূড়ান্ত
        if (mismatchCount >= 2 && netRole === 'host') {
            sendState(false, true);
            mismatchCount = 0;
        }
    } else {
        mismatchCount = 0;
    }
}

function netWatchdog() {
    if (!seatReady || evicted || netStartPending) return;
    if (!peer || peer.destroyed) {
        startNetwork(0);
        return;
    }
    if (peer.disconnected) {
        try { peer.reconnect(); } catch (e) { /* উপেক্ষা */ }
    }
}

/* ---------- বার্তা গ্রহণ (একটার পর একটা, ক্রম বজায় রেখে) ---------- */
const inbox = [];
let draining = false;

function enqueue(msg) {
    if (!msg || typeof msg !== 'object') return;
    inbox.push(msg);
    if (!draining) drainInbox();
}

async function drainInbox() {
    draining = true;
    while (inbox.length) {
        const m = inbox.shift();
        try {
            await handleMessage(m);
        } catch (e) {
            console.error('বার্তা প্রক্রিয়ায় ত্রুটি:', e);
        }
    }
    draining = false;
}

async function handleMessage(m) {
    switch (m.type) {
        case 'HELLO':
            onHello(m);
            break;
        case 'DICE':
            if (m.ep !== epoch) { requestState(); break; }
            await rollDice(m.diceId, m.value);
            break;
        case 'MOVE':
            if (m.ep !== epoch) { requestState(); break; }
            await remoteMove(m.tokenId);
            break;
        case 'STATE':
            await receiveState(m.state, m.force);
            break;
        case 'REQ_STATE':
            sendState(false);
            break;
        case 'RESTART':
            await receiveRestart(m.state);
            break;
        case 'PING':
            onPing(m);
            break;
    }
}

/* ==========================================================
   ১৫. 🎙️ ভয়েস চ্যাট (আগের মতোই: ছোট মাইক উইজেট, অটো কল)
   ========================================================== */
const voice = (function () {
    let localStream = null;
    let isMuted = false;
    let activeCall = null;
    let callTimer = null;

    // স্ক্রিনে ছোট স্টাইলিশ মাইক সিম্বল ও উইজেট যোগ করা
    function injectVoiceUI() {
        if (document.getElementById("voice-chat-widget")) return;

        const widget = document.createElement("div");
        widget.id = "voice-chat-widget";
        widget.innerHTML = `
            <style>
                #voice-chat-widget {
                    position: fixed;
                    bottom: 15px;
                    left: 15px;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(15, 23, 42, 0.9);
                    padding: 5px 10px;
                    border-radius: 20px;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
                    color: #fff;
                    font-family: system-ui, -apple-system, sans-serif;
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                }
                #mic-toggle-btn {
                    background: #22c55e;
                    border: none;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 11px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.2s ease;
                }
                #mic-toggle-btn.muted {
                    background: #ef4444;
                }
                .mic-symbol {
                    font-size: 10px;
                    padding: 2px 5px;
                    background: rgba(0, 243, 255, 0.15);
                    border: 1px solid rgba(0, 243, 255, 0.4);
                    border-radius: 6px;
                    color: #00f3ff;
                    font-weight: bold;
                }
            </style>
            <span class="mic-symbol" id="mic-sym-indicator">🎙️</span>
            <button id="mic-toggle-btn" title="মাইক অন/অফ করুন">🟢 চালু</button>
            <audio id="remote-voice-audio" autoplay></audio>
        `;
        document.body.appendChild(widget);
        document.getElementById("mic-toggle-btn").addEventListener("click", toggleMic);
    }

    // মাইক্রোফোনের পারমিশন নেওয়া
    async function getMicStream() {
        if (localStream) return localStream;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false
            });
            updateMicUI(true);
            return localStream;
        } catch (err) {
            console.error("মাইক্রোফোন এক্সেস পাওয়া যায়নি:", err);
            updateMicUI(false, "❌ ব্লকড");
            return null;
        }
    }

    function updateMicUI(active, customText = null) {
        const btn = document.getElementById("mic-toggle-btn");
        const sym = document.getElementById("mic-sym-indicator");
        if (!btn) return;

        if (active && !isMuted) {
            btn.classList.remove("muted");
            btn.innerHTML = "🔊 চালু";
            if (sym) sym.style.borderColor = "#22c55e";
        } else if (!active && customText) {
            btn.classList.add("muted");
            btn.innerHTML = customText;
            if (sym) sym.style.borderColor = "#ef4444";
        }
    }

    // মাইক মিউট / আনমিউট টগল
    function toggleMic() {
        if (!localStream) {
            getMicStream().then(stream => {
                if (stream) callOnce();
            });
            return;
        }

        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isMuted = !isMuted;
            audioTrack.enabled = !isMuted;

            const btn = document.getElementById("mic-toggle-btn");
            const sym = document.getElementById("mic-sym-indicator");

            if (isMuted) {
                btn.classList.add("muted");
                btn.innerHTML = "🔇 বন্ধ";
                if (sym) sym.style.borderColor = "#ef4444";
            } else {
                btn.classList.remove("muted");
                btn.innerHTML = "🔊 চালু";
                if (sym) sym.style.borderColor = "#22c55e";
            }
        }
    }

    // রিমোট ইউজারের ভয়েস প্লে করা
    function handleRemoteStream(remoteStream) {
        const audioElem = document.getElementById("remote-voice-audio");
        if (audioElem) {
            audioElem.srcObject = remoteStream;
            audioElem.play().catch(e => console.log("Audio play blocked by browser:", e));
        }
    }

    // ক্লায়েন্ট হোস্টকে কল করবে
    async function callOnce() {
        if (!peer || !conn || !conn.open || netRole !== 'client') return;
        if (activeCall && activeCall.open) return;
        let stream = await getMicStream();
        if (!stream) {
            try { stream = new MediaStream(); } catch (e) { return; }
        }
        try {
            if (activeCall) { try { activeCall.close(); } catch (e) { /* উপেক্ষা */ } }
            const call = peer.call(conn.peer, stream);
            if (call) {
                call.on("stream", handleRemoteStream);
                call.on("close", () => { if (activeCall === call) activeCall = null; });
                activeCall = call;
            }
        } catch (e) { console.log("কল করা যায়নি:", e); }
    }

    // PeerJS ইনস্ট্যান্সে ইনকামিং কল ধরার ব্যবস্থা (হোস্ট ও ক্লায়েন্ট দুজনেই)
    function attach(p) {
        p.on("call", async (call) => {
            const stream = await getMicStream();
            if (activeCall && activeCall !== call) { try { activeCall.close(); } catch (e) { /* উপেক্ষা */ } }
            if (stream) {
                call.answer(stream);
            } else {
                call.answer(); // মাইক না থাকলেও রিমোটের কথা শুনতে পাবে
            }
            call.on("stream", handleRemoteStream);
            call.on("close", () => { if (activeCall === call) activeCall = null; });
            activeCall = call;
        });
    }

    // ডাটা কানেকশন তৈরি হলে ক্লায়েন্ট অটো কল শুরু করবে (না লাগলে ৪ সেকেন্ড পর পর আবার চেষ্টা)
    function onConnected(role) {
        clearInterval(callTimer);
        if (role !== 'client') return;
        callOnce();
        callTimer = setInterval(() => {
            if (!conn || !conn.open) { clearInterval(callTimer); return; }
            if (activeCall && activeCall.open) return;
            callOnce();
        }, 4000);
    }

    function reset() {
        clearInterval(callTimer);
        if (activeCall) { try { activeCall.close(); } catch (e) { /* উপেক্ষা */ } }
        activeCall = null;
    }

    function init() {
        injectVoiceUI();
        // প্রথম ক্লিকে ব্রাউজারের মাইক পারমিশন পপআপ
        document.addEventListener("click", () => {
            if (!localStream) {
                getMicStream();
            }
        }, { once: true });
    }

    return { init, attach, onConnected, reset };
})();

/* ==========================================================
   ১৬. ফেসবুক/মেসেঞ্জারের ইন-অ্যাপ ব্রাউজার ও Chrome-এ নেওয়া
   ========================================================== */
function isInAppBrowser() {
    return /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram/i.test(navigator.userAgent || '');
}

// রুম ও জায়গার তথ্য সহ লিংক বানানো, যাতে Chrome-এও একই প্লেয়ার হিসেবে ঢোকা যায়
function buildTransferLinks() {
    const data = {
        r: roomId, c: myColor, p: myPid, n: roomName,
        o: (getSessions()[roomId] || {}).role || 'guest'
    };
    const enc = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
    const base = location.origin + location.pathname;
    return {
        https: `${base}?t=${enc}`,
        intent: `intent://${location.host}${location.pathname}?t=${enc}#Intent;scheme=${location.protocol.replace(':', '')};package=com.android.chrome;end`
    };
}

// লিংক থেকে আসা তথ্য লোকাল স্টোরেজে নেওয়া (এক ব্রাউজার থেকে অন্য ব্রাউজারে যাওয়ার জন্য)
function importTransfer() {
    try {
        const m = /[?&]t=([^&#]+)/.exec(location.search || '');
        if (!m) return;
        const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
        if (data && data.r) {
            if (data.p) lsSet(LS_PID, data.p);
            const all = getSessions();
            all[data.r] = { role: data.o || 'guest', color: data.c || null, roomName: data.n || '' };
            lsSet(LS_SESSIONS, JSON.stringify(all));
            lsSet(LS_CURRENT, data.r);
        }
    } catch (e) { /* ভুল লিংক হলে উপেক্ষা */ }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* উপেক্ষা */ }
}

function setupInAppBanner() {
    if (!isInAppBrowser()) return;
    const banner = $('inapp-banner');
    if (!banner) return;
    banner.hidden = false;

    $('inapp-close-btn').addEventListener('click', () => { banner.hidden = true; });
    $('open-chrome-btn').addEventListener('click', async () => {
        if (!roomId || !myColor) { toast('আগে রুমে যুক্ত হোন।', 'error'); return; }
        const links = buildTransferLinks();
        if (/Android/i.test(navigator.userAgent)) {
            window.location.href = links.intent;
        } else {
            try {
                await navigator.clipboard.writeText(links.https);
                toast('📋 লিংক কপি হয়েছে। Safari/Chrome-এ পেস্ট করে খুলুন।', 'success');
            } catch (e) {
                toast('লিংক কপি করা যায়নি। ব্রাউজারের মেনু থেকে "Open in Browser" বেছে নিন।', 'error');
            }
        }
    });
}

/* ==========================================================
   ১৭. বোতাম ও ইভেন্ট সংযোগ
   ========================================================== */
function goLobby() {
    window.location.href = INDEX_PAGE;
}

function bindUi() {
    // ডাইসে ক্লিক
    $('dice-top-right').addEventListener('click', () => rollDice('dice-top-right'));
    $('dice-bottom-left').addEventListener('click', () => rollDice('dice-bottom-left'));

    // রিসেট (নিশ্চিতকরণ সহ)
    $('reset-btn').addEventListener('click', () => { $('confirm-overlay').hidden = false; });
    $('confirm-no-btn').addEventListener('click', () => { $('confirm-overlay').hidden = true; });
    $('confirm-yes-btn').addEventListener('click', () => {
        $('confirm-overlay').hidden = true;
        doReset();
    });

    // বিজয়ী পপআপ থেকে আবার খেলা
    $('win-restart-btn').addEventListener('click', () => doReset());

    // লবিতে ফেরা
    $('lobby-btn').addEventListener('click', goLobby);
    $('conn-lobby-btn').addEventListener('click', goLobby);
    $('win-lobby-btn').addEventListener('click', goLobby);

    // সংযোগ সমস্যায় আবার চেষ্টা
    $('conn-retry-btn').addEventListener('click', () => enterRoom());
}

/* ==========================================================
   ১৮. রুমে প্রবেশ ও শুরু
   ========================================================== */
async function enterRoom() {
    const session = getSessions()[roomId] || {};
    showConn('রুমে যুক্ত হচ্ছে...', '', { spinner: true });

    // ১. Firebase থেকে রুম ও শেষ অবস্থা পড়া
    let room;
    try {
        room = await fetchRoom();
    } catch (err) {
        if (err.status === 404) {
            clearSessionLocal();
            showConn('রুম পাওয়া যায়নি', 'রুমটি মুছে গেছে বা মেয়াদ শেষ হয়েছে।', { spinner: false });
        } else {
            showConn('সংযোগ সমস্যা', friendlyError(err), { spinner: false, retry: true });
        }
        return;
    }

    // ২. আমার রঙ ঠিক করা (প্লেয়ারের নামে বাঁধা, হোস্ট বদলালেও বদলায় না)
    let seat;
    try {
        seat = await resolveSeat(room, session.color);
    } catch (err) {
        showConn('সংযোগ সমস্যা', friendlyError(err), { spinner: false, retry: true });
        return;
    }
    if (!seat) {
        clearSessionLocal();
        showConn('রুম পূর্ণ 🚫', 'এই রুমে ইতিমধ্যে দুজন খেলোয়াড় আছেন।', { spinner: false });
        return;
    }

    myColor = seat;
    if (room.roomName) roomName = room.roomName;
    $('room-title').textContent = roomName;
    saveSessionLocal();

    // ৩. হলুদ প্লেয়ারের স্ক্রিনে বোর্ড ঘুরবে, যাতে নিজের গুটি নিচে থাকে
    document.body.classList.toggle('flipped', myColor === 'yellow');
    setLabels();

    // ৪. শেষ অবস্থা ফিরিয়ে আনা, না থাকলে (বা ম্যাচ শেষ হলে) নতুন খেলা
    const saved = parseState(room.gameState);
    if (saved && !saved.w) {
        applyState(saved);
        toast('✅ আগের খেলা ফিরে এসেছে', 'success');
    } else {
        applyState(freshState(saved ? saved.ep + 1 : 1));
    }

    seatReady = true;
    startNetwork(0);
}

function init() {
    importTransfer();

    // টোকেনের মূল জায়গা (বেস) মনে রাখা
    Object.keys(tokens).forEach(tokenId => {
        const tokenElem = document.getElementById(tokenId);
        if (tokenElem) tokens[tokenId].initialParent = tokenElem.parentElement;
    });
    setupTokenEvents();
    bindUi();
    setupAudioUnlock();
    voice.init();
    updateDiceControls();

    roomId = lsGet(LS_CURRENT);
    const session = roomId ? getSessions()[roomId] : null;
    if (!roomId || !session) {
        // রুম বাছা হয়নি: লবিতে পাঠানো
        window.location.replace(INDEX_PAGE);
        return;
    }
    roomName = session.roomName || '';
    $('room-title').textContent = roomName;
    myPid = getMyPid();

    setupInAppBanner();

    // নিয়মিত কাজ
    setInterval(pingLoop, PING_INTERVAL_MS);
    setInterval(netWatchdog, PING_INTERVAL_MS);
    setInterval(seatHeartbeat, SEAT_HEARTBEAT_MS);
    setInterval(() => {
        // চাল চলছে অথচ ২০ সেকেন্ডের বেশি পার: আটকে গেছে ধরে ছেড়ে দেওয়া
        if (isMoving && Date.now() - movingSince > 20000) {
            console.warn('চাল আটকে ছিল, ছেড়ে দেওয়া হলো');
            isMoving = false;
            updateDiceControls();
            requestState();
        }
    }, 3000);

    // ট্যাবে (যেমন মেসেঞ্জার থেকে) ফিরে এলে সাথে সাথে সংযোগ যাচাই
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            netWatchdog();
            pingLoop();
            seatHeartbeat();
        }
    });
    window.addEventListener('pageshow', (e) => {
        if (e.persisted && seatReady && !evicted) startNetwork(0);
    });
    // পেজ ছাড়ার সময় আইডি ছেড়ে দেওয়া, যাতে অন্যজন দ্রুত হোস্টের দায়িত্ব নিতে পারে
    window.addEventListener('pagehide', () => {
        try { if (peer && !peer.destroyed) peer.destroy(); } catch (e) { /* উপেক্ষা */ }
    });

    enterRoom();
}

document.addEventListener('DOMContentLoaded', init);
