/**
 * server.js - Central Express Server & Ludo Game API Handler
 * এই ফাইলটি সম্পূর্ণ সিকিউর এবং বাগ-মুক্ত ব্যাকএন্ড ইঞ্জিন হিসেবে কাজ করবে।
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// ১. ব্যাকএন্ডের সিকিউর লজিক ও ডাইস অ্যালগরিদম মডিউল ইম্পোর্ট
const { rollDiceAPI, addPenalty, resetConsecutiveSixes } = require('./api/dice');
const { 
    SAFE_CELLS, 
    PATHS, 
    getMoveableTokens, 
    validateAndCalculateMove, 
    checkEatMechanics, 
    checkWinState 
} = require('./api/logic');

const app = express();

// ২. প্রয়োজনীয় মিডলওয়্যার
app.use(cors());
app.use(express.json());

// স্ট্যাটিক ফাইল ফ্রন্টএন্ডে রেন্ডার করার কনফিগারেশন
app.use(express.static(path.join(__dirname)));

// ৩. ইন-মেমোরি গেম স্টেট হোল্ডার (Active Games in Server RAM)
const activeGames = {};

/**
 * গেম রুম স্টেট ইনিশিয়ালাইজ করার হেল্পার ফাংশন
 */
function getOrCreateRoomState(roomId) {
    const validRoomId = roomId && roomId.trim() !== '' ? roomId : 'default_room';

    if (!activeGames[validRoomId]) {
        activeGames[validRoomId] = {
            currentTurn: 'red',
            diceValue: 0,
            hasRolled: false,
            tokens: {
                'red-1': { color: 'red', pathIndex: -1, isFinished: false },
                'red-2': { color: 'red', pathIndex: -1, isFinished: false },
                'red-3': { color: 'red', pathIndex: -1, isFinished: false },
                'red-4': { color: 'red', pathIndex: -1, isFinished: false },
                'yellow-1': { color: 'yellow', pathIndex: -1, isFinished: false },
                'yellow-2': { color: 'yellow', pathIndex: -1, isFinished: false },
                'yellow-3': { color: 'yellow', pathIndex: -1, isFinished: false },
                'yellow-4': { color: 'yellow', pathIndex: -1, isFinished: false }
            }
        };
    }
    return activeGames[validRoomId];
}

// ==========================================
// ৪. ব্যাকএন্ড API এ্যান্ডপয়েন্টসমূহ
// ==========================================

// ৪.১ সার্ভার স্টেট টেস্ট হেলথ চেক
app.get('/api/status', (req, res) => {
    res.json({ status: "Online", message: "Ludo Game Engine is Running Properly!" });
});

// ৪.২ ডাইস রোলিং এ্যান্ডপয়েন্ট (/api/roll-dice)
app.post('/api/roll-dice', (req, res) => {
    try {
        const { roomId, player } = req.body;

        if (!player || (player !== 'red' && player !== 'yellow')) {
            return res.status(400).json({ success: false, error: "অবৈধ প্লেয়ার!" });
        }

        const game = getOrCreateRoomState(roomId);

        // চালের নিরাপত্তা যাচাই
        if (game.currentTurn !== player) {
            return res.status(400).json({ success: false, error: "এখন আপনার চালের সময় নয়!" });
        }

        if (game.hasRolled) {
            return res.status(400).json({ success: false, error: "আপনি অলরেডি ডাইস চাল দিয়েছেন!" });
        }

        // সিকিউর অ্যালগরিদম দিয়ে ডাইসের মান তৈরি
        const diceResult = rollDiceAPI(player, game.tokens, PATHS, SAFE_CELLS);
        
        game.diceValue = diceResult.diceValue;
        game.hasRolled = true;

        // চাল দেওয়ার মতো গুটি ফিল্টার করা
        const moveableTokens = getMoveableTokens(game.tokens, player, game.diceValue);

        // যদি চাল দেওয়ার মতো কোনো গুটি না থাকে, তবে অটোমেটিক টার্ন রিসেট করার ব্যবস্থা
        if (moveableTokens.length === 0 && game.diceValue !== 6) {
            game.hasRolled = false;
            game.diceValue = 0;
            game.currentTurn = (player === 'red') ? 'yellow' : 'red';
            resetConsecutiveSixes(player);
        }

        return res.json({
            success: true,
            diceValue: diceResult.diceValue,
            consecutiveSixes: diceResult.consecutiveSixes,
            moveableTokens: moveableTokens,
            hasMoveableToken: moveableTokens.length > 0,
            nextTurn: game.currentTurn
        });
    } catch (err) {
        console.error("Roll Dice Error:", err);
        return res.status(500).json({ success: false, error: "সার্ভারে সমস্যা হয়েছে!" });
    }
});

