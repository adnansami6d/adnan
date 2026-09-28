/**
 * script.js - Complete Dice & Token Logic Fix
 */

const roomId = localStorage.getItem('ludo_room_id');
const myRole = localStorage.getItem('ludo_player_role') || 'red'; 
const isHost = localStorage.getItem('ludo_is_host') === 'true';

const API_URL = window.location.origin.includes('http') ? window.location.origin : "https://ludo-api.onrender.com";

let peer = null;
let conn = null;
let currentTurn = 'red'; 
let currentDiceValue = null;

const START_CELLS = {
    red: "cell-22",
    yellow: "cell-204"
};

function playSound(soundId) {
    const audio = document.getElementById(soundId);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }
}

// ইউআই আপডেট: চাল আসার অ্যানিমেশন
function updateTurnUI(moveableTokens = []) {
    document.querySelectorAll('.dice-container').forEach(d => d.classList.remove('turn-bounce'));
    document.querySelectorAll('.token').forEach(t => t.classList.remove('token-bounce'));

    if (currentTurn === myRole && !currentDiceValue) {
        const myDiceId = (myRole === 'red') ? 'dice-bottom-left' : 'dice-top-right';
        const diceElem = document.getElementById(myDiceId);
        if (diceElem) diceElem.classList.add('turn-bounce');
    }

    if (currentTurn === myRole && currentDiceValue && moveableTokens.length > 0) {
        moveableTokens.forEach(tokenId => {
            const tokenEl = document.getElementById(tokenId);
            if (tokenEl) tokenEl.classList.add('token-bounce');
        });
    }
}

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

// ডাইস রোলিং হ্যান্ডলার
async function handleDiceClick(clickedDiceId) {
    const myExpectedDiceId = (myRole === 'red') ? 'dice-bottom-left' : 'dice-top-right';

    if (clickedDiceId !== myExpectedDiceId) {
        alert("এটি আপনার ডাইস নয়!");
        return;
    }

    if (currentTurn !== myRole) {
        alert("অপনেন্টের চালের জন্য অপেক্ষা করুন!");
        return;
    }

    if (currentDiceValue !== null) {
        alert("আপনি অলরেডি ডাইস চাল দিয়েছেন!");
        return;
    }

    playSound('sound-dice');
    document.getElementById(clickedDiceId).classList.remove('turn-bounce');

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
            throw new Error(data.error || "Server Error");
        }
    } catch (err) {
        // সার্ভার সাড়া না দিলে ফলব্যাক রোল
        diceValue = Math.floor(Math.random() * 6) + 1;
        
        // লোকাল চেকিং: ৬ ছাড়া গুটি বেস থেকে বের হতে পারবে না
        const myTokens = Array.from(document.querySelectorAll(`.${myRole}-token`));
        if (diceValue === 6) {
            moveableTokens = myTokens.map(t => t.id);
        } else {
            // যদি গুটি বোর্ডের ঘরের ভেতরে থাকে (বেসের বাইরে), কেবল সেগুলো চালযোগ্য
            moveableTokens = myTokens.filter(t => !t.parentElement.classList.contains('home-inner-box')).map(t => t.id);
        }
    }

    currentDiceValue = diceValue;
    animateDiceRoll(clickedDiceId, diceValue);

    setTimeout(() => {
        // যদি চাল দেওয়ার মতো গুটি থাকে (Moveable Tokens > 0)
        if (moveableTokens.length > 0) {
            updateTurnUI(moveableTokens);
        } else {
            // ৬ না আসলে এবং চাল দেওয়ার মতো গুটি না থাকলে অটোমেটিক স্কিপ
            const nextTurn = (diceValue === 6) ? myRole : (myRole === 'red' ? 'yellow' : 'red');
            
            setTimeout(() => {
                currentTurn = nextTurn;
                currentDiceValue = null;
                updateTurnUI();

                if (conn && conn.open) {
                    conn.send({ type: 'SKIP_TURN', nextTurn: nextTurn });
                }
            }, 1000);
        }
    }, 1000);

    if (conn && conn.open) {
        conn.send({
            type: 'DICE_ROLLED',
            diceContainerId: clickedDiceId,
            value: diceValue,
            moveableTokens: moveableTokens
        });
    }
}

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

// গুটি সরানোর হ্যান্ডলার
async function handleTokenClick(tokenId) {
    if (currentTurn !== myRole) return;
    if (!currentDiceValue) {
        alert("আগে ডাইস রোল করুন!");
        return;
    }

    if (!tokenId.startsWith(myRole)) {
        alert("এটি আপনার গুটি নয়!");
        return;
    }

    playSound('sound-move');

    let validMove = false;
    let targetCellId = null;
    let nextTurn = (currentDiceValue === 6) ? myRole : (myRole === 'red' ? 'yellow' : 'red');

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
        // লোকাল ফলব্যাক
        if (currentDiceValue === 6) {
            validMove = true;
            targetCellId = START_CELLS[myRole];
        }
    }

    if (typeof targetCellId === 'number') {
        targetCellId = `cell-${targetCellId}`;
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

function moveTokenUI(tokenId, targetCellId) {
    const token = document.getElementById(tokenId);
    const targetCell = document.getElementById(targetCellId);

    if (token && targetCell) {
        targetCell.appendChild(token);
    }
}

window.onload = () => {
    initPeerConnection();
    updateTurnUI();
};
        
