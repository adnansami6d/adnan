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

async function handleTokenClick(tokenId, isRemote = false) {
    if (isRemote) {
        while (isMoving) {
            await delay(50);
        }
    } else {
        if (!hasRolled || isMoving) return;
    }

    // অন্য প্লেয়ারকে গুটি চালের ডাটা পাঠানো 📡
    if (!isRemote && conn && conn.open) {
        conn.send({
            type: "TOKEN_MOVED",
            tokenId: tokenId
        });
    }

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
            alert(`🎉 অভিনন্দন Khan! ${currentPlayer === 'red' ? 'লাল (Red)' : 'হলুদ (Yellow)'} প্লেয়ার জয়ী হয়েছেন!`);
        }, 500);
    }
}

// ==========================================
// ১. কাস্টম ডাইস ট্র্যাকার ও গ্লোবাল ভ্যারিয়েবল
// ==========================================

const playerLuckPenalty = {
    red: 0,
    yellow: 0
};

const playerSixCounts = {
    red: 0,
    yellow: 0
};

// ==========================================
// ২. বাউন্স ও কাস্টম ফাংশন ওভাররাইড
// ==========================================

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

// ==========================================
// ৩. স্মার্ট ডাইস লজিক ও র্যান্ডম জেনারেটর
// ==========================================

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

// ==========================================
// ৪. মূল ডাইস রোলিং ফাংশন (3D Animation)
// ==========================================

async function rollDice(diceId, remoteValue = null) {
    if (remoteValue === null) {
        if (currentPlayer !== myColor) return;
        if ((currentPlayer === 'red' && diceId !== 'dice-bottom-left') ||
            (currentPlayer === 'yellow' && diceId !== 'dice-top-right') || hasRolled || isMoving) {
            return;
        }
    } else {
        while (isMoving) {
            await delay(50);
        }
    }

    const diceElement = document.getElementById(diceId);
    const cube = diceElement ? diceElement.querySelector('.cube') : null;

    if (diceElement) diceElement.style.animation = "";
    playAudio(soundDiceRoll);

    if (remoteValue !== null) {
        diceValue = remoteValue;
    } else {
        diceValue = generateSmartDiceValue();
        if (conn && conn.open) {
            conn.send({
                type: "DICE_ROLLED",
                diceId: diceId,
                value: diceValue
            });
        }
    }

    hasRolled = true;

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
            if (remoteValue === null) {
                handleTokenClick(moveableTokens[0], false);
            }
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
// ==========================================
// PeerJS অটো-কানেক্ট ও লিংক শেয়ারিং লজিক
// ==========================================

let peer = null;
let conn = null;
let myColor = null;
let currentRoomId = null;

// ১. পেজ লোড হলেই ইউআরএল (URL) চেক করা হবে
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');

    if (roomIdFromUrl) {
        // প্লেয়ার লিংকে ক্লিক করে এসেছে -> অটো জয়েন হবে
        autoJoinRoom(roomIdFromUrl);
    }
});

// ২. হোস্ট রুম তৈরি করবে
document.getElementById("create-room-btn").addEventListener("click", () => {
    myColor = 'red'; 
    currentRoomId = "ludo-" + Math.floor(100000 + Math.random() * 900000); // ৬ ডিজিটের ইউনিক আইডেন্টিফায়ার
    
    peer = new Peer(currentRoomId);

    peer.on("open", (id) => {
        // UI আপডেট
        document.getElementById("host-controls").style.display = "none";
        document.getElementById("invite-section").style.display = "block";
    });

    peer.on("connection", (connection) => {
        conn = connection;
        setupConnectionEvents();
    });

    peer.on("error", (err) => {
        console.error("Peer Error:", err);
        alert("কানেকশন তৈরি করতে সমস্যা হয়েছে! পেজ রিফ্রেশ করুন।");
    });
});

