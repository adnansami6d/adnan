/* =====================================================================
   NEON TEXAS HOLD'EM  -  js/pokerconfig.js
   গেমের সব নিয়ম, সময়, বটের তালিকা, সাউন্ডের নাম ও লেখা এই ফাইলে।
   কিছু বদলাতে চাইলে শুধু এখানে বদলান, অন্য JS ফাইল ছুঁতে হবে না।
   (রং/সাইজ/ডিজাইন এখানে নয়, সেগুলো style.css এ।)

   ১) নিয়ম       -> START_BALANCE, ENTRY_FEE, PHASE_MULTIPLIER ...
   ২) বট          -> BOT_POOL (নাম, স্বভাব, ভাবার সময়)
   ৩) সময়        -> TIME (সব মিলিসেকেন্ডে, ১০০০ = ১ সেকেন্ড)
   ৪) সংখ্যার ধরন -> DISPLAY
   ৫) সাউন্ড      -> SOUND
   ৬) লেখা        -> TEXT
   ===================================================================== */
'use strict';

const PokerConfig = (() => {

  const C = {

    /* ---------- ১) নিয়ম ---------- */
    STORAGE_KEY: 'neonHoldem.balance',   // localStorage এ ব্যালেন্সের নাম
    SOUND_KEY: 'neonHoldem.sound',       // সাউন্ড অন/অফ মনে রাখার নাম
    START_BALANCE: 100000,               // প্রথমবার ব্যালেন্স (1L)
    ENTRY_FEE: 15000,                    // প্রতি হ্যান্ডে সবার এন্ট্রি ফি
    PHASE_MULTIPLIER: 2,                 // প্রতি ফেজে ন্যূনতম বেট দ্বিগুণ (15K, 30K, 60K, 120K)
    MAX_RAISES_PER_ROUND: 3,             // এক রাউন্ডে সর্বোচ্চ কতবার রেইজ
    CHIP_STEP: 1000,                     // বেট এর ধাপ
    RAISE_LEVELS: 5,                     // RAISE চাপলে কয়েন কত ভাগে ভাগ হবে
    MIN_BOTS: 2,                         // টেবিলে এর কম বট বাকি থাকলে "TABLE EMPTY", তখন নতুন ৪ জন বসে

    BOT_COUNT: 4,                        // টেবিলে বটের সংখ্যা (সিট ১ থেকে ৪)
    BOT_START_CHIPS: 100000,             // বটদের শুরুর কয়েন
    BOT_CHIPS_VARIATION: [0.7, 1.3],     // বটের কয়েন এর কমবেশি (0.7 গুণ থেকে 1.3 গুণ)

    PHASES: ['PRE-FLOP', 'FLOP', 'TURN', 'RIVER'],

    /* ---------- ২) বটের তালিকা ----------
       প্রথম ৪ জন প্রথমবার বসে (index.html এর নামের সাথে মিলিয়ে)।
       টেবিল ফাঁকা হলে পুরো তালিকা থেকে র‍্যান্ডম ৪ জন বসে।
         aggression : শক্ত হাতে রেইজ করার সম্ভাবনা (০ থেকে ১)
         bluff      : দুর্বল হাতে ব্লাফ করার সম্ভাবনা
         caution    : বেশি হলে বেশি সাবধানী (১ = স্বাভাবিক)
         loose      : সন্দেহজনক অবস্থায়ও কল করার প্রবণতা
         think      : ভাবার সময় [কম, বেশি] মিলিসেকেন্ড (প্রত্যেকের আলাদা, ৫-৬ সেকেন্ড) */
    BOT_POOL: [
      { name: 'Sujat',    aggression: 0.30, bluff: 0.04, caution: 1.00, loose: 0.12, think: [5000, 5600] },
      { name: 'Hossain',  aggression: 0.55, bluff: 0.08, caution: 1.10, loose: 0.05, think: [5300, 5900] },
      { name: 'ACEbyjks', aggression: 0.75, bluff: 0.20, caution: 0.90, loose: 0.15, think: [5600, 6200] },
      { name: 'All maro', aggression: 0.65, bluff: 0.28, caution: 0.85, loose: 0.22, think: [5900, 6500] },
      { name: 'Rubel',    aggression: 0.45, bluff: 0.10, caution: 1.05, loose: 0.10, think: [5100, 5700] },
      { name: 'Nayeem',   aggression: 0.70, bluff: 0.15, caution: 0.95, loose: 0.18, think: [5400, 6000] },
      { name: 'Tania',    aggression: 0.35, bluff: 0.06, caution: 1.15, loose: 0.08, think: [5700, 6300] },
      { name: 'Shila',    aggression: 0.60, bluff: 0.22, caution: 0.90, loose: 0.20, think: [5200, 5800] }
    ],
    BOT_THINK_DEFAULT: [5000, 6000],     // প্রোফাইলে think না থাকলে

    /* ---------- ৩) সময় (মিলিসেকেন্ড) ---------- */
    TIME: {
      FIRST_HAND_DELAY: 600,             // START চাপার পর ফুলস্ক্রিন স্থির হওয়ার অপেক্ষা
      ANNOUNCE: 1800,                    // "GAME STARTING" দেখানোর সময়
      FIRST_COUNTDOWN_SECONDS: 5,        // প্রথম হ্যান্ডের আগে কাউন্টডাউন (সেকেন্ড)
      COUNTDOWN_SECONDS: 3,              // পরের হ্যান্ডগুলোর আগে কাউন্টডাউন (সেকেন্ড)
      COLLECT_PAUSE: 1000,               // এন্ট্রি ফি কালেক্টের পর বিরতি
      DEAL_GAP: 700,                     // এক কার্ড থেকে আরেক কার্ড বিলির বিরতি (ধীরে)
      DEAL_FLIGHT: 650,                  // একটা কার্ড উড়ে আসার সময় (CSS অ্যানিমেশন)
      COMMUNITY_GAP: 800,                // বোর্ডের কার্ড বিলির বিরতি
      FLIP_DELAY: 500,                   // কার্ড উল্টানোর আগে অপেক্ষা
      FLIP_TIME: 650,                    // কার্ড উল্টানোর পর অপেক্ষা
      ACTION_PAUSE: 600,                 // প্রতি চালের পর বিরতি
      BETWEEN_ROUNDS: 600,               // রাউন্ড শেষে বেট ব্যাজ মোছার আগে
      SHOWDOWN_HOLD: 3000,               // শোডাউনে সবার কার্ড দেখানোর সময় (৩ সেকেন্ড)
      PAYOUT_PAUSE: 1100,                // পট থেকে বিজয়ীর কাছে কয়েন যাওয়ার সময়
      CLEAR_PAUSE: 700,                  // বোর্ড পরিষ্কার করার পর বিরতি
      DEALER_SAY: 2200,                  // ডিলারের কথা দেখানোর সময়
      EMPTY_TABLE_PAUSE: 2600,           // "TABLE EMPTY" দেখানোর সময়
      BOT_LEAVE_PAUSE: 1400,             // বট উঠে যাওয়ার দৃশ্য
      FOLDED_SPEED: 0.35,                // ইউজার ফোল্ড করলে বাকি খেলা কত গুণ সময়ে চলবে (ছোট = দ্রুত)
      MESSAGE_MS: 1800,                  // টেবিলের মেসেজ কতক্ষণ থাকবে
      TOAST_MS: 2200                     // নিচের ছোট নোটিফিকেশন
    },

    /* ---------- ৪) সংখ্যার ধরন ----------
       'full'  => 100,000
       'short' => 1L, 15K, 40Cr */
    DISPLAY: {
      chips: 'full',      // নেমপ্লেট, পট, ব্যালেন্স
      bet: 'short'        // বেট ব্যাজ, বাটন, মেসেজ
    },

    /* ---------- ৫) সাউন্ড ----------
       ফাইলগুলো sounds/ ফোল্ডারে রাখুন। ফাইল না থাকলে গেম চলবে, শুধু শব্দ হবে না
       (countdown ছাড়া, কাউন্টডাউনে ফাইল না থাকলে ব্রাউজারেই টিক শব্দ তৈরি হয়)। */
    SOUND: {
      enabled: true,
      volume: 0.9,                            // ০ থেকে ১
      files: {
        coin: 'sounds/coin.mp3',              // কেউ বেট/চাল দিয়ে কয়েন ডিলারের কাছে দিলে
        collect: 'sounds/bordcoin.mp3',       // কয়েন কালেক্ট (এন্ট্রি ফি ও বিজয়ীর পট)
        win: 'sounds/win.mp3',                // কেউ জিতলে
        countdown: 'sounds/countdown.mp3'     // (ঐচ্ছিক) কাউন্টডাউনের প্রতি সেকেন্ডে
      },
      beep: {                                 // countdown.mp3 না থাকলে এই টিক শব্দ
        tick: { freq: 880, ms: 110 },
        go: { freq: 1320, ms: 320 }
      }
    },

    /* ---------- ৬) লেখা (স্ক্রিনে যা দেখা যায়) ---------- */
    TEXT: {
      GAME_STARTING: 'GAME STARTING',
      NEW_GAME_STARTING: 'NEW GAME STARTING',
      DEALER_NEW: 'New game starting!',
      COUNTDOWN_GO: 'DEAL!',
      ENTRY_FEE: 'Entry fee',
      MIN_BET: 'Min bet',
      TABLE_EMPTY: 'TABLE EMPTY!',
      NEW_PLAYERS: 'New players are joining',
      LEFT_TABLE: 'left the table',
      JOINED_TABLE: 'joined the table',
      YOU: 'You',
      FOLD: 'FOLD',
      CHECK: 'CHECK',
      CALL: 'CALL',
      RAISE: 'RAISE',
      BET: 'BET',
      RAISE_TO: 'RAISE TO',
      ALL_IN: 'ALL-IN',
      CONFIRM: 'CONFIRM',
      WIN: 'WIN',
      WINS_WITH: 'wins with',
      WINS: 'wins',
      EVERYONE_FOLDED: 'everyone else folded',
      SPLIT_POT: 'SPLIT POT',
      FOLDED: 'folded',
      CHECKED: 'checked',
      CALLED: 'called',
      BET_LOWER: 'bet',
      RAISED_TO: 'raised to',
      GAME_OVER: 'GAME OVER',
      GAME_OVER_SUB: 'Not enough chips for the entry fee',
      PLAY_AGAIN: 'RESET & PLAY AGAIN',
      BALANCE: 'Balance',
      TAP_AGAIN: 'TAP AGAIN TO CONFIRM',
      RESET_BALANCE: 'RESET BALANCE',
      BALANCE_RESET: 'Balance reset to',
      SOUND_ON: 'SOUND: ON',
      SOUND_OFF: 'SOUND: OFF'
    }
  };

  /* ===================== ছোট সহায়ক ফাংশন ===================== */
  const trim = v => String(Math.round(v * 100) / 100);

  function formatFull(n) { return Math.round(n).toLocaleString('en-US'); }      // 100,000

  function formatShort(n) {                                                      // 15K, 1L, 40Cr
    n = Math.round(n);
    if (n >= 1e7) return trim(n / 1e7) + 'Cr';
    if (n >= 1e5) return trim(n / 1e5) + 'L';
    if (n >= 1e3) return trim(n / 1e3) + 'K';
    return String(n);
  }

  // কয়েনের সংখ্যা DISPLAY.chips অনুযায়ী ('full' বা 'short')
  function chips(n) { return C.DISPLAY.chips === 'short' ? formatShort(n) : formatFull(n); }
  // বেট এর সংখ্যা DISPLAY.bet অনুযায়ী
  function bet(n) { return C.DISPLAY.bet === 'full' ? formatFull(n) : formatShort(n); }

  function snap(n) { return Math.round(n / C.CHIP_STEP) * C.CHIP_STEP; }

  // নির্দিষ্ট ফেজের ন্যূনতম বেট: unitFor(0)=15K, unitFor(1)=30K ...
  function unitFor(phaseIdx) { return C.ENTRY_FEE * Math.pow(C.PHASE_MULTIPLIER, phaseIdx); }

  function t(key) { return key in C.TEXT ? C.TEXT[key] : key; }

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function randInt(lo, hi) { return Math.round(rand(lo, hi)); }

  // বটের জন্য র‍্যান্ডম শুরুর কয়েন
  function botChips() {
    const v = C.BOT_CHIPS_VARIATION;
    return Math.max(C.ENTRY_FEE, snap(C.BOT_START_CHIPS * rand(v[0], v[1])));
  }

  return Object.assign(C, { formatFull, formatShort, chips, bet, snap, unitFor, t, rand, randInt, botChips });
})();
