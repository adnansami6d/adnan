/* =====================================================================
   NEON TEXAS HOLD'EM  -  pokergamev2.js   (pokergame.js এর অনলাইন রূপ)
   পুরোনো pokerengine / pokerrender / pokerbots / pokercards / pokerconfig এখানে বদলানো লাগে না।

   ভূমিকা
   - হোস্ট (PokerNet.isHost()) : আসল গেম চালায় (ডেক, বেটিং, বটের চাল, পট)।
       প্রতিটি ui() ডাক নিজের স্ক্রিনে চালায় আর সবাইকে পাঠায়।
       প্রতিটি চালের পর পুরো গেম স্টেট (snapshot) সবাইকে পাঠায়।
   - ক্লায়েন্ট : হোস্টের পাঠানো ui ডাক নিজের স্ক্রিনে চালায়। নিজের পালায় বাটন দেখায়, উত্তর হোস্টকে পাঠায়।
   - হোস্ট চলে গেলে PokerNet পরের মানুষকে হোস্ট ঘোষণা করে, সে নিজের ক্যাশ করা snapshot থেকে
     চলমান হ্যান্ড চালিয়ে যায়।

   সিট
   - টেবিলে ৫ সিট (abs 0..4)। Man N বসে abs N-1 এ। abs 4 সবসময় খালি।
   - যে স্লটে মানুষ নেই সেখানে বট বসে। Man 1 = bot 3, Man 2 = bot 2, Man 3 = bot 1, Man 4 = bot 0
     (BOT_POOL এর ইনডেক্স)। ১ মানুষ = ৩ বট ... ৪ মানুষ = ০ বট।
   - প্রত্যেকের স্ক্রিনে নিজের সিট নিচে (view seat 0) দেখায়, বাকিরা ঘুরে যায়।

   বট ঢোকানো: ডিলার (হোস্ট) অনুরোধ করে। PokerBots.requestJoin(game, absSeat, avoidName) থাকলে সেটা
   ব্যবহার হয় (pokerbotsv2.js)। না থাকলে এই ফাইলের ভেতরের নিয়ম চলে।
   ===================================================================== */
'use strict';

