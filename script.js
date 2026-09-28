/* ===================================================
   ১. অটোমেটিক PeerJS লাইব্রেরি লোডার
   =================================================== */
(function loadPeerJSScript() {
    if (typeof Peer === 'undefined') {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.2/peerjs.min.js";
        script.onload = () => { initP2P(); };
        document.head.appendChild(script);
    } else {
        initP2P();
    }
})();

/* ===================================================
   ২. সাউন্ড ও গ্লোবাল ভ্যারিয়েবল
   =================================================== */
const soundDiceRoll = new Audio('dice-roll.mp3');
const soundSix = new Audio('six.mp3');
const soundMove = new Audio('move.mp3');
const eatSounds = [
    new Audio('eat1.mp3'),
    new Audio('eat2.mp3'),
    new Audio('eat3.mp3')
];
const soundHome = new Audio('home.mp3');
const soundWin = new Audio('win.mp3');

function playAudio(audio, maxDurationMs = null) {
    if (audio) {
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
let consecutiveSixes = 0;

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

/* ===================================================
   ৩. পিয়ার-টু-পিয়ার (P2P) কানেকশন এবং স্ট্যাটাস বার
   =================================================== */
const roomId = localStorage.getItem('ludo_room_id') || 'default_room';
const myRole = localStorage.getItem('ludo_player_role') || 'red'; 
const isHost = localStorage.getItem('ludo_is_host') === 'true';

let peer = null;
let conn = null;

function createStatusUI() {
    if (document.getElementById('p2p-status-bar')) return;
    const statusBar = document.createElement('div');
    statusBar.id = 'p2p-status-bar';
    statusBar.style.cssText = `
        position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.8); color: #fff; padding: 6px 16px;
        border-radius: 20px; font-size: 13px; font-weight: bold; z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3); text-align: center;
    `;
    statusBar.innerHTML = '🔴 অপনেন্টের সাথে কানেক্ট হচ্ছে...';
    document.body.appendChild(statusBar);
}

function updateStatusUI(isConnected) {
    const statusBar = document.getElementById('p2p-status-bar');
    if (statusBar) {
        if (isConnected) {
            statusBar.style.background = '#28a745';
            statusBar.innerHTML = `🟢 প্লেয়ার কানেক্টেড (${myRole === 'red' ? 'লাল' : 'হলুদ'})`;
        } else {
            statusBar.style.background = '#dc3545';
            statusBar.innerHTML = '🔴 সংযোগ বিচ্ছিন্ন! ওয়েট করুন...';
        }
    }
       }
function initP2P() {
    createStatusUI();
    const peerId = isHost ? 'ludo-' + roomId : 'ludo-guest-' + Math.floor(Math.random() * 10000);
    
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
            connectToHost();
        }
    });

    peer.on('connection', (incoming) => {
        conn = incoming;
        setupConnectionListeners();
    });

    peer.on('error', (err) => {
        console.log("Peer Error:", err);
        setTimeout(initP2P, 3000); // এরর হলে ৩ সেকেন্ড পর আবার চেষ্টা করবে
    });
}

function connectToHost() {
    const hostId = 'ludo-' + roomId;
    conn = peer.connect(hostId);
    
    conn.on('open', () => {
        setupConnectionListeners();
    });

    conn.on('error', () => {
        setTimeout(connectToHost, 2000);
    });
}

function setupConnectionListeners() {
    if (!conn) return;
    updateStatusUI(true);

    conn.on('data', (data) => {
        if (data.type === 'DICE_ROLLED') {
            processDiceRoll(data.diceId, data.value, true);
        } else if (data.type === 'TOKEN_CLICKED') {
            handleTokenClick(data.tokenId, true);
        } else if (data.type === 'TURN_SWITCHED') {
            currentPlayer = data.nextPlayer;
            hasRolled = false;
            isMoving = false;
            consecutiveSixes = 0;
            updateDiceControls();
        }
    });

    conn.on('close', () => {
        updateStatusUI(false);
        if (!isHost) connectToHost();
    });
}

function sendP2PData(data) {
    if (conn && conn.open) {
        conn.send(data);
    }
           }
/* ===================================================
   ৪. গেম ইনিশিয়ালাইজেশন
   =================================================== */
window.addEventListener('DOMContentLoaded', () => {
    Object.keys(tokens).forEach(tokenId => {
        const tokenElem = document.getElementById(tokenId);
        if (tokenElem) {
            tokens[tokenId].initialParent = tokenElem.parentElement;
        }
    });
    setupTokenEvents();
    updateDiceControls();
});

