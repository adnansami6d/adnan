/**
 * api/logic.js - Secure Game Rules, Movement Validation & Path Maps
 * এই ফাইলটি শুধুমাত্র Node.js ব্যাকএন্ডে রান হবে এবং ফ্রন্টএন্ড থেকে হাইড থাকবে।
 */

// ১. সেফ জোন এবং প্লেয়ার ম্যাপ (আগের ফাইল অনুযায়ী ১০০% হুবহু)
const SAFE_CELLS = [22, 93, 122, 187, 204, 133, 104, 39];[span_1](start_span)[span_1](end_span)

const PATHS = {
    red: [
        22, 37, 52, 67, 82, 96, 95, 94, 93, 92, 91, 106, 121, 122, 123, 124, 125, 126, 
        142, 157, 172, 187, 202, 217, 218, 219, 204, 189, 174, 159, 144, 130, 131, 132, 
        133, 134, 135, 120, 105, 104, 103, 102, 101, 100, 84, 69, 54, 39, 24, 9, 8, 23, 
        38, 53, 68, 83, 'home-bottom'
    ],[span_2](start_span)[span_2](end_span)
    yellow: [
        204, 189, 174, 159, 144, 130, 131, 132, 133, 134, 135, 120, 105, 104, 103, 102, 
        101, 100, 84, 69, 54, 39, 24, 9, 8, 7, 22, 37, 52, 67, 82, 96, 95, 94, 93, 92, 91, 
        106, 121, 122, 123, 124, 125, 126, 142, 157, 172, 187, 202, 217, 218, 203, 188, 173, 158, 143, 'home-top'
    ][span_3](start_span)[span_3](end_span)
};

// ২. চালযোগ্য গুটি নির্ধারণ করা (Moveable Tokens Filter)
function getMoveableTokens(tokens, currentPlayer, diceValue) {
    const playerTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer && !tokens[id].isFinished);[span_4](start_span)[span_4](end_span)
    
    return playerTokens.filter(id => {
        const token = tokens[id];
        if (token.pathIndex === -1) {
            return diceValue === 6; // বেস থেকে বের হতে ৬ লাগবে
        }
        const newIndex = token.pathIndex + diceValue;
        return newIndex < PATHS[currentPlayer].length; // বোর্ডের শেষ সীমার বেশি চাল যাবে না
    });[span_5](start_span)[span_5](end_span)
}

// ৩. গুটি সরানোর ভ্যালিডেশন এবং নতুন পজিশন গণনা
function validateAndCalculateMove(tokenId, diceValue, tokens, currentPlayer) {
    const token = tokens[tokenId];

    // সিকিউরিটি চেক: প্লেয়ারের নিজস্ব গুটি কিনা এবং গেম শেষ হয়েছে কিনা
    if (!token || token.color !== currentPlayer || token.isFinished) {
        return { isValid: false, reason: "অবৈধ গুটি নির্বাচন করা হয়েছে!" };
    }

    const moveableTokens = getMoveableTokens(tokens, currentPlayer, diceValue);
    if (!moveableTokens.includes(tokenId)) {
        return { isValid: false, reason: "এই গুটিটি চাল দেওয়া সম্ভব নয়!" };
    }

    let targetPathIndex = token.pathIndex;

    // ১. গুটি ঘরের ভেতরে (Base/Home) থাকলে এবং ৬ পড়লে
    if (token.pathIndex === -1 && diceValue === 6) {
        targetPathIndex = 0;
    } 
    // ২. গুটি অলরেডি বোর্ডে থাকলে
    else if (token.pathIndex >= 0) {
        targetPathIndex = token.pathIndex + diceValue;
    }

    const targetCellId = PATHS[currentPlayer][targetPathIndex];
    const isFinished = (targetPathIndex === PATHS[currentPlayer].length - 1);[span_6](start_span)[span_6](end_span)

    return {
        isValid: true,
        tokenId: tokenId,
        oldIndex: token.pathIndex,
        newIndex: targetPathIndex,
        targetCellId: targetCellId,
        isFinished: isFinished
    };
}

// ৪. অপোনেন্ট গুটি খাওয়ার চেক (Check Eat Mechanics)
function checkEatMechanics(movedTokenId, targetPathIndex, tokens, currentPlayer) {
    const currentCellId = PATHS[currentPlayer][targetPathIndex];

    // সেফ জোনে থাকলে বা হোম ট্রায়াঙ্গেল ঘরে থাকলে খাওয়া যাবে না
    if (SAFE_CELLS.includes(currentCellId) || typeof currentCellId === 'string') {[span_7](start_span)[span_7](end_span)
        return { hasEaten: false, eatenTokenIds: [] };
    }

    let hasEaten = false;
    let eatenTokenIds = [];

    // অন্য প্লেয়ারের গুটি একই ঘরে আছে কি না তা যাচাই করা
    for (const otherTokenId of Object.keys(tokens)) {
        const otherToken = tokens[otherTokenId];
        if (otherToken.color !== currentPlayer && otherToken.pathIndex >= 0 && !otherToken.isFinished) {[span_8](start_span)[span_8](end_span)
            const otherCellId = PATHS[otherToken.color][otherToken.pathIndex];[span_9](start_span)[span_9](end_span)
            if (currentCellId === otherCellId) {[span_10](start_span)[span_10](end_span)
                hasEaten = true;
                eatenTokenIds.push(otherTokenId);
            }
        }
    }

    return {
        hasEaten: hasEaten,
        eatenTokenIds: eatenTokenIds
    };
}

// ৫. বিজয়ী ঘোষণা চেক করা (Check Win State)
function checkWinState(tokens, currentPlayer) {
    const playerTokens = Object.keys(tokens).filter(id => tokens[id].color === currentPlayer);[span_11](start_span)[span_11](end_span)
    return playerTokens.every(id => tokens[id].isFinished);[span_12](start_span)[span_12](end_span)
}

// Node.js এক্সপোর্ট (server.js এবং api/dice.js এর সাথে ব্যবহারের জন্য)
module.exports = {
    SAFE_CELLS,
    PATHS,
    getMoveableTokens,
    validateAndCalculateMove,
    checkEatMechanics,
    checkWinState
};
      
