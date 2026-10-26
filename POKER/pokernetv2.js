/* =====================================================================
   NEON TEXAS HOLD'EM  -  pokernetv2.js   (সম্পূর্ণ নতুন ফাইল)
   অনলাইন অংশ: PeerJS মেশ, রুম খোঁজা, সিট বাছা, হোস্ট বদল, ব্যাকগ্রাউন্ড ভয়েস।

   লোডের ক্রম (index.html): peerjs CDN  ->  ... সব পুরোনো ফাইল ...  ->  pokernetv2.js  ->  pokergame.js

   ---------------------------------------------------------------------
   নিয়ম
   - রুম আইডি  = "Poker" + ৪ অঙ্কের সিরিয়াল  (Poker0001, Poker0002 ...)
   - প্রতিটি মানুষের সিটের নিজস্ব Peer ID:  Poker0001-M1 ... Poker0001-M4
       Man 1 = bot 3 এর জায়গা, Man 2 = bot 2, Man 3 = bot 1, Man 4 = bot 0
   - সর্বোচ্চ ৪ মানুষ, ৫ম সিট সবসময় খালি।
   - হোস্ট = যে মানুষগুলো এখন আছে তাদের মধ্যে সবচেয়ে ছোট সিট নম্বর (M1, না থাকলে M2 ...)
   - সবাই সবার সাথে আগে থেকেই কানেক্টেড (মেশ), তাই হোস্ট গেলে রিকানেক্ট লাগে না।
   - কেউ রুমে না থাকলে (সব রুম ফুল বা কোনো রুম নেই) তবেই নতুন রুম খোলে।

   ---------------------------------------------------------------------
   pokergame.js এর ব্যবহার
     const info = await PokerNet.join();        // {room, roomId, seat, isHost, members}
     PokerNet.on('message',  (fromSeat, msg) => {...});   // অন্যদের পাঠানো বার্তা
     PokerNet.on('host',     ({isHost, hostSeat, previous}) => {...});   // হোস্ট বদল
     PokerNet.on('members',  (seatsArray) => {...});      // কারা কারা এখন মানুষ
     PokerNet.on('joined',   (seat) => {...});            // নতুন মানুষ এল
     PokerNet.on('left',     (seat) => {...});            // কেউ চলে গেল
     PokerNet.on('snapshot', (data) => {...});            // হোস্টের পাঠানো পুরো গেম স্টেট
     PokerNet.broadcast(msg);                  // সবাইকে
     PokerNet.sendTo(seat, msg);               // একজনকে (যেমন তার হোল কার্ড)
     PokerNet.setSnapshotProvider(() => state);   // হোস্ট নতুন কেউ এলে এটা তাকে পাঠায়
     PokerNet.sendSnapshot(data);              // হোস্ট সবাইকে পুরো স্টেট পাঠায় (ক্যাশ আপডেট)
     PokerNet.lastSnapshot()                   // সর্বশেষ পাওয়া স্টেট (নতুন হোস্ট এটা থেকে চালায়)
     PokerNet.isHost(), PokerNet.seat(), PokerNet.members(), PokerNet.roomId()
     PokerNet.leave();
   ===================================================================== */
'use strict';