// ৩. অটো-জয়েন (Auto Join Logic)
function autoJoinRoom(targetRoomId) {
    myColor = 'yellow';
    
    // UI আপডেট
    document.getElementById("host-controls").style.display = "none";
    document.getElementById("status-msg").innerText = "🔄 রুমে যুক্ত হওয়া হচ্ছে...";

    peer = new Peer();
    
    peer.on("open", () => {
        conn = peer.connect(targetRoomId);
        setupConnectionEvents();
    });

    peer.on("error", (err) => {
        showRejoinModal("হোস্ট অফলাইন আছেন বা রুমটি বন্ধ হয়ে গেছে!");
    });
}

// ৪. ইনভাইট লিংক শেয়ারিং বাটন (Web Share API + Clipboard Fallback)
document.getElementById("share-invite-btn").addEventListener("click", async () => {
    if (!currentRoomId) return;

    // বর্তমান পেজের ইউআরএল দিয়ে ইনভাইট লিংক তৈরি
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'লুডু গেম ইনভাইট',
                text: 'আমার সাথে অনলাইন লুডু খেলো! নিচের লিংকে ক্লিক করে সরাসরি যুক্ত হও:',
                url: inviteUrl
            });
        } catch (err) {
            console.log("Share cancelled or failed:", err);
        }
    } else {
        // মোবাইল/ব্রাউজারে Share API না থাকলে ক্লিপবোর্ডে কপি হবে
        navigator.clipboard.writeText(inviteUrl).then(() => {
            alert("📋 ইনভাইট লিংক কপি হয়েছে! আপনার বন্ধুকে মেসেঞ্জারে পাঠিয়ে দিন।");
        });
    }
});

// ৫. কানেকশন হ্যান্ডলার এবং অফলাইন/ম্যাচ শেষ নোটিফিকেশন
function setupConnectionEvents() {
    conn.on("open", () => {
        console.log("কানেক্টেড!");
        document.getElementById("lobby-overlay").style.display = "none";
    });

    conn.on("data", (data) => {
        if (data.type === "DICE_ROLLED") {
            rollDice(data.diceId, data.value);
        }
        else if (data.type === "TOKEN_MOVED") {
            handleTokenClick(data.tokenId, true);
        }
    });

    // হোস্ট অফলাইন হলে বা কানেকশন কেটে গেলে
    conn.on("close", () => {
        showRejoinModal("গেম কানেকশন বিচ্ছিন্ন হয়েছে! নতুন খেলা শুরু করুন।");
    });
}

// ৬. অফলাইন বা খেলা শেষে নতুন রুম খোলার পপআপ
function showRejoinModal(message) {
    document.getElementById("lobby-overlay").style.display = "flex";
    document.getElementById("lobby-title").innerText = "গেম ওভার / বিচ্ছিন্ন 🎲";
    document.getElementById("host-controls").style.display = "block";
    document.getElementById("invite-section").style.display = "none";
    document.getElementById("status-msg").innerText = message;
    
    // URL থেকে পুরনো ?room= পারামিটার মুছে ফেলা
    window.history.replaceState({}, document.title, window.location.pathname);
}


