// ==========================================
// ১. সাউন্ডস এবং গ্লোবাল কনফিগারেশন
// ==========================================
const soundDiceRoll = new Audio('audio/dice-roll.mp3');
const soundSix = new Audio('audio/six.mp3');
const soundMove = new Audio('audio/move.mp3');
const eatSounds = [
    new Audio('audio/eat1.mp3'),
    new Audio('audio/eat2.mp3'),
    new Audio('audio/eat3.mp3')
];
const soundHome = new Audio('audio/home.mp3');
const soundWin = new Audio('audio/win.mp3');

// আপনার সঠিক JSONBin ID
const BIN_ID = "6aba2566ffd5d1605336db09";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

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

const playerLuckPenalty = { red: 0, yellow: 0 };
const playerSixCounts = { red: 0, yellow: 0 };

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

// ==========================================
// ২. প্রারম্ভিক ইনিশিয়ালাইজেশন
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    Object.keys(tokens).forEach(tokenId => {
        const tokenElem = document.getElementById(tokenId);
        if (tokenElem) {
            tokens[tokenId].initialParent = tokenElem.parentElement;
        }
    });
    setupTokenEvents();
    updateDiceControls();
    startOnlineSync();
});

function setupTokenEvents() {
    Object.keys(tokens).forEach(tokenId => {
        const tokenElem = document.getElementById(tokenId);
        if (tokenElem) {
            tokenElem.addEventListener('click', () => handleTokenClick(tokenId));
        }
    });
}

// ==========================================
// ৩. ৩ডি ডাইস রোলিং (Vercel Secure API)
// ==========================================
async function rollDice(diceId) {
    if ((currentPlayer === 'red' && diceId !== 'dice-bottom-left') ||
        (currentPlayer === 'yellow' && diceId !== 'dice-top-right') || hasRolled || isMoving) {
        return;
    }

    const diceElement = document.getElementById(diceId);
    if (diceElement) diceElement.style.animation = "";

    playAudio(soundDiceRoll);

    try {
        let response = await fetch('/api/roll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentPlayer,
                tokens,
                consecutiveSixes,
                playerLuckPenalty,
                playerSixCounts
            })
        });

        let data = await response.json();
        
        // API অফলাইন বা ফেইল করলে লোকাল র্যান্ডম ফলব্যাক
        if (!response.ok || !data.diceValue) {
            diceValue = Math.floor(Math.random() * 6) + 1;
        } else {
            diceValue = data.diceValue;
        }

        hasRolled = true;

        if (diceValue === 6) {
            consecutiveSixes++;
            playerSixCounts[currentPlayer] = (playerSixCounts[currentPlayer] || 0) + 1;
        } else {
            consecutiveSixes = 0;
        }

        animateDice3D(diceId, diceValue);

        if (diceValue === 6) {
            playAudio(soundSix, 1900);
        }

        setTimeout(async () => {
            const moveableTokens = getMoveableTokens();

            if (moveableTokens.length === 1) {
                setTokensBounce(moveableTokens, true);
                await delay(300);
                handleTokenClick(moveableTokens[0]);
            } else if (moveableTokens.length > 1) {
                setTokensBounce(moveableTokens, true);
            } else {
                if (diceValue === 6) {
                    hasRolled = false;
                    updateDiceControls();
                    pushStateToCloud();
                } else {
                    switchTurn();
                }
            }
        }, 1000);

    } catch (error) {
        console.error("Dice roll error:", error);
        diceValue = Math.floor(Math.random() * 6) + 1;
        hasRolled = true;
        animateDice3D(diceId, diceValue);
    }
}

function animateDice3D(diceId, val) {
    const diceElement = document.getElementById(diceId);
    const cube = diceElement ? diceElement.querySelector('.cube') : null;

    const xRotations = (Math.floor(Math.random() * 4) + 4) * 360;
    const yRotations = (Math.floor(Math.random() * 4) + 4) * 360;

    let xDeg = 0, yDeg = 0;
    switch (val) {
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
}

// ==========================================
// ৪. গুটি চালের লজিক ও ইন্টারঅ্যাকশন
// ==========================================
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

async function handleTokenClick(tokenId) {
    if (!hasRolled || isMoving) return;

    const token = tokens[tokenId];
    if (token.color !== currentPlayer || token.isFinished) return;

    const moveableTokens = getMoveableTokens();
    if (!moveableTokens.includes(tokenId)) return;

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
                playerLuckPenalty[otherToken.color] += 0.02;
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
    } else {
        updateDiceControls();
        pushStateToCloud();
    }
}

function switchTurn() {
    currentPlayer = currentPlayer === 'red' ? 'yellow' : 'red';
    hasRolled = false;
    isMoving = false;
    consecutiveSixes = 0;
    updateDiceControls();
    pushStateToCloud();
}

function updateDiceControls() {
    const redDice = document.getElementById('dice-bottom-left');
    const yellowDice = document.getElementById('dice-top-right');

    if (currentPlayer === 'red') {
        if (redDice) {
            redDice.style.opacity = '1';
            redDice.style.pointerEvents = 'auto';
        }
        if (yellowDice) {
            yellowDice.style.opacity = '0.4';
            yellowDice.style.pointerEvents = 'none';
        }
    } else {
        if (yellowDice) {
            yellowDice.style.opacity = '1';
            yellowDice.style.pointerEvents = 'auto';
        }
        if (redDice) {
            redDice.style.opacity = '0.4';
            redDice.style.pointerEvents = 'none';
        }
    }
    updateDiceBouncing();
}

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

// ==========================================
// ৫. অনলাইন সিঙ্ক্রোনাইজেশন (jsonbin.io)
// ==========================================
let lastSyncTimestamp = 0;

async function pushStateToCloud() {
    try {
        const payload = {
            currentPlayer,
            diceValue,
            hasRolled,
            tokensState: Object.keys(tokens).reduce((acc, key) => {
                acc[key] = { pathIndex: tokens[key].pathIndex, isFinished: tokens[key].isFinished };
                return acc;
            }, {}),
            timestamp: Date.now()
        };

        await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error("Cloud push error:", e);
    }
}

function startOnlineSync() {
    setInterval(async () => {
        if (isMoving || hasRolled) return;

        try {
            const res = await fetch(JSONBIN_URL + '/latest');
            if (!res.ok) return;
            
            const data = await res.json();
            const cloudState = data.record;

            if (cloudState && cloudState.timestamp > lastSyncTimestamp) {
                lastSyncTimestamp = cloudState.timestamp;
                
                if (cloudState.currentPlayer !== currentPlayer) {
                    currentPlayer = cloudState.currentPlayer;
                    hasRolled = cloudState.hasRolled;
                    diceValue = cloudState.diceValue;
                    updateDiceControls();
                }

                if (cloudState.tokensState) {
                    Object.keys(cloudState.tokensState).forEach(id => {
                        const cloudToken = cloudState.tokensState[id];
                        if (tokens[id] && tokens[id].pathIndex !== cloudToken.pathIndex) {
                            tokens[id].pathIndex = cloudToken.pathIndex;
                            tokens[id].isFinished = cloudToken.isFinished;

                            if (cloudToken.pathIndex >= 0) {
                                moveTokenToCell(id, PATHS[tokens[id].color][cloudToken.pathIndex]);
                            } else {
                                const tokenElem = document.getElementById(id);
                                if (tokenElem && tokens[id].initialParent) {
                                    tokens[id].initialParent.appendChild(tokenElem);
                                }
                            }
                        }
                    });
                }
            }
        } catch (e) {
            console.error("Sync error:", e);
        }
    }, 1200);
  }
      
