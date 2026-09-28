/**
 * api/dice.js - Secure Backend Dice Generator and Algorithm
 * এই ফাইলটি শুধুমাত্র Node.js সার্ভারের ব্যাকএন্ডে রান হবে।
 */

// ১. গেমের স্টেটস এবং প্লেয়ার ট্র্যাকার (মেমোরিতে সিকিউর রাখা)
const playerLuckPenalty = {
    red: 0,
    yellow: 0
};

const playerSixCounts = {
    red: 0,
    yellow: 0
};

let consecutiveSixes = {
    red: 0,
    yellow: 0
};

// ২. হেল্পার ফাংশন: কাস্টম ওয়েটেড র্যান্ডম সিলেক্টর (Weighted Random Function)
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

// ৩. প্রধান সিকিউর ডাইস জেনারেটর (সার্ভার সাইড অ্যালগরিদম)
function generateSmartDiceValue(currentPlayer, tokens, PATHS, SAFE_CELLS) {
    const opponent = currentPlayer === 'red' ? 'yellow' : 'red';
    const playerPenalty = playerLuckPenalty[currentPlayer] || 0;

    // নিয়ম ১: টানা ৩টি ৬ বন্ধ করা (সার্ভার চেকিং)
    if (consecutiveSixes[currentPlayer] >= 2) {
        return Math.floor(Math.random() * 5) + 1; // ১ থেকে ৫ এর মধ্যে র্যান্ডম মান
    }

    const myTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && !tokens[id].isFinished);
    const opponentTokens = Object.keys(tokens).filter(id => tokens[id].color === opponent && !tokens[id].isFinished);

    // নিয়ম ২: অপোনেন্টের গুটি ৬ ঘরের মধ্যে থাকলে খাওয়ার ৪০% চান্স (সর্বোচ্চ প্রাধান্য)
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

    // নিয়ম ৩: সব গুটি বেসে থাকলে ৬০% চান্স ৬ পাওয়ার
    const allInBase = myTokens.every(id => tokens[id].pathIndex === -1);
    if (allInBase) {
        return getWeightedRandom(6, 0.60, playerPenalty);
    }

    // নিয়ম ৪: হোম ত্রিভুজের ১-২ ঘর দূরে থাকলে ৫০% চান্স সঠিক চাল পাওয়ার
    for (const id of myTokens) {
        const token = tokens[id];
        if (token.pathIndex >= 0) {
            const distanceToHome = (PATHS[currentPlayer].length - 1) - token.pathIndex;
            if (distanceToHome === 1 || distanceToHome === 2) {
                return getWeightedRandom(distanceToHome, 0.50, playerPenalty);
            }
        }
    }

    // নিয়ম ৫: বোর্ডে যার গুটি বেশি এগোচ্ছে, তার ৪-৬ আসার ৮% বোনাস চান্স
    const myActiveTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && tokens[id].pathIndex > -1).length;
    const oppActiveTokens = Object.keys(tokens).filter(id => tokens[id].color === opponent && tokens[id].pathIndex > -1).length;

    if (myActiveTokens > oppActiveTokens) {
        if (Math.random() < Math.max(0.01, 0.08 - playerPenalty)) {
            const goodValues = [4, 5, 6];
            return goodValues[Math.floor(Math.random() * goodValues.length)];
        }
    }

    // নিয়ম ৬: ২ ছক্কার ব্যবধানে ৯০% বাফ এবং ইউনিভার্সাল ৫% চান্স
    const mySixes = playerSixCounts[currentPlayer] || 0;
    const oppSixes = playerSixCounts[opponent] || 0;

    let sixProbability = 0.05; // ইউনিভার্সাল ৫% চান্স

    if (oppSixes - mySixes >= 2) {
        sixProbability = 0.90; // ৯০% চান্স বাফ
    }

    if (Math.random() < Math.max(0.01, sixProbability - playerPenalty)) {
        return 6;
    }

    // নিয়ম ৭: সাধারণ ১-৬ র্যান্ডম মান
    return Math.floor(Math.random() * 6) + 1;
}

// ৪. মূল এক্সপোর্টেড ফাংশন (যা server.js থেকে কল করা হবে)
function rollDiceAPI(currentPlayer, tokens, PATHS, SAFE_CELLS) {
    const diceValue = generateSmartDiceValue(currentPlayer, tokens, PATHS, SAFE_CELLS);

    // সিকিউর স্টেট আপডেট
    if (diceValue === 6) {
        consecutiveSixes[currentPlayer] = (consecutiveSixes[currentPlayer] || 0) + 1;
        playerSixCounts[currentPlayer] = (playerSixCounts[currentPlayer] || 0) + 1;
    } else {
        consecutiveSixes[currentPlayer] = 0;
    }

    return {
        diceValue: diceValue,
        consecutiveSixes: consecutiveSixes[currentPlayer]
    };
}

// ৫. পেনাল্টি আপডেট করার মেথড (যেমন: গুটি খাওয়া খেলে পেনাল্টি বাড়ে)
function addPenalty(playerColor, amount = 0.02) {
    if (playerLuckPenalty.hasOwnProperty(playerColor)) {
        playerLuckPenalty[playerColor] += amount;
    }
}

// ৬. রিসেট ফাংশন (টার্ন বা গেম শেষে ব্যবহারের জন্য)
function resetConsecutiveSixes(playerColor) {
    if (consecutiveSixes.hasOwnProperty(playerColor)) {
        consecutiveSixes[playerColor] = 0;
    }
}

// Node.js মডিউল এক্সপোর্ট
module.exports = {
    rollDiceAPI,
    addPenalty,
    resetConsecutiveSixes
};
  
