/* =====================================================================
   NEON TEXAS HOLD'EM  -  js/pokerengine.js
   খেলার নিয়ম ও হিসাব: সিট, বেটিং রাউন্ড, পট, সাইড পট, বিজয়ী নির্ণয়।
   বট উঠে যাওয়া (সিট ফাঁকা) এবং টেবিল ফাঁকা হলে নতুন ৪ জন বসার নিয়মও এখানে।
   এখানে কোনো DOM/ডিজাইন/সাউন্ড নেই। নিয়মের সংখ্যা সব pokerconfig.js এ।

   সিট: 0 = ইউজার (নিচে), 1..4 = বট (ঘড়ির কাঁটার ক্রমে)। ফাঁকা সিট = null।

   game.js এর ব্যবহারের ক্রম:
     const game = new PokerEngine.Game(balance);        // ইউজার + প্রথম ৪ বট বসে
     const prep = game.prepareHand();                   // {ok, broke, left[], joined[], tableEmpty}
       ... (ঘোষণা, কাউন্টডাউন) ...
     const fees = game.collectEntryFees();              // কয়েন কালেক্ট
     const order = game.dealHoleCards();                // কোন সিটে কোন ক্রমে কার্ড যাবে
     game.beginBetting();
     while (true) {
       const p = game.current();
       if (p) { game.act(p.id, 'call') ...; continue; }
       const step = game.advance();                     // {type:'phase', cards} অথবা {type:'end', result}
       if (step.type === 'end') break;
     }
   ===================================================================== */
'use strict';

