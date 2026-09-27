
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
        38, 53, 68, 83 , 'home-bottom'
    ],
    yellow: [
        204, 189, 174, 159, 144, 130, 131, 132, 133, 134, 135, 120, 105, 104, 103, 102, 
        101, 100, 84, 69, 54, 39, 24, 9, 8,7,22,37,52,67,82, 96, 95, 94, 93, 92, 91, 
        106, 121, 122, 123, 124, 125, 126, 142, 157, 172, 187, 202,217,218,203,  188,173,158,143, 'home-top'
    ]
};

let currentPlayer = 'red';
let diceValue = 0;
let hasRolled = false;
let isMoving = false; 
let consecutiveSixes = 0
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
          tokenElem.addEventListener('click', () => handleTokenClick(tokenId));
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
await delay(stepDelay);}
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
            alert(`🎉 অভিনন্দন খানকির ছেলে! ${currentPlayer === 'red' ? 'লাল (Red)' : 'হলুদ (Yellow)'} প্লেয়ার জয়ী হয়েছেন!`);
        }, 500);
    }
}
// ==========================================
// ১. কাস্টম ডাইস ট্র্যাকার ও গ্লোবাল ভ্যারিয়েবল
// ==========================================

// প্লেয়ারের লাক পেনাল্টি ট্র্যাকার (প্রতিবার গুটি খেলে লাক কমবে)
const playerLuckPenalty = {
    red: 0,
    yellow: 0
};

// প্লেয়ারদের মোট ছক্কা (৬) গণনার ট্র্যাকার
const playerSixCounts = {
    red: 0,
    yellow: 0
};

// ==========================================
// ২. বাউন্স ও কাস্টম ফাংশন ওভাররাইড
// ==========================================

// পেজ লোড বা নতুন চালে এক্টিভ প্লেয়ারের ডাইস বাউন্স করানো
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

// আগের updateDiceControls ওভাররাইড করে বাউন্স অ্যানিমেশন যুক্ত করা
const originalUpdateDiceControls = updateDiceControls;
updateDiceControls = function() {
    originalUpdateDiceControls();
    updateDiceBouncing();
};

// গুটি খাওয়া খেলে পেনাল্টি ট্র্যাকার আপডেট করা
const originalResetTokenToBase = resetTokenToBase;
resetTokenToBase = async function(tokenId) {
    const eatenToken = tokens[tokenId];
    if (eatenToken && playerLuckPenalty.hasOwnProperty(eatenToken.color)) {
        playerLuckPenalty[eatenToken.color] += 0.02; // -2% Luck Penalty
    }
    return await originalResetTokenToBase(tokenId);
};

// ==========================================
// ৩. স্মার্ট ডাইস লজিক ও র্যান্ডম জেনারেটর
// ==========================================

// কাস্টম ওয়েটেড র্যান্ডম সিলেক্টর (Weighted Random Function)
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

