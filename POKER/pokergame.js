/* =====================================================================
   NEON TEXAS HOLD'EM  -  js/pokergame.js
   পুরো হ্যান্ডের ক্রম এখানে। এই ফাইল নিজে কিছু আঁকে না, শুধু ঠিক করে "কখন কী হবে"।
     আঁকা        -> PokerRender   (pokerrender.js)
     নিয়ম/পট     -> PokerEngine   (pokerengine.js)
     বটের চাল     -> PokerBots     (pokerbots.js)
     সাউন্ড       -> PokerAudio    (pokeraudio.js)
     ফুলস্ক্রিন/ব্যালেন্স -> PokerDevice (pokerdevice.js)
     সব সময়/লেখা -> PokerConfig   (pokerconfig.js)

   script এর ক্রম (index.html):
     pokerconfig, pokercards, pokerengine, pokerbots, pokeraudio, pokerdevice, pokerrender, pokergame

   হ্যান্ডের ক্রম:
     START -> (ফুলস্ক্রিন) -> সিট/বট উঠে যাওয়া -> ঘোষণা -> কাউন্টডাউন -> এন্ট্রি ফি কালেক্ট
     -> কার্ড বিলি -> বেটিং (PRE-FLOP, FLOP, TURN, RIVER) -> শোডাউন ৩ সেকেন্ড -> বিজয়ীর পট
     -> বোর্ড পরিষ্কার -> ডিলার "New game starting!" -> আবার কাউন্টডাউন

   ---------------------------------------------------------------------
   PokerRender এর কাছে যা যা চাই (সবগুলো ঐচ্ছিক-নিরাপদ: না থাকলে শুধু console এ সতর্কতা, গেম থামে না)
   যেগুলোর পাশে (P) আছে সেগুলো Promise ফেরত দেবে, অ্যানিমেশন শেষ হলে resolve করবে।

   স্ক্রিন ও বাটন
     init()                          একবার, শুরুতে
     bind({start, exit, fullscreen, sound, resetBalance})   বাটনের ক্লিকে এই ফাংশনগুলো ডাকবে
                                     (start অবশ্যই ক্লিকের ভেতরেই সরাসরি ডাকতে হবে)
     showStart(balance)              START স্ক্রিন দেখাও
     showGame()                      গেম স্ক্রিন দেখাও
     setSoundLabel(text)             সেটিংসের সাউন্ড বাটনের লেখা
     toast(text, ms)                 নিচের ছোট নোটিফিকেশন
   টেবিল
     setupTable(game)                নতুন গেমের জন্য পুরো টেবিল আঁকো
     updateSeats(game)               সব সিটের নাম, কয়েন, folded, allIn, ফাঁকা সিট
     setDealer(seat)                 ডিলার বাটন
     setPot(amount)                  পটের সংখ্যা
     setPhase(name, unit)            "FLOP" এবং ন্যূনতম বেট
     resetHand()                     বোর্ড, কার্ড, ব্যাজ, হাইলাইট সব পরিষ্কার
     botLeave(info) (P)              info = {seat, id, name, chips}
     botJoin(info)  (P)              info = {seat, id, name, chips}
   লেখা
     announce(text, ms)              "GAME STARTING"
     dealerSay(text, ms)             ডিলারের কথা
     message(text, ms)               টেবিলের মেসেজ
     tableEmpty(title, sub, ms)      "TABLE EMPTY!"
     countdown(text)                 "5", "4" ... "DEAL!"        hideCountdown()
   হ্যান্ড চলার সময়
     flyFees(fees) (P)               fees = [{seat, paid}], সবার কয়েন পটে
     dealHole(seat, card|null, idx) (P)   null মানে উল্টো কার্ড (বটের)। শুধু ইউজারের কার্ড আসে
     dealCommunityCard(card, index) (P)   বোর্ডে একটা কার্ড (উল্টো অবস্থায়)
     flipCommunity(startIndex, count) (P) বোর্ডের কার্ড উল্টানো
     setActive(seat)                 যার পালা (-1 = কেউ না)
     playerAction(event, text)       event = engine এর event, text = "Sujat raised to 45K"
     flyChipsToDealer(seat, amount) (P)
     clearBadges()                   বেট ব্যাজ মোছা
     foldSeat(seat)                  ফোল্ডের চেহারা
     askUser(la, game) (P)           বাটন দেখাও। ফেরত দেবে {action:'fold'|'check'|'call'|'raise', amount}
                                     la = game.legalActions(me)। raiseLevels এ ৫ ভাগের মান আছে
     disableActions()                বাটন বন্ধ
   শোডাউন
     revealHands(list) (P)           list = [{seat, id, hole, cards, handName, description}] শুধু ফোল্ড না করাদের
     showWinners(list, text)         list = [{seat, id, name, amount, net, description}]
     flyPotToWinners(list) (P)       list = [{seat, amount}]
   গেম ওভার
     showGameOver(title, sub, buttonText) (P)   বাটনে চাপলে resolve
     hideGameOver()
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

  const CANCEL = { cancelled: true };     // চলমান খেলা থামানোর সংকেত
  const MAX_ACTIONS_PER_ROUND = 200;      // অসীম লুপ ঠেকানোর নিরাপত্তা

  /* ===================== নিরাপদ ডাক ===================== */
  const warned = {};

  // PokerRender এর ফাংশন ডাকা। ফাংশন না থাকলে বা ভুল হলে গেম থামে না।
  function ui(name, ...args) {
    const fn = V && V[name];
    if (typeof fn !== 'function') {
      if (!warned[name]) { warned[name] = true; console.warn('PokerRender.' + name + ' পাওয়া যায়নি'); }
      return undefined;
    }
    try { return fn.apply(V, args); }
    catch (e) { console.error('PokerRender.' + name + ' এ ভুল:', e); return undefined; }
  }

  function snd(name) {
    try { if (A && typeof A[name] === 'function') A[name](); }
    catch (e) { /* সাউন্ডের ভুলে গেম থামবে না */ }
  }

  const delay = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));

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

  function winText(game, result) {
    const W = result.winners.map(id => game.byId(id)).filter(Boolean);
    if (!W.length) return '';
    if (!result.showdown) return W[0].name + ' ' + K.t('WINS') + ' (' + K.t('EVERYONE_FOLDED') + ')';
    const h = result.hands[W[0].id];
    const desc = h ? h.description : '';
    if (W.length > 1) return K.t('SPLIT_POT') + ': ' + W.map(p => p.name).join(' & ') + (desc ? ' - ' + desc : '');
    return W[0].name + ' ' + K.t('WINS_WITH') + ' ' + desc;
  }

  const namesOf = list => list.map(x => x.name).join(', ');
  const soundLabel = () => K.t(A.isEnabled() ? 'SOUND_ON' : 'SOUND_OFF');

  /* =====================================================================
     একটা "সেশন" = START চাপা থেকে বের হওয়া/গেম ওভার পর্যন্ত একটানা খেলা।
     stop() করলে চলমান সব অপেক্ষা পরের ধাপে নিজে থেকে থেমে যায়।
     ===================================================================== */
  function makeSession(entry) {
    let dead = false;
    let speed = 1;                       // ইউজার ফোল্ড করলে ছোট হয় (খেলা দ্রুত)

    const alive = () => { if (dead) throw CANCEL; };

    // অপেক্ষা। fixed=true হলে ফোল্ডের দ্রুত গতি প্রযোজ্য নয়
    async function wait(ms, fixed) { await delay(ms * (fixed ? 1 : speed)); alive(); }

    // PokerRender ডেকে শেষ হওয়া পর্যন্ত অপেক্ষা
    async function U(name, ...args) {
      let r;
      try { r = await ui(name, ...args); }
      catch (e) { console.error('PokerRender.' + name + ' এ ভুল:', e); }
      alive();
      return r;
    }

    // ডেকে সাথে সাথে ছেড়ে দেওয়া (অ্যানিমেশন চলতে থাকবে), পরে settle() দিয়ে অপেক্ষা
    function fire(name, ...args) {
      return Promise.resolve(ui(name, ...args)).catch(e => { console.error('PokerRender.' + name + ' এ ভুল:', e); });
    }
    async function settle(list) { await Promise.all(list); alive(); }

    function stop() {
      dead = true;
      ui('disableActions');
    }

    /* ---------- ব্যালেন্স সেভ (চালের সাথে সাথে, যাতে মাঝপথে বের হয়ে ক্ষতি এড়ানো না যায়) ---------- */
    function saveBalance(game) { try { D.saveBalance(game.human.chips); } catch (e) { /* ignore */ } }

    /* ---------- বট উঠে যাওয়া / নতুন বট বসা ---------- */
    async function seatChanges(prep) {
      if (prep.left.length) {
        const pend = prep.left.map(l => fire('botLeave', l));
        ui('message', namesOf(prep.left) + ' ' + K.t('LEFT_TABLE'), T.BOT_LEAVE_PAUSE);
        await wait(T.BOT_LEAVE_PAUSE);
        await settle(pend);
      }
      if (prep.tableEmpty) {
        ui('tableEmpty', K.t('TABLE_EMPTY'), K.t('NEW_PLAYERS'), T.EMPTY_TABLE_PAUSE);
        await wait(T.EMPTY_TABLE_PAUSE);
      }
      if (prep.joined.length) {
        const pend = prep.joined.map(j => fire('botJoin', j));
        ui('message', namesOf(prep.joined) + ' ' + K.t('JOINED_TABLE'), T.BOT_LEAVE_PAUSE);
        await wait(T.BOT_LEAVE_PAUSE);
        await settle(pend);
      }
    }

    /* ---------- কাউন্টডাউন ---------- */
    async function countdown(seconds) {
      const tick = T.COUNTDOWN_TICK || 1000;       // ঐচ্ছিক: config এর TIME এ COUNTDOWN_TICK দিলে বদলাবে
      const goHold = T.COUNTDOWN_GO_HOLD || 500;   // ঐচ্ছিক: COUNTDOWN_GO_HOLD
      for (let s = seconds; s >= 1; s--) {
        ui('countdown', String(s));
        snd('tick');
        await wait(tick, true);
      }
      ui('countdown', K.t('COUNTDOWN_GO'));
      snd('go');
      await wait(goHold, true);
      ui('hideCountdown');
    }

    /* ---------- হোল কার্ড বিলি ---------- */
    async function dealHole(game) {
      const order = game.dealHoleCards();
      const seen = {};
      const pend = [];
      for (const seat of order) {
        const idx = seen[seat] || 0;
        seen[seat] = idx + 1;
        const card = game.seats[seat].hole[idx];
        // বটের কার্ডের পরিচয় এখানে পাঠানো হয় না, শুধু উল্টো কার্ড ওড়ে
        pend.push(fire('dealHole', seat, seat === 0 ? card : null, idx));
        await wait(T.DEAL_GAP);
      }
      await settle(pend);
    }

    /* ---------- বোর্ডের কার্ড (ফ্লপ/টার্ন/রিভার) ---------- */
    async function dealBoard(game, step) {
      ui('setPhase', step.phase, step.unit);
      const start = game.community.length - step.cards.length;
      const pend = [];
      for (let i = 0; i < step.cards.length; i++) {
        pend.push(fire('dealCommunityCard', step.cards[i], start + i));
        await wait(T.COMMUNITY_GAP);
      }
      await settle(pend);
      await wait(T.FLIP_DELAY);
      await U('flipCommunity', start, step.cards.length);
      await wait(T.FLIP_TIME);
    }

    /* ---------- একটা বেটিং রাউন্ড ---------- */
    function safeAct(game, p, d) {
      let res = game.act(p.id, d && d.action, d && d.amount);
      if (res.ok) return res;
      const la = game.legalActions(p);                 // ভুল চাল হলে নিরাপদ বিকল্প
      res = game.act(p.id, la.canCheck ? 'check' : 'fold');
      if (!res.ok) res = game.act(p.id, 'fold');
      return res;
    }

    async function bettingRound(game) {
      for (let guard = 0; guard < MAX_ACTIONS_PER_ROUND; guard++) {
        const p = game.current();
        if (!p) break;
        ui('setActive', p.seat);

        let d;
        if (p.isHuman) {
          const la = game.legalActions(p);
          d = await U('askUser', la, game);
          ui('disableActions');
          if (!d) d = { action: la.canCheck ? 'check' : 'fold' };   // PokerRender না থাকলে
        } else {
          d = B.decide(game, p);                       // বট শুধু নিজের কার্ড ও বোর্ড দেখে
          await wait(B.thinkTime(p));                  // প্রত্যেকের আলাদা ৫-৬ সেকেন্ড
        }

        const res = safeAct(game, p, d);
        if (!res.ok) break;
        const ev = res.event;

        if (ev.type === 'fold') {
          ui('foldSeat', ev.seat);
          if (p.isHuman) speed = T.FOLDED_SPEED;       // ইউজার ফোল্ড করলে বাকি খেলা দ্রুত
        }
        ui('playerAction', ev, actionText(ev));

        let flight = null;
        if (ev.amount > 0) {
          snd('coin');
          flight = fire('flyChipsToDealer', ev.seat, ev.amount);
        }
        ui('updateSeats', game);
        ui('setPot', game.pot);
        saveBalance(game);

        await wait(T.ACTION_PAUSE);
        if (flight) await settle([flight]);
      }
      ui('setActive', -1);
    }

    /* ---------- শোডাউন ও পেআউট ---------- */
    async function finishHand(game, result) {
      ui('setActive', -1);
      ui('clearBadges');

      if (result.showdown) {
        // শুধু ফোল্ড না করাদের কার্ড দেখানো হয়
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
      ui('showWinners', winners, winText(game, result));
      snd('win');
      // শোডাউনে ৩ সেকেন্ড সবার কার্ড দেখা যাবে (ফোল্ড করলেও এই সময় কমে না)
      if (result.showdown) await wait(T.SHOWDOWN_HOLD, true);
      else await wait(T.PAYOUT_PAUSE);

      // বিজয়ীর কাছে পট
      snd('collect');
      await U('flyPotToWinners', winners.filter(w => w.amount > 0).map(w => ({ seat: w.seat, amount: w.amount })));
      ui('setPot', 0);
      ui('updateSeats', game);
      ui('toast', K.t('BALANCE') + ': ' + K.chips(game.human.chips), T.TOAST_MS);
      await wait(T.PAYOUT_PAUSE);

      ui('resetHand');                                  // বোর্ড পরিষ্কার
      await wait(T.CLEAR_PAUSE);
    }

    /* ---------- গেম ওভার ---------- */
    async function gameOver() {
      ui('setActive', -1);
      ui('disableActions');
      await U('showGameOver', K.t('GAME_OVER'), K.t('GAME_OVER_SUB'), K.t('PLAY_AGAIN'));
      D.resetBalance();
      ui('hideGameOver');
      return 'restart';
    }

    /* ---------- মূল লুপ ---------- */
    async function run() {
      if (entry) { await entry(); alive(); }

      const game = new E.Game(D.loadBalance());
      ui('setupTable', game);
      let first = true;

      while (true) {
        speed = 1;
        const prep = game.prepareHand();
        if (prep.broke) return await gameOver();

        ui('resetHand');
        ui('setPot', 0);
        ui('setDealer', prep.dealer);
        await seatChanges(prep);           // উঠে যাওয়া/বসার দৃশ্য আগে, তারপর সব সিট মেলানো
        ui('updateSeats', game);

        // ঘোষণা
        if (first) {
          ui('announce', K.t('GAME_STARTING'), T.ANNOUNCE);
          await wait(T.ANNOUNCE);
        } else {
          ui('dealerSay', K.t('DEALER_NEW'), T.DEALER_SAY);
          await wait(T.DEALER_SAY);
        }

        // কাউন্টডাউন
        await countdown(first ? T.FIRST_COUNTDOWN_SECONDS : T.COUNTDOWN_SECONDS);
        first = false;

        // এন্ট্রি ফি কালেক্ট
        const fees = game.collectEntryFees();
        ui('message', K.t('ENTRY_FEE') + ' ' + K.bet(K.ENTRY_FEE), T.MESSAGE_MS);
        snd('collect');
        await U('flyFees', fees);
        ui('updateSeats', game);
        ui('setPot', game.pot);
        saveBalance(game);
        await wait(T.COLLECT_PAUSE);

        // কার্ড বিলি
        await dealHole(game);

        // বেটিং: PRE-FLOP -> FLOP -> TURN -> RIVER
        game.beginBetting();
        ui('setPhase', game.phase, game.unit);

        let result = null;
        while (true) {
          await bettingRound(game);
          await wait(T.BETWEEN_ROUNDS);
          ui('clearBadges');
          const step = game.advance();
          if (step.type === 'end') { result = step.result; break; }
          await dealBoard(game, step);
        }

        saveBalance(game);                               // ফল ঠিক হয়ে গেছে, বিজয়ীর কয়েনসহ সেভ
        await finishHand(game, result);
      }
    }

    // run() এর ফল: 'restart' (গেম ওভারের পর নতুন গেম) অথবা 'cancelled'
    const done = run().then(r => r || 'cancelled', e => {
      if (e !== CANCEL) {
        console.error('গেমে ভুল:', e);
        ui('toast', 'Error: ' + (e && e.message ? e.message : e), T.TOAST_MS);
      }
      return 'cancelled';
    });

    return { stop, done };
  }

  /* ===================== সেশন চালানো/থামানো ===================== */
  let session = null;
  let playing = false;

  function stopSession() {
    if (session) { session.stop(); session = null; }
  }

  function startSession(entry) {
    stopSession();
    const s = makeSession(entry);
    session = s;
    s.done.then(out => {
      if (session !== s) return;       // এর মধ্যে অন্য সেশন এসে গেছে
      session = null;
      if (out === 'restart' && playing) startSession(null);
    });
    return s;
  }

  /* ===================== বাটনের কাজ ===================== */
  function onStart() {
    if (session) return;
    // এই দুটো অবশ্যই START ক্লিকের ভেতরেই (ব্রাউজারের নিয়ম)
    A.unlock();
    const fs = D.enterFullscreen();
    playing = true;
    D.setPlaying(true);
    ui('showGame');
    ui('setSoundLabel', soundLabel());
    startSession(async () => {
      try { await fs; } catch (e) { /* ফুলস্ক্রিন না পেলেও চলবে */ }
      await delay(T.FIRST_HAND_DELAY);
      D.update();
    });
  }

  function onExit() {
    playing = false;
    stopSession();
    A.stopAll();
    D.setPlaying(false);
    D.exitFullscreen();
    ui('hideGameOver');
    ui('showStart', D.loadBalance());
  }

  function onResetBalance() {
    D.resetBalance();
    ui('toast', K.t('BALANCE_RESET') + ' ' + K.chips(K.START_BALANCE), T.TOAST_MS);
    if (playing) {                      // খেলার মধ্যে হলে নতুন ব্যালেন্সে নতুন গেম
      ui('hideGameOver');
      startSession(null);
    } else {
      ui('showStart', D.loadBalance());
    }
  }

  function onSound() {
    A.toggle();
    ui('setSoundLabel', soundLabel());
  }

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
