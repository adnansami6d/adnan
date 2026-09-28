/**
 * server.js - Central Express Server & API Handler
 * এই ফাইলটি আপনার হোস্টিংয়ে (Render/Railway/Vercel) ব্যাকএন্ড হিসেবে রান করবে।
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// ১. সিকিউর API ফাইল দুটি সার্ভারে ইম্পোর্ট/রিকোয়ার করা
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

// মিডলওয়্যার কনফিগারেশন
app.use(cors()); // সকল ডোমেন বা ক্লায়েন্ট থেকে রিকোয়েস্ট এলাউ করার জন্য
app.use(express.json());

// ২. কেবল পাবলিক স্ট্যাটিক ফাইলগুলো ব্রাউজারে সার্ভ করা (HTML/CSS/JS/Sound)
// api/ ফোল্ডারটি এখানে অন্তর্ভুক্ত নেই, তাই ফ্রন্টএন্ড থেকে ফাইলগুলো দেখা যাবে না
app.use(express.static(__dirname));

// ৩. ইন-মেমোরি রুম গেম স্টেট (Active Games in Server RAM)
const activeGames = {};

// রুম স্টেট ইনিশিয়ালাইজেশন হেল্পার
function getOrCreateRoomState(roomId) {
    if (!activeGames[roomId]) {
        activeGames[roomId] = {
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
    return activeGames[roomId];
}

// ==========================================
// ৪. সিকিউর API এ্যান্ডপয়েন্টসমূহ (REST APIs)
// ==========================================

// ৪.১ সার্ভার হেলথ চেক এ্যান্ডপয়েন্ট
app.get('/api/status', (req, res) => {
    res.json({ status: "Online", message: "Ludo Secure Logic Server Active" });
});

// ৪.২ ডাইস রোলিং এ্যান্ডপয়েন্ট (/api/roll-dice)
app.post('/api/roll-dice', (req, res) => {
    const { roomId, player } = req.body;
    const game = getOrCreateRoomState(roomId || 'default_room');

    // সিকিউরিটি চেক: প্লেয়ারের টার্ন সঠিক আছে কি না
    if (game.currentTurn !== player) {
        return res.status(400).json({ error: "এখন আপনার চালের সময় নয়!" });
    }

    if (game.hasRolled) {
        return res.status(400).json({ error: "আপনি অলরেডি ডাইস চাল দিয়েছেন!" });
    }

    // api/dice.js এর সিকিউর স্মার্ট অ্যালগরিদম কল করা
    const diceResult = rollDiceAPI(player, game.tokens, PATHS, SAFE_CELLS);
    
    game.diceValue = diceResult.diceValue;
    game.hasRolled = true;

    // চালযোগ্য গুটি আছে কিনা বের করা
    const moveableTokens = getMoveableTokens(game.tokens, player, game.diceValue);

    res.json({
        success: true,
        diceValue: game.diceValue,
        consecutiveSixes: diceResult.consecutiveSixes,
        moveableTokens: moveableTokens,
        hasMoveableToken: moveableTokens.length > 0
    });
});

// ৪.৩ গুটি মুভমেন্ট ও ভ্যালিডেশন এ্যান্ডপয়েন্ট (/api/move-token)
app.post('/api/move-token', (req, res) => {
    const { roomId, tokenId, player } = req.body;
    const game = getOrCreateRoomState(roomId || 'default_room');

    // সিকিউরিটি চেক
    if (game.currentTurn !== player) {
        return res.status(400).json({ error: "অবৈধ চাল চেষ্টা করা হয়েছে!" });
    }

    if (!game.hasRolled || game.diceValue === 0) {
        return res.status(400).json({ error: "আগে ডাইস রোল করতে হবে!" });
    }

    // api/logic.js দিয়ে চাল ভ্যালিডেশন
    const moveResult = validateAndCalculateMove(tokenId, game.diceValue, game.tokens, player);

    if (!moveResult.isValid) {
        return res.json({ validMove: false, message: moveResult.reason });
    }

    // ব্যাকএন্ড স্টেটে গুটির নতুন অবস্থান আপডেট
    game.tokens[tokenId].pathIndex = moveResult.newIndex;
    if (moveResult.isFinished) {
        game.tokens[tokenId].isFinished = true;
    }

    // গুটি খাওয়ার মেকানিক্স চেক
    const eatResult = checkEatMechanics(tokenId, moveResult.newIndex, game.tokens, player);

    if (eatResult.hasEaten) {
        // খাওয়া যাওয়া গুটিগুলোকে বেসে ফেরত পাঠানো
        eatResult.eatenTokenIds.forEach(eatenId => {
            game.tokens[eatenId].pathIndex = -1;
            const eatenColor = game.tokens[eatenId].color;
            addPenalty(eatenColor, 0.02); // অপোনেন্টের জন্য লাক পেনাল্টি
        });
    }

    // বিজয়ী চেক
    const isWinner = checkWinState(game.tokens, player);

    // পরবর্তী টার্ন পরিবর্তন বা ধরে রাখা
    let extraTurn = (game.diceValue === 6 || eatResult.hasEaten || moveResult.isFinished);
    
    if (!extraTurn) {
        game.currentTurn = (player === 'red') ? 'yellow' : 'red';
        resetConsecutiveSixes(player);
    }

    game.hasRolled = false;
    const lastDiceValue = game.diceValue;
    game.diceValue = 0; // ডাইস মান রিসেট

    res.json({
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
});

// ৫. সার্ভার পোর্ট লিসেনিং
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Ludo Server running on Port: ${PORT}`);
    console.log(`🔒 API Directory protected in Node RAM`);
    console.log(`=================================`);
});
                  
