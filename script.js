// ১. লোকাল স্টোরেজ থেকে রুম ও রোল ডাটা রিসিভ
const roomId = localStorage.getItem('ludo_room_id');
const myRole = localStorage.getItem('ludo_player_role') || 'red'; // 'red' or 'yellow'
const isHost = localStorage.getItem('ludo_is_host') === 'true';

// ব্যাকএন্ড API ইউআরএল (আপনার Node.js সার্ভারের লিংক)
const API_URL = "https://ludo-api.onrender.com"; // আপনার সার্ভার লাইভ হলে লিংক পরিবর্তন করুন

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

// ৩. PeerJS সেটআপ ও অপনেন্ট সিঙ্ক্রোনাইজেশন
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
        if (!isHost) {
            // গেস্ট হলে হোস্টের সাথে কানেক্ট করবে
            conn = peer.connect('ludo-' + roomId);
            setupConnectionListeners();
        }
    });

    peer.on('connection', (incomingConn) => {
        // হোস্ট হলে গেস্টের কানেকশন রিসিভ করবে
        conn = incomingConn;
        setupConnectionListeners();
    });
}

// ৪. অপনেন্টের চাল রিসিভ করার লিসেনার
function setupConnectionListeners() {
    conn.on('data', (data) => {
        if (data.type === 'DICE_ROLLED') {
            animateDiceRoll(data.diceContainerId, data.value);
            currentDiceValue = data.value;
        } else if (data.type === 'TOKEN_MOVED') {
            moveTokenUI(data.tokenId, data.targetCellId);
            currentTurn = data.nextTurn;
        }
    });
}

// ৫. ডাইস ক্লিক হ্যান্ডলার (সিকিউর API রোল)
async function handleDiceClick(diceContainerId) {
    // নিজের চাল না হলে ডাইস ক্লিক কাজ করবে না
    if ((myRole === 'red' && diceContainerId !== 'dice-bottom-left') ||
        (myRole === 'yellow' && diceContainerId !== 'dice-top-right')) {
        alert("এখন আপনার চাল নয়!");
        return;
    }

    if (currentTurn !== myRole) {
        alert("অপনেন্টের চালের জন্য অপেক্ষা করুন!");
        return;
    }

    playSound('sound-dice');

    try {
        // সিকিউর ব্যাকএন্ড Node.js API থেকে ডাইসের মান চাওয়া
        const response = await fetch(`${API_URL}/api/roll-dice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: roomId, player: myRole })
        });
        
        const data = await response.json();
        const diceValue = data.diceValue; // ব্যাকএন্ড থেকে জেনারেট হওয়া মান
        currentDiceValue = diceValue;

        // অ্যানিমেশন দেখান
        animateDiceRoll(diceContainerId, diceValue);

        // অপনেন্টকে PeerJS দিয়ে শুধু জানিয়ে দেওয়া যে ডাইস কত পড়েছে
        if (conn && conn.open) {
            conn.send({
                type: 'DICE_ROLLED',
                diceContainerId: diceContainerId,
                value: diceValue
            });
        }
    } catch (err) {
        // যদি ব্যাকএন্ড অফলাইন থাকে, তবে লোকাল ফলব্যাক জেনারেটর
        const fallbackValue = Math.floor(Math.random() * 6) + 1;
        currentDiceValue = fallbackValue;
        animateDiceRoll(diceContainerId, fallbackValue);
        
        if (conn && conn.open) {
            conn.send({ type: 'DICE_ROLLED', diceContainerId: diceContainerId, value: fallbackValue });
        }
    }
}

// ৬. ডাইস ৩ডি অ্যানিমেশন
function animateDiceRoll(containerId, value) {
    const cube = document.querySelector(`#${containerId} .cube`);
    if (!cube) return;

    // ৩ডি রোটেশন ডিগ্রী নির্ধারণ
    const rotations = {
        1: 'rotateX(0deg) rotateY(0deg)',
        6: 'rotateX(180deg) rotateY(0deg)',
        3: 'rotateX(0deg) rotateY(-90deg)',
        4: 'rotateX(0deg) rotateY(90deg)',
        2: 'rotateX(-90deg) rotateY(0deg)',
        5: 'rotateX(90deg) rotateY(0deg)'
    };

    cube.style.transition = 'transform 1s ease-out';
    cube.style.transform = `rotateX(${720 + Math.random()*360}deg) rotateY(${720 + Math.random()*360}deg)`;

    setTimeout(() => {
        cube.style.transform = rotations[value];
    }, 1000);
}

// ৭. গুটি ক্লিক হ্যান্ডলার (সিকিউর মুভমেন্ট লজিক)
async function handleTokenClick(tokenId) {
    if (currentTurn !== myRole) return;
    if (!currentDiceValue) {
        alert("আগে ডাইস রোল করুন!");
        return;
    }

    playSound('sound-move');

    try {
        // ব্যাকএন্ড API থেকে জেনে নেওয়া এই গুটি কোন সেলে যাবে
        const response = await fetch(`${API_URL}/api/move-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tokenId: tokenId,
                diceValue: currentDiceValue,
                player: myRole
            })
        });

        const data = await response.json();

        if (data.validMove) {
            moveTokenUI(tokenId, data.targetCellId);

            const nextTurn = (currentDiceValue === 6) ? myRole : (myRole === 'red' ? 'yellow' : 'red');
            currentTurn = nextTurn;
            currentDiceValue = null;

            // অপনেন্টকে নতুন গুটির পজিশন পাঠানো
            if (conn && conn.open) {
                conn.send({
                    type: 'TOKEN_MOVED',
                    tokenId: tokenId,
                    targetCellId: data.targetCellId,
                    nextTurn: nextTurn
                });
            }
        } else {
            alert("এই গুটিটি চাল দেওয়া সম্ভব নয়!");
        }
    } catch (err) {
        console.error("Move validation error:", err);
    }
}

// ৮. বোর্ডের ভিজ্যুয়াল গুটি সরানোর অ্যানিমেশন
function moveTokenUI(tokenId, targetCellId) {
    const token = document.getElementById(tokenId);
    const targetCell = document.getElementById(targetCellId);

    if (token && targetCell) {
        targetCell.appendChild(token);
    }
}

// ইনিশিয়ালাইজেশন
window.onload = () => {
    initPeerConnection();
};
            