function setupTokenEvents() {
    Object.keys(tokens).forEach(tokenId => {
        const tokenElem = document.getElementById(tokenId);
        if (tokenElem) {
            tokenElem.addEventListener('click', () => handleTokenClick(tokenId, false));
        }
    });
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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
   /* ===================================================
   ৫. ৩ডি গুটি হাঁটার মূল অ্যানিমেশন (অনলাইন সিঙ্ক সহ)
   =================================================== */
async function handleTokenClick(tokenId, isRemote = false) {
    if (!isRemote && currentPlayer !== myRole) return;
    if (!hasRolled || isMoving) return;

    const token = tokens[tokenId];
    if (token.color !== currentPlayer || token.isFinished) return;

    const moveableTokens = getMoveableTokens();
    if (!moveableTokens.includes(tokenId)) return;

    if (!isRemote) {
        sendP2PData({ type: 'TOKEN_CLICKED', tokenId: tokenId });
    }

    isMoving = true;
    setTokensBounce(Object.keys(tokens), false);

    let stepsToMove = diceValue;

    if (token.pathIndex === -1 && diceValue === 6) {
        token.pathIndex = 0;
        moveTokenToCell(tokenId, PATHS[currentPlayer][0]);
        playAudio(soundMove);
        await delay(250); 
    } else if (token.pathIndex >= 0) {
        for (let i = 0; i < stepsToMove; i++) {
            token.pathIndex++;
            const currentCell = PATHS[currentPlayer][token.pathIndex];
            
            moveTokenToCell(tokenId, currentCell);
            playAudio(soundMove);
            await delay(250); 
        }
    }

    if (token.pathIndex === PATHS[currentPlayer].length - 1) {
        token.isFinished = true;
        
        const homeCellId = PATHS[currentPlayer][token.pathIndex];
        moveTokenToCell(tokenId, homeCellId);

        playAudio(soundHome);

        checkWinState();
        isMoving = false;
        handlePostMove(true);
        return;
    }
    
    const extraTurn = await checkEatOrSafe(tokenId);
    
    isMoving = false;
    handlePostMove(diceValue === 6 || extraTurn);
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
        targetElem.appendChild(tokenElem);
    }
}

async function checkEatOrSafe(movedTokenId) {
    const currentToken = tokens[movedTokenId];
    const currentCellId = PATHS[currentPlayer][currentToken.pathIndex];

    if (SAFE_CELLS.includes(currentCellId) || typeof currentCellId === 'string') {
        return false;
    }
    let hasEaten = false;
    for (const otherTokenId of Object.keys(tokens)) {
        const otherToken = tokens[otherTokenId];
        if (otherToken.color !== currentPlayer && otherToken.pathIndex >= 0 && !otherToken.isFinished) {
            const otherCellId = PATHS[otherToken.color][otherToken.pathIndex];
            if (currentCellId === otherCellId) {
                hasEaten = true;
                await resetTokenToBase(otherTokenId);
            }
        }
    }
    return hasEaten;
}
async function resetTokenToBase(tokenId) {
    const token = tokens[tokenId];
    const playerPath = PATHS[token.color];
    const currentPos = token.pathIndex;
    if (currentPos < 0) return;

    const randomEatSound = eatSounds[Math.floor(Math.random() * eatSounds.length)];
    randomEatSound.currentTime = 0;
    randomEatSound.loop = true;
    randomEatSound.play().catch(e => console.log(e));

    const stepDelay = Math.max(10, Math.min(100, Math.floor(1200 / (currentPos + 1))));
    for (let i = currentPos - 1; i >= 0; i--) {
        token.pathIndex = i;
        const previousCell = playerPath[i];
        moveTokenToCell(tokenId, previousCell);
        await delay(stepDelay);
    }
    token.pathIndex = -1;
    const tokenElem = document.getElementById(tokenId);
    if (tokenElem && token.initialParent) {
        token.initialParent.appendChild(tokenElem);
    }
    randomEatSound.pause();
    randomEatSound.currentTime = 0;
    randomEatSound.loop = false;
}

function handlePostMove(getsAnotherTurn) {
    hasRolled = false;
    if (!getsAnotherTurn) {
        switchTurn();
    }
}

function switchTurn() {
    currentPlayer = currentPlayer === 'red' ? 'yellow' : 'red';
    hasRolled = false;
    isMoving = false;
    consecutiveSixes = 0;
    updateDiceControls();
    sendP2PData({ type: 'TURN_SWITCHED', nextPlayer: currentPlayer });
}