// স্মার্ট ডাইস সংখ্যা জেনারেটর (সকল নিয়ম মেনে)
function generateSmartDiceValue() {
    const opponent = currentPlayer === 'red' ? 'yellow' : 'red';
    const playerPenalty = playerLuckPenalty[currentPlayer] || 0;

    // নিয়ম ৩: টানা ৩টি ৬ বন্ধ করা
    if (consecutiveSixes >= 2) {
        return Math.floor(Math.random() * 5) + 1; // ১ থেকে ৫
    }

    const myTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && !tokens[id].isFinished);
    const opponentTokens = Object.keys(tokens).filter(id => tokens[id].color === opponent && !tokens[id].isFinished);

    // নিয়ম ৪: অপোনেন্টের গুটি ৬ ঘরের মধ্যে থাকলে খাওয়ার ৪০% চান্স (সর্বোচ্চ প্রাধান্য)
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

    // অপোনেন্টকে খাওয়ার চান্স থাকলে এটি প্রাধান্য পাবে
    if (canEatOpponent) {
        return getWeightedRandom(eatDistance, 0.40, playerPenalty);
    }

    // নিয়ম ৫: সব গুটি বেসে থাকলে ৬০% চান্স ৬ পাওয়ার
    const allInBase = myTokens.every(id => tokens[id].pathIndex === -1);
    if (allInBase) {
        return getWeightedRandom(6, 0.60, playerPenalty);
    }

    // নিয়ম ৬: হোম ত্রিভুজের ১-২ ঘর দূরে থাকলে ৫০% চান্স সঠিক চাল পাওয়ার
    for (const id of myTokens) {
        const token = tokens[id];
        if (token.pathIndex >= 0) {
            const distanceToHome = (PATHS[currentPlayer].length - 1) - token.pathIndex;
            if (distanceToHome === 1 || distanceToHome === 2) {
                return getWeightedRandom(distanceToHome, 0.50, playerPenalty);
            }
        }
    }

    // নতুন নিয়ম ১: বোর্ডে যার গুটি বেশি এগোচ্ছে, তার ৪-৬ আসার ৮% বোনাস চান্স
    const myActiveTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && tokens[id].pathIndex > -1).length;
    const oppActiveTokens = Object.keys(tokens).filter(id => tokens[id].color === opponent && tokens[id].pathIndex > -1).length;

    if (myActiveTokens > oppActiveTokens) {
        if (Math.random() < Math.max(0.01, 0.08 - playerPenalty)) {
            const goodValues = [4, 5, 6];
            return goodValues[Math.floor(Math.random() * goodValues.length)];
        }
    }

    // নতুন নিয়ম ২: ২ ছক্কার ব্যবধানে ৯০% বাফ এবং ইউনিভার্সাল ৫% চান্স
    const mySixes = playerSixCounts[currentPlayer] || 0;
    const oppSixes = playerSixCounts[opponent] || 0;

    let sixProbability = 0.05; // ইউনিভার্সাল ৫% চান্স

    if (oppSixes - mySixes >= 2) {
        sixProbability = 0.90; // ৯০% চান্স বাফ
    }

    if (Math.random() < Math.max(0.01, sixProbability - playerPenalty)) {
        return 6;
    }

    // নিয়ম ৮: সাধারণ ১-৫ র্যান্ডম মান
    return Math.floor(Math.random() * 6) + 1;
}

// ==========================================
// ৪. মূল ডাইস রোলিং ফাংশন (3D Animation)
// ==========================================

function rollDice(diceId) {
    if ((currentPlayer === 'red' && diceId !== 'dice-bottom-left') ||
        (currentPlayer === 'yellow' && diceId !== 'dice-top-right') || hasRolled || isMoving) {
        return;
    }

    const diceElement = document.getElementById(diceId);
    const cube = diceElement ? diceElement.querySelector('.cube') : null;

    // বাউন্সিং বন্ধ করা
    if (diceElement) diceElement.style.animation = "";

    playAudio(soundDiceRoll);

    // স্মার্ট ডাইস মান বের করা
    diceValue = generateSmartDiceValue();

    hasRolled = true;

    if (diceValue === 6) {
        consecutiveSixes++;
        playerSixCounts[currentPlayer] = (playerSixCounts[currentPlayer] || 0) + 1;
    } else {
        consecutiveSixes = 0;
    }

    // ৩ডি অ্যানিমেশন হিসাব
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

    // অ্যানিমেশন শেষে চাল প্রসেস করা
    setTimeout(async () => {
        const moveableTokens = getMoveableTokens();

        if (moveableTokens.length === 1) {
            setTokensBounce(moveableTokens, true);
            await delay(300);
            handleTokenClick(moveableTokens[0]);
        } else if (moveableTokens.length > 1) {
            setTokensBounce(moveableTokens, true);
        } else {
            // চাল না থাকলে টার্ন কন্টিনিউ/সুইচ করা
            if (diceValue === 6) {
                hasRolled = false;
                updateDiceControls();
            } else {
                switchTurn();
            }
        }
    }, 1000);
}

// প্রারম্ভিক বাউন্স অ্যানিমেশন সক্রিয় করা
document.addEventListener('DOMContentLoaded', () => {
    updateDiceBouncing();
});