// 🎙️ অটোমেটিক ভয়েস চ্যাট প্লাগইন (ফাইলের নিচে পেস্ট করার জন্য)
// ============================================================
(function () {
    let localStream = null;
    let isMuted = false;
    let activeCall = null;

    // ১. স্ক্রিনে অটোমেটিক মিউট/আনমিউট বাটন ও অডিও প্লেয়ার যোগ করা (UI Injection)
    function injectVoiceUI() {
        if (document.getElementById("voice-chat-widget")) return;

        const widget = document.createElement("div");
        widget.id = "voice-chat-widget";
        widget.innerHTML = `
            <style>
                #voice-chat-widget {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: rgba(15, 23, 42, 0.85);
                    padding: 8px 14px;
                    border-radius: 30px;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
                    color: #fff;
                    font-family: system-ui, -apple-system, sans-serif;
                    backdrop-filter: blur(8px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                #mic-toggle-btn {
                    background: #22c55e;
                    border: none;
                    color: white;
                    padding: 8px 14px;
                    border-radius: 20px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 13px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                #mic-toggle-btn:hover {
                    transform: scale(1.05);
                }
                #mic-toggle-btn.muted {
                    background: #ef4444;
                }
                #voice-status {
                    font-size: 12px;
                    color: #cbd5e1;
                }
            </style>
            <span id="voice-status">🎙️ মাইক রেডি</span>
            <button id="mic-toggle-btn">🔊 মাইক চালু</button>
            <audio id="remote-voice-audio" autoplay></audio>
        `;
        document.body.appendChild(widget);

        document.getElementById("mic-toggle-btn").addEventListener("click", toggleMic);
    }

    // ২. মাইক্রোফোনের পারমিশন নেওয়া
    async function getMicStream() {
        if (localStream) return localStream;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            updateStatus("🟢 কথা বলুন", true);
            return localStream;
        } catch (err) {
            console.error("মাইক্রোফোন এক্সেস পাওয়া যায়নি:", err);
            updateStatus("❌ মাইক ব্লকড", false);
            return null;
        }
    }

    // ৩. স্ট্যাটাস আপডেট
    function updateStatus(text, active = false) {
        const statusElem = document.getElementById("voice-status");
        if (statusElem) statusElem.innerText = text;
    }

    // ৪. মাইক মিউট / আনমিউট
    function toggleMic() {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isMuted = !isMuted;
            audioTrack.enabled = !isMuted;

            const btn = document.getElementById("mic-toggle-btn");
            if (isMuted) {
                btn.classList.add("muted");
                btn.innerHTML = "🔇 মাইক বন্ধ";
                updateStatus("🔇 মাইক মিউট", false);
            } else {
                btn.classList.remove("muted");
                btn.innerHTML = "🔊 মাইক চালু";
                updateStatus("🟢 কথা বলুন", true);
            }
        }
    }

    // ৫. অপোনেন্টের ভয়েস স্পিকারে শোনানো
    function handleRemoteStream(remoteStream) {
        const audioElem = document.getElementById("remote-voice-audio");
        if (audioElem) {
            audioElem.srcObject = remoteStream;
        }
        updateStatus("🟢 ভয়েস চালু আছে", true);
    }

    // ৬. PeerJS Monkey-Patch (কোড না পরিবর্তন করেই হুক করা)
    const OriginalPeer = window.Peer;
    if (OriginalPeer) {
        window.Peer = function (...args) {
            const instance = new OriginalPeer(...args);
            injectVoiceUI();

            // ইনকামিং ভয়েস কল রিসিভ করা (Host Side)
            instance.on("call", async (call) => {
                const stream = await getMicStream();
                if (stream) {
                    call.answer(stream);
                    call.on("stream", handleRemoteStream);
                    activeCall = call;
                }
            });

            return instance;
        };
        window.Peer.prototype = OriginalPeer.prototype;
    }

    // ৭. রুম তৈরি বা জয়েন করার সময় মাইক এক্টিভ করা
    document.addEventListener("click", (e) => {
        if (e.target && (e.target.id === "create-room-btn" || e.target.id === "join-room-btn")) {
            getMicStream();
        }
    });

    // ৮. কানেকশন ওপেন হলে অটোমেটিক ভয়েস কল দেওয়া (Joiner Side)
    setInterval(() => {
        if (typeof conn !== "undefined" && conn && conn.open && typeof peer !== "undefined" && peer && !activeCall) {
            if (typeof myColor !== "undefined" && myColor === 'yellow') {
                getMicStream().then((stream) => {
                    if (stream && conn.peer) {
                        const call = peer.call(conn.peer, stream);
                        call.on("stream", handleRemoteStream);
                        activeCall = call;
                    }
                });
            }
        }
    }, 1000);

})();