const PokerGame = (() => {
  const K = PokerConfig;
  const T = K.TIME;
  const E = PokerEngine;
  const B = PokerBots;
  const A = PokerAudio;
  const D = PokerDevice;
  const V = PokerRender;
  const N = PokerNet;
  const C = PokerCards;

  const CANCEL = { cancelled: true };
  const MAX_ACTIONS_PER_ROUND = 200;
  const SEATS = E.SEAT_COUNT;            // 5
  const MAX_HUMANS = 4;
  const ASK_MS = 45000;                  // মানুষ এতক্ষণে চাল না দিলে নিজে চেক/ফোল্ড
  const FIELDS = ['seats', 'dealer', 'deck', 'community', 'pot', 'phaseIdx', 'currentBet', 'raises',
                  'turn', 'handOver', 'handNo', 'lastResult'];

  /* ===================== নিরাপদ ডাক ===================== */
  const warned = {};
  function ui(name, ...args) {
    const fn = V && V[name];
    if (typeof fn !== 'function') {
      if (!warned[name]) { warned[name] = true; console.warn('PokerRender.' + name + ' পাওয়া যায়নি'); }
      return undefined;
    }
    try { return fn.apply(V, args); }
    catch (e) { console.error('PokerRender.' + name + ' এ ভুল:', e); return undefined; }
  }
  function snd(name) { try { if (A && typeof A[name] === 'function') A[name](); } catch (e) { /* ignore */ } }
  const delay = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

  /* ===================== লেখা বানানো ===================== */
  function actionText(ev) {
    const n = ev.name;
    let s;
    if (ev.type === 'fold') s = n + ' ' + K.t('FOLDED');
    else if (ev.type === 'check') s = n + ' ' + K.t('CHECKED');
    else if (ev.type === 'call') s = n + ' ' + K.t('CALLED') + ' ' + K.bet(ev.amount);
    else s = n + ' ' + (ev.isBet ? K.t('BET_LOWER') : K.t('RAISED_TO')) + ' ' + K.bet(ev.total);
    if (ev.allIn && (ev.type === 'call' || ev.type === 'raise')) s += ' (' + K.t('ALL_IN') + ')';
    return s;
  }
  function winText(g, result) {
    const W = result.winners.map(id => g.byId(id)).filter(Boolean);
    if (!W.length) return '';
    if (!result.showdown) return W[0].name + ' ' + K.t('WINS') + ' (' + K.t('EVERYONE_FOLDED') + ')';
    const h = result.hands[W[0].id];
    const desc = h ? h.description : '';
    if (W.length > 1) return K.t('SPLIT_POT') + ': ' + W.map(p => p.name).join(' & ') + (desc ? ' - ' + desc : '');
    return W[0].name + ' ' + K.t('WINS_WITH') + ' ' + desc;
  }
  const namesOf = list => list.map(x => x.name).join(', ');
  const soundLabel = () => K.t(A.isEnabled() ? 'SOUND_ON' : 'SOUND_OFF');

  /* ===================== অবস্থা ===================== */
  let me = null;                         // {slot: 1..4, abs: 0..3}
  let game = null;                       // আসল engine (শুধু হোস্টে)
  let humans = {};                       // slot -> {name, chips, broke, ready}  (হোস্ট রাখে, snapshot এ যায়)
  let hosting = false;
  let session = null;
  let playing = false;
  let netBound = false;
  let synced = false;                    // ক্লায়েন্টের টেবিল একবার মেলানো হয়েছে কিনা
  let lastSnap = null;
  let lastPub = new Array(SEATS).fill(null);   // সর্বশেষ জানা সিটের চেহারা (abs ক্রমে)
  let brokeShown = false;
  const asks = {};                       // হোস্ট: slot -> {token, res}
  let askSerial = 0;
  let localAskToken = 0;

  /* ===================== ভিউ: নিজের সিট সবসময় নিচে ===================== */
  const vs = abs => (abs - me.abs + SEATS) % SEATS;
  const sw = o => Object.assign({}, o, { seat: vs(o.seat) });

  function pubOf(p) {
    return p ? { id: p.id, name: p.name, chips: p.chips, folded: !!p.folded, allIn: !!p.allIn, isHuman: !!p.isHuman, seat: p.seat } : null;
  }
  const pubSeats = () => game.seats.map(pubOf);

  // PokerRender যে "game" আশা করে: seats[0] = আমি, human = আমি
  function viewOf(pubArr) {
    const out = new Array(SEATS).fill(null);
    for (let abs = 0; abs < SEATS; abs++) {
      const p = pubArr[abs];
      if (!p) continue;
      const v = vs(abs);
      out[v] = Object.assign({}, p, { seat: v, name: abs === me.abs ? K.t('YOU') : p.name });
    }
    return { seats: out, human: out[0], players: out.filter(Boolean) };
  }

  // আসল (abs) সিট নম্বরের আর্গুমেন্ট -> নিজের স্ক্রিনের সিট নম্বর
  const TR = {
    setupTable: a => [viewOf(a[0])],
    updateSeats: a => [viewOf(a[0])],
    setDealer: a => [vs(a[0])],
    setActive: a => [a[0] < 0 ? -1 : vs(a[0])],
    foldSeat: a => [vs(a[0])],
    flyChipsToDealer: a => [vs(a[0]), a[1]],
    botLeave: a => [sw(a[0])],
    botJoin: a => [Object.assign(sw(a[0]), a[0].seat === me.abs ? { name: K.t('YOU') } : {})],
    flyFees: a => [a[0].map(sw)],
    dealHole: a => [vs(a[0]), a[1], a[2]],
    playerAction: a => [sw(a[0]), a[1]],
    revealHands: a => [a[0].map(sw)],
    showWinners: a => [a[0].map(sw), a[1]],
    flyPotToWinners: a => [a[0].map(sw)]
  };

  function saveMine() {
    const p = lastPub[me.abs];
    if (p && p.id === 'm' + me.slot) { try { D.saveBalance(p.chips); } catch (e) { /* ignore */ } }
  }
  const myChips = () => { const p = lastPub[me.abs]; return p ? p.chips : 0; };

  // নিজের স্ক্রিনে চালানো
  function localUI(name, args) {
    if (name === 'setupTable' || name === 'updateSeats') { lastPub = args[0]; saveMine(); }
    const f = TR[name];
    return ui(name, ...(f ? f(args) : args));
  }

  // হোস্ট: নিজের স্ক্রিনে চালানো + সবাইকে পাঠানো। ফেরত: নিজের অ্যানিমেশনের Promise
  function show(name, ...args) {
    N.broadcast({ t: 'ui', n: name, a: args });
    return Promise.resolve(localUI(name, args)).catch(e => console.error('PokerRender.' + name + ' এ ভুল:', e));
  }
  // হোল কার্ড: শুধু মালিক কার্ডের পরিচয় পায়
  function showDeal(seat, card, idx) {
    N.members().forEach(s => {
      if (s !== me.slot) N.sendTo(s, { t: 'ui', n: 'dealHole', a: [seat, (s - 1 === seat) ? card : null, idx] });
    });
    return Promise.resolve(localUI('dealHole', [seat, seat === me.abs ? card : null, idx]))
      .catch(e => console.error('dealHole এ ভুল:', e));
  }
  function sound(name) { N.broadcast({ t: 'snd', n: name }); snd(name); }
  function balToast() {
    N.broadcast({ t: 'bal' });
    ui('toast', K.t('BALANCE') + ': ' + K.chips(myChips()), T.TOAST_MS);
  }

  /* ===================== snapshot (হোস্ট বদলের জন্য) ===================== */
  function buildSnapshot(stage) {
    if (!game) return null;
    const st = {};
    FIELDS.forEach(f => { st[f] = game[f]; });
    st.botSerial = game._botSerial;
    return clone({ stage, st, humans });
  }
  function checkpoint(stage) { const s = buildSnapshot(stage); if (s) N.sendSnapshot(s); }

  function newEngine() {
    const g = new E.Game(0);             // কনস্ট্রাক্টর ইউজার+বট বসায়, সব খালি করে নিই
    g.seats.fill(null);
    g._botSerial = 0;
    g.dealer = -1;
    g.handOver = true;
    return g;
  }
  function restoreEngine(snap) {
    const g = newEngine();
    FIELDS.forEach(f => { g[f] = clone(snap.st[f]); });
    g._botSerial = snap.st.botSerial || 0;
    return g;
  }

  // যে কেউ (ক্লায়েন্ট বা নতুন হোস্ট) snapshot থেকে নিজের স্ক্রিন সাজায়
  function applySync(snap) {
    if (!snap || !snap.st || !me) return;
    const st = snap.st;
    const pub = st.seats.map(pubOf);
    localUI('setupTable', [pub]);
    if (st.dealer >= 0) ui('setDealer', vs(st.dealer));
    ui('setPot', st.pot);
    ui('setPhase', K.PHASES[st.phaseIdx], K.unitFor(st.phaseIdx));
    if (!st.handOver) {
      st.seats.forEach((p, abs) => {
        if (p && !p.folded) (p.hole || []).forEach((c, i) => ui('dealHole', vs(abs), abs === me.abs ? c : null, i));
      });
      const jobs = st.community.map((c, i) => ui('dealCommunityCard', c, i));
      if (st.community.length) Promise.all(jobs).then(() => ui('flipCommunity', 0, st.community.length));
    }
  }

  /* ===================== বট ঢোকানোর অনুরোধ (ডিলার -> বট) ===================== */
  function makeBot(abs, avoid) {
    const G = game;
    const taken = new Set(G.players.map(p => p.name));
    let prof = null;
    if (B && typeof B.requestJoin === 'function') {
      try { prof = B.requestJoin(G, abs, avoid); } catch (e) { prof = null; }
    }
    if (!prof) {
      const pool = K.BOT_POOL;
      const pref = pool[(MAX_HUMANS - 1) - abs];       // Man 1 (abs 0) = bot 3 ... Man 4 (abs 3) = bot 0
      if (!avoid && pref && !taken.has(pref.name)) prof = pref;
      else prof = C.shuffle(pool.slice()).find(b => !taken.has(b.name) && b.name !== avoid) ||
                  pool.find(b => !taken.has(b.name)) || pool[0];
    }
    return G._newPlayer({ id: 'b' + (++G._botSerial), seat: abs, name: prof.name, chips: K.botChips(), profile: prof });
  }

  /* ===================== নতুন হ্যান্ডের প্রস্তুতি (অনলাইন) ===================== */
  const infoOf = p => ({ seat: p.seat, id: p.id, name: p.name, chips: p.chips });
  const humanReady = h => !!h && h.ready !== false && !h.broke && h.chips >= K.ENTRY_FEE;

  function prepareOnline() {
    const out = { left: [], joined: [], broke: [], dealer: 0 };
    const G = game, fee = K.ENTRY_FEE;

    for (let slot = 1; slot <= MAX_HUMANS; slot++) {
      const abs = slot - 1, h = humans[slot], cur = G.seats[abs];

      if (cur && cur.isHuman) {
        if (!h) { out.left.push(infoOf(cur)); G.seats[abs] = null; }                   // চলে গেছে
        else if (cur.chips < fee) {                                                    // কয়েন শেষ
          h.broke = true; h.chips = 0;
          out.broke.push(slot); out.left.push(infoOf(cur)); G.seats[abs] = null;
        }
      } else if (cur) {                                                                // বট বসা
        if (humanReady(h) || cur.chips < fee) { out.left.push(infoOf(cur)); G.seats[abs] = null; }
      }

      if (!G.seats[abs]) {
        let p;
        if (humanReady(h)) p = G._newPlayer({ id: 'm' + slot, seat: abs, name: h.name, chips: h.chips, isHuman: true });
        else {
          const last = out.left[out.left.length - 1];
          p = makeBot(abs, last && last.seat === abs ? last.name : null);
        }
        G.seats[abs] = p;
        out.joined.push(infoOf(p));
      }
    }

    G.handNo++; G.handOver = false; G.lastResult = null;
    G.community = []; G.pot = 0; G.phaseIdx = 0; G.currentBet = 0; G.raises = 0; G.turn = -1;
    G.deck = C.shuffle(C.createDeck());
    for (const p of G.players) {
      p.hole = []; p.folded = false; p.allIn = false; p.bet = 0; p.totalBet = 0;
      p.acted = false; p.lastAction = null; delete p.left;
    }
    G.dealer = G._nextSeat(G.dealer);
    out.dealer = G.dealer;
    return out;
  }

  /* ===================== মানুষের চাল চাওয়া ===================== */
  async function askLocal(la) {
    const view = viewOf(lastPub);
    let tm;
    const timeout = new Promise(r => { tm = setTimeout(() => r(null), ASK_MS); });
    const d = await Promise.race([Promise.resolve(ui('askUser', la, view)), timeout]);
    clearTimeout(tm);
    ui('disableActions');
    return d;
  }

  function askRemote(slot, la) {
    return new Promise(res => {
      const token = ++askSerial;
      const done = d => { clearTimeout(tm); if (asks[slot] && asks[slot].token === token) delete asks[slot]; res(d); };
      const tm = setTimeout(() => { N.sendTo(slot, { t: 'askcancel' }); done(null); }, ASK_MS);
      asks[slot] = { token, res: done };
      N.sendTo(slot, { t: 'ask', la, token });
    });
  }

  /* ===================== কেউ চলে গেলে (হোস্ট) ===================== */
  function handleLeft(slot, quiet) {
    delete humans[slot];
    const a = asks[slot];
    if (a) a.res(null);
    if (!game) return;
    const p = game.seats[slot - 1];
    if (p && p.isHuman && !game.handOver && !p.folded) {
      p.left = true;
      if (game.turn !== slot - 1) {                       // তার পালা না হলে সাথে সাথে ফোল্ড
        p.folded = true;
        if (!quiet) { show('foldSeat', slot - 1); show('updateSeats', pubSeats()); }
      }
    }
  }

  /* =====================================================================
     হোস্টের সেশন: হ্যান্ডের পর হ্যান্ড
     ===================================================================== */
  function makeSession(resumeSnap) {
    let dead = false;
    const alive = () => { if (dead) throw CANCEL; };
    async function wait(ms) { await delay(ms); alive(); }
    async function U(name, ...args) { const r = await show(name, ...args); alive(); return r; }
    async function settle(list) { await Promise.all(list); alive(); }

    function stop() { dead = true; ui('disableActions'); Object.keys(asks).forEach(k => { try { asks[k].res(null); } catch (e) { /* */ } }); }

    /* ---------- বট/মানুষ উঠে যাওয়া ও বসা ---------- */
    async function seatChanges(prep) {
      if (prep.left.length) {
        const pend = prep.left.map(l => show('botLeave', l));
        show('message', namesOf(prep.left) + ' ' + K.t('LEFT_TABLE'), T.BOT_LEAVE_PAUSE);
        await wait(T.BOT_LEAVE_PAUSE);
        await settle(pend);
      }
      if (prep.joined.length) {
        const pend = prep.joined.map(j => show('botJoin', j));
        show('message', namesOf(prep.joined) + ' ' + K.t('JOINED_TABLE'), T.BOT_LEAVE_PAUSE);
        await wait(T.BOT_LEAVE_PAUSE);
        await settle(pend);
      }
    }

    async function countdown(seconds) {
      const tick = T.COUNTDOWN_TICK || 1000;
      const goHold = T.COUNTDOWN_GO_HOLD || 500;
      for (let s = seconds; s >= 1; s--) {
        show('countdown', String(s));
        sound('tick');
        await wait(tick);
      }
      show('countdown', K.t('COUNTDOWN_GO'));
      sound('go');
      await wait(goHold);
      show('hideCountdown');
    }

    async function dealHole() {
      const order = game.dealHoleCards();
      const seen = {};
      const pend = [];
      for (const seat of order) {
        const idx = seen[seat] || 0;
        seen[seat] = idx + 1;
        pend.push(showDeal(seat, game.seats[seat].hole[idx], idx));
        await wait(T.DEAL_GAP);
      }
      await settle(pend);
    }

    async function dealBoard(step) {
      show('setPhase', step.phase, step.unit);
      const start = game.community.length - step.cards.length;
      const pend = [];
      for (let i = 0; i < step.cards.length; i++) {
        pend.push(show('dealCommunityCard', step.cards[i], start + i));
        await wait(T.COMMUNITY_GAP);
      }
      await settle(pend);
      await wait(T.FLIP_DELAY);
      await U('flipCommunity', start, step.cards.length);
      await wait(T.FLIP_TIME);
    }

    function safeAct(p, d) {
      let res = game.act(p.id, d && d.action, d && d.amount);
      if (res.ok) return res;
      const la = game.legalActions(p);
      res = game.act(p.id, la.canCheck ? 'check' : 'fold');
      if (!res.ok) res = game.act(p.id, 'fold');
      return res;
    }

    async function bettingRound() {
      for (let guard = 0; guard < MAX_ACTIONS_PER_ROUND; guard++) {
        const p = game.current();
        if (!p) break;
        show('setActive', p.seat);

        let d;
        if (p.isHuman) {
          const slot = p.seat + 1;
          if (p.left || !humans[slot]) d = { action: 'fold' };
          else {
            const la = game.legalActions(p);
            d = (slot === me.slot) ? await askLocal(la) : await askRemote(slot, la);
            alive();
            if (!d) d = { action: la.canCheck ? 'check' : 'fold' };
          }
        } else {
          d = B.decide(game, p);                       // বট শুধু নিজের কার্ড ও বোর্ড দেখে
          await wait(B.thinkTime(p));
        }

        const res = safeAct(p, d);
        if (!res.ok) break;
        const ev = res.event;

        if (ev.type === 'fold') show('foldSeat', ev.seat);
        show('playerAction', ev, actionText(ev));

        let flight = null;
        if (ev.amount > 0) {
          sound('coin');
          flight = show('flyChipsToDealer', ev.seat, ev.amount);
        }
        show('updateSeats', pubSeats());
        show('setPot', game.pot);
        checkpoint('bet');

        await wait(T.ACTION_PAUSE);
        if (flight) await settle([flight]);
      }
      show('setActive', -1);
    }

    // PRE-FLOP -> FLOP -> TURN -> RIVER -> ফল
    async function bettingLoop() {
      while (true) {
        await bettingRound();
        await wait(T.BETWEEN_ROUNDS);
        show('clearBadges');
        const step = game.advance();
        if (step.type === 'end') return step.result;
        await dealBoard(step);
        checkpoint('bet');
      }
    }

    async function finishHand(result) {
      show('setActive', -1);
      show('clearBadges');

      if (result.showdown) {
        const list = result.reveal.map(id => {
          const p = game.byId(id);
          const h = result.hands[id];
          return {
            seat: p.seat, id, hole: p.hole.slice(),
            cards: h ? h.cards.map(c => c.id) : [],
            handName: h ? h.name : '', description: h ? h.description : ''
          };
        });
        await U('revealHands', list);
        await wait(T.FLIP_TIME);
      }

      const winners = result.allWinners.map(id => {
        const p = game.byId(id);
        const h = result.hands[id];
        return {
          seat: p.seat, id, name: p.name,
          amount: result.payouts[id] || 0, net: result.net[id] || 0,
          description: h ? h.description : ''
        };
      });
      show('showWinners', winners, winText(game, result));
      sound('win');
      if (result.showdown) await wait(T.SHOWDOWN_HOLD);
      else await wait(T.PAYOUT_PAUSE);

      sound('collect');
      await U('flyPotToWinners', winners.filter(w => w.amount > 0).map(w => ({ seat: w.seat, amount: w.amount })));
      show('setPot', 0);
      show('updateSeats', pubSeats());
      balToast();
      await wait(T.PAYOUT_PAUSE);

      show('resetHand');
      await wait(T.CLEAR_PAUSE);
    }

    async function playHand(first) {
      const prep = prepareOnline();

      show('resetHand');
      show('setPot', 0);
      show('setDealer', prep.dealer);
      await seatChanges(prep);
      show('updateSeats', pubSeats());
      prep.broke.forEach(slot => { if (slot === me.slot) handleMyBroke(); else N.sendTo(slot, { t: 'broke' }); });

      if (first) { show('announce', K.t('GAME_STARTING'), T.ANNOUNCE); await wait(T.ANNOUNCE); }
      else { show('dealerSay', K.t('DEALER_NEW'), T.DEALER_SAY); await wait(T.DEALER_SAY); }

      await countdown(first ? T.FIRST_COUNTDOWN_SECONDS : T.COUNTDOWN_SECONDS);

      const fees = game.collectEntryFees();
      show('message', K.t('ENTRY_FEE') + ' ' + K.bet(K.ENTRY_FEE), T.MESSAGE_MS);
      sound('collect');
      await U('flyFees', fees);
      show('updateSeats', pubSeats());
      show('setPot', game.pot);
      await wait(T.COLLECT_PAUSE);

      await dealHole();

      game.beginBetting();
      show('setPhase', game.phase, game.unit);
      checkpoint('bet');

      const result = await bettingLoop();
      await finishHand(result);
      checkpoint('idle');
    }

    async function run() {
      let first = true;
      if (resumeSnap) {
        first = false;
        if (resumeSnap.stage === 'bet' && !game.handOver) {      // চলমান হ্যান্ড নতুন হোস্ট শেষ করে
          show('setActive', -1);
          const result = await bettingLoop();
          await finishHand(result);
          checkpoint('idle');
        }
      } else {
        await wait(T.FIRST_HAND_DELAY);
        show('setupTable', pubSeats());
      }
      while (true) { await playHand(first); first = false; }
    }

    const done = run().then(() => 'ended', e => {
      if (e !== CANCEL) {
        console.error('গেমে ভুল:', e);
        ui('toast', 'Error: ' + (e && e.message ? e.message : e), T.TOAST_MS);
      }
      return 'cancelled';
    });
    return { stop, done };
  }

  function stopSession() { if (session) { session.stop(); session = null; } }

  /* ===================== হোস্ট হওয়া ===================== */
  function becomeHost(fresh) {
    hosting = true;
    const snap = fresh ? null : (N.lastSnapshot() || lastSnap);
    if (snap && snap.st) { game = restoreEngine(snap); humans = clone(snap.humans) || {}; }
    else { game = newEngine(); humans = {}; }

    const mem = N.members();
    Object.keys(humans).map(Number).forEach(s => { if (mem.indexOf(s) < 0) handleLeft(s, true); });
    if (!humans[me.slot]) humans[me.slot] = { name: 'Man ' + me.slot, chips: D.loadBalance(), broke: false, ready: true };
    mem.forEach(s => { if (!humans[s]) humans[s] = { name: 'Man ' + s, chips: K.START_BALANCE, broke: false, ready: false }; });

    N.setSnapshotProvider(() => buildSnapshot(game.handOver ? 'idle' : 'bet'));

    if (snap && snap.st) {
      const s = buildSnapshot(snap.stage);
      applySync(s);                                      // নিজের স্ক্রিন
      N.broadcast({ t: 'sync', snap: s });               // সবার স্ক্রিন একই করা
      ui('toast', K.t('NEW_HOST') || 'You are the host now', T.TOAST_MS);
      session = makeSession(s);
    } else {
      session = makeSession(null);
    }
  }

  /* ===================== শূন্য অবস্থায় ভাঙা কয়েন ===================== */
  async function handleMyBroke() {
    if (brokeShown) return;
    brokeShown = true;
    ui('disableActions');
    await ui('showGameOver', K.t('GAME_OVER'), K.t('GAME_OVER_SUB'), K.t('PLAY_AGAIN'));
    D.resetBalance();
    ui('hideGameOver');
    brokeShown = false;
    const chips = D.loadBalance();
    if (hosting) {
      const h = humans[me.slot];
      if (h) { h.broke = false; h.chips = chips; h.ready = true; }
    } else {
      N.sendTo(N.hostSeat(), { t: 'rejoin', chips });
    }
  }

  /* ===================== নেটওয়ার্কের বার্তা ===================== */
  function sendHello() {
    if (!me || hosting) return;
    N.sendTo(N.hostSeat(), { t: 'hello', chips: D.loadBalance() });
  }
  const sane = v => Math.max(0, Math.min(Number(v) || 0, 1e12));

  function onMessage(from, m) {
    if (!m || !m.t || !me) return;

    if (hosting) {                                       // হোস্ট শুধু ক্লায়েন্টের বার্তা শোনে
      if (m.t === 'hello' || m.t === 'rejoin') {
        const seated = game && game.seats[from - 1] && game.seats[from - 1].isHuman;
        const h = humans[from] || (humans[from] = { name: 'Man ' + from, chips: K.START_BALANCE, broke: false, ready: true });
        h.ready = true;
        if (m.t === 'rejoin') { h.broke = false; h.chips = sane(m.chips) || K.START_BALANCE; }
        else if (!seated) h.chips = sane(m.chips) || h.chips;
      } else if (m.t === 'act') {
        const a = asks[from];
        if (a && a.token === m.token) a.res({ action: m.action, amount: m.amount });
      }
      return;
    }

    if (from !== N.hostSeat()) return;                   // ক্লায়েন্ট শুধু হোস্টের কথা শোনে
    switch (m.t) {
      case 'ui': localUI(m.n, m.a); break;
      case 'snd': snd(m.n); break;
      case 'bal': ui('toast', K.t('BALANCE') + ': ' + K.chips(myChips()), T.TOAST_MS); break;
      case 'sync': synced = true; lastSnap = m.snap; applySync(m.snap); break;
      case 'broke': handleMyBroke(); break;
      case 'askcancel': localAskToken = 0; ui('disableActions'); break;
      case 'ask': {
        const token = m.token;
        localAskToken = token;
        askLocal(m.la).then(d => {
          if (localAskToken !== token || !d) return;
          N.sendTo(N.hostSeat(), { t: 'act', token, action: d.action, amount: d.amount });
        });
        break;
      }
      default: break;
    }
  }

  function bindNet() {
    if (netBound) return;
    netBound = true;
    N.on('message', onMessage);
    N.on('snapshot', snap => {
      if (!snap) return;
      lastSnap = snap;
      if (!me || hosting) return;
      if (!synced) { synced = true; applySync(snap); }
      else {
        const p = snap.st && snap.st.seats[me.abs];
        if (p && p.id === 'm' + me.slot) { try { D.saveBalance(p.chips); } catch (e) { /* ignore */ } }
      }
    });
    N.on('host', info => {
      if (!me) return;
      if (info.isHost && !hosting) becomeHost(false);
      else if (!info.isHost) { synced = true; sendHello(); }   // নতুন হোস্টকে নিজের কথা জানাই
    });
    N.on('left', seat => { if (hosting) handleLeft(seat, false); });
  }

  /* ===================== বাটনের কাজ ===================== */
  async function onStart() {
    if (playing) return;
    // এই দুটো অবশ্যই START ক্লিকের ভেতরেই (ব্রাউজারের নিয়ম)
    A.unlock();
    const fs = D.enterFullscreen();
    playing = true;
    D.setPlaying(true);
    ui('showGame');
    ui('setSoundLabel', soundLabel());
    bindNet();
    synced = false; lastSnap = null; hosting = false;

    try { await fs; } catch (e) { /* ফুলস্ক্রিন না পেলেও চলবে */ }

    let info;
    try { info = await N.join(); }
    catch (e) { console.error(e); playing = false; D.setPlaying(false); ui('showStart', D.loadBalance()); return; }
    if (!playing) { N.leave(); return; }                 // কানেক্ট হওয়ার মধ্যে বের হয়ে গেছে

    me = { slot: info.seat, abs: info.seat - 1 };
    D.update();
    ui('toast', info.roomId, T.TOAST_MS);
    localUI('setupTable', [new Array(SEATS).fill(null)]);

    if (info.isHost) becomeHost(true);
    else {
      sendHello();
      if (lastSnap && !synced) { synced = true; applySync(lastSnap); }
    }
  }

  function onExit() {
    playing = false;
    stopSession();
    hosting = false; me = null; game = null; humans = {}; synced = false; lastSnap = null;
    try { N.leave(); } catch (e) { /* ignore */ }
    A.stopAll();
    D.setPlaying(false);
    D.exitFullscreen();
    ui('hideGameOver');
    ui('showStart', D.loadBalance());
  }

  function onResetBalance() {
    D.resetBalance();
    ui('toast', K.t('BALANCE_RESET') + ' ' + K.chips(K.START_BALANCE), T.TOAST_MS);
    if (!playing) ui('showStart', D.loadBalance());
  }

  function onSound() { A.toggle(); ui('setSoundLabel', soundLabel()); }
  function onFullscreen() { D.toggleFullscreen(); }

  /* ===================== শুরু ===================== */
  function init() {
    ui('init');
    ui('bind', { start: onStart, exit: onExit, fullscreen: onFullscreen, sound: onSound, resetBalance: onResetBalance });
    ui('showStart', D.loadBalance());
    ui('setSoundLabel', soundLabel());
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return { init, onStart, onExit, isRunning: () => !!session, stop: stopSession };
})();
