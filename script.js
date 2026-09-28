/**
 * script.js - Client Side Game Engine & PeerJS Sync Logic
 */

// ১. লোকাল স্টোরেজ থেকে রুম ও রোল ডাটা রিসিভ
const roomId = localStorage.getItem('ludo_room_id');
const myRole = localStorage.getItem('ludo_player_role') || 'red'; // 'red' or 'yellow'
const isHost = localStorage.getItem('ludo_is_host') === 'true';

// ডাইনামিক হোস্ট ইউআরএল (লোকাল অথবা লাইভ সার্ভার অটো-ডিটেক্ট)
const API_URL = window.location.origin.includes('http') ? window.location.origin : "https://ludo-api.onrender.com";

let peer = null;
let conn = null;
let currentTurn = 'red'; // খেলা রেড দিয়ে শুরু হবে
let currentDiceValue = null;

// ২. সাউন্ড ইফেক্ট ফাংশন
function playSound(soundId) {
    const audio = document.getElementById(soundId);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }
}

// ৩. যার যার স্ক্রিনে তার গুটি নিচে দেখানোর জন্য বোর্ড রোটেট
function applyBoardRotation() {
    if (myRole === 'yellow') {
        const board = document.querySelector('.grid-container');
        if (board) {
            board.classList.add('flip-board');
        }
    }
}

// ৪. ইউআই আপডেট: যার চাল তার ডাইস ও চালযোগ্য গুটি লাফানোর লজিক
function updateTurnUI(moveableTokens = []) {
    // আগের সব লাফানোর এনিমেশন ক্লাস মুছে ফেলা
    document.querySelectorAll('.dice-container').forEach(d => d.classList.remove('turn-bounce'));
    document.querySelectorAll('.token').forEach(t => t.classList.remove('token-bounce'));

    // ১. ডাইস লাফানো: যদি নিজের চাল হয় এবং এখনো ডাইস চাল না দেওয়া হয়ে থাকে
    if (currentTurn === myRole && !currentDiceValue) {
        const myDiceId = (myRole === 'red') ? 'dice-bottom-left' : 'dice-top-right';
        const diceElem = document.getElementById(myDiceId);
        if (diceElem) {
            diceElem.classList.add('turn-bounce');
        }
    }

    // ২. গুটি লাফানো: ডাইস চালার পর যেগুলো গুটি সরানো সম্ভব
    if (currentTurn === myRole && currentDiceValue && moveableTokens.length > 0) {
        moveableTokens.forEach(tokenId => {
            const tokenEl = document.getElementById(tokenId);
            if (tokenEl) {
                tokenEl.classList.add('token-bounce');
            }
        });
    }
}

// ৫. PeerJS সেটআপ ও অপনেন্ট সিঙ্ক্রোনাইজেশন
function initPeerConnection() {
    const peerId = isHost ? 'ludo-' + roomId : 'ludo-guest-' + Math.floor(Math.random() * 1000);
    peer = new Peer(peerId, {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        },
        secure: true
    });

    peer.on('open', () => {
        if (!isHost && roomId) {
            conn = peer.connect('ludo-' + roomId);
            setupConnectionListeners();
        }
    });

    peer.on('connection', (incomingConn) => {
        conn = incomingConn;
        setupConnectionListeners();
    });
}

// ৬. অপনেন্টের ডাটা রিসিভ করার লিসেনার
function setupConnectionListeners() {
    conn.on('data', (data) => {
        if (data.type === 'DICE_ROLLED') {
            animateDiceRoll(data.diceContainerId, data.value);
            currentDiceValue = data.value;
            updateTurnUI(data.moveableTokens || []);
        } else if (data.type === 'TOKEN_MOVED') {
            moveTokenUI(data.tokenId, data.targetCellId);
            currentTurn = data.nextTurn;
            currentDiceValue = null;
            updateTurnUI();
        } else if (data.type === 'SKIP_TURN') {
            currentTurn = data.nextTurn;
            currentDiceValue = null;
            updateTurnUI();
        }
    });
}