const PokerNet = (() => {

  /* ===================== সেটিংস ===================== */
  const PREFIX       = 'Poker';
  const MAX_HUMANS   = 4;
  const MAX_ROOMS    = 99;
  const PROBE_MS     = 5000;     // একটা সিটে সাড়া পাওয়ার অপেক্ষা
  const PICK_MS      = 10000;    // সিট বাছতে সময় (না বাছলে নিজে বসে)
  const MIC_WAIT_MS  = 12000;    // মাইক পারমিশনের জন্য সর্বোচ্চ অপেক্ষা
  const PING_MS      = 2000;
  const DEAD_MS      = 8000;     // এতক্ষণ চুপ থাকলে মানুষটা চলে গেছে ধরা হবে
  const PEER_CONFIG  = {};       // নিজের PeerJS সার্ভার থাকলে এখানে দিন: {host, port, path}

  const T = {
    CONNECTING: 'অনলাইন গেমে কানেক্ট হচ্ছে… অপেক্ষা করুন',
    SEARCHING:  'রুম খোঁজা হচ্ছে',
    CREATING:   'নতুন রুম খোলা হচ্ছে',
    JOINING:    'রুমে ঢোকা হচ্ছে',
    PICK:       'কোন সিটে বসবেন?',
    TAKEN:      'ভর্তি',
    MIC_BTN:    '🎤 মাইক চালু করুন',
    MIC_ON:     '🎤 মাইক চালু আছে',
    MIC_OFF:    'মাইক ছাড়া চলছে (শুধু শুনতে পারবেন)',
    NO_PEERJS:  'PeerJS লোড হয়নি। ইন্টারনেট দেখুন।',
    FAILED:     'কানেক্ট করা গেল না। আবার চেষ্টা চলছে…'
  };

  /* ===================== ছোট সহায়ক ===================== */
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const pad4  = n => String(n).padStart(4, '0');
  const roomName = room => PREFIX + pad4(room);
  const idOf = (room, seat) => roomName(room) + '-M' + seat;

  function parseId(id, room) {
    const m = /^Poker(\d{4})-M([1-4])$/.exec(id || '');
    if (!m) return null;
    if (room != null && Number(m[1]) !== room) return null;
    return { room: Number(m[1]), seat: Number(m[2]) };
  }

  /* ===================== ইভেন্ট ===================== */
  const handlers = {};
  function on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); }
  function emit(name, ...args) {
    (handlers[name] || []).forEach(fn => { try { fn(...args); } catch (e) { console.error('PokerNet.' + name, e); } });
  }

  /* ===================== অবস্থা ===================== */
  let peer = null;
  let room = 0, mySeat = 0, hostSeat = 0;
  let joined = false;
  const conns    = {};   // seat -> DataConnection
  const calls    = {};   // seat -> MediaConnection
  const audios   = {};   // seat -> <audio>
  const lastSeen = {};   // seat -> সময়
  let pingTimer = null;
  let snapshotProvider = null;
  let snapshotCache = null;

  /* ===================== ভয়েস ===================== */
  let micStream = null, micState = 'pending';   // 'pending' | 'on' | 'off'
  let micPromise = null;
  let silentStream = null;

  function getSilentStream() {
    if (silentStream) return silentStream;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      silentStream = ctx.createMediaStreamDestination().stream;
    } catch (e) { silentStream = new MediaStream(); }
    return silentStream;
  }

  function requestMic() {
    if (micPromise) return micPromise;
    micPromise = (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no mic api');
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        micState = 'on';
      } catch (e) { micState = 'off'; }
      updateMicNote();
      return micStream;
    })();
    return micPromise;
  }

  const outStream = () => micStream || getSilentStream();

  function playRemote(seat, stream) {
    let a = audios[seat];
    if (!a) {
      a = document.createElement('audio');
      a.autoplay = true;
      a.setAttribute('playsinline', '');
      a.style.display = 'none';
      document.body.appendChild(a);
      audios[seat] = a;
    }
    a.srcObject = stream;
    const p = a.play();
    if (p && p.catch) p.catch(() => { pendingPlay = true; });   // ফোনে প্রথম ট্যাপের পর চালু হবে
  }

  let pendingPlay = false;
  function resumeAudio() {
    if (!pendingPlay) return;
    pendingPlay = false;
    Object.values(audios).forEach(a => { const p = a.play(); if (p && p.catch) p.catch(() => {}); });
  }
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
    document.addEventListener(ev, resumeAudio, { passive: true }));

  function attachCall(seat, call) {
    if (calls[seat]) { try { calls[seat].close(); } catch (e) {} }
    calls[seat] = call;
    call.on('stream', s => playRemote(seat, s));
    call.on('close',  () => { if (calls[seat] === call) { delete calls[seat]; removeAudio(seat); } });
    call.on('error',  () => {});
  }

  function removeAudio(seat) {
    const a = audios[seat];
    if (a) { try { a.srcObject = null; a.remove(); } catch (e) {} delete audios[seat]; }
  }

  /* ===================== স্ক্রিন (লোডিং, সিট বাছা) ===================== */
  let ov = null, ovText = null, ovSub = null, ovPick = null, ovMic = null, ovNote = null;

  function injectCss() {
    if (document.getElementById('pn-css')) return;
    const s = document.createElement('style');
    s.id = 'pn-css';
    s.textContent = `
#pn-ov{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:14px;padding:24px;text-align:center;color:#fff;font-family:system-ui,sans-serif;
  background:radial-gradient(ellipse at 50% 30%,#1b0f3a 0%,#05030f 70%)}
#pn-ov.pn-hide{display:none}
.pn-spin{width:46px;height:46px;border-radius:50%;border:4px solid rgba(255,255,255,.15);border-top-color:#35f0ff;animation:pnspin 1s linear infinite}
@keyframes pnspin{to{transform:rotate(360deg)}}
.pn-title{font-size:20px;font-weight:700;letter-spacing:.3px}
.pn-sub{font-size:14px;opacity:.75;min-height:18px}
.pn-pick{display:none;gap:10px;flex-wrap:wrap;justify-content:center;max-width:420px}
.pn-pick.pn-show{display:flex}
.pn-seat{min-width:120px;padding:14px 16px;border-radius:12px;border:2px solid #35f0ff;background:rgba(53,240,255,.08);
  color:#fff;font-size:16px;font-weight:700}
.pn-seat:disabled{border-color:#555;color:#777;background:rgba(255,255,255,.04)}
.pn-mic{padding:10px 18px;border-radius:999px;border:2px solid #ff4fd8;background:rgba(255,79,216,.1);color:#fff;font-size:15px}
.pn-note{font-size:13px;opacity:.7}
`;
    document.head.appendChild(s);
  }

  function buildOverlay() {
    if (ov) return;
    injectCss();
    ov = document.createElement('div');
    ov.id = 'pn-ov';
    ov.innerHTML =
      '<div class="pn-spin"></div>' +
      '<div class="pn-title"></div>' +
      '<div class="pn-sub"></div>' +
      '<div class="pn-pick"></div>' +
      '<button class="pn-mic" type="button"></button>' +
      '<div class="pn-note"></div>';
    document.body.appendChild(ov);
    ovText = ov.querySelector('.pn-title');
    ovSub  = ov.querySelector('.pn-sub');
    ovPick = ov.querySelector('.pn-pick');
    ovMic  = ov.querySelector('.pn-mic');
    ovNote = ov.querySelector('.pn-note');
    ovMic.textContent = T.MIC_BTN;
    ovMic.addEventListener('click', () => { requestMic(); resumeAudio(); });
  }

  function showOverlay(sub) {
    buildOverlay();
    ov.classList.remove('pn-hide');
    ovText.textContent = T.CONNECTING;
    ovSub.textContent = sub || '';
    ovPick.classList.remove('pn-show');
    updateMicNote();
  }
  function setSub(t) { if (ovSub) ovSub.textContent = t; }
  function hideOverlay() { if (ov) ov.classList.add('pn-hide'); }

  function updateMicNote() {
    if (!ovNote) return;
    ovMic.style.display = micState === 'pending' ? '' : 'none';
    ovNote.textContent = micState === 'on' ? T.MIC_ON : micState === 'off' ? T.MIC_OFF : '';
  }

  // খালি সিটের মধ্যে থেকে বেছে নেওয়া। না বাছলে PICK_MS পর সবচেয়ে ছোট খালি সিট
  function chooseSeat(freeSeats, occupied) {
    return new Promise(resolve => {
      buildOverlay();
      ovPick.innerHTML = '';
      let done = false, left = Math.round(PICK_MS / 1000);
      const finish = seat => {
        if (done) return;
        done = true; clearInterval(tm);
        ovPick.classList.remove('pn-show');
        resolve(seat);
      };
      for (let s = 1; s <= MAX_HUMANS; s++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pn-seat';
        const taken = occupied.indexOf(s) >= 0;
        b.textContent = 'Man ' + s + (taken ? ' (' + T.TAKEN + ')' : '');
        b.disabled = taken;
        if (!taken) b.addEventListener('click', () => finish(s));
        ovPick.appendChild(b);
      }
      ovPick.classList.add('pn-show');
      const tick = () => { setSub(T.PICK + ' (' + left + ')'); };
      tick();
      const tm = setInterval(() => { left--; tick(); if (left <= 0) finish(Math.min.apply(null, freeSeats)); }, 1000);
    });
  }

  /* ===================== রুম খোঁজা (probe) ===================== */
  let probePeer = null;

  function makeProbePeer() {
    return new Promise((resolve, reject) => {
      const p = new Peer(undefined, PEER_CONFIG);
      const to = setTimeout(() => reject(new Error('probe timeout')), 15000);
      p.on('open', () => { clearTimeout(to); resolve(p); });
      p.on('error', e => { if (!probePeer) { clearTimeout(to); reject(e); } });
    });
  }

  // রুমে কোন কোন সিটে মানুষ আছে তার তালিকা
  function probeRoom(roomNo) {
    return new Promise(resolve => {
      const occupied = [];
      const pending = {};
      let left = MAX_HUMANS, finished = false;

      const done = () => {
        if (finished) return;
        finished = true;
        probePeer.off('error', onErr);
        Object.keys(pending).forEach(k => { try { pending[k].close(); } catch (e) {} });
        resolve(occupied.sort());
      };
      const settle = (seat, isOcc) => {
        if (!pending[seat]) return;
        if (isOcc) occupied.push(seat);
        left--;
        if (left === 0) done();
      };
      const onErr = e => {
        const msg = String((e && e.message) || '');
        for (let s = 1; s <= MAX_HUMANS; s++) {
          if (pending[s] && msg.indexOf(idOf(roomNo, s)) >= 0) { const c = pending[s]; settle(s, false); c.__settled = true; }
        }
      };
      probePeer.on('error', onErr);

      for (let s = 1; s <= MAX_HUMANS; s++) {
        const c = probePeer.connect(idOf(roomNo, s));
        pending[s] = c;
        c.on('open', () => { if (!c.__settled) { c.__settled = true; settle(s, true); } });
      }
      setTimeout(() => {
        for (let s = 1; s <= MAX_HUMANS; s++) if (pending[s] && !pending[s].__settled) { pending[s].__settled = true; left--; }
        done();
      }, PROBE_MS);
    });
  }

  /* ===================== সিট দখল ও মেশ ===================== */
  function claimSeat(roomNo, seat) {
    return new Promise(resolve => {
      let settled = false;
      const p = new Peer(idOf(roomNo, seat), PEER_CONFIG);
      const to = setTimeout(() => { if (!settled) { settled = true; try { p.destroy(); } catch (e) {} resolve(null); } }, 15000);
      p.on('open', () => { if (settled) return; settled = true; clearTimeout(to); resolve(p); });
      p.on('error', e => {
        if (!settled) {   // আইডি আগেই কেউ নিয়ে নিয়েছে (দুজন একসাথে একই সিট)
          settled = true; clearTimeout(to);
          try { p.destroy(); } catch (x) {}
          resolve(null);
        }
      });
    });
  }

  function seatsKnown() { return [mySeat].concat(Object.keys(conns).map(Number)).sort((a, b) => a - b); }

  // হোস্ট স্থির থাকে। শুধু হোস্ট চলে গেলে বাকিদের মধ্যে সবচেয়ে ছোট সিট নতুন হোস্ট।
  function recomputeHost() {
    let h = hostSeat;
    if (!h) h = Math.min.apply(null, seatsKnown());
    else if (h !== mySeat && !conns[h]) h = Math.min.apply(null, seatsKnown());
    if (h !== hostSeat) {
      const previous = hostSeat;
      hostSeat = h;
      if (joined) emit('host', { isHost: hostSeat === mySeat, hostSeat, previous });
    }
  }

  function broadcastWho() {
    const msg = { _pn: 'who', seats: seatsKnown(), host: hostSeat };
    Object.values(conns).forEach(c => { try { c.send(msg); } catch (e) {} });
  }

  function setupConn(seat, conn) {
    if (conns[seat] && conns[seat] !== conn) { try { conns[seat].close(); } catch (e) {} }
    conns[seat] = conn;
    lastSeen[seat] = Date.now();

    const announce = () => {
      lastSeen[seat] = Date.now();
      if (joined) recomputeHost();
      broadcastWho();
      if (joined) {
        emit('joined', seat);
        emit('members', seatsKnown());
        // হোস্ট হলে নতুন মানুষকে এখনকার পুরো স্টেট পাঠায়
        if (hostSeat === mySeat && snapshotProvider) {
          try { conn.send({ _pn: 'snap', data: snapshotProvider() }); } catch (e) {}
        }
      }
    };
    if (conn.open) announce(); else conn.on('open', announce);

    conn.on('data', d => {
      lastSeen[seat] = Date.now();
      if (!d) return;
      if (d._pn === 'ping') return;
      if (d._pn === 'who') {
        if (!hostSeat && d.host && !joined) hostSeat = d.host;      // নতুন এলে চলমান হোস্টকে মেনে নিই
        // যাকে চিনি না তাকে ডাকি (শুধু বড় সিট ছোট সিটকে ডাকে, যাতে দুজন একসাথে না ডাকে)
        (d.seats || []).forEach(s => { if (s !== mySeat && !conns[s] && mySeat > s) connectTo(s); });
        return;
      }
      if (d._pn === 'snap') { snapshotCache = d.data; emit('snapshot', d.data); return; }
      emit('message', seat, d);
    });
    conn.on('close', () => dropSeat(seat, conn));
    conn.on('error', () => dropSeat(seat, conn));
  }

  function connectTo(seat) {
    if (conns[seat] || seat === mySeat || !peer) return;
    const id = idOf(room, seat);
    const conn = peer.connect(id, { reliable: true });
    setupConn(seat, conn);
    // ভয়েস কল: যে ডাকে সে-ই কল করে
    try {
      const call = peer.call(id, outStream());
      if (call) attachCall(seat, call);
    } catch (e) {}
    // সাড়া না এলে বাদ
    setTimeout(() => { if (conns[seat] === conn && !conn.open) dropSeat(seat, conn); }, PROBE_MS);
  }

  function dropSeat(seat, conn) {
    if (conn && conns[seat] !== conn) return;
    if (!conns[seat]) return;
    try { conns[seat].close(); } catch (e) {}
    delete conns[seat];
    delete lastSeen[seat];
    if (calls[seat]) { try { calls[seat].close(); } catch (e) {} delete calls[seat]; }
    removeAudio(seat);
    recomputeHost();
    if (joined) { emit('left', seat); emit('members', seatsKnown()); }
  }

  function wirePeer(p) {
    p.on('connection', conn => {
      const info = parseId(conn.peer, room);
      if (!info || info.seat === mySeat) {   // probe বা অচেনা: শুধু সাড়া দিয়ে ছেড়ে দিই
        conn.on('open', () => setTimeout(() => { try { conn.close(); } catch (e) {} }, 400));
        return;
      }
      setupConn(info.seat, conn);
    });
    p.on('call', call => {
      const info = parseId(call.peer, room);
      if (!info) { try { call.close(); } catch (e) {} return; }
      call.answer(outStream());
      attachCall(info.seat, call);
    });
    p.on('disconnected', () => { try { p.reconnect(); } catch (e) {} });   // ব্রোকার থেকে সরলেও মেশ চলে
    p.on('error', () => {});
  }

  function startHeartbeat() {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      const now = Date.now();
      Object.keys(conns).forEach(k => {
        const seat = Number(k), c = conns[seat];
        try { if (c.open) c.send({ _pn: 'ping' }); } catch (e) {}
        if (now - (lastSeen[seat] || now) > DEAD_MS) dropSeat(seat, c);
      });
    }, PING_MS);
  }

  /* ===================== জয়েন ===================== */
  async function join() {
    if (typeof Peer === 'undefined') { showOverlay(T.NO_PEERJS); throw new Error('PeerJS missing'); }
    showOverlay(T.SEARCHING);
    hostSeat = 0; snapshotCache = null; joined = false;
    requestMic();                                   // পারমিশনের প্রশ্ন সাথে সাথে আসে, অপেক্ষা করে না

    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        if (!probePeer) probePeer = await makeProbePeer();
      } catch (e) { setSub(T.FAILED); await delay(2000); continue; }

      for (let r = 1; r <= MAX_ROOMS; r++) {
        setSub(T.SEARCHING + ' · ' + roomName(r));
        const occupied = await probeRoom(r);
        if (occupied.length >= MAX_HUMANS) continue;          // ফুল, পরের রুম

        let seat;
        if (occupied.length === 0) { seat = 1; setSub(T.CREATING + ' · ' + roomName(r)); }
        else {
          const free = [];
          for (let s = 1; s <= MAX_HUMANS; s++) if (occupied.indexOf(s) < 0) free.push(s);
          seat = free.length === 1 ? free[0] : await chooseSeat(free, occupied);
          setSub(T.JOINING + ' · ' + roomName(r));
        }

        await Promise.race([requestMic(), delay(MIC_WAIT_MS)]);   // ভয়েসের জন্য মাইক রেডি হোক

        const p = await claimSeat(r, seat);
        if (!p) { r--; await delay(400); continue; }              // কেউ আগে নিয়েছে, একই রুম আবার দেখি

        peer = p; room = r; mySeat = seat;
        wirePeer(p);
        occupied.forEach(s => connectTo(s));

        // অন্তত একজনের সাথে কানেকশন খোলা পর্যন্ত (বা নতুন রুম হলে সাথে সাথে)
        if (occupied.length) {
          const t0 = Date.now();
          while (Date.now() - t0 < PROBE_MS && !Object.values(conns).some(c => c.open)) await delay(100);
        }

        try { probePeer.destroy(); } catch (e) {}
        probePeer = null;

        if (!occupied.length) hostSeat = mySeat;                  // নতুন রুম: আমিই হোস্ট
        else {
          const t1 = Date.now();                                   // চলমান হোস্টের নাম আসা পর্যন্ত একটু অপেক্ষা
          while (!hostSeat && Date.now() - t1 < 3000) await delay(100);
          if (!hostSeat || (hostSeat !== mySeat && !conns[hostSeat])) hostSeat = Math.min.apply(null, seatsKnown());
        }
        joined = true;
        startHeartbeat();
        hideOverlay();
        emit('members', seatsKnown());
        return { room, roomId: roomName(room), seat: mySeat, isHost: hostSeat === mySeat, members: seatsKnown() };
      }
      setSub(T.FAILED);
      await delay(1500);
    }
    throw new Error('join failed');
  }

  function leave() {
    joined = false;
    clearInterval(pingTimer);
    Object.keys(conns).forEach(k => { try { conns[k].close(); } catch (e) {} delete conns[k]; });
    Object.keys(calls).forEach(k => { try { calls[k].close(); } catch (e) {} delete calls[k]; });
    Object.keys(audios).forEach(removeAudio);
    try { if (peer) peer.destroy(); } catch (e) {}
    try { if (probePeer) probePeer.destroy(); } catch (e) {}
    peer = null; probePeer = null;
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  }

  // ট্যাব বন্ধ করলে ভদ্রভাবে বের হই, যাতে অন্যরা সাথে সাথে বুঝতে পারে
  window.addEventListener('pagehide', leave);

  /* ===================== বার্তা পাঠানো ===================== */
  function broadcast(msg) {
    Object.values(conns).forEach(c => { try { if (c.open) c.send(msg); } catch (e) {} });
  }
  function sendTo(seat, msg) {
    const c = conns[seat];
    try { if (c && c.open) c.send(msg); } catch (e) {}
  }
  function sendSnapshot(data) {
    snapshotCache = data;
    broadcast({ _pn: 'snap', data });
  }

  /* ===================== বাইরের জন্য ===================== */
  return {
    join, leave, on,
    broadcast, sendTo,
    setSnapshotProvider: fn => { snapshotProvider = fn; },
    sendSnapshot,
    lastSnapshot: () => snapshotCache,
    isHost:  () => joined && hostSeat === mySeat,
    hostSeat: () => hostSeat,
    seat:    () => mySeat,
    members: () => seatsKnown(),
    roomId:  () => (room ? roomName(room) : ''),
    micState: () => micState
  };
})();