function updateDiceControls() {
    const redDice = document.getElementById('dice-bottom-left');
    const yellowDice = document.getElementById('dice-top-right');

    if (currentPlayer === 'red') {
        redDice.style.opacity = '1';
        redDice.style.pointerEvents = 'auto';
        yellowDice.style.opacity = '0.4';
        yellowDice.style.pointerEvents = 'none';
    } else {
        yellowDice.style.opacity = '1';
        yellowDice.style.pointerEvents = 'auto';
        redDice.style.opacity = '0.4';
        redDice.style.pointerEvents = 'none';
    }
}

function checkWinState() {
    const playerTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer);
    const hasWon = playerTokens.every(id => tokens[id].isFinished);

    if (hasWon) {
        playAudio(soundWin);
        setTimeout(() => {
            alert(`🎉 অভিনন্দন! ${currentPlayer === 'red' ? 'লাল (Red)' : 'হলুদ (Yellow)'} প্লেয়ার জয়ী হয়েছেন!`);
        }, 500);
    }
}

/* ===================================================
   ৬. স্মার্ট ডাইস অ্যালগরিদম
   =================================================== */
const playerLuckPenalty = { red: 0, yellow: 0 };
const playerSixCounts = { red: 0, yellow: 0 };

function updateDiceBouncing() {
    const redDice = document.getElementById('dice-bottom-left');
    const yellowDice = document.getElementById('dice-top-right');

    if (redDice) redDice.style.animation = "";
    if (yellowDice) yellowDice.style.animation = "";

    if (!hasRolled && !isMoving) {
        if (currentPlayer === 'red' && redDice) {
            redDice.style.animation = "bounce 0.6s infinite alternate";
        } else if (currentPlayer === 'yellow' && yellowDice) {
            yellowDice.style.animation = "bounce 0.6s infinite alternate";
        }
    }
}
const originalUpdateDiceControls = updateDiceControls;
updateDiceControls = function() {
    originalUpdateDiceControls();
    updateDiceBouncing();
};

const originalResetTokenToBase = resetTokenToBase;
resetTokenToBase = async function(tokenId) {
    const eatenToken = tokens[tokenId];
    if (eatenToken && playerLuckPenalty.hasOwnProperty(eatenToken.color)) {
        playerLuckPenalty[eatenToken.color] += 0.02;
    }
    return await originalResetTokenToBase(tokenId);
};

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

/* ===================================================
   ৭. ৩ডি ডাইস রোলিং হ্যান্ডলার
   =================================================== */
function rollDice(diceId) {
    if (currentPlayer !== myRole) return;
    if (hasRolled || isMoving) return;

    const val = generateSmartDiceValue();
    processDiceRoll(diceId, val, false);
}

function processDiceRoll(diceId, forcedValue, isRemote = false) {
    const diceElement = document.getElementById(diceId);
    const cube = diceElement ? diceElement.querySelector('.cube') : null;

    if (diceElement) diceElement.style.animation = "";

    playAudio(soundDiceRoll);

    diceValue = forcedValue;
    hasRolled = true;

    if (!isRemote) {
        sendP2PData({ type: 'DICE_ROLLED', diceId: diceId, value: forcedValue });
    }

    if (diceValue === 6) {
        consecutiveSixes++;
        playerSixCounts[currentPlayer] = (playerSixCounts[currentPlayer] || 0) + 1;
    } else {
        consecutiveSixes = 0;
    }

    const xRotations = (Math.floor(Math.random() * 4) + 4) * 360;
    const yRotations = (Math.floor(Math.random() * 4) + 4) * 360;

    let xDeg = 0, yDeg = 0;
    switch (diceValue) {
        case 1: xDeg = 0; yDeg = 0; break;
        case 2: xDeg = -90; yDeg = 0; break;
        case 3: xDeg = 0; yDeg = -90; break;
        case 4: xDeg = 0; yDeg = 90; break;
        case 5: xDeg = 90; yDeg = 0; break;
        case 6: xDeg = 0; yDeg = 180; break;
    }

    if (cube) {
        cube.style.transform = `rotateX(${xRotations + xDeg}deg) rotateY(${yRotations + yDeg}deg)`;
    }

    if (diceValue === 6) {
        playAudio(soundSix, 1900);
    }

    setTimeout(async () => {
        const moveableTokens = getMoveableTokens();

        if (moveableTokens.length === 1) {
            setTokensBounce(moveableTokens, true);
            await delay(300);
            handleTokenClick(moveableTokens[0], isRemote);
        } else if (moveableTokens.length > 1) {
            setTokensBounce(moveableTokens, true);
        } else {
            if (diceValue === 6) {
                hasRolled = false;
                updateDiceControls();
            } else {
                switchTurn();
            }
        }
    }, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
    updateDiceBouncing();
});