// ৭. ডাইস ক্লিক হ্যান্ডলার
async function handleDiceClick(diceContainerId) {
    // সিকিউরিটি চেক: নিজের ডাইস না হলে বা চাল না থাকলে ব্লক করা
    if ((myRole === 'red' && diceContainerId !== 'dice-bottom-left') ||
        (myRole === 'yellow' && diceContainerId !== 'dice-top-right')) {
        alert("এটি আপনার ডাইস নয়!");
        return;
    }

    if (currentTurn !== myRole) {
        alert("অপনেন্টের চালের জন্য অপেক্ষা করুন!");
        return;
    }

    if (currentDiceValue !== null) {
        alert("আপনি অলরেডি ডাইস চাল দিয়েছেন! এবার গুটি চাল দিন।");
        return;
    }

    playSound('sound-dice');

    // ডাইসে ক্লিক হওয়ামাত্র লাফানো বন্ধ করা
    document.getElementById(diceContainerId).classList.remove('turn-bounce');

    let diceValue = null;
    let moveableTokens = [];

    try {
        const response = await fetch(`${API_URL}/api/roll-dice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: roomId || 'default_room', player: myRole })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            diceValue = data.diceValue;
            moveableTokens = data.moveableTokens || [];
        } else {
            throw new Error(data.error || "Server Response Error");
        }
    } catch (err) {
        // ফলব্যাক: সার্ভার না থাকলে র্যান্ডম রোল
        diceValue = Math.floor(Math.random() * 6) + 1;
        // লোকাল চালযোগ্য গুটি স্ক্যান
        moveableTokens = getLocalMoveableTokens(myRole, diceValue);
    }

    currentDiceValue = diceValue;

    // ৩ডি রোটেশন এনিমেশন চালানো
    animateDiceRoll(diceContainerId, diceValue);

    // চাল দেওয়ার মতো গুটি আছে কিনা চেক
    setTimeout(() => {
        if (moveableTokens.length > 0) {
            updateTurnUI(moveableTokens);
        } else {
            // চাল দেওয়ার মতো কোনো গুটি না থাকলে ২ সেকেন্ড পর চাল স্কিপ করে অপোনেন্টকে দেওয়া
            const nextTurn = (diceValue === 6) ? myRole : (myRole === 'red' ? 'yellow' : 'red');
            if (nextTurn !== myRole) {
                setTimeout(() => {
                    currentTurn = nextTurn;
                    currentDiceValue = null;
                    updateTurnUI();

                    if (conn && conn.open) {
                        conn.send({ type: 'SKIP_TURN', nextTurn: nextTurn });
                    }
                }, 1000);
            } else {
                currentDiceValue = null;
                updateTurnUI();
            }
        }
    }, 1000);

    // অপনেন্টকে PeerJS দিয়ে ডাটা পাঠানো
    if (conn && conn.open) {
        conn.send({
            type: 'DICE_ROLLED',
            diceContainerId: diceContainerId,
            value: diceValue,
            moveableTokens: moveableTokens
        });
    }
}

// ৮. ডাইস ৩ডি অ্যানিমেশন
function animateDiceRoll(containerId, value) {
    const cube = document.querySelector(`#${containerId} .cube`);
    if (!cube) return;

    const rotations = {
        1: 'rotateX(0deg) rotateY(0deg)',
        6: 'rotateX(180deg) rotateY(0deg)',
        3: 'rotateX(0deg) rotateY(-90deg)',
        4: 'rotateX(0deg) rotateY(90deg)',
        2: 'rotateX(-90deg) rotateY(0deg)',
        5: 'rotateX(90deg) rotateY(0deg)'
    };

    cube.style.transition = 'transform 1s ease-out';
    cube.style.transform = `rotateX(${720 + Math.random() * 360}deg) rotateY(${720 + Math.random() * 360}deg)`;

    setTimeout(() => {
        cube.style.transform = rotations[value];
    }, 1000);
}

// ৯. গুটি ক্লিক হ্যান্ডলার
async function handleTokenClick(tokenId) {
    if (currentTurn !== myRole) return;
    if (!currentDiceValue) {
        alert("আগে ডাইস রোল করুন!");
        return;
    }

    // নিশ্চিত হওয়া যে ক্লিক করা গুটিটি নিজের প্লেয়ারের
    if (!tokenId.startsWith(myRole)) {
        alert("এটি আপনার গুটি নয়!");
        return;
    }

    playSound('sound-move');

    let validMove = false;
    let targetCellId = null;
    let nextTurn = currentTurn;

    try {
        const response = await fetch(`${API_URL}/api/move-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: roomId || 'default_room',
                tokenId: tokenId,
                diceValue: currentDiceValue,
                player: myRole
            })
        });

        const data = await response.json();
        if (response.ok && data.validMove) {
            validMove = true;
            targetCellId = data.targetCellId;
            nextTurn = data.nextTurn;
        } else {
            alert(data.message || "এই গুটিটি চাল দেওয়া সম্ভব নয়!");
            return;
        }
    } catch (err) {
        // লোকাল ক্লায়েন্ট সাইড গণনা (সার্ভার অফলাইন থাকলে)
        const tokenElem = document.getElementById(tokenId);
        if (tokenElem) {
            validMove = true;
            nextTurn = (currentDiceValue === 6) ? myRole : (myRole === 'red' ? 'yellow' : 'red');
        }
    }

    if (validMove && targetCellId) {
        moveTokenUI(tokenId, targetCellId);

        currentTurn = nextTurn;
        currentDiceValue = null;
        updateTurnUI();

        if (conn && conn.open) {
            conn.send({
                type: 'TOKEN_MOVED',
                tokenId: tokenId,
                targetCellId: targetCellId,
                nextTurn: nextTurn
            });
        }
    }
}

// ১০. বোর্ডের ভিজ্যুয়াল গুটি সরানোর অ্যানিমেশন
function moveTokenUI(tokenId, targetCellId) {
    const token = document.getElementById(tokenId);
    const targetCell = document.getElementById(targetCellId);

    if (token && targetCell) {
        targetCell.appendChild(token);
    }
}

// ১১. ফলব্যাক হেল্পার (সার্ভার ছাড়া লোকাল পরীক্ষার জন্য)
function getLocalMoveableTokens(player, diceValue) {
    const tokens = Array.from(document.querySelectorAll(`.${player}-token`));
    return tokens.map(t => t.id);
}

// ইনিশিয়ালাইজেশন
window.onload = () => {
    applyBoardRotation();
    initPeerConnection();
    updateTurnUI();
};
