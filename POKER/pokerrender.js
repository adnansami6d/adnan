/* =====================================================================
   NEON TEXAS HOLD'EM  -  js/pokerrender.js
   স্ক্রিনে আঁকা, অ্যানিমেশন, বাটন। গেমের ক্রম ঠিক করে pokergame.js, এই ফাইল শুধু দেখায়।
   এখানে কোনো রং/সাইজ/ডিজাইন নেই। শুধু CSS ক্লাস চালু/বন্ধ করে আর CSS ভ্যারিয়েবল বসায়।
   ডিজাইন বদলাতে শুধু style.css এডিট করুন।

   উড়ন্ত কয়েন/কার্ডের জায়গা PokerDevice.centerOf দিয়ে নেওয়া হয়, তাই ফোন
   পোর্ট্রেটে থাকলেও (স্টেজ ঘুরে গেলেও) ঠিক জায়গায় উড়ে।

   ---------------------------------------------------------------------
   index.html এ যা যা থাকতে হবে (id)  [পুরোনো নামই রাখা হয়েছে]
     #stage                 সব কিছুর বাইরের মোড়ক (device.js এর ঘোরানো স্টেজ)
     #start-screen  #start-btn  #start-balance
     #game  #fx-layer  #pot-box  #pot-amount  #phase-label  #community(.slot x5)  #message  #toast
     .dealer                (কার্ড এখান থেকে উড়ে আসে)
     #seat-0 ... #seat-4    প্রতিটার ভেতরে: .hole-cards .avatar .name .chips-value
                            .bet-badge .status-badge .dealer-btn
     #actions  #btn-fold #btn-check #btn-call #btn-raise
     #raise-panel (ভেতরে .raise-head span, #raise-levels, #btn-raise-confirm)
     #btn-exit #btn-fullscreen #btn-settings
     #settings-modal  #btn-reset-balance  #btn-settings-close  (#btn-sound না থাকলে নিজে বানায়)
   নিচেরগুলো না থাকলে এই ফাইল নিজেই বানিয়ে নেয় (তবু index.html এ রাখাই ভালো):
     #announce  #countdown  #dealer-say  #table-empty(.t-title .t-sub)
     #gameover(.modal) ভেতরে #go-title #go-sub #btn-playagain  #raise-levels  #btn-sound

   style.css এ যে ক্লাসগুলো লাগবে
     লুকানো/দেখানো : .hidden   .show (message, toast, announce, countdown, dealer-say, table-empty, bet-badge, status-badge, dealer-btn)
     সিট          : .seat.empty (ফাঁকা)  .folded  .active  .winner  .allin  .leaving  .joining
     স্ট্যাটাস      : .status-badge.show + fold | check | call | raise | allin | win | hand
     কার্ড         : .card (.big .small) .face-down .red .black .deal .win .dim, ভেতরে .card-inner .front .back
     কাউন্টডাউন     : #countdown.show.tick (প্রতি সংখ্যায় .tick নতুন করে বসে, অ্যানিমেশন চালানোর জন্য)
     বাটন          : #actions.disabled   .raise-panel.open
     raise লেভেল    : #raise-levels > button.level  (.on = নিচ থেকে ভরা, .sel = বর্তমান)
                      প্রতিটায় --lv (০.২ থেকে ১) আছে, লেভেল যত উঁচু তত বড় দেখাতে চাইলে এটা ব্যবহার করুন
                      সবচেয়ে উপরের লেভেল (ALL-IN) দেখাতে column-reverse ব্যবহার করুন
     কয়েন         : .fx-chip (--dx --dy), পটের সংখ্যায় .bump
   JS যে CSS ভ্যারিয়েবল বসায় (<html> এ): --deal-ms  --flip-ms  --chip-ms
   ===================================================================== */
'use strict';