const PokerEngine = (() => {
  const K = PokerConfig;
  const Cards = PokerCards;
  const SEAT_COUNT = 5;

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  /* ===================== পট ভাগাভাগি (সাইড পট সহ) ===================== */
  // entries: [{id, hole, folded, totalBet}]
  function distributePot(entries, community) {
    const bests = {};
    const getBest = e => bests[e.id] || (bests[e.id] = Cards.evaluateBest(e.hole, community));

    const contrib = entries.filter(e => e.totalBet > 0);
    const levels = Array.from(new Set(contrib.map(e => e.totalBet))).sort((a, b) => a - b);
    const pots = [];
    let prev = 0, carry = 0;

    for (const lvl of levels) {
      const slice = lvl - prev; prev = lvl;
      const inPot = contrib.filter(e => e.totalBet >= lvl);
      const amount = slice * inPot.length + carry; carry = 0;
      const eligible = inPot.filter(e => !e.folded);
      if (!eligible.length) { carry = amount; continue; }
      pots.push({ amount, eligible: eligible.map(e => e.id) });
    }
    if (carry > 0 && pots.length) pots[pots.length - 1].amount += carry;

    const payouts = {};
    for (const pot of pots) {
      let winners;
      if (pot.eligible.length === 1) {
        winners = [pot.eligible[0]];
      } else {
        let bestScore = null; winners = [];
        for (const id of pot.eligible) {
          const e = entries.find(x => x.id === id);
          const b = getBest(e);
          const c = bestScore ? Cards.compareScores(b.score, bestScore) : 1;
          if (c > 0) { bestScore = b.score; winners = [id]; }
          else if (c === 0) winners.push(id);
        }
      }
      const share = Math.floor(pot.amount / winners.length);
      const rem = pot.amount - share * winners.length;
      winners.forEach((id, i) => { payouts[id] = (payouts[id] || 0) + share + (i === 0 ? rem : 0); });
      pot.winners = winners;
    }
    return { pots, payouts, bests };
  }

  /* ===================== গেম ===================== */
  class Game {
    constructor(humanChips, humanName) {
      this.seats = new Array(SEAT_COUNT).fill(null);
      this._botSerial = 0;
      this.seats[0] = this._newPlayer({ id: 'me', seat: 0, name: humanName || K.t('YOU'), chips: humanChips, isHuman: true });

      this.dealer = -1;
      this.deck = [];
      this.community = [];
      this.pot = 0;
      this.phaseIdx = 0;
      this.currentBet = 0;
      this.raises = 0;
      this.turn = -1;
      this.handOver = true;
      this.handNo = 0;
      this.lastResult = null;

      this.seatBots(false);                  // প্রথমবার: তালিকার প্রথম ৪ জন
    }

    _newPlayer(d) {
      return {
        id: d.id, seat: d.seat, name: d.name, isHuman: !!d.isHuman, chips: d.chips, profile: d.profile || null,
        hole: [], folded: false, allIn: false,
        bet: 0,        // এই রাউন্ডে দেওয়া
        totalBet: 0,   // এই হ্যান্ডে মোট দেওয়া (এন্ট্রি ফি সহ)
        acted: false, lastAction: null
      };
    }

    /* ---------- প্রশ্ন ---------- */
    get players() { return this.seats.filter(Boolean); }           // যারা এখন টেবিলে বসা
    get bots() { return this.seats.filter(p => p && !p.isHuman); }
    get human() { return this.seats[0]; }
    get phase() { return K.PHASES[this.phaseIdx]; }
    get unit() { return K.unitFor(this.phaseIdx); }                // এই ফেজের ন্যূনতম বেট: 15K, 30K, 60K, 120K
    byId(id) { return this.players.find(p => p.id === id) || null; }

    /* ---------- সিট: বট বসানো ---------- */
    // random=false: তালিকার ক্রমে (প্রথমবার)। random=true: র‍্যান্ডম (টেবিল ফাঁকা হওয়ার পর)
    seatBots(random) {
      const pool = random ? Cards.shuffle(K.BOT_POOL.slice()) : K.BOT_POOL.slice();
      const taken = new Set(this.players.map(p => p.name));
      const joined = [];
      for (let seat = 1; seat < SEAT_COUNT; seat++) {
        if (this.seats[seat]) continue;
        if (this.bots.length >= K.BOT_COUNT) break;
        const prof = pool.find(b => !taken.has(b.name));
        if (!prof) break;
        taken.add(prof.name);
        const p = this._newPlayer({ id: 'b' + (++this._botSerial), seat, name: prof.name, chips: K.botChips(), profile: prof });
        this.seats[seat] = p;
        joined.push({ seat, id: p.id, name: p.name, chips: p.chips });
      }
      return joined;
    }

    /* ---------- নতুন হ্যান্ডের প্রস্তুতি ----------
       ১) ইউজারের কয়েন এন্ট্রি ফি এর কম হলে broke (গেম ওভার)
       ২) যে বটের কয়েন এন্ট্রি ফি এর কম, সে উঠে যায়, সিট ফাঁকা (আবার কয়েন নেয় না)
       ৩) বট MIN_BOTS এর কম হলে "টেবিল ফাঁকা": বাকিরাও উঠে যায়, নতুন ৪ জন নতুন কয়েন নিয়ে বসে
       ৪) ডিলার বাটন সরে, ডেক শাফল হয়, সব রিসেট */
    prepareHand() {
      const out = { ok: true, broke: false, left: [], joined: [], tableEmpty: false };
      if (this.human.chips < K.ENTRY_FEE) { out.ok = false; out.broke = true; return out; }

      for (let s = 1; s < SEAT_COUNT; s++) {
        const p = this.seats[s];
        if (p && p.chips < K.ENTRY_FEE) {
          out.left.push({ seat: s, id: p.id, name: p.name, chips: p.chips });
          this.seats[s] = null;
        }
      }

      if (this.bots.length < K.MIN_BOTS) {
        out.tableEmpty = true;
        for (let s = 1; s < SEAT_COUNT; s++) {
          const p = this.seats[s];
          if (p) { out.left.push({ seat: s, id: p.id, name: p.name, chips: p.chips }); this.seats[s] = null; }
        }
        out.joined = this.seatBots(true);
      }

      this.handNo++;
      this.handOver = false;
      this.lastResult = null;
      this.community = [];
      this.pot = 0;
      this.phaseIdx = 0;
      this.currentBet = 0;
      this.raises = 0;
      this.turn = -1;
      this.deck = Cards.shuffle(Cards.createDeck());
      for (const p of this.players) {
        p.hole = []; p.folded = false; p.allIn = false;
        p.bet = 0; p.totalBet = 0; p.acted = false; p.lastAction = null;
      }
      this.dealer = this._nextSeat(this.dealer);
      out.dealer = this.dealer;
      return out;
    }

    // from এর পরের প্রথম বসা সিট (ঘড়ির কাঁটার ক্রমে)
    _nextSeat(from) {
      for (let k = 1; k <= SEAT_COUNT; k++) {
        const i = (((from + k) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
        if (this.seats[i]) return i;
      }
      return 0;
    }

    /* ---------- এন্ট্রি ফি কালেক্ট ---------- */
    collectEntryFees() {
      const fees = [];
      for (const p of this.players) {
        const fee = Math.min(K.ENTRY_FEE, p.chips);
        p.chips -= fee; p.totalBet += fee; this.pot += fee;
        if (p.chips === 0) p.allIn = true;
        fees.push({ seat: p.seat, id: p.id, paid: fee });
      }
      return fees;
    }

    /* ---------- হোল কার্ড বিলি: ডিলারের পর থেকে ঘড়ির কাঁটার ক্রমে, দুই চক্কর ---------- */
    dealHoleCards() {
      const order = [];
      for (let round = 0; round < 2; round++) {
        let seat = this.dealer;
        const count = this.players.length;
        for (let k = 0; k < count; k++) {
          seat = this._nextSeat(seat);
          this.seats[seat].hole.push(this.deck.pop());
          order.push(seat);
        }
      }
      return order;
    }

    beginBetting() {
      this._beginRound();
      return { unit: this.unit, turn: this.turn };
    }

    // সবকিছু একসাথে (টেস্টের জন্য)
    startHand() {
      const prep = this.prepareHand();
      if (!prep.ok) return prep;
      const fees = this.collectEntryFees();
      const dealOrder = this.dealHoleCards();
      this.beginBetting();
      return Object.assign(prep, { fees, dealOrder, fee: K.ENTRY_FEE, pot: this.pot, unit: this.unit });
    }

    _beginRound() {
      this.currentBet = 0;
      this.raises = 0;
      for (const p of this.players) {
        p.bet = 0; p.acted = false;
        if (!p.folded && !p.allIn) p.lastAction = null;
      }
      this._nextTurn(this.dealer);
    }

    _nextTurn(from) {
      for (let k = 1; k <= SEAT_COUNT; k++) {
        const i = (from + k) % SEAT_COUNT;
        const p = this.seats[i];
        if (p && !p.folded && !p.allIn && (!p.acted || p.bet < this.currentBet)) { this.turn = i; return; }
      }
      this.turn = -1;
    }

    _pay(p, amount) {
      amount = Math.max(0, Math.min(amount, p.chips));
      p.chips -= amount; p.bet += amount; p.totalBet += amount; this.pot += amount;
      if (p.chips === 0) p.allIn = true;
      return amount;
    }

    /* ---------- রাউন্ড শেষ কিনা ---------- */
    isRoundOver() {
      if (this.handOver) return true;
      const live = this.players.filter(p => !p.folded);
      if (live.length <= 1) return true;
      const actors = live.filter(p => !p.allIn);
      if (actors.length === 0) return true;
      if (actors.length === 1) return actors[0].bet >= this.currentBet;
      return actors.every(p => p.acted && p.bet === this.currentBet);
    }

    // এখন যার অ্যাকশন নেওয়ার পালা (রাউন্ড শেষ হলে null)
    current() {
      if (this.isRoundOver() || this.turn < 0) return null;
      return this.seats[this.turn];
    }

    /* ---------- কী কী করা যাবে ---------- */
    legalActions(p) {
      const toCall = Math.max(0, this.currentBet - p.bet);
      const maxRaiseTo = p.bet + p.chips;                                   // অল-ইন
      // রেইজ তখনই অর্থবহ যখন অন্তত একজন প্রতিপক্ষ সাড়া দিতে পারে
      const someoneCanRespond = this.players.some(o => o !== p && !o.folded && !o.allIn);
      const canRaise = this.raises < K.MAX_RAISES_PER_ROUND && p.chips > toCall && someoneCanRespond;
      const minRaiseTo = Math.min(this.currentBet + this.unit, maxRaiseTo);
      let potRaiseTo = p.bet + toCall + (this.pot + toCall);                // পট-সাইজ রেইজ
      potRaiseTo = clamp(K.snap(potRaiseTo), minRaiseTo, maxRaiseTo);

      // RAISE চাপলে কয়েন ৫ ভাগে: নিচে = ন্যূনতম রেইজ, একদম উপরে = অল-ইন
      const raiseLevels = [];
      if (canRaise) {
        const n = K.RAISE_LEVELS;
        for (let i = 0; i < n; i++) {
          let v = i === 0 ? minRaiseTo : (i === n - 1 ? maxRaiseTo : K.snap(minRaiseTo + (maxRaiseTo - minRaiseTo) * i / (n - 1)));
          v = clamp(v, minRaiseTo, maxRaiseTo);
          if (!raiseLevels.length || v > raiseLevels[raiseLevels.length - 1]) raiseLevels.push(v);
        }
      }

      return {
        canFold: true,
        canCheck: toCall === 0,
        canCall: toCall > 0,
        toCall,
        callAmount: Math.min(toCall, p.chips),
        canRaise,
        isBet: this.currentBet === 0,       // true হলে বাটনে "BET" লেখা যায়
        minRaiseTo, maxRaiseTo, potRaiseTo, raiseLevels,
        unit: this.unit, chips: p.chips, pot: this.pot
      };
    }

    /* ---------- অ্যাকশন: 'fold' | 'check' | 'call' | 'raise' (raiseTo = এই রাউন্ডে মোট কত) ---------- */
    act(id, action, raiseTo) {
      if (this.handOver) return { ok: false, error: 'hand_over' };
      const p = this.seats[this.turn];
      if (!p || p.id !== id) return { ok: false, error: 'not_your_turn' };

      const la = this.legalActions(p);
      const wasBet = this.currentBet === 0;
      let paid = 0;

      if (action === 'fold') {
        p.folded = true;
      } else if (action === 'check') {
        if (!la.canCheck) return { ok: false, error: 'cannot_check' };
        p.acted = true;
      } else if (action === 'call') {
        if (!la.canCall) return { ok: false, error: 'cannot_call' };
        paid = this._pay(p, la.toCall);
        p.acted = true;
      } else if (action === 'raise') {
        if (!la.canRaise) return { ok: false, error: 'cannot_raise' };
        const target = clamp(K.snap(+raiseTo || 0), la.minRaiseTo, la.maxRaiseTo);
        paid = this._pay(p, target - p.bet);
        this.currentBet = Math.max(this.currentBet, p.bet);
        this.raises++;
        for (const o of this.players) if (o !== p && !o.folded && !o.allIn) o.acted = false;
        p.acted = true;
      } else {
        return { ok: false, error: 'unknown_action' };
      }

      p.lastAction = { type: action, amount: paid, total: p.bet, allIn: p.allIn, isBet: wasBet };
      this._nextTurn(this.turn);

      return {
        ok: true,
        event: { type: action, playerId: p.id, seat: p.seat, name: p.name, amount: paid, total: p.bet, allIn: p.allIn, isBet: wasBet, pot: this.pot },
        roundOver: this.isRoundOver()
      };
    }

    /* ---------- রাউন্ড শেষে পরের ধাপ ----------
       ফেরত: {type:'phase', phase, phaseIdx, cards, unit}  অথবা  {type:'end', result} */
    advance() {
      if (this.handOver) return { type: 'end', result: this.lastResult };
      const live = this.players.filter(p => !p.folded);
      if (live.length === 1 || this.phaseIdx === 3) return { type: 'end', result: this.endHand() };

      this.phaseIdx++;
      this.deck.pop(); // বার্ন কার্ড
      const count = this.phaseIdx === 1 ? 3 : 1;
      const cards = [];
      for (let i = 0; i < count; i++) cards.push(this.deck.pop());
      this.community.push(...cards);
      this._beginRound();
      return { type: 'phase', phase: this.phase, phaseIdx: this.phaseIdx, cards, unit: this.unit };
    }

    /* ---------- হ্যান্ড শেষ: বিজয়ী নির্ণয় ও পট বিতরণ ---------- */
    endHand() {
      if (this.handOver && this.lastResult) return this.lastResult;

      const players = this.players;
      const live = players.filter(p => !p.folded);
      const showdown = live.length > 1;
      const entries = players.map(p => ({ id: p.id, hole: p.hole, folded: p.folded, totalBet: p.totalBet }));
      const dist = distributePot(entries, this.community);

      const potTotal = this.pot;
      const net = {}, hands = {};
      for (const p of players) {
        const won = dist.payouts[p.id] || 0;
        p.chips += won;
        net[p.id] = won - p.totalBet;
        if (showdown && !p.folded) hands[p.id] = dist.bests[p.id] || Cards.evaluateBest(p.hole, this.community);
      }
      this.pot = 0;

      const main = dist.pots[0];
      const winners = main ? main.winners.slice() : [];                      // মূল পটের বিজয়ী (টাই হলে একাধিক)
      const allWinners = Object.keys(dist.payouts).filter(id => dist.payouts[id] > 0);
      const reveal = showdown ? live.map(p => p.id) : [];                    // যাদের কার্ড সবাইকে দেখানো হবে (ফোল্ড করাদের নয়)

      this.handOver = true;
      this.turn = -1;
      this.lastResult = {
        showdown, potTotal,
        community: this.community.slice(),
        winners, allWinners, reveal,
        payouts: dist.payouts,   // {id: পাওয়া কয়েন}
        net,                     // {id: লাভ/ক্ষতি}
        hands,                   // {id: {score, cards, name, description}} (শুধু শোডাউনে)
        pots: dist.pots
      };
      return this.lastResult;
    }
  }

  return { SEAT_COUNT, distributePot, Game };
})();