// ৪.৩ গুটি মুভমেন্ট ও চাল ভ্যালিডেশন এ্যান্ডপয়েন্ট (/api/move-token)
app.post('/api/move-token', (req, res) => {
    try {
        const { roomId, tokenId, player } = req.body;
        const game = getOrCreateRoomState(roomId);

        // ভ্যালিডেশন চেক
        if (game.currentTurn !== player) {
            return res.status(400).json({ validMove: false, message: "অবৈধ চাল চেষ্টা করা হয়েছে!" });
        }

        if (!game.hasRolled || game.diceValue === 0) {
            return res.status(400).json({ validMove: false, message: "আগে ডাইস রোল করতে হবে!" });
        }

        // গুটি মুভমেন্ট যাচাই
        const moveResult = validateAndCalculateMove(tokenId, game.diceValue, game.tokens, player);

        if (!moveResult.isValid) {
            return res.json({ validMove: false, message: moveResult.reason });
        }

        // ব্যাকএন্ড স্টেট আপডেট
        game.tokens[tokenId].pathIndex = moveResult.newIndex;
        if (moveResult.isFinished) {
            game.tokens[tokenId].isFinished = true;
        }

        // অপোনেন্ট গুটি খাওয়ার মেকানিক্স চেক
        const eatResult = checkEatMechanics(tokenId, moveResult.newIndex, game.tokens, player);

        if (eatResult.hasEaten) {
            eatResult.eatenTokenIds.forEach(eatenId => {
                game.tokens[eatenId].pathIndex = -1; // গুটি বেসে ফেরত পাঠানো
                const eatenColor = game.tokens[eatenId].color;
                addPenalty(eatenColor, 0.02);
            });
        }

        // বিজয় নির্ধারণ
        const isWinner = checkWinState(game.tokens, player);

        // অতিরিক্ত চাল পাওয়ার লজিক (৬ পড়লে, গুটি কাটলে বা বোর্ডে গুটি পাকালে)
        let extraTurn = (game.diceValue === 6 || eatResult.hasEaten || moveResult.isFinished);
        
        if (!extraTurn) {
            game.currentTurn = (player === 'red') ? 'yellow' : 'red';
            resetConsecutiveSixes(player);
        }

        game.hasRolled = false;
        const lastDiceValue = game.diceValue;
        game.diceValue = 0;

        return res.json({
            validMove: true,
            tokenId: tokenId,
            targetCellId: moveResult.targetCellId,
            isFinished: moveResult.isFinished,
            hasEaten: eatResult.hasEaten,
            eatenTokens: eatResult.eatenTokenIds,
            isWinner: isWinner,
            extraTurn: extraTurn,
            nextTurn: game.currentTurn,
            diceValueUsed: lastDiceValue
        });
    } catch (err) {
        console.error("Move Token Error:", err);
        return res.status(500).json({ validMove: false, message: "সার্ভার প্রসেসিং এরর!" });
    }
});

// ৫. হোম রাউট রিডাইরেক্ট (রুম পেজে পাঠাতে)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'room.html'));
});

// ৬. সার্ভার পোর্ট লিসেনিং
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Ludo Engine Server Running: http://localhost:${PORT}`);
    console.log(`=================================`);
});
            