const PokerRender = (() => {
  const K = PokerConfig;
  const T = K.TIME;
  const D = PokerDevice;

  // ঐচ্ছিক: config এর TIME এ এই দুটো দিলে বদলাবে
  const CHIP_FLIGHT = T.CHIP_FLIGHT || 700;     // একটা কয়েন উড়তে কত ms
  const CHIP_STAGGER = T.CHIP_STAGGER || 70;    // কয়েনের মাঝের বিরতি

  const later = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
  const $ = id => document.getElementById(id);

  /* ===================== অবস্থা ===================== */
  const E = {};                     // এলিমেন্ট
  let seats = [];                   // সিটের এলিমেন্ট
  let slots = [];                   // বোর্ডের ৫টা slot
  let holeEls = [[], [], [], [], []];   // সিট অনুযায়ী হাতের কার্ড
  let boardEls = [];                // বোর্ডের কার্ড (index অনুযায়ী)
  let revealed = {};                // {playerId: [সেরা ৫ কার্ডের id]}
  let levelEls = [];
  let pending = null;               // ইউজারের অ্যাকশনের অপেক্ষা
  let curLA = null;
  let selLevel = 0;
  let potValue = 0;
  let bound = false;
  let ready = false;
  const timers = {};

  // একটা ক্লাস কিছুক্ষণ চালু রাখা
  function flash(el, cls, ms, key) {
    el.classList.add(cls);
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => el.classList.remove(cls), ms);
  }

  function ensure(id, cls, parent, html) {
    let e = $(id);
    if (!e) {
      e = document.createElement('div');
      e.id = id; e.className = cls;
      if (html) e.innerHTML = html;
      parent.appendChild(e);
    }
    return e;
  }

  /* ===================== শুরু ===================== */
  function init() {
    if (ready) return;
    ready = true;

    const root = document.documentElement;
    root.style.setProperty('--deal-ms', T.DEAL_FLIGHT + 'ms');
    root.style.setProperty('--flip-ms', T.FLIP_TIME + 'ms');
    root.style.setProperty('--chip-ms', CHIP_FLIGHT + 'ms');

    const host = $('stage') || document.body;
    E.start = $('start-screen');
    E.game = $('game') || host;
    E.fx = ensure('fx-layer', 'fx-layer', E.game);
    E.potBox = $('pot-box');
    E.pot = $('pot-amount');
    E.phase = $('phase-label');
    E.message = ensure('message', 'message', E.game);
    E.toast = ensure('toast', 'toast', host);
    E.community = $('community');
    E.dealer = document.querySelector('.dealer');
    E.actions = $('actions');
    E.raisePanel = $('raise-panel');
    E.raiseHead = E.raisePanel ? E.raisePanel.querySelector('.raise-head span') : null;
    E.levels = ensure('raise-levels', 'raise-levels', E.raisePanel || E.game);
    E.btnFold = $('btn-fold'); E.btnCheck = $('btn-check');
    E.btnCall = $('btn-call'); E.btnRaise = $('btn-raise');
    E.confirm = $('btn-raise-confirm');
    E.settings = $('settings-modal');

    E.announce = ensure('announce', 'announce', E.game);
    E.countdown = ensure('countdown', 'countdown', E.game);
    E.dealerSay = ensure('dealer-say', 'dealer-say', E.game);
    E.tableEmpty = ensure('table-empty', 'table-empty', E.game, '<div class="t-title"></div><div class="t-sub"></div>');
    E.gameover = ensure('gameover', 'modal hidden', host,
      '<div class="modal-card lose"><div class="result-title" id="go-title"></div>' +
      '<div class="result-hand" id="go-sub"></div><button id="btn-playagain" class="btn btn-start"></button></div>');

    slots = E.community ? Array.from(E.community.querySelectorAll('.slot')) : [];
    seats = [0, 1, 2, 3, 4].map(i => {
      const root = $('seat-' + i);
      if (!root) return null;
      return {
        root,
        hole: root.querySelector('.hole-cards'),
        avatar: root.querySelector('.avatar'),
        name: root.querySelector('.name'),
        chips: root.querySelector('.chips-value'),
        bet: root.querySelector('.bet-badge'),
        status: root.querySelector('.status-badge'),
        dealerBtn: root.querySelector('.dealer-btn')
      };
    });

    // সেটিংসে সাউন্ড বাটন না থাকলে বানানো
    if (E.settings && !$('btn-sound')) {
      const b = document.createElement('button');
      b.id = 'btn-sound'; b.className = 'btn btn-check';
      const ref = $('btn-reset-balance');
      const card = E.settings.querySelector('.modal-card');
      if (card) card.insertBefore(b, ref || null);
    }

    bindActionButtons();
  }

  /* ===================== বাটনের সংযোগ (pokergame এর ফাংশনের সাথে) ===================== */
  function bind(h) {
    if (bound) return;
    bound = true;
    h = h || {};
    const on = (id, fn) => { const e = $(id); if (e && fn) e.addEventListener('click', fn); };

    on('start-btn', () => h.start && h.start());          // ক্লিকের ভেতরেই ডাকা হয়
    on('btn-exit', () => { closeSettings(); h.exit && h.exit(); });
    on('btn-fullscreen', () => h.fullscreen && h.fullscreen());
    on('btn-sound', () => h.sound && h.sound());
    on('btn-settings', openSettings);
    on('btn-settings-close', closeSettings);

    // ব্যালেন্স রিসেট: প্রথম ট্যাপে নিশ্চিত করতে বলে, ৩ সেকেন্ডের মধ্যে আবার ট্যাপ করলে রিসেট
    const btn = $('btn-reset-balance');
    if (btn) {
      const label = K.t('RESET_BALANCE') + ' (' + K.chips(K.START_BALANCE) + ')';
      btn.textContent = label;
      let armed = false, tm = 0;
      btn.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          btn.textContent = K.t('TAP_AGAIN');
          tm = setTimeout(() => { armed = false; btn.textContent = label; }, 3000);
          return;
        }
        clearTimeout(tm);
        armed = false;
        btn.textContent = label;
        closeSettings();
        h.resetBalance && h.resetBalance();
      });
    }
  }

  function openSettings() { if (E.settings) E.settings.classList.remove('hidden'); }
  function closeSettings() { if (E.settings) E.settings.classList.add('hidden'); }

  /* ===================== স্ক্রিন ===================== */
  function showStart(balance) {
    closeSettings();
    hideGameOver();
    hideCountdown();
    disableActions();
    const b = $('start-balance');
    if (b) b.textContent = K.chips(balance);
    if (E.game !== document.body) E.game.classList.add('hidden');
    if (E.start) E.start.classList.remove('hidden');
  }

  function showGame() {
    if (E.start) E.start.classList.add('hidden');
    if (E.game !== document.body) E.game.classList.remove('hidden');
  }

  function setSoundLabel(text) {
    const b = $('btn-sound');
    if (b) b.textContent = text;
  }

  function toast(text, ms) {
    E.toast.textContent = text;
    flash(E.toast, 'show', ms || T.TOAST_MS, 'toast');
  }

  /* ===================== কার্ড তৈরি (ক্লাস চালু/বন্ধ করে) ===================== */
  function fillFront(el, card) {
    el.classList.remove('red', 'black');
    el.classList.add(card.color);
    el.dataset.id = card.id;
    el.querySelector('.front').innerHTML =
      '<span class="c-corner">' + card.label + '<br>' + card.symbol + '</span>' +
      '<span class="c-center">' + card.symbol + '</span>';
  }

  // card = null হলে সামনের পিঠ খালি (বটের লুকানো কার্ড)
  function cardEl(card, size) {
    const el = document.createElement('div');
    el.className = 'card' + (size ? ' ' + size : '') + ' face-down';
    el.innerHTML = '<div class="card-inner"><div class="front"></div><div class="back"></div></div>';
    if (card) fillFront(el, card);
    return el;
  }

  // ডিলারের জায়গা থেকে কার্ডের জায়গায় উড়ে আসা (স্টেজের কোঅর্ডিনেটে)
  function animateDeal(el) {
    if (!E.dealer) return;
    const from = D.centerOf(E.dealer);
    const to = D.centerOf(el);
    el.style.setProperty('--from-x', (from.x - to.x) + 'px');
    el.style.setProperty('--from-y', (from.y - to.y) + 'px');
    el.classList.add('deal');
    const done = () => el.classList.remove('deal');
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, T.DEAL_FLIGHT + 250);
  }

  /* ===================== উড়ন্ত কয়েন ===================== */
  function flyChips(fromEl, toEl, count) {
    if (!fromEl || !toEl) return Promise.resolve();
    const a = D.centerOf(fromEl), b = D.centerOf(toEl);
    count = Math.max(1, Math.min(4, count || 2));
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const c = document.createElement('div');
        c.className = 'fx-chip';
        E.fx.appendChild(c);
        const w = c.offsetWidth || 20;
        c.style.left = (a.x - w / 2) + 'px';
        c.style.top = (a.y - w / 2) + 'px';
        c.style.setProperty('--dx', (b.x - a.x) + 'px');
        c.style.setProperty('--dy', (b.y - a.y) + 'px');
        c.addEventListener('animationend', () => c.remove());
        setTimeout(() => c.remove(), CHIP_FLIGHT + 600);
      }, i * CHIP_STAGGER);
    }
    return later(CHIP_FLIGHT + (count - 1) * CHIP_STAGGER);
  }

  /* ===================== টেবিল ===================== */
  function paintSeat(i, p) {
    const s = seats[i];
    if (!s) return;
    s.root.classList.toggle('empty', !p);
    if (!p) return;
    s.name.textContent = p.name;
    s.chips.textContent = K.chips(p.chips);
    s.root.classList.toggle('folded', !!p.folded);
    s.root.classList.toggle('allin', !!p.allIn && !p.folded);
  }

  function updateSeats(game) {
    for (let i = 0; i < seats.length; i++) paintSeat(i, game.seats[i]);
  }

  function setupTable(game) {
    resetHand();
    hideGameOver();
    hideCountdown();
    seats.forEach(s => { if (s) s.dealerBtn.classList.remove('show'); });
    potValue = 0;
    E.pot.textContent = K.chips(0);
    updateSeats(game);
  }

  function setDealer(seat) {
    seats.forEach((s, i) => { if (s) s.dealerBtn.classList.toggle('show', i === seat); });
  }

  function setPot(v) {
    const bump = v > potValue;
    potValue = v;
    E.pot.textContent = K.chips(v);
    if (bump) {
      E.pot.classList.remove('bump');
      void E.pot.offsetWidth;                 // অ্যানিমেশন আবার চালানোর কৌশল
      E.pot.classList.add('bump');
    }
  }

  function setPhase(name, unit) {
    E.phase.textContent = name;
    message(name + '  ·  ' + K.t('MIN_BET') + ' ' + K.bet(unit), T.MESSAGE_MS);
  }

  // নতুন হ্যান্ড/হ্যান্ড শেষে: বোর্ড, কার্ড, ব্যাজ, হাইলাইট সব পরিষ্কার
  function resetHand() {
    seats.forEach(s => {
      if (!s) return;
      s.hole.innerHTML = '';
      s.root.classList.remove('folded', 'active', 'winner', 'allin', 'leaving', 'joining');
      s.bet.classList.remove('show');
      s.bet.innerHTML = '';
      s.status.className = 'status-badge';
      s.status.textContent = '';
    });
    slots.forEach(sl => { sl.innerHTML = ''; });
    holeEls = [[], [], [], [], []];
    boardEls = [];
    revealed = {};
    E.phase.textContent = K.PHASES[0];
    E.message.classList.remove('show');
  }

  function botLeave(info) {
    const s = seats[info.seat];
    if (!s) return Promise.resolve();
    s.root.classList.add('leaving');
    return later(T.BOT_LEAVE_PAUSE * 0.8).then(() => {
      s.root.classList.remove('leaving');
      s.root.classList.add('empty');
      s.hole.innerHTML = '';
    });
  }

  function botJoin(info) {
    const s = seats[info.seat];
    if (!s) return Promise.resolve();
    s.name.textContent = info.name;
    s.chips.textContent = K.chips(info.chips);
    s.root.classList.remove('empty', 'folded', 'allin');
    s.root.classList.add('joining');
    return later(T.BOT_LEAVE_PAUSE * 0.8).then(() => s.root.classList.remove('joining'));
  }

  /* ===================== লেখা ===================== */
  function announce(text, ms) {
    E.announce.textContent = text;
    flash(E.announce, 'show', ms || T.ANNOUNCE, 'announce');
  }

  function dealerSay(text, ms) {
    E.dealerSay.textContent = text;
    flash(E.dealerSay, 'show', ms || T.DEALER_SAY, 'dealerSay');
  }

  function message(text, ms) {
    E.message.textContent = text;
    flash(E.message, 'show', ms || T.MESSAGE_MS, 'message');
  }

  function tableEmpty(title, sub, ms) {
    E.tableEmpty.querySelector('.t-title').textContent = title;
    E.tableEmpty.querySelector('.t-sub').textContent = sub;
    flash(E.tableEmpty, 'show', ms || T.EMPTY_TABLE_PAUSE, 'tableEmpty');
  }

  function countdown(text) {
    E.countdown.textContent = text;
    E.countdown.classList.add('show');
    E.countdown.classList.remove('tick');
    void E.countdown.offsetWidth;
    E.countdown.classList.add('tick');
  }

  function hideCountdown() {
    if (!E.countdown) return;
    E.countdown.classList.remove('show', 'tick');
  }

  /* ===================== হ্যান্ড চলার সময় ===================== */
  // এন্ট্রি ফি: সবার কাছ থেকে পটে কয়েন
  function flyFees(fees) {
    const list = fees.filter(f => f.paid > 0 && seats[f.seat]).map(f => flyChips(seats[f.seat].avatar, E.potBox, 2));
    return Promise.all(list);
  }

  // হোল কার্ড: ইউজারের কার্ড উড়ে এসে উল্টে যায়। বটের কার্ড (card = null) উল্টোই থাকে
  function dealHole(seat, card) {
    const s = seats[seat];
    if (!s) return Promise.resolve();
    const el = cardEl(card, card ? 'big' : 'small');
    s.hole.appendChild(el);
    holeEls[seat].push(el);
    animateDeal(el);
    return later(T.DEAL_FLIGHT).then(() => { if (card) el.classList.remove('face-down'); });
  }

  function dealCommunityCard(card, index) {
    const slot = slots[index];
    if (!slot) return Promise.resolve();
    const el = cardEl(card);
    slot.appendChild(el);
    boardEls[index] = el;
    animateDeal(el);
    return later(T.DEAL_FLIGHT);
  }

  function flipCommunity(start, count) {
    for (let i = 0; i < count; i++) {
      const el = boardEls[start + i];
      if (el) el.classList.remove('face-down');
    }
    return Promise.resolve();
  }

  function setActive(seat) {
    seats.forEach((s, i) => { if (s) s.root.classList.toggle('active', i === seat); });
  }

  function showStatus(seat, key, text) {
    const s = seats[seat];
    if (!s) return;
    s.status.className = 'status-badge show ' + key;
    s.status.textContent = text;
  }

  // কারও চাল: স্ট্যাটাস ব্যাজ, বেট ব্যাজ, টেবিলের মেসেজ
  function playerAction(ev, text) {
    const s = seats[ev.seat];
    if (!s) return;
    let key = ev.type;
    let label;
    if (ev.type === 'fold') label = K.t('FOLD');
    else if (ev.type === 'check') label = K.t('CHECK');
    else if (ev.type === 'call') label = K.t('CALL');
    else { key = 'raise'; label = ev.isBet ? K.t('BET') : K.t('RAISE'); }
    if (ev.allIn && ev.type !== 'fold') { key = 'allin'; label = K.t('ALL_IN'); }

    showStatus(ev.seat, key, label);
    if (ev.type === 'fold') s.root.classList.add('folded');
    if (ev.allIn && ev.type !== 'fold') s.root.classList.add('allin');

    if (ev.total > 0) {
      s.bet.innerHTML = '<span class="chip-icon"></span> ' + K.bet(ev.total);
      s.bet.classList.add('show');
    }
    if (text) message(text, T.MESSAGE_MS);
  }

  function flyChipsToDealer(seat, amount) {
    const s = seats[seat];
    if (!s) return Promise.resolve();
    return flyChips(s.avatar, E.potBox, Math.ceil(amount / K.ENTRY_FEE));
  }

  // রাউন্ড শেষ: বেট ব্যাজ মোছা। শুধু ফোল্ড ও অল-ইন স্ট্যাটাস থাকে
  function clearBadges() {
    seats.forEach(s => {
      if (!s) return;
      s.bet.classList.remove('show');
      const keep = s.status.classList.contains('fold') || s.status.classList.contains('allin');
      if (!keep) { s.status.className = 'status-badge'; s.status.textContent = ''; }
    });
  }

  function foldSeat(seat) {
    const s = seats[seat];
    if (s) s.root.classList.add('folded');
  }

  /* ===================== ইউজারের বাটন ===================== */
  function setBtn(btn, show, label, amount) {
    if (!btn) return;
    btn.classList.toggle('hidden', !show);
    if (!show) return;
    btn.textContent = '';
    const l = document.createElement('span');
    l.className = 'btn-label';
    l.textContent = label;
    btn.appendChild(l);
    if (amount) {
      const a = document.createElement('span');
      a.className = 'call-amount';
      a.textContent = ' ' + amount;
      btn.appendChild(a);
    }
  }

  function closeRaise() { if (E.raisePanel) E.raisePanel.classList.remove('open'); }

  // RAISE চাপলে কয়েন ৫ ভাগে: নিচে ন্যূনতম রেইজ, একদম উপরে ALL-IN
  function buildLevels(la) {
    E.levels.innerHTML = '';
    levelEls = [];
    const L = la.raiseLevels || [];
    L.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level';
      b.style.setProperty('--lv', ((i + 1) / L.length).toFixed(2));
      b.textContent = v >= la.maxRaiseTo ? K.t('ALL_IN') : K.bet(v);
      b.addEventListener('click', () => selectLevel(i));
      E.levels.appendChild(b);
      levelEls.push(b);
    });
    selectLevel(0);
  }

  function selectLevel(i) {
    if (!curLA || !curLA.raiseLevels.length) return;
    selLevel = Math.max(0, Math.min(i, curLA.raiseLevels.length - 1));
    levelEls.forEach((b, j) => {
      b.classList.toggle('on', j <= selLevel);
      b.classList.toggle('sel', j === selLevel);
    });
    const v = curLA.raiseLevels[selLevel];
    if (E.confirm) E.confirm.textContent = K.t('CONFIRM') + ' ' + (v >= curLA.maxRaiseTo ? K.t('ALL_IN') : K.bet(v));
  }

  function submit(d) {
    if (!pending) return;
    const f = pending;
    pending = null;
    E.actions.classList.add('disabled');
    closeRaise();
    f(d);
  }

  function bindActionButtons() {
    if (E.btnFold) E.btnFold.addEventListener('click', () => submit({ action: 'fold' }));
    if (E.btnCheck) E.btnCheck.addEventListener('click', () => submit({ action: 'check' }));
    if (E.btnCall) E.btnCall.addEventListener('click', () => submit({ action: 'call' }));
    if (E.btnRaise) E.btnRaise.addEventListener('click', () => { if (pending && E.raisePanel) E.raisePanel.classList.toggle('open'); });
    if (E.confirm) E.confirm.addEventListener('click', () => {
      if (pending && curLA && curLA.raiseLevels.length) submit({ action: 'raise', amount: curLA.raiseLevels[selLevel] });
    });
  }

  // ইউজারের চালের অপেক্ষা। ফেরত: {action, amount}
  function askUser(la, game) {
    curLA = la;
    const me = game.human;
    setBtn(E.btnFold, true, K.t('FOLD'));
    setBtn(E.btnCheck, la.canCheck, K.t('CHECK'));
    const allInCall = la.callAmount >= me.chips;
    setBtn(E.btnCall, la.canCall, allInCall ? K.t('ALL_IN') : K.t('CALL'), K.bet(la.callAmount));
    setBtn(E.btnRaise, la.canRaise, la.isBet ? K.t('BET') : K.t('RAISE'));
    if (E.raiseHead) E.raiseHead.textContent = la.isBet ? K.t('BET') : K.t('RAISE_TO');
    if (la.canRaise) buildLevels(la);
    closeRaise();

    return new Promise(resolve => {
      pending = resolve;
      E.actions.classList.remove('disabled');
    });
  }

  function disableActions() {
    pending = null;
    if (E.actions) E.actions.classList.add('disabled');
    closeRaise();
  }

  /* ===================== শোডাউন ===================== */
  // শুধু ফোল্ড না করাদের কার্ড (pokergame শুধু তাদেরই পাঠায়)
  function revealHands(list) {
    list.forEach(x => {
      revealed[x.id] = x.cards || [];
      const els = holeEls[x.seat] || [];
      if (x.seat !== 0) els.forEach((el, i) => { if (x.hole[i]) fillFront(el, x.hole[i]); });
      if (x.handName) showStatus(x.seat, 'hand', x.handName);
    });
    return later(60).then(() => {
      list.forEach(x => (holeEls[x.seat] || []).forEach(el => el.classList.remove('face-down')));
    });
  }

  function showWinners(list, text) {
    const ids = new Set();
    list.forEach(w => (revealed[w.id] || []).forEach(c => ids.add(c)));

    list.forEach(w => {
      const s = seats[w.seat];
      if (!s) return;
      s.root.classList.add('winner');
      const gain = w.net > 0 ? w.net : w.amount;
      showStatus(w.seat, 'win', K.t('WIN') + ' +' + K.bet(gain));
    });

    // জেতা ৫ কার্ড উজ্জ্বল, বাকিগুলো ম্লান
    if (ids.size) {
      const all = boardEls.concat(...holeEls).filter(el => el && el.dataset.id);
      all.forEach(el => el.classList.add(ids.has(el.dataset.id) ? 'win' : 'dim'));
    }
    if (text) message(text, T.SHOWDOWN_HOLD);
  }

  function flyPotToWinners(list) {
    const jobs = list.filter(w => seats[w.seat]).map(w => flyChips(E.potBox, seats[w.seat].avatar, 4));
    return Promise.all(jobs);
  }

  /* ===================== গেম ওভার ===================== */
  function showGameOver(title, sub, buttonText) {
    $('go-title').textContent = title;
    $('go-sub').textContent = sub;
    const btn = $('btn-playagain');
    btn.textContent = buttonText;
    E.gameover.classList.remove('hidden');
    return new Promise(resolve => {
      btn.addEventListener('click', () => resolve(), { once: true });
    });
  }

  function hideGameOver() {
    if (E.gameover) E.gameover.classList.add('hidden');
  }

  return {
    init, bind, showStart, showGame, setSoundLabel, toast,
    setupTable, updateSeats, setDealer, setPot, setPhase, resetHand, botLeave, botJoin,
    announce, dealerSay, message, tableEmpty, countdown, hideCountdown,
    flyFees, dealHole, dealCommunityCard, flipCommunity, setActive, playerAction,
    flyChipsToDealer, clearBadges, foldSeat, askUser, disableActions,
    revealHands, showWinners, flyPotToWinners, showGameOver, hideGameOver
  };
})();
