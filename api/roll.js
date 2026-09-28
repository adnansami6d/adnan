// api/roll.js

const BIN_ID = "6aba2566ffd5d1605336db09";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { currentPlayer, tokens, consecutiveSixes, playerLuckPenalty, playerSixCounts } = req.body;

        const diceValue = generateSmartDiceValue({
            currentPlayer,
            tokens,
            consecutiveSixes: consecutiveSixes || 0,
            playerLuckPenalty: playerLuckPenalty || { red: 0, yellow: 0 },
            playerSixCounts: playerSixCounts || { red: 0, yellow: 0 }
        });

        const updatedState = {
            diceValue: diceValue,
            currentPlayer: currentPlayer,
            timestamp: Date.now()
        };

        // jsonbin আপডেট করার রিকোয়েস্ট
        fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedState)
        }).catch(err => console.error("JSONBin Update Error:", err));

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
          
