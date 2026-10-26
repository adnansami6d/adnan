/* ==========================================================
   Game Bazz — 16game.js (ষোলো গুটি)
   খেলার সব লজিক: নিয়ম, বোর্ড আঁকা, চাল, গুটি ধরা, জয়, নতুন খেলা।
   কানেকশন নিয়ে এখানে কিছু নেই — সেটা 16connection.js-এ।

   কাজের নিয়ম (লুডুর মতোই):
   - দুজনেই নিজের ফোনে গেম চালায়, একই নিয়মে একই অবস্থা তৈরি হয়।
   - যে চাল দেয় সে চালটা পাঠায়, বন্ধুর ফোনে যাচাই করে একই চাল চলে।
   - host = নিচের পক্ষ ('h'), guest = ওপরের পক্ষ ('g')।
     guest-এর স্ক্রিনে স্থানাঙ্ক উল্টে আঁকা হয়, তাই দুজনেরই নিজের গুটি নিচে।
   - প্রতি ম্যাচের শুরুতে host দুই পক্ষের আলাদা রং আর কে আগে চালবে ঠিক করে
     START মেসেজে পাঠায়।

   মেসেজ: START | MOVE | CAP | END | REMATCH

   16extras.js থেকে ঐচ্ছিক হুক (না থাকলেও গেম চলবে):
   - window.Sfx.touch() / Sfx.eat() / Sfx.win()
   - window.GameUI.toast(text)
   ========================================================== */

/* ---------- ১. বোর্ডের জ্যামিতি ও নিয়ম (Core) ---------- */
const Core = (() => {
  const U = 100; // এক ঘর = ১০০ একক
  const pts = {};
  const G = (x, y) => `g${x}${y}`;

  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) pts[G(x, y)] = { x, y };

  // ওপরের ত্রিভুজ
  Object.assign(pts, {
    t1: { x: 1, y: -1 }, t2: { x: 2, y: -1 }, t3: { x: 3, y: -1 },
    t4: { x: 1.5, y: -0.5 }, t5: { x: 2, y: -0.5 }, t6: { x: 2.5, y: -0.5 }
  });
  // নিচের ত্রিভুজ
  Object.assign(pts, {
    b1: { x: 1, y: 5 }, b2: { x: 2, y: 5 }, b3: { x: 3, y: 5 },
    b4: { x: 1.5, y: 4.5 }, b5: { x: 2, y: 4.5 }, b6: { x: 2.5, y: 4.5 }
  });

  // সব রেখা (ক্রমানুসারে বিন্দু)। পরপর দুটি বিন্দু = পাশের ঘর, তিনটি = ডিঙানোর সুযোগ।
  const lines = [];
  for (let y = 0; y < 5; y++) lines.push([0, 1, 2, 3, 4].map(x => G(x, y)));      // সারি
  for (let x = 0; x < 5; x++) {
    if (x === 2) lines.push(['t2', 't5', G(2, 0), G(2, 1), G(2, 2), G(2, 3), G(2, 4), 'b5', 'b2']);
    else lines.push([0, 1, 2, 3, 4].map(y => G(x, y)));                          // কলাম
  }
  lines.push([G(0, 0), G(1, 1), G(2, 2), G(3, 3), G(4, 4)]);                      // কোনাকুনি
  lines.push([G(4, 0), G(3, 1), G(2, 2), G(1, 3), G(0, 4)]);
  lines.push(['t3', 't6', G(2, 0), G(1, 1), G(0, 2)]);                            // ওপরের ডায়মন্ড + ত্রিভুজ
  lines.push(['t1', 't4', G(2, 0), G(3, 1), G(4, 2)]);
  lines.push([G(0, 2), G(1, 3), G(2, 4), 'b6', 'b3']);                            // নিচের ডায়মন্ড + ত্রিভুজ
  lines.push([G(4, 2), G(3, 3), G(2, 4), 'b4', 'b1']);
  lines.push(['t1', 't2', 't3'], ['t4', 't5', 't6'], ['b1', 'b2', 'b3'], ['b4', 'b5', 'b6']);

  const adj = {};
  const jumps = {};
  Object.keys(pts).forEach(id => { adj[id] = new Set(); jumps[id] = []; });

  lines.forEach(line => {
    for (let i = 0; i < line.length - 1; i++) {
      adj[line[i]].add(line[i + 1]);
      adj[line[i + 1]].add(line[i]);
    }
    for (let i = 1; i < line.length - 1; i++) {
      jumps[line[i - 1]].push({ over: line[i], to: line[i + 1] });
      jumps[line[i + 1]].push({ over: line[i], to: line[i - 1] });
    }
  });

  // শুরুর সাজানো: guest ('g') ওপরে, host ('h') নিচে, মাঝের সারি ফাঁকা
  function initialBoard() {
    const b = {};
    Object.keys(pts).forEach(id => { b[id] = null; });
    ['t1', 't2', 't3', 't4', 't5', 't6'].forEach(id => { b[id] = 'g'; });
    ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].forEach(id => { b[id] = 'h'; });
    for (let x = 0; x < 5; x++) {
      b[G(x, 0)] = 'g'; b[G(x, 1)] = 'g';
      b[G(x, 3)] = 'h'; b[G(x, 4)] = 'h';
    }
    return b;
  }

  function movesFrom(board, id) {
    return [...adj[id]].filter(to => !board[to]);
  }

  function capturesFrom(board, id) {
    const me = board[id];
    return jumps[id].filter(j => board[j.over] && board[j.over] !== me && !board[j.to]);
  }

  return { U, pts, lines, initialBoard, movesFrom, capturesFrom };
})();

