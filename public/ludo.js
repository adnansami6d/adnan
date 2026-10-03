/* Game Bazz Ludo - secure client renderer
 * The browser is NEVER authoritative for dice, turns, token positions or wins.
 * All game-changing actions are sent to the Socket.IO server.
 */
(() => {
  'use strict';

  const socket = io({
    path: '/api/ludoserver',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    auth: { clientVersion: '1.0.0' }
  });

  let myColor = null;
  let roomCode = null;
  let state = null;
  let isAnimating = false;
  let initialParents = {};

  const PATHS = {
    red: [22,37,52,67,82,96,95,94,93,92,91,106,121,122,123,124,125,126,142,157,172,187,202,217,218,219,204,189,174,159,144,130,131,132,133,134,135,120,105,104,103,102,101,100,84,69,54,39,24,9,8,23,38,53,68,83,'home-bottom'],
    yellow: [204,189,174,159,144,130,131,132,133,134,135,120,105,104,103,102,101,100,84,69,54,39,24,9,8,7,22,37,52,67,82,96,95,94,93,92,91,106,121,122,123,124,125,126,142,157,172,187,202,217,218,203,188,173,158,143,'home-top']
  };
  const SAFE_CELLS = new Set([22,93,122,187,204,133,104,39]);

  const $ = id => document.getElementById(id);
  const delay = ms => new Promise(r => setTimeout(r, ms));

  const sounds = {
    dice: new Audio('dice-roll.mp3'),
    six: new Audio('six.mp3'),
    move: new Audio('move.mp3'),
    eat1: new Audio('eat1.mp3'),
    eat2: new Audio('eat2.mp3'),
    home: new Audio('home.mp3'),
    win: new Audio('win.mp3')
  };
  function playAudio(a, duration = null) {
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
    if (duration) setTimeout(() => { a.pause(); a.currentTime = 0; }, duration);
  }

  function tokenIds() {
    return ['red-1','red-2','red-3','red-4','yellow-1','yellow-2','yellow-3','yellow-4'];
  }

  function captureParents() {
    tokenIds().forEach(id => {
      const el = $(id);
      if (el && !initialParents[id]) initialParents[id] = el.parentElement;
    });
  }

  function cellElement(identifier) {
    return typeof identifier === 'number' ? $(`cell-${identifier}`) : $(identifier);
  }

  function moveTokenToCell(tokenId, identifier) {
    const token = $(tokenId), target = cellElement(identifier);
    if (token && target) target.appendChild(token);
  }

  function resetTokenVisual(tokenId) {
    const parent = initialParents[tokenId];
    const token = $(tokenId);
    if (parent && token) parent.appendChild(token);
  }

  function renderTokens(nextState) {
    if (!nextState?.tokens) return;
    Object.entries(nextState.tokens).forEach(([id, t]) => {
      if (t.isFinished) {
        moveTokenToCell(id, PATHS[t.color][PATHS[t.color].length - 1]);
      } else if (t.pathIndex >= 0) {
        moveTokenToCell(id, PATHS[t.color][t.pathIndex]);
      } else {
        resetTokenVisual(id);
      }
    });
  }

  function movableTokens() {
    if (!state || !myColor || state.turn !== myColor || !state.hasRolled) return [];
    return Object.entries(state.tokens)
      .filter(([id,t]) => t.color === myColor && !t.isFinished)
      .filter(([id,t]) => t.pathIndex === -1 ? state.dice === 6 : t.pathIndex + state.dice < PATHS[myColor].length);
  }

  function updateTurnUI() {
    const red = $('dice-bottom-left'), yellow = $('dice-top-right');
    if (!red || !yellow) return;
    const active = state?.turn;
    const canRoll = state && state.phase === 'playing' && state.turn === myColor && !state.hasRolled && !state.gameOver;
    red.style.opacity = active === 'red' ? '1' : '0.4';
    yellow.style.opacity = active === 'yellow' ? '1' : '0.4';
    red.style.pointerEvents = active === 'red' && canRoll ? 'auto' : 'none';
    yellow.style.pointerEvents = active === 'yellow' && canRoll ? 'auto' : 'none';
    red.style.animation = canRoll && active === 'red' ? 'bounce 0.6s infinite alternate' : '';
    yellow.style.animation = canRoll && active === 'yellow' ? 'bounce 0.6s infinite alternate' : '';
  }

  function highlightMoves() {
    tokenIds().forEach(id => {
      const el = $(id);
      if (el) { el.classList.remove('active-turn'); el.style.animation = ''; }
    });
    if (isAnimating) return;
    const ids = movableTokens().map(x => x[0]);
    ids.forEach(id => {
      const el = $(id);
      if (el) { el.classList.add('active-turn'); el.style.animation = 'bounce 0.5s infinite alternate'; }
    });
  }

  function renderDice(diceValue, diceId) {
    const diceElement = $(diceId);
    const cube = diceElement?.querySelector('.cube');
    if (!cube || !Number.isInteger(diceValue)) return;
    const xRotations = (Math.floor(Math.random() * 4) + 4) * 360;
    const yRotations = (Math.floor(Math.random() * 4) + 4) * 360;
    let xDeg = 0, yDeg = 0;
    if (diceValue === 2) xDeg = -90;
    if (diceValue === 3) yDeg = -90;
    if (diceValue === 4) yDeg = 90;
    if (diceValue === 5) xDeg = 90;
    if (diceValue === 6) yDeg = 180;
    cube.style.transform = `rotateX(${xRotations + xDeg}deg) rotateY(${yRotations + yDeg}deg)`;
  }

  async function animateAuthoritativeMove(tokenId, from, to, color, captured) {
    isAnimating = true;
    highlightMoves();
    if (from === -1 && to === 0) {
      moveTokenToCell(tokenId, PATHS[color][0]);
      playAudio(sounds.move);
      await delay(250);
    } else {
      for (let i = Math.max(0, from + 1); i <= to; i++) {
        moveTokenToCell(tokenId, PATHS[color][i]);
        playAudio(sounds.move);
        await delay(130);
      }
    }
    if (captured) playAudio(Math.random() > 0.5 ? sounds.eat1 : sounds.eat2);
    isAnimating = false;
    if (state) renderTokens(state);
    highlightMoves();
  }

  function showLobby(message = '') {
    $('lobby-overlay').style.display = 'flex';
    if (message) $('status-msg').innerText = message;
  }

  function hideLobby() { $('lobby-overlay').style.display = 'none'; }

  function resetLobby() {
    $('host-controls').style.display = 'block';
    $('invite-section').style.display = 'none';
    $('lobby-title').innerText = 'অনলাইন লুডু 🎲';
  }

  function setRoomUrl(code) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    history.replaceState({}, document.title, url.toString());
  }

  function removeRoomUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }

  function createRoom() {
    $('status-msg').innerText = '🔄 নিরাপদ রুম তৈরি হচ্ছে...';
    socket.emit('room:create', {}, response => {
      if (!response?.ok) return showLobby(response?.error || 'রুম তৈরি করা যায়নি।');
      roomCode = response.roomCode;
      myColor = response.color;
      localStorage.setItem('gameBazzLudoPlayerToken', response.playerToken || '');
      setRoomUrl(roomCode);
      $('host-controls').style.display = 'none';
      $('invite-section').style.display = 'block';
      $('display-room-code').innerText = 'রুম কোড: ' + roomCode;
      $('status-msg').innerText = 'বন্ধুকে রুম কোড/লিংক দিন।';
      state = response.state;
      renderTokens(state);
      updateTurnUI();
    });
  }

  function joinRoom(code) {
    const clean = String(code || '').trim().replace(/^ludo-/i, '');
    if (!/^\d{6}$/.test(clean)) return showLobby('❌ ৬ ডিজিটের সঠিক রুম কোড দিন।');
    $('host-controls').style.display = 'none';
    $('status-msg').innerText = '🔄 রুমে নিরাপদভাবে যুক্ত হওয়া হচ্ছে...';
    socket.emit('room:join', { roomCode: clean }, response => {
      if (!response?.ok) {
        resetLobby();
        return showLobby(response?.error || 'রুমে যোগ দেওয়া যায়নি।');
      }
      roomCode = clean;
      myColor = response.color;
      localStorage.setItem('gameBazzLudoPlayerToken', response.playerToken || '');
      setRoomUrl(roomCode);
      state = response.state;
      hideLobby();
      renderTokens(state);
      updateTurnUI();
      highlightMoves();
    });
  }

  function rollDice() {
    if (!state || state.phase !== 'playing' || state.turn !== myColor || state.hasRolled || isAnimating) return;
    socket.emit('game:roll', {}, response => {
      if (!response?.ok) return;
      state = response.state;
      playAudio(sounds.dice);
      if (state.dice === 6) playAudio(sounds.six, 1900);
      renderDice(response.dice, response.diceId);
      updateTurnUI();
      setTimeout(() => {
        if (!state) return;
        const moves = movableTokens();
        if (moves.length === 1) {
          highlightMoves();
          setTimeout(() => socket.emit('game:move', { tokenId: moves[0][0] }), 300);
        } else if (!moves.length) {
          // Server already advances the turn when no legal move exists.
          state = response.state;
          updateTurnUI();
        } else highlightMoves();
      }, 1000);
    });
  }

  function requestMove(tokenId) {
    if (isAnimating || !state || state.turn !== myColor || !state.hasRolled) return;
    if (!movableTokens().some(([id]) => id === tokenId)) return;
    socket.emit('game:move', { tokenId }, response => {
      if (!response?.ok) return;
      const move = response.move;
      state = response.state;
      animateAuthoritativeMove(tokenId, move.from, move.to, move.color, move.captured);
      if (move.finished) playAudio(sounds.home);
      if (move.winner) playAudio(sounds.win);
      setTimeout(() => { updateTurnUI(); highlightMoves(); }, Math.max(250, (move.steps || 1) * 130 + 50));
    });
  }

  socket.on('game:state', payload => {
    state = payload.state;
    myColor = payload.you?.color || myColor;
    roomCode = payload.roomCode || roomCode;
    renderTokens(state);
    updateTurnUI();
    highlightMoves();
    if (state.gameOver && state.winner) {
      $('win-overlay').style.display = 'flex';
      $('win-message').innerText = state.winner === 'red' ? 'লাল (Red) খেলোয়াড় জয়ী!' : 'হলুদ (Yellow) খেলোয়াড় জয়ী!';
    }
  });

  socket.on('game:move', async move => {
    if (!state || move.by === myColor) return;
    state = move.state;
    await animateAuthoritativeMove(move.tokenId, move.from, move.to, move.color, move.captured);
    if (move.finished) playAudio(sounds.home);
    if (move.winner) playAudio(sounds.win);
    updateTurnUI();
    highlightMoves();
  });

  socket.on('game:dice', payload => {
    if (!state || payload.by === myColor) return;
    state = payload.state;
    playAudio(sounds.dice);
    if (state.dice === 6) playAudio(sounds.six, 1900);
    renderDice(state.dice, state.diceId);
    updateTurnUI();
    highlightMoves();
  });

  socket.on('room:ready', payload => {
    state = payload.state;
    hideLobby();
    renderTokens(state);
    updateTurnUI();
    highlightMoves();
  });

  socket.on('room:waiting', payload => {
    state = payload.state;
    $('status-msg').innerText = '🟢 রুম তৈরি হয়েছে। দ্বিতীয় খেলোয়াড়ের অপেক্ষায়...';
  });

  socket.on('server:error', message => {
    if (message) $('status-msg').innerText = '⚠️ ' + message;
  });

  socket.on('disconnect', () => {
    if (roomCode) showLobby('🔴 সার্ভার সংযোগ বিচ্ছিন্ন। পুনরায় সংযোগের চেষ্টা চলছে...');
  });

  socket.on('connect', () => {
    if (roomCode) socket.emit('room:reconnect', { roomCode, playerToken: localStorage.getItem('gameBazzLudoPlayerToken') || '' }, response => {
      if (response?.ok) { state = response.state; myColor = response.color; hideLobby(); renderTokens(state); updateTurnUI(); highlightMoves(); }
    });
  });

  function setupVoice() {
    // Socket.IO is used only for WebRTC signaling; audio itself remains peer-to-peer.
    let stream = null, pc = null;
    const widget = document.createElement('div');
    widget.id = 'voice-chat-widget';
    widget.innerHTML = '<style>#voice-chat-widget{position:fixed;bottom:15px;left:15px;z-index:10000;display:flex;align-items:center;gap:6px;background:rgba(15,23,42,.9);padding:5px 10px;border-radius:20px;box-shadow:0 4px 10px rgba(0,0,0,.4);color:#fff;font-family:system-ui;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.15)}#mic-toggle-btn{background:#22c55e;border:0;color:#fff;padding:4px 8px;border-radius:12px;cursor:pointer;font-weight:600;font-size:11px}</style><span>🎙️</span><button id="mic-toggle-btn">🟢 চালু</button><audio id="remote-voice-audio" autoplay></audio>';
    document.body.appendChild(widget);
    const btn = $('mic-toggle-btn');
    btn.addEventListener('click', async () => {
      try {
        if (!stream) stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
        const track = stream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        btn.innerText = track.enabled ? '🟢 চালু' : '🔴 বন্ধ';
        if (!pc) {
          pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
          stream.getTracks().forEach(t => pc.addTrack(t, stream));
          pc.onicecandidate = e => e.candidate && socket.emit('voice:ice', e.candidate);
          pc.ontrack = e => { $('remote-voice-audio').srcObject = e.streams[0]; };
          socket.on('voice:offer', async offer => { await pc.setRemoteDescription(offer); const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); socket.emit('voice:answer', ans); });
          socket.on('voice:answer', async answer => { if (pc.signalingState !== 'stable') await pc.setRemoteDescription(answer); });
          socket.on('voice:ice', async candidate => { try { await pc.addIceCandidate(candidate); } catch {} });
          const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('voice:offer', offer);
        }
      } catch { btn.innerText = '❌ ব্লকড'; }
    });
  }

  window.resetGame = () => { location.reload(); };

  document.addEventListener('DOMContentLoaded', () => {
    captureParents();
    ['red-1','red-2','red-3','red-4','yellow-1','yellow-2','yellow-3','yellow-4'].forEach(id => $(id)?.addEventListener('click', () => requestMove(id)));
    $('dice-bottom-left')?.addEventListener('click', rollDice);
    $('dice-top-right')?.addEventListener('click', rollDice);
    $('create-room-btn')?.addEventListener('click', createRoom);
    $('join-room-btn')?.addEventListener('click', () => joinRoom($('room-code-input')?.value));
    $('share-invite-btn')?.addEventListener('click', async () => {
      if (!roomCode) return;
      const inviteUrl = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}`;
      try { if (navigator.share) await navigator.share({title:'লুডু গেম ইনভাইট',text:'আমার সাথে অনলাইন লুডু খেলো!',url:inviteUrl}); else await navigator.clipboard.writeText(inviteUrl); } catch {}
    });
    const code = new URLSearchParams(location.search).get('room');
    if (code) joinRoom(code);
    setupVoice();
  });
})();
