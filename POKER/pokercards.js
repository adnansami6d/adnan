/* =====================================================================
   NEON TEXAS HOLD'EM  -  js/pokercards.js
   কার্ড সংক্রান্ত সবকিছু: ডেক, শাফল, ৭ কার্ড থেকে সেরা ৫ কার্ডের হাত,
   হাতের তুলনা ও নাম, এবং জেতার সম্ভাবনা অনুমান (বটের জন্য)।
   এখানে বেটিং, পট, ডিজাইন কিছু নেই।

   ব্যবহার:
     const deck = PokerCards.shuffle(PokerCards.createDeck());
     const best = PokerCards.evaluateBest(holeCards, communityCards);
     best.score, best.cards (সেরা ৫টি), best.name ("Flush"), best.description ("Flush, Ace high")
     PokerCards.compareScores(a, b)  =>  1, 0, -1
   ===================================================================== */
'use strict';

const PokerCards = (() => {

  const HAND_NAMES = [
    'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
    'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'
  ];

  /* ===================== কার্ড ও ডেক ===================== */
  const SUITS = ['s', 'h', 'd', 'c'];
  const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const RANK_LABEL = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const RANK_NAME = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  const RANK_ID = '23456789TJQKA';

  // কার্ড: {id:'As', rank:14, suit:'s', label:'A', symbol:'♠', color:'black'|'red'}
  const FULL_DECK = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) {
      FULL_DECK.push(Object.freeze({
        id: RANK_ID[r - 2] + s, rank: r, suit: s,
        label: RANK_LABEL[r], symbol: SUIT_SYMBOL[s],
        color: (s === 'h' || s === 'd') ? 'red' : 'black'
      }));
    }
  }
  const BY_ID = {};
  FULL_DECK.forEach(c => { BY_ID[c.id] = c; });

  function randInt(n) {
    const c = globalThis.crypto;
    if (c && c.getRandomValues) {
      const a = new Uint32Array(1);
      c.getRandomValues(a);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function shuffle(arr) { // Fisher-Yates
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function createDeck() { return FULL_DECK.slice(); }
  function cardById(id) { return BY_ID[id] || null; }

  /* ===================== হ্যান্ড ইভালুয়েশন ===================== */
  // স্কোর = অ্যারে [ক্যাটাগরি, টাই-ব্রেকার...]; ক্যাটাগরি 0 (High Card) থেকে 9 (Royal Flush)
  function evaluate5(cs) {
    const ranks = [cs[0].rank, cs[1].rank, cs[2].rank, cs[3].rank, cs[4].rank];
    for (let i = 1; i < 5; i++) { // বড় থেকে ছোট সাজানো (insertion sort, দ্রুত)
      const v = ranks[i]; let j = i - 1;
      while (j >= 0 && ranks[j] < v) { ranks[j + 1] = ranks[j]; j--; }
      ranks[j + 1] = v;
    }
    const flush = cs[0].suit === cs[1].suit && cs[1].suit === cs[2].suit && cs[2].suit === cs[3].suit && cs[3].suit === cs[4].suit;

    // গ্রুপ: [কতটি, র‍্যাংক] — সংখ্যা বেশি আগে, সমান হলে বড় র‍্যাংক আগে
    const groups = [];
    for (let i = 0; i < 5; i++) {
      const last = groups[groups.length - 1];
      if (last && last[1] === ranks[i]) last[0]++; else groups.push([1, ranks[i]]);
    }
    for (let i = 1; i < groups.length; i++) { // stable insertion sort by count desc
      const g = groups[i]; let j = i - 1;
      while (j >= 0 && groups[j][0] < g[0]) { groups[j + 1] = groups[j]; j--; }
      groups[j + 1] = g;
    }
    const shape = groups.length === 5 ? '11111' : groups.map(g => g[0]).join('');

    let straightHigh = 0;
    if (groups.length === 5) {
      if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
      else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) straightHigh = 5; // A-2-3-4-5
    }

    if (straightHigh && flush) return straightHigh === 14 ? [9, 14] : [8, straightHigh];
    if (shape === '41') return [7, groups[0][1], groups[1][1]];
    if (shape === '32') return [6, groups[0][1], groups[1][1]];
    if (flush) return [5, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]];
    if (straightHigh) return [4, straightHigh];
    if (shape === '311') return [3, groups[0][1], groups[1][1], groups[2][1]];
    if (shape === '221') return [2, groups[0][1], groups[1][1], groups[2][1]];
    if (shape === '2111') return [1, groups[0][1], groups[1][1], groups[2][1], groups[3][1]];
    return [0, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]];
  }

  function compareScores(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  const comboCache = {};
  function combos(n) { // n টি কার্ড থেকে ৫টির সব কম্বিনেশনের ইনডেক্স
    if (comboCache[n]) return comboCache[n];
    const res = [];
    (function rec(start, cur) {
      if (cur.length === 5) { res.push(cur.slice()); return; }
      for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return (comboCache[n] = res);
  }

  function bestOf(cards) { // সেরা ৫ কার্ড (৫-৭ কার্ড থেকে)
    let bestScore = null, bestFive = null;
    for (const c of combos(cards.length)) {
      const five = [cards[c[0]], cards[c[1]], cards[c[2]], cards[c[3]], cards[c[4]]];
      const sc = evaluate5(five);
      if (!bestScore || compareScores(sc, bestScore) > 0) { bestScore = sc; bestFive = five; }
    }
    return { score: bestScore, cards: bestFive };
  }

  const plural = r => RANK_NAME[r] + 's';

  function describeHand(s) {
    switch (s[0]) {
      case 9: return 'Royal Flush';
      case 8: return 'Straight Flush, ' + RANK_NAME[s[1]] + ' high';
      case 7: return 'Four of a Kind, ' + plural(s[1]);
      case 6: return 'Full House, ' + plural(s[1]) + ' full of ' + plural(s[2]);
      case 5: return 'Flush, ' + RANK_NAME[s[1]] + ' high';
      case 4: return 'Straight, ' + RANK_NAME[s[1]] + ' high';
      case 3: return 'Three of a Kind, ' + plural(s[1]);
      case 2: return 'Two Pair, ' + plural(s[1]) + ' and ' + plural(s[2]);
      case 1: return 'Pair of ' + plural(s[1]);
      default: return 'High Card ' + RANK_NAME[s[1]];
    }
  }

  // hole(২) + community(৩-৫) থেকে সেরা হাত। ৫টির কম কার্ড থাকলে null।
  function evaluateBest(hole, community) {
    const cards = hole.concat(community);
    if (cards.length < 5) return null;
    const b = bestOf(cards);
    return {
      score: b.score, cards: b.cards, category: b.score[0],
      name: HAND_NAMES[b.score[0]], description: describeHand(b.score)
    };
  }

  /* ===================== সম্ভাবনা অনুমান (বটের জন্য) ===================== */
  // Monte Carlo: বাকি কার্ড র‍্যান্ডম দিয়ে আমার জেতার সম্ভাবনা (০ থেকে ১)
  // বট শুধু নিজের হাত ও টেবিলের কার্ড দেয়; অন্যদের কার্ড এখানে কখনো যায় না।
  function estimateEquity(hole, community, opponents, sims) {
    opponents = Math.max(1, opponents | 0);
    sims = sims || 200;
    const used = new Set();
    hole.concat(community).forEach(c => used.add(c.id));
    const pool = FULL_DECK.filter(c => !used.has(c.id));
    const need = opponents * 2 + (5 - community.length);
    let wins = 0, ties = 0;

    for (let s = 0; s < sims; s++) {
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      let k = 0;
      const board = community.slice();
      while (board.length < 5) board.push(pool[k++]);
      const mine = bestOf(hole.concat(board)).score;
      let beaten = false, tie = false;
      for (let o = 0; o < opponents; o++) {
        const oh = [pool[k++], pool[k++]];
        const c = compareScores(bestOf(oh.concat(board)).score, mine);
        if (c > 0) { beaten = true; break; }
        if (c === 0) tie = true;
      }
      if (!beaten) { if (tie) ties++; else wins++; }
    }
    return (wins + ties * 0.5) / sims;
  }

  return {
    HAND_NAMES, SUIT_SYMBOL,
    createDeck, shuffle, cardById,
    evaluate5, evaluateBest, bestOf, compareScores, describeHand,
    estimateEquity
  };
})();
