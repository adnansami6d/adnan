/* Game Bazz — home.js */
(() => {
  'use strict';

  const FIREBASE_PROJECT_ID = 'tournament-2d6d4';
  const FIREBASE_API_KEY = 'AIzaSyCNvnJsIn4-oKHLVv7-oNHCTskj8E';
  const DOCS_ROOT = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const LS_SESSIONS = 'gamebazz_sessions';
  const LS_CURRENT = 'gamebazz_current';
  const PEER_PREFIX = 'gamebazz-';
  const SAFE_CELLS = [22, 93, 122, 187, 204, 133, 104, 39];

  const PATHS = {
    red: [22,37,52,67,82,96,95,94,93,92,91,106,121,122,123,124,125,126,142,157,172,187,202,217,218,219,204,189,174,159,144,130,131,132,133,134,135,120,105,104,103,102,101,100,84,69,54,39,24,9,8,23,38,53,68,83,'home-bottom'],
    yellow: [204,189,174,159,144,130,131,132,133,134,135,120,105,104,103,102,101,100,84,69,54,39,24,9,8,7,22,37,52,67,82,96,95,94,93,92,91,106,121,122,123,124,125,126,142,157,172,187,202,217,218,203,188,173,158,143,'home-top']
  };

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const audio = {};

  ['dice-roll','six','move','eat1','eat2','home','win'].forEach(name => {
    try { audio[name] = new Audio(`${name}.mp3`); }
    catch (_) { audio[name] = null; }
  });

  function play(name, maxMs) {
    const a = audio[name];
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
      const p = a.play();
      if (p?.catch) p.catch(() => {});
    } catch (_) {}
    if (maxMs) setTimeout(() => {
      try { a.pause(); a.currentTime = 0; } catch (_) {}
    }, maxMs);
  }

  function toast(message, type = '') {
    const host = $('toast-container');
    if (!host) return;
    const item = document.createElement('div');
    item.className = `toast ${type ? `toast-${type}` : ''}`;
    item.textContent = message;
    host.appendChild(item);
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(() => {
      item.classList.remove('show');
      setTimeout(() => item.remove(), 300);
    }, 2800);
  }

  function localGet(key) {
    try { return localStorage.getItem(key); }
    catch (_) { return null; }
  }

  function localSet(key, value) {
    try { localStorage.setItem(key, value); }
    catch (_) {}
  }

  function getSession() {
    const roomNo = localGet(LS_CURRENT);
    let sessions = {};
    try {
      sessions = JSON.parse(localGet(LS_SESSIONS) || '{}') || {};
    } catch (_) {}
    return { roomNo, session: roomNo ? sessions[roomNo] : null };
  }

  const { roomNo, session } = getSession();
  const myColor = session?.color === 'yellow' || session?.role === 'guest'
    ? 'yellow' : 'red';
  const isHost = myColor === 'red';

  let peer = null;
  let conn = null;
  let isConnected = false;
  let isMoving = false;
  let actionLock = false;
  let stateVersion = 0;
  let persistTimer = null;
  let reconnectTimer = null;
  let destroyed = false;
  let hasLoadedSavedState = false;

  function freshState() {
    const tokenState = {};
    ['red','yellow'].forEach(color => {
      [1,2,3,4].forEach(n => {
        tokenState[`${color}-${n}`] = {
          color, pathIndex: -1, isFinished: false
        };
      });
    });
    return {
      version: 1,
      currentPlayer: 'red',
      diceValue: 0,
      hasRolled: false,
      consecutiveSixes: 0,
      playerSixCounts: { red: 0, yellow: 0 },
      playerLuckPenalty: { red: 0, yellow: 0 },
      tokens: tokenState,
      winner: null,
      updatedAt: Date.now()
    };
  }

  let state = freshState();

  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || !raw.tokens ||
        !['red','yellow'].includes(raw.currentPlayer)) return null;

    const next = freshState();
    next.currentPlayer = raw.currentPlayer;
    next.diceValue = Number(raw.diceValue) || 0;
    next.hasRolled = !!raw.hasRolled &&
      next.diceValue >= 1 && next.diceValue <= 6;
    next.consecutiveSixes = Number(raw.consecutiveSixes) || 0;
    next.playerSixCounts = {
      red: Number(raw.playerSixCounts?.red) || 0,
      yellow: Number(raw.playerSixCounts?.yellow) || 0
    };
    next.playerLuckPenalty = {
      red: Number(raw.playerLuckPenalty?.red) || 0,
      yellow: Number(raw.playerLuckPenalty?.yellow) || 0
    };
    next.winner = ['red','yellow'].includes(raw.winner) ? raw.winner : null;

    for (const id of Object.keys(next.tokens)) {
      const t = raw.tokens[id];
      if (!t) continue;
      const color = id.startsWith('red-') ? 'red' : 'yellow';
      const index = Number(t.pathIndex);
      next.tokens[id] = {
        color,
        pathIndex: Number.isInteger(index) &&
          index >= -1 && index < PATHS[color].length ? index : -1,
        isFinished: !!t.isFinished
      };
      if (next.tokens[id].isFinished) {
        next.tokens[id].pathIndex = PATHS[color].length - 1;
      }
    }

    next.updatedAt = Number(raw.updatedAt) || Date.now();
    return next;
  }
    function getRoomDocumentUrl() {
    return `${DOCS_ROOT}/rooms/${encodeURIComponent(roomNo)}`;
  }

  async function firestoreRead() {
    if (!roomNo) return null;
    const res = await fetch(
      `${getRoomDocumentUrl()}?key=${FIREBASE_API_KEY}`,
      { cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`Firebase read ${res.status}`);
    const doc = await res.json();
    const raw = doc.fields?.gameState?.stringValue;
    if (!raw) return null;
    try { return sanitizeState(JSON.parse(raw)); }
    catch (_) { return null; }
  }

  async function firestoreWrite() {
    if (!isHost || !roomNo) return;
    const payload = JSON.stringify({ ...state, updatedAt: Date.now() });
    const url = `${getRoomDocumentUrl()}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=gameState`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: { gameState: { stringValue: payload } }
      })
    });
    if (!res.ok) throw new Error(`Firebase write ${res.status}`);
  }

  function persistAndBroadcast() {
    state.updatedAt = Date.now();
    stateVersion++;
    state.version = stateVersion;
    renderState();

    if (isHost && conn?.open) safeSend({ type: 'STATE', state });

    if (isHost) {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        firestoreWrite().catch(err => {
          console.warn('Firebase save failed', err);
          toast('Firebase-এ সংরক্ষণ হয়নি; কানেকশন পরীক্ষা করুন।', 'error');
        });
      }, 120);
    }
  }

  function safeSend(data) {
    try {
      if (conn?.open) conn.send(data);
    } catch (err) {
      console.warn('Peer send failed', err);
    }
  }

  function setConnection(connected, message) {
    isConnected = connected;
    const dot = $('conn-dot');
    if (dot) {
      dot.classList.toggle('conn-off', !connected);
      dot.classList.toggle('conn-on', connected);
    }

    const overlay = $('conn-overlay');
    if (!overlay) return;

    if (connected) {
      overlay.hidden = true;
    } else {
      overlay.hidden = false;
      if ($('conn-msg')) {
        $('conn-msg').textContent =
          message || 'বন্ধুর সঙ্গে সংযোগের অপেক্ষায়…';
      }
      if ($('conn-spinner')) $('conn-spinner').hidden = !!message;
      if ($('conn-retry-btn')) $('conn-retry-btn').hidden = false;
    }
  }

  function connectPeer() {
    if (!roomNo || !window.Peer) {
      setConnection(false, 'রুমের তথ্য বা PeerJS পাওয়া যায়নি। লবি থেকে আবার প্রবেশ করুন।');
      return;
    }

    if (peer) {
      try { peer.destroy(); } catch (_) {}
    }

    setConnection(false, isHost
      ? 'বন্ধুর যোগ দেওয়ার অপেক্ষায়…'
      : 'হোস্টের সঙ্গে সংযোগ হচ্ছে…');

    const peerId = `${PEER_PREFIX}${roomNo}`;

    try {
      peer = isHost ? new Peer(peerId) : new Peer();
    } catch (err) {
      setConnection(false, 'PeerJS চালু করা যায়নি। আবার চেষ্টা করুন।');
      return;
    }

    peer.on('open', () => {
      if (isHost) {
        setConnection(false, 'বন্ধুর যোগ দেওয়ার অপেক্ষায়…');
      } else {
        conn = peer.connect(peerId, { reliable: true });
        bindConnection(conn);
      }
    });

    if (isHost) {
      peer.on('connection', incoming => {
        if (conn?.open) {
          incoming.close();
          return;
        }
        conn = incoming;
        bindConnection(conn);
      });
    }

    peer.on('error', err => {
      console.warn('Peer error', err);
      setConnection(false, isHost
        ? 'রুম খুলতে সমস্যা হয়েছে। আবার চেষ্টা করুন।'
        : 'হোস্ট অফলাইন অথবা রুমে সংযোগ করা যাচ্ছে না।');
    });

    peer.on('disconnected', () => {
      if (!destroyed) {
        try { peer.reconnect(); } catch (_) {}
      }
    });
  }

  function bindConnection(connection) {
    connection.on('open', async () => {
      setConnection(true);
      if ($('room-title')) {
        $('room-title').textContent = session?.roomName || `রুম ${roomNo}`;
      }

      if (isHost) {
        await restoreFromFirebase();
        safeSend({ type: 'STATE', state });
        persistAndBroadcast();
      } else {
        safeSend({ type: 'GET_STATE' });
      }
    });

    connection.on('data', async msg => {
      if (!msg || typeof msg.type !== 'string') return;

      if (isHost) {
        if (msg.type === 'GET_STATE') {
          safeSend({ type: 'STATE', state });
          return;
        }

        if (msg.type === 'ROLL_REQUEST' &&
            !actionLock && !state.winner &&
            state.currentPlayer === 'yellow' && !state.hasRolled) {
          await rollDice(true);
          return;
        }

        if (msg.type === 'MOVE_REQUEST' &&
            !actionLock && !state.winner &&
            state.currentPlayer === 'yellow' && state.hasRolled) {
          await moveToken(msg.tokenId, true);
          return;
        }

        if (msg.type === 'RESET_REQUEST') {
          resetState(true);
          return;
        }
      } else if (msg.type === 'STATE') {
        const incoming = sanitizeState(msg.state);
        if (incoming) {
          state = incoming;
          renderState();
        }
      }
    });

    connection.on('close', () => {
      if (destroyed) return;
      setConnection(false, 'সংযোগ বিচ্ছিন্ন হয়েছে। আবার সংযোগের চেষ্টা চলছে…');

      if (!isHost) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (!destroyed && !isConnected) connectPeer();
        }, 2200);
      }
    });

    connection.on('error', err => {
      console.warn('Connection error', err);
      setConnection(false, 'সংযোগে সমস্যা হয়েছে।');
    });
  }

  async function restoreFromFirebase() {
    if (!isHost) return;
    try {
      const saved = await firestoreRead();
      if (saved &&
          (!hasLoadedSavedState ||
           (saved.updatedAt || 0) > (state.updatedAt || 0))) {
        state = saved;
      }
      hasLoadedSavedState = true;
    } catch (err) {
      console.warn('Firebase restore failed', err);
    }
  }

  function getMoveableTokens(color = state.currentPlayer) {
    if (!state.hasRolled ||
        ![1,2,3,4,5,6].includes(state.diceValue)) return [];

    return Object.keys(state.tokens).filter(id => {
      const t = state.tokens[id];
      if (t.color !== color || t.isFinished) return false;
      if (t.pathIndex === -1) return state.diceValue === 6;
      return t.pathIndex + state.diceValue < PATHS[color].length;
    });
  }

  function renderTokens() {
    document.querySelectorAll('.cell[data-count]').forEach(el => {
      el.removeAttribute('data-count');
    });

    Object.keys(state.tokens).forEach(id => {
      const token = state.tokens[id];
      const el = $(id);
      if (!el) return;

      let parent;

      if (token.pathIndex < 0) {
        parent = document.querySelector(
          token.color === 'red'
            ? '#bottom-left-home .home-inner-box'
            : '#top-right-home .home-inner-box'
        );
      } else {
        const cell = PATHS[token.color][token.pathIndex];
        parent = typeof cell === 'number' ? $(`cell-${cell}`) : $(cell);
      }

      if (parent && el.parentElement !== parent) parent.appendChild(el);
    });

    const groups = new Map();

    document.querySelectorAll('#board .token').forEach(el => {
      const p = el.parentElement;
      if (!p) return;

      if (p.classList.contains('cell') ||
          p.classList.contains('triangle')) {
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(el);
      }
    });

    groups.forEach((items, parent) => {
      if (parent.classList.contains('cell')) {
        parent.dataset.count = String(Math.min(items.length, 5));
      }
      items.forEach((el, i) => {
        el.dataset.slot = String(i % 9);
      });
    });

    document.querySelectorAll('.token').forEach(el => {
      if (!groups.has(el.parentElement)) {
        el.removeAttribute('data-slot');
      }
    });
  }

  function renderState() {
    renderTokens();
    document.body.classList.toggle('flipped', myColor === 'yellow');

    const myTurn = state.currentPlayer === myColor;
    const badge = $('turn-badge');

    if (badge) {
      badge.hidden = false;
      badge.textContent = state.winner
        ? `${state.winner === 'red' ? 'লাল' : 'হলুদ'} জয়ী!`
        : (myTurn ? '🎯 আপনার চাল' : '⏳ বন্ধুর চাল');
      badge.classList.toggle('turn-mine', myTurn);
      badge.classList.toggle('turn-opp', !myTurn);
    }

    const redDice = $('dice-bottom-left');
    const yellowDice = $('dice-top-right');

    if (redDice) {
      redDice.style.opacity = state.currentPlayer === 'red' ? '1' : '.4';
      redDice.style.pointerEvents =
        state.currentPlayer === 'red' && myColor === 'red' &&
        !state.hasRolled && !state.winner ? 'auto' : 'none';
    }

    if (yellowDice) {
      yellowDice.style.opacity = state.currentPlayer === 'yellow' ? '1' : '.4';
      yellowDice.style.pointerEvents =
        state.currentPlayer === 'yellow' && myColor === 'yellow' &&
        !state.hasRolled && !state.winner ? 'auto' : 'none';
    }

    const labelBottom = $('label-bottom');
    const labelTop = $('label-top');

    if (labelBottom) {
      labelBottom.textContent = myColor === 'red' ? 'আপনি • লাল' : 'আপনি • হলুদ';
    }
    if (labelTop) {
      labelTop.textContent = myColor === 'red' ? 'বন্ধু • হলুদ' : 'বন্ধু • লাল';
    }

    if (state.diceValue) {
      const target = state.currentPlayer === 'red' ? redDice : yellowDice;
      const cube = target?.querySelector('.cube');
      const rotations = {
        1: [0,0], 2: [-90,0], 3: [0,-90],
        4: [0,90], 5: [90,0], 6: [0,180]
      };
      const r = rotations[state.diceValue];
      if (cube && r) {
        cube.style.transform = `rotateX(${r[0]}deg) rotateY(${r[1]}deg)`;
      }
    }

    setBounce();

    const win = $('win-overlay');
    if (win) {
      win.hidden = !state.winner;
      if (state.winner && $('win-message')) {
        $('win-message').textContent =
          `🎉 ${state.winner === 'red' ? 'লাল (Red)' : 'হলুদ (Yellow)'} প্লেয়ার জয়ী হয়েছেন!`;
      }
    }

    const title = $('room-title');
    if (title && roomNo) {
      title.textContent = session?.roomName || `রুম ${roomNo}`;
    }
  }

  function setBounce() {
    document.querySelectorAll('.token').forEach(el => {
      el.classList.remove('active-turn');
      el.style.animation = '';
    });

    if (state.winner || !state.hasRolled) return;

    getMoveableTokens().forEach(id => {
      const el = $(id);
      if (el) {
        el.classList.add('active-turn');
        el.style.animation = 'bounce .5s infinite alternate';
      }
    });
  }
    async function rollDice(fromRemote = false) {
    if (!isHost) {
      safeSend({ type: 'ROLL_REQUEST' });
      return;
    }
    if (actionLock || state.winner || state.hasRolled) return;

    actionLock = true;
    const value = Math.floor(Math.random() * 6) + 1;
    state.diceValue = value;
    state.hasRolled = true;

    if (value === 6) {
      state.consecutiveSixes++;
      state.playerSixCounts[state.currentPlayer]++;
      play('six', 1900);
    } else {
      state.consecutiveSixes = 0;
      play('dice-roll');
    }

    persistAndBroadcast();
    await sleep(700);

    const movable = getMoveableTokens();

    if (!movable.length) {
      if (value === 6) {
        state.hasRolled = false;
      } else {
        switchTurn();
      }
      persistAndBroadcast();
    } else if (movable.length === 1 && state.currentPlayer === 'red') {
      actionLock = false;
      await sleep(250);
      await moveToken(movable[0], false);
      return;
    }

    actionLock = false;
  }

  async function moveToken(tokenId, fromRemote = false) {
    if (!isHost) {
      if (state.currentPlayer === myColor &&
          getMoveableTokens(myColor).includes(tokenId)) {
        safeSend({ type: 'MOVE_REQUEST', tokenId });
      }
      return;
    }

    if (actionLock || !state.hasRolled || state.winner ||
        !getMoveableTokens().includes(tokenId)) return;

    actionLock = true;
    isMoving = true;

    const token = state.tokens[tokenId];
    const color = token.color;
    const roll = state.diceValue;
    const wasOut = token.pathIndex >= 0;

    if (!wasOut && roll === 6) {
      token.pathIndex = 0;
      renderTokens();
      play('move');
      await sleep(220);
    } else if (wasOut) {
      for (let i = 0; i < roll; i++) {
        token.pathIndex++;
        renderTokens();
        play('move');
        await sleep(180);
      }
    }

    const lastIndex = PATHS[color].length - 1;
    if (token.pathIndex === lastIndex) {
      token.isFinished = true;
      play('home');
    }

    let ate = false;

    if (!token.isFinished) {
      const cell = PATHS[color][token.pathIndex];

      if (typeof cell === 'number' && !SAFE_CELLS.includes(cell)) {
        for (const other of Object.values(state.tokens)) {
          if (other.color === color || other.pathIndex < 0 ||
              other.isFinished) continue;

          if (PATHS[other.color][other.pathIndex] === cell) {
            other.pathIndex = -1;
            other.isFinished = false;
            ate = true;
          }
        }
      }
    }

    const won = Object.values(state.tokens)
      .filter(t => t.color === color)
      .every(t => t.isFinished);

    if (won) {
      state.winner = color;
      play('win');
    }

    const anotherTurn = roll === 6 || ate || token.isFinished;
    state.hasRolled = false;
    state.diceValue = 0;

    if (!state.winner && !anotherTurn) switchTurn();

    isMoving = false;
    actionLock = false;
    persistAndBroadcast();
  }

  function switchTurn() {
    state.currentPlayer = state.currentPlayer === 'red' ? 'yellow' : 'red';
    state.hasRolled = false;
    state.diceValue = 0;

    if (state.currentPlayer === 'red') {
      state.consecutiveSixes = 0;
    }
  }

  function resetState(fromRemote = false) {
    if (!isHost) {
      safeSend({ type: 'RESET_REQUEST' });
      if ($('confirm-overlay')) $('confirm-overlay').hidden = true;
      if ($('win-overlay')) $('win-overlay').hidden = true;
      return;
    }

    state = freshState();
    actionLock = false;
    isMoving = false;

    if ($('confirm-overlay')) $('confirm-overlay').hidden = true;
    if ($('win-overlay')) $('win-overlay').hidden = true;

    persistAndBroadcast();
    firestoreWrite().catch(err =>
      console.warn('Firebase reset save failed', err)
    );
    toast('নতুন খেলা শুরু হয়েছে।', 'success');
  }

  function goLobby() {
    window.location.href = 'index.html';
  }

  function bindUI() {
    ['red', 'yellow'].forEach(color => {
      [1, 2, 3, 4].forEach(n => {
        const id = `${color}-${n}`;

        $(id)?.addEventListener('click', () => {
          if (state.currentPlayer !== myColor ||
              !state.hasRolled ||
              !getMoveableTokens(myColor).includes(id)) return;

          if (isHost) moveToken(id);
          else safeSend({ type: 'MOVE_REQUEST', tokenId: id });
        });
      });
    });

    $('dice-bottom-left')?.addEventListener('click', () => {
      if (myColor === 'red' && state.currentPlayer === 'red') {
        rollDice();
      }
    });

    $('dice-top-right')?.addEventListener('click', () => {
      if (myColor === 'yellow' && state.currentPlayer === 'yellow') {
        rollDice();
      }
    });

    $('reset-btn')?.addEventListener('click', () => {
      if ($('confirm-overlay')) $('confirm-overlay').hidden = false;
    });

    $('confirm-no-btn')?.addEventListener('click', () => {
      if ($('confirm-overlay')) $('confirm-overlay').hidden = true;
    });

    $('confirm-yes-btn')?.addEventListener('click', () => resetState());
    $('win-restart-btn')?.addEventListener('click', () => resetState());

    $('lobby-btn')?.addEventListener('click', goLobby);
    $('conn-lobby-btn')?.addEventListener('click', goLobby);
    $('win-lobby-btn')?.addEventListener('click', goLobby);

    $('conn-retry-btn')?.addEventListener('click', connectPeer);

    $('inapp-close-btn')?.addEventListener('click', () => {
      if ($('inapp-banner')) $('inapp-banner').hidden = true;
    });

    $('open-chrome-btn')?.addEventListener('click', () => {
      toast('ব্রাউজারের মেনু থেকে “Open in Chrome” নির্বাচন করুন।');
    });

    window.addEventListener('online', () => {
      if (!isConnected) connectPeer();
    });

    window.addEventListener('beforeunload', () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
    });
  }

  function showInAppBanner() {
    const ua = navigator.userAgent || '';
    if (/FBAN|FBAV|Instagram|Messenger/i.test(ua) && $('inapp-banner')) {
      $('inapp-banner').hidden = false;
    }
  }

  async function init() {
    bindUI();
    showInAppBanner();
    renderState();

    if (!roomNo || !session) {
      setConnection(
        false,
        'রুমের সেশন পাওয়া যায়নি। লবিতে ফিরে রুমে আবার প্রবেশ করুন।'
      );
      if ($('conn-retry-btn')) $('conn-retry-btn').hidden = true;
      return;
    }

    if (isHost) {
      try {
        const saved = await firestoreRead();
        if (saved) state = saved;
      } catch (err) {
        console.warn('Firebase initial restore failed', err);
      }
    }

    renderState();
    connectPeer();

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' &&
          isHost && !actionLock) {
        await restoreFromFirebase();
        renderState();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();