/* ---------- ২. খেলা ও দেখানো ---------- */
(() => {
  'use strict';

  const { U, pts, lines, initialBoard, movesFrom, capturesFrom } = Core;
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const R = 20; // গুটির ব্যাসার্ধ (আগে ২৪ ছিল — এখন একটু ছোট)

  const toBn = n => String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);

  /* প্রতি ম্যাচে এখান থেকে দুটি আলাদা রং বাছা হয় (fam একই হলে বাদ — কাছাকাছি রং এড়াতে) */
  const PALETTE = [
    { hex: '#ff4d6d', name: 'লাল',    fam: 'r' },
    { hex: '#ff6bd6', name: 'গোলাপি', fam: 'r' },
    { hex: '#ff8a3d', name: 'কমলা',   fam: 'y' },
    { hex: '#ffd23f', name: 'হলুদ',   fam: 'y' },
    { hex: '#3da5ff', name: 'নীল',    fam: 'b' },
    { hex: '#3df0e0', name: 'আকাশি',  fam: 'b' },
    { hex: '#2ee59d', name: 'সবুজ',   fam: 'g' },
    { hex: '#b86bff', name: 'বেগুনি', fam: 'p' }
  ];

  const Sfx = () => window.Sfx || {};
  const notify = text => { try { if (window.GameUI && window.GameUI.toast) window.GameUI.toast(text); } catch (_) {} };

  /* ---------- অবস্থা ---------- */
  let myRole = null;        // 'host' | 'guest'
  let mySide = null;        // 'h' | 'g'
  let started = false;      // দুজন যুক্ত হলে true
  let matchId = 0;          // প্রতি নতুন ম্যাচে বাড়ে
  let colors = null;        // { h: palette-item, g: palette-item }
  let board = null;         // { বিন্দু: 'h' | 'g' | null }
  let turn = 'h';
  let selected = null;
  let chainPiece = null;    // পরপর ধরার সময় যে গুটি চলছে
  let winner = null;        // 'h' | 'g' | 'draw' | null

  const Game = { send: () => {} };   // 16connection.js এটা বসিয়ে দেবে

  /* ---------- SVG স্তর ---------- */
  const svg = $('board');
  let gLines, gDots, gHints, gPieces;
  const pieceEls = new Map();         // বিন্দুর নাম → গুটির এলিমেন্ট

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  // guest-এর স্ক্রিনে বোর্ড ১৮০° উল্টে আঁকা (বোর্ড x: ০–৪, y: -১–৫, তাই কেন্দ্র (২,২))
  function pos(id) {
    const p = pts[id];
    const flip = myRole === 'guest';
    const x = flip ? 4 - p.x : p.x;
    const y = flip ? 4 - p.y : p.y;
    return { x: x * U, y: y * U };
  }

  function buildBoard() {
    svg.innerHTML = '';
    gLines = el('g', {}, svg);
    gDots = el('g', {}, svg);
    gHints = el('g', {}, svg);
    gPieces = el('g', {}, svg);
    pieceEls.clear();

    lines.forEach(line => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = pos(line[i]), b = pos(line[i + 1]);
        el('line', { class: 'board-line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, gLines);
      }
    });
    Object.keys(pts).forEach(id => {
      const p = pos(id);
      el('circle', { class: 'board-dot', cx: p.x, cy: p.y, r: 4.5 }, gDots);
    });
  }

  /* ---------- গুটি তৈরি ও সরানো ---------- */
  function setPiecePos(g, id) {
    const p = pos(id);
    g.style.transform = `translate(${p.x}px, ${p.y}px)`;
    g.dataset.at = id;
  }

  function makePiece(id, side) {
    const g = el('g', { class: `piece ${side === mySide ? 'mine' : 'opp'}` }, gPieces);
    g.style.setProperty('--c', colors[side].hex);
    g.dataset.side = side;

    el('ellipse', { class: 'shadow', cx: 0, cy: R * 0.78, rx: R * 0.78, ry: R * 0.26 }, g);
    const hop = el('g', { class: 'hop' }, g);
    el('circle', { class: 'rim', r: R }, hop);
    el('circle', { class: 'core', r: R - 4 }, hop);
    el('circle', { class: 'core-glow', cx: -2, cy: -3, r: R * 0.5 }, hop);
    el('ellipse', { class: 'shine', cx: -R * 0.33, cy: -R * 0.4, rx: R * 0.3, ry: R * 0.16, transform: 'rotate(-35 ' + (-R * 0.33) + ' ' + (-R * 0.4) + ')' }, hop);
    el('circle', { class: 'ring', r: R + 6 }, g);

    setPiecePos(g, id);
    g.addEventListener('click', () => onPieceClick(g.dataset.at));
    pieceEls.set(id, g);
    return g;
  }

  function buildPieces() {
    pieceEls.forEach(g => g.remove());
    pieceEls.clear();
    Object.keys(board).forEach(id => { if (board[id]) makePiece(id, board[id]); });
  }

  function movePieceEl(from, to) {
    const g = pieceEls.get(from);
    if (!g) return;
    pieceEls.delete(from);
    pieceEls.set(to, g);
    gPieces.appendChild(g);            // সরানো গুটি সবার ওপরে দেখা যাবে
    setPiecePos(g, to);
    setTimeout(() => {                 // ঘরে বসার হালকা চাপ
      g.classList.add('landed');
      setTimeout(() => g.classList.remove('landed'), 360);
    }, 230);
  }

  function removePieceEl(id) {
    const g = pieceEls.get(id);
    if (!g) return;
    pieceEls.delete(id);
    g.classList.remove('movable', 'selected');
    g.classList.add('captured');
    setTimeout(() => g.remove(), 450);
  }

  /* ---------- হিসাব ---------- */
  const other = side => (side === 'h' ? 'g' : 'h');
  const count = side => Object.values(board || {}).filter(v => v === side).length;
  const hasMoves = id => movesFrom(board, id).length > 0 || capturesFrom(board, id).length > 0;
  const sideHasMoves = side => Object.keys(board).some(id => board[id] === side && hasMoves(id));

  /* ---------- দেখানো (রেন্ডার) ---------- */
  function setLabel(id, side, text) {
    const box = $(id);
    if (!box) return;
    box.hidden = !board;
    if (!board) return;
    box.style.setProperty('--c', colors[side].hex);
    box.querySelector('.name').textContent = text;
    box.querySelector('.left').textContent = toBn(count(side));
    box.classList.toggle('active', !winner && turn === side);
  }

  function render() {
    const live = !!board;
    const myTurn = live && turn === mySide;

    // চলার ইঙ্গিত (শুধু নিজের চালে, বাছাই করা গুটির জন্য)
    gHints.innerHTML = '';
    if (live && started && !winner && myTurn && selected && board[selected] === mySide) {
      const canStep = !chainPiece;
      if (canStep) {
        movesFrom(board, selected).forEach(to => {
          const p = pos(to);
          const c = el('circle', { class: 'hint-move', cx: p.x, cy: p.y, r: R - 2 }, gHints);
          c.addEventListener('click', () => doMove(selected, to));
        });
      }
      capturesFrom(board, selected).forEach(j => {
        const o = pos(j.over), p = pos(j.to);
        el('circle', { class: 'hint-over', cx: o.x, cy: o.y, r: R + 7 }, gHints);
        const c = el('circle', { class: 'hint-cap', cx: p.x, cy: p.y, r: R - 2 }, gHints);
        c.addEventListener('click', () => doCapture(selected, j));
      });
    }

    // যে গুটিগুলো চাল দেওয়ার উপযুক্ত — হালকা লাফাবে
    const movable = new Set();
    if (live && started && !winner) {
      if (chainPiece) {
        if (capturesFrom(board, chainPiece).length) movable.add(chainPiece);
      } else {
        Object.keys(board).forEach(id => { if (board[id] === turn && hasMoves(id)) movable.add(id); });
      }
    }
    pieceEls.forEach((g, id) => {
      g.classList.toggle('movable', movable.has(id));
      g.classList.toggle('selected', myTurn && id === selected);
    });

    // লেবেল ও ব্যাজ
    if (live) {
      setLabel('label-bottom', mySide, `আপনি • ${colors[mySide].name}`);
      setLabel('label-top', other(mySide), `বন্ধু • ${colors[other(mySide)].name}`);
    } else {
      ['label-bottom', 'label-top'].forEach(id => { const b = $(id); if (b) b.hidden = true; });
    }

    const badge = $('turn-badge');
    if (badge) {
      badge.hidden = !(live && started);
      if (live) {
        if (winner) {
          badge.textContent = winner === 'draw' ? '🤝 ড্র' : (winner === mySide ? '🏆 আপনি জিতেছেন' : '🏆 বন্ধু জিতেছে');
        } else if (myTurn) {
          badge.textContent = chainPiece ? '🎯 আবার ধরতে পারেন' : '🎯 আপনার চাল';
        } else {
          badge.textContent = '⏳ বন্ধুর চাল';
        }
        badge.classList.toggle('turn-mine', myTurn && !winner);
        badge.classList.toggle('turn-opp', !myTurn || !!winner);
      }
    }

    const stop = $('stop-btn');
    if (stop) stop.hidden = !(live && started && !winner && myTurn && !!chainPiece);
  }

  /* ---------- চালের নিয়ম যাচাই ---------- */
  function legalMove(side, from, to) {
    return started && !winner && turn === side && !chainPiece &&
           board[from] === side && movesFrom(board, from).includes(to);
  }
  function legalCapture(side, from, over, to) {
    if (!started || winner || turn !== side || board[from] !== side) return null;
    if (chainPiece && from !== chainPiece) return null;
    return capturesFrom(board, from).find(j => j.over === over && j.to === to) || null;
  }

  /* ---------- চাল প্রয়োগ (দুজনের ফোনেই একই কোড) ---------- */
  function endTurn() {
    selected = null;
    chainPiece = null;
    turn = other(turn);
    checkStuck();
  }

  // চাল দেওয়ার মতো গুটি না থাকলে চাল পাস; দুজনেরই না থাকলে গুটি বেশি যার সে জেতে
  function checkStuck() {
    if (winner || sideHasMoves(turn)) return;
    const next = other(turn);
    if (sideHasMoves(next)) {
      notify(turn === mySide ? 'আপনার চাল দেওয়ার মতো গুটি নেই, চাল পাস।' : 'বন্ধুর চাল দেওয়ার মতো গুটি নেই, চাল পাস।');
      turn = next;
    } else {
      const a = count('h'), b = count('g');
      finish(a === b ? 'draw' : (a > b ? 'h' : 'g'));
    }
  }

  function applyMove(side, from, to) {
    board[to] = side;
    board[from] = null;
    movePieceEl(from, to);
    Sfx().touch && Sfx().touch();
    endTurn();
    render();
  }

  function applyCapture(side, from, j) {
    board[j.to] = side;
    board[from] = null;
    board[j.over] = null;
    movePieceEl(from, j.to);
    removePieceEl(j.over);
    setTimeout(() => { Sfx().eat && Sfx().eat(); }, 200);

    if (count(other(side)) === 0) {
      selected = null;
      chainPiece = null;
      finish(side);
      return;
    }

    selected = j.to;
    if (capturesFrom(board, j.to).length > 0) {
      chainPiece = j.to;          // আবার ধরার সুযোগ — চাইলে থামানো যাবে
      render();
    } else {
      endTurn();
      render();
    }
  }

  function finish(w) {
    winner = w;
    selected = null;
    chainPiece = null;
    render();
    const id = matchId;
    setTimeout(() => {
      if (id !== matchId || !winner) return;
      Sfx().win && Sfx().win();
      showWin();
    }, 800);
  }

  function showWin() {
    const box = $('win-overlay');
    if (!box) return;
    const icon = box.querySelector('.win-icon');
    const piece = $('win-piece');
    const title = $('win-title');
    const msg = $('win-message');

    if (winner === 'draw') {
      if (icon) icon.textContent = '🤝';
      if (piece) piece.style.setProperty('--c', '#8fa3bf');
      if (title) title.textContent = 'ড্র!';
      if (msg) msg.textContent = 'কারও চাল দেওয়ার মতো গুটি নেই।';
    } else {
      const c = colors[winner];
      const mine = winner === mySide;
      if (icon) icon.textContent = mine ? '🏆' : '🥈';
      if (piece) piece.style.setProperty('--c', c.hex);
      if (title) title.textContent = mine ? 'অভিনন্দন! আপনি জিতেছেন 🎉' : 'বন্ধু জিতেছে';
      if (msg) msg.textContent = `${c.name} গুটি জয়ী!` + (mine ? '' : ' আবার চেষ্টা করুন।');
    }
    box.hidden = false;
  }

  /* ---------- নিজের ক্লিক ---------- */
  function onPieceClick(at) {
    if (!started || winner || !board) return;
    if (turn !== mySide || chainPiece) return;      // পরপর ধরার সময় গুটি বদলানো যাবে না
    if (board[at] !== mySide) return;
    Sfx().touch && Sfx().touch();
    selected = selected === at ? null : at;
    render();
  }

  function doMove(from, to) {
    if (!legalMove(mySide, from, to)) return;
    Game.send({ type: 'MOVE', from, to });
    applyMove(mySide, from, to);
  }

  function doCapture(from, j) {
    const jump = legalCapture(mySide, from, j.over, j.to);
    if (!jump) return;
    Game.send({ type: 'CAP', from, over: j.over, to: j.to });
    applyCapture(mySide, from, jump);
  }

  function doStop() {
    if (!started || winner || turn !== mySide || !chainPiece) return;
    Game.send({ type: 'END' });
    endTurn();
    render();
  }

  /* ---------- নতুন ম্যাচ ---------- */
  function pickColors() {
    const i = Math.floor(Math.random() * PALETTE.length);
    let j;
    do { j = Math.floor(Math.random() * PALETTE.length); }
    while (j === i || PALETTE[j].fam === PALETTE[i].fam);
    return { h: i, g: j };
  }

  // host: রং ও প্রথম চাল ঠিক করে দুজনকেই জানায়
  function newMatch() {
    const msg = {
      type: 'START',
      id: matchId + 1,
      colors: pickColors(),
      first: Math.random() < 0.5 ? 'h' : 'g'
    };
    Game.send(msg);
    applyStart(msg);
  }

  function applyStart(msg) {
    const ch = Number(msg.colors && msg.colors.h), cg = Number(msg.colors && msg.colors.g);
    if (!PALETTE[ch] || !PALETTE[cg] || ch === cg) return;

    matchId = Number(msg.id) || matchId + 1;
    colors = { h: PALETTE[ch], g: PALETTE[cg] };
    board = initialBoard();
    turn = msg.first === 'g' ? 'g' : 'h';
    selected = null;
    chainPiece = null;
    winner = null;

    ['win-overlay', 'confirm-overlay'].forEach(id => { const b = $(id); if (b) b.hidden = true; });

    buildPieces();
    render();
  }

  // "আবার খেলুন" / "নতুন খেলা" — দুই পক্ষই ডাকতে পারে (16extras.js ডাকে)
  function newGame() {
    if (!started) return;
    if (myRole === 'host') {
      newMatch();
    } else {
      Game.send({ type: 'REMATCH', id: matchId });
      const msg = $('win-message');
      if (winner && msg) msg.textContent = '⏳ নতুন খেলা শুরু হচ্ছে...';
    }
  }

  /* ---------- বন্ধুর পাঠানো মেসেজ ---------- */
  function handleRemote(msg) {
    if (!started || !msg || typeof msg.type !== 'string') return;
    const opp = other(mySide);

    switch (msg.type) {
      case 'START':
        if (myRole === 'guest') applyStart(msg);
        break;
      case 'REMATCH':
        // পুরনো ম্যাচের অনুরোধ (দুজনেই একসাথে চাপলে) বাদ
        if (myRole === 'host' && Number(msg.id) === matchId) newMatch();
        break;
      case 'MOVE': {
        if (!board) return;
        const from = String(msg.from), to = String(msg.to);
        if (!pts[from] || !pts[to]) return;
        if (legalMove(opp, from, to)) applyMove(opp, from, to);
        break;
      }
      case 'CAP': {
        if (!board) return;
        const from = String(msg.from), over = String(msg.over), to = String(msg.to);
        if (!pts[from] || !pts[over] || !pts[to]) return;
        const jump = legalCapture(opp, from, over, to);
        if (jump) applyCapture(opp, from, jump);
        break;
      }
      case 'END':
        if (board && !winner && turn === opp && chainPiece) { endTurn(); render(); }
        break;
    }
  }

  /* ---------- শুরু / শেষ ---------- */
  function start(role) {
    myRole = role === 'host' ? 'host' : 'guest';
    mySide = myRole === 'host' ? 'h' : 'g';
    started = true;
    board = null; colors = null; winner = null; selected = null; chainPiece = null;
    buildBoard();                      // guest-এর জন্য উল্টো করে আঁকা হবে
    render();
    if (myRole === 'host') newMatch(); // guest START মেসেজের অপেক্ষায় থাকে
  }

  function stop() {
    started = false;
    selected = null;
    chainPiece = null;
    if (board) render();
  }

  /* ---------- শুরুর কাজ ---------- */
  buildBoard();
  const stopBtn = $('stop-btn');
  if (stopBtn) stopBtn.addEventListener('click', doStop);
  // বোর্ডের ফাঁকা জায়গায় চাপলে বাছাই বাতিল
  svg.addEventListener('click', e => {
    if (e.target === svg && !chainPiece && selected) { selected = null; render(); }
  });

  Game.start = start;
  Game.stop = stop;
  Game.newGame = newGame;
  Game.handleRemote = handleRemote;
  window.Game = Game;
})();
