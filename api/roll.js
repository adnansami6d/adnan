// api/roll.js

// নিরাপদ ডাটাবেজ লিংক (jsonbin.io)
const JSONBIN_URL = "https://api.jsonbin.io/v3/qs/6aba2566ffd5d1605336db09";

export default async function handler(req, res) {
    // শুধুমাত্র POST রিকোয়েস্ট গ্রহণ করা হবে
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { currentPlayer, tokens, consecutiveSixes, playerLuckPenalty, playerSixCounts } = req.body;

        // ১. সার্ভার সাইডে স্মার্ট ডাইস ভ্যালু গণনা (আপনার মূল লজিক অনুযায়ী)
        const diceValue = generateSmartDiceValue({
            currentPlayer,
            tokens,
            consecutiveSixes: consecutiveSixes || 0,
            playerLuckPenalty: playerLuckPenalty || { red: 0, yellow: 0 },
            playerSixCounts: playerSixCounts || { red: 0, yellow: 0 }
        });

        // ২. ডাটাবেজে (jsonbin.io) আপডেট পাঠানো
        const updatedState = {
            diceValue: diceValue,
            currentPlayer: currentPlayer,
            timestamp: Date.now()
        };

        await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedState)
        });

        // ৩. ক্লায়েন্ট ব্রাউজারে রেসপন্স পাঠানো
        return res.status(200).json({
            success: true,
            diceValue: diceValue
        });

    } catch (error) {
        console.error("Roll API Error:", error);
        return res.status(500).json({ error: "Server error rolling dice" });
    }
}

// ==========================================
// মূল স্মার্ট ডাইস অ্যালগরিদম (Server-Side)
// ==========================================

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

function generateSmartDiceValue(data) {
    const { currentPlayer, tokens, consecutiveSixes, playerLuckPenalty, playerSixCounts } = data;
    const opponent = currentPlayer === 'red' ? 'yellow' : 'red';
    const playerPenalty = playerLuckPenalty[currentPlayer] || 0;

    // ১. নিয়ম ৩: টানা ৩টি ৬ আটকানো
    if (consecutiveSixes >= 2) {
        return Math.floor(Math.random() * 5) + 1; // ১ থেকে ৫
    }

    const myTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && !tokens[id].isFinished);
    const opponentTokens = Object.keys(tokens).filter(id => tokens[id].color === opponent && !tokens[id].isFinished);

    // ২. নিয়ম ৪: অপোনেন্টের গুটি ৬ ঘরের মধ্যে থাকলে খাওয়ার ৪০% চান্স (সর্বোচ্চ প্রাধান্য)
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

    // ৩. নিয়ম ৫: সব গুটি বেসে থাকলে ৬০% চান্স ৬ পাওয়ার
    const allInBase = myTokens.every(id => tokens[id].pathIndex === -1);
    if (allInBase) {
        return getWeightedRandom(6, 0.60, playerPenalty);
    }

    // ৪. নিয়ম ৬: হোম ত্রিভুজের ১-২ ঘর দূরে থাকলে ৫০% চান্স সঠিক চাল পাওয়ার
    for (const id of myTokens) {
        const token = tokens[id];
        if (token.pathIndex >= 0) {
            const distanceToHome = (PATHS[currentPlayer].length - 1) - token.pathIndex;
            if (distanceToHome === 1 || distanceToHome === 2) {
                return getWeightedRandom(distanceToHome, 0.50, playerPenalty);
            }
        }
    }

    // ৫. নতুন নিয়ম ১: বোর্ডে যার গুটি বেশি এগোচ্ছে, তার ৪-৬ আসার ৮% বোনাস চান্স
    const myActiveTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && tokens[id].pathIndex > -1).length;
    const oppActiveTokens = Object.keys(tokens).filter(id => tokens[id].color === opponent && tokens[id].pathIndex > -1).length;

    if (myActiveTokens > oppActiveTokens) {
        if (Math.random() < Math.max(0.01, 0.08 - playerPenalty)) {
            const goodValues = [4, 5, 6];
            return goodValues[Math.floor(Math.random() * goodValues.length)];
        }
    }

    // ৬. নতুন নিয়ম ২: ২ ছক্কার ব্যবধানে ৯০% বাফ এবং ইউনিভার্সাল ৫% চান্স
    const mySixes = playerSixCounts[currentPlayer] || 0;
    const oppSixes = playerSixCounts[opponent] || 0;

    let sixProbability = 0.05; // ইউনিভার্সাল ৫% চান্স

    if (oppSixes - mySixes >= 2) {
        sixProbability = 0.90; // ৯০% চান্স বাফ
    }

    if (Math.random() < Math.max(0.01, sixProbability - playerPenalty)) {
        return 6;
    }

    // ৭. সাধারণ ১-৬ র্যান্ডম মান
    return Math.floor(Math.random() * 6) + 1;
              }
      
