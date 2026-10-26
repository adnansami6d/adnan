/* ==========================================================
   Game Bazz — 16extras.js (ষোলো গুটি)
   বাকি সব: লবি পপআপ, বাটন, টোস্ট, মেসেঞ্জার সতর্কবার, ভয়েস চ্যাট, সাউন্ড।

   সাউন্ড:
   - গুটি ছোঁয়া ও গুটি খাওয়ার হালকা শব্দ কোডেই বানানো (কোনো ফাইল লাগে না)
   - জয়ের শব্দ: 16win.mp3 (এই ফোল্ডারে রাখুন)
   16game.js এগুলো window.Sfx ও window.GameUI দিয়ে ডাকে।
   ========================================================== */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ==========================================================
     টোস্ট
     ========================================================== */
  function toast(message, type = '') {
    const host = $('toast-container');
    if (!host) return;
    const item = document.createElement('div');
    item.className = `toast${type ? ` toast-${type}` : ''}`;
    item.textContent = message;
    host.appendChild(item);
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(() => {
      item.classList.remove('show');
      setTimeout(() => item.remove(), 300);
    }, 2800);
  }
  window.GameUI = { toast };

  /* ==========================================================
     সাউন্ড (Web Audio দিয়ে বানানো + win.mp3)
     ========================================================== */
  let actx = null;
  function audioCtx() {
    if (actx) return actx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch (_) { actx = null; }
    return actx;
  }

  // ব্রাউজার প্রথম ছোঁয়ার আগে সাউন্ড চালাতে দেয় না — তাই প্রথম ছোঁয়ায় চালু করি
  function unlockAudio() {
    const c = audioCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    const r = $('remote-voice');
    if (r && r.srcObject && r.paused) r.play().catch(() => {});
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
    document.addEventListener(ev, unlockAudio, { passive: true })
  );

  // এক টোন: শুরুর ফ্রিকোয়েন্সি থেকে শেষ ফ্রিকোয়েন্সিতে নামে/ওঠে, নরমভাবে মিলিয়ে যায়
  function tone({ from, to, dur, vol, type = 'sine', delay = 0 }) {
    const c = audioCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // সামান্য নয়েজ (গুটি খাওয়ার "পপ"-এর জন্য)
  function noiseBurst({ dur, vol, freq, delay = 0 }) {
    const c = audioCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(t0);
  }

  // জয়ের ফাইল
  let winAudio = null;
  try {
    winAudio = new Audio('16win.mp3');
    winAudio.preload = 'auto';
  } catch (_) { winAudio = null; }

  function winFallbackChime() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ from: f, to: f * 1.01, dur: 0.28, vol: 0.12, delay: i * 0.14 })
    );
  }

  window.Sfx = {
    // গুটি ছোঁয়া / বসানো: ছোট নরম "টুক"
    touch() {
      tone({ from: 760, to: 420, dur: 0.07, vol: 0.09 });
    },
    // গুটি খাওয়া: নরম "ধুপ" + হালকা পপ
    eat() {
      tone({ from: 240, to: 80, dur: 0.16, vol: 0.16 });
      noiseBurst({ dur: 0.07, vol: 0.05, freq: 1400 });
    },
    // জয়: 16win.mp3, না চললে ছোট ঘণ্টাধ্বনি
    win() {
      if (!winAudio) { winFallbackChime(); return; }
      try {
        winAudio.currentTime = 0;
        const p = winAudio.play();
        if (p && p.catch) p.catch(() => winFallbackChime());
      } catch (_) {
        winFallbackChime();
      }
    }
  };
  if (winAudio) winAudio.addEventListener('error', () => { winAudio = null; });

  /* ==========================================================
     পিন ঠিক করা (বাংলা অঙ্ক → ইংরেজি, শুধু সংখ্যা)
     ========================================================== */
  function cleanPin(value) {
    return String(value || '')
      .replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d))
      .replace(/\D/g, '')
      .slice(0, 3);
  }

  /* ==========================================================
     লবি পপআপ
     ========================================================== */
  const lobby = {
    overlay: $('lobby-overlay'),
    menu: $('lobby-menu'),
    wait: $('lobby-wait'),
    msg: $('lobby-msg'),
    pinDisplay: $('room-pin-display'),
    createPin: $('create-pin'),
    joinPin: $('join-pin'),
    createBtn: $('create-room-btn'),
    joinBtn: $('join-room-btn')
  };
  const JOIN_LABEL = '🔑 জয়েন করুন';

  function showMenu(errorText) {
    lobby.overlay.hidden = false;
    lobby.menu.hidden = false;
    lobby.wait.hidden = true;
    lobby.createBtn.disabled = false;
    lobby.joinBtn.disabled = false;
    lobby.joinBtn.textContent = JOIN_LABEL;
    if (errorText) {
      lobby.msg.textContent = errorText;
      lobby.msg.hidden = false;
    } else {
      lobby.msg.hidden = true;
    }
  }

  function showWaiting(pin) {
    lobby.menu.hidden = true;
    lobby.wait.hidden = false;
    lobby.msg.hidden = true;
    lobby.pinDisplay.textContent = pin;
  }

  function setDot(state) {          // 'on' | 'off' | 'wait'
    const dot = $('conn-dot');
    if (!dot) return;
    dot.classList.toggle('conn-on', state === 'on');
    dot.classList.toggle('conn-off', state === 'off');
    dot.classList.toggle('conn-wait', state === 'wait');
  }

  [lobby.createPin, lobby.joinPin].forEach(input => {
    input.addEventListener('input', () => { input.value = cleanPin(input.value); });
  });

  lobby.createBtn.addEventListener('click', () => {
    const pin = cleanPin(lobby.createPin.value);
    lobby.msg.hidden = true;
    if (pin.length !== 3) {
      showMenu('পিন ঠিক ৩টি সংখ্যার হতে হবে।');
      return;
    }
    lobby.createBtn.disabled = true;
    lobby.joinBtn.disabled = true;
    window.Net.createRoom(pin);
  });

  lobby.joinBtn.addEventListener('click', () => {
    const pin = cleanPin(lobby.joinPin.value);
    lobby.msg.hidden = true;
    if (pin.length !== 3) {
      showMenu('বন্ধুর ৩ সংখ্যার পিনটি লিখুন।');
      return;
    }
    lobby.createBtn.disabled = true;
    lobby.joinBtn.disabled = true;
    lobby.joinBtn.textContent = '⏳ যুক্ত হচ্ছে...';
    window.Net.joinRoom(pin);
  });

  lobby.createPin.addEventListener('keydown', e => { if (e.key === 'Enter') lobby.createBtn.click(); });
  lobby.joinPin.addEventListener('keydown', e => { if (e.key === 'Enter') lobby.joinBtn.click(); });

  $('wait-cancel-btn').addEventListener('click', () => {
    window.Net.leave();
    setDot('off');
    showMenu();
  });

  /* ==========================================================
     কানেকশনের ঘটনা
     ========================================================== */
  window.Net.on('waiting', pin => {
    setDot('wait');
    showWaiting(pin);
  });

  window.Net.on('error', text => {
    setDot('off');
    showMenu(text);
  });

  window.Net.on('connected', ({ role, pin }) => {
    lobby.joinBtn.textContent = JOIN_LABEL;
    lobby.overlay.hidden = true;
    $('conn-overlay').hidden = true;
    setDot('on');
    const title = $('room-title');
    if (title) title.textContent = `রুম ${pin}`;
    toast(role === 'host' ? 'বন্ধু যুক্ত হয়েছে! খেলা শুরু।' : 'যুক্ত হয়েছেন! খেলা শুরু।', 'success');
  });

  window.Net.on('disconnected', () => {
    setDot('off');
    $('win-overlay').hidden = true;
    $('confirm-overlay').hidden = true;
    $('conn-msg').textContent = 'গেম কানেকশন বিচ্ছিন্ন হয়েছে! নতুন খেলা শুরু করুন।';
    $('conn-overlay').hidden = false;
    closeVoice();
  });

  /* ==========================================================
     ওপরের বাটন ও পপআপ
     ========================================================== */
  function goLobby() {
    try { window.Net.leave(); } catch (_) {}
    window.location.reload();
  }

  $('lobby-btn').addEventListener('click', goLobby);
  $('conn-lobby-btn').addEventListener('click', goLobby);
  $('win-lobby-btn').addEventListener('click', goLobby);

  $('reset-btn').addEventListener('click', () => {
    if (window.Net.conn && window.Net.conn.open) $('confirm-overlay').hidden = false;
  });
  $('confirm-no-btn').addEventListener('click', () => { $('confirm-overlay').hidden = true; });
  $('confirm-yes-btn').addEventListener('click', () => {
    $('confirm-overlay').hidden = true;
    window.Game.newGame();
    toast(window.Net.role === 'host' ? 'নতুন খেলা শুরু হয়েছে।' : 'নতুন খেলার অনুরোধ পাঠানো হয়েছে।', 'success');
  });
  $('win-restart-btn').addEventListener('click', () => {
    window.Game.newGame();
  });

  /* ==========================================================
     মেসেঞ্জার/ফেসবুক ব্রাউজারের সতর্কবার
     ========================================================== */
  if (/FBAN|FBAV|Instagram|Messenger/i.test(navigator.userAgent || '')) {
    $('inapp-banner').hidden = false;
  }
  $('inapp-close-btn').addEventListener('click', () => { $('inapp-banner').hidden = true; });
  $('open-chrome-btn').addEventListener('click', () => {
    toast('ব্রাউজারের মেনু থেকে “Open in Chrome” নির্বাচন করুন।');
  });

  /* ==========================================================
     ভয়েস চ্যাট
     - জয়েন করা প্লেয়ার (guest) কানেকশন হলে host-কে কল করে
     - host কল ধরে
     - মাইক না পেলেও বন্ধুর কথা শোনা যায় (নিঃশব্দ ট্র্যাক দিয়ে কল চলে)
     ========================================================== */
  const voice = { stream: null, muted: false, call: null, denied: false };

  function setMicLabel() {
    const btn = $('mic-btn');
    if (!btn) return;
    if (voice.denied && !voice.stream) btn.textContent = '❌ ব্লকড';
    else btn.textContent = voice.muted ? '🔇 বন্ধ' : '🔊 চালু';
  }

  async function getMic() {
    if (voice.stream) return voice.stream;
    try {
      voice.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
      voice.denied = false;
    } catch (err) {
      console.warn('মাইক পাওয়া যায়নি', err);
      voice.stream = null;
      voice.denied = true;
    }
    setMicLabel();
    return voice.stream;
  }

  // মাইক না থাকলে কলের জন্য নিঃশব্দ অডিও ট্র্যাক
  function silentStream() {
    const c = audioCtx();
    if (c && c.createMediaStreamDestination) return c.createMediaStreamDestination().stream;
    return new MediaStream();
  }

  function playRemote(stream) {
    const audio = $('remote-voice');
    if (!audio) return;
    audio.srcObject = stream;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }

  function closeVoice() {
    try { if (voice.call) voice.call.close(); } catch (_) {}
    voice.call = null;
    const audio = $('remote-voice');
    if (audio) audio.srcObject = null;
  }

  $('mic-btn').addEventListener('click', async () => {
    // মাইক এখনো পাওয়া যায়নি — আবার অনুমতি চাই
    if (!voice.stream) {
      const s = await getMic();
      if (!s) {
        toast('মাইকের অনুমতি দেওয়া নেই। ব্রাউজার সেটিং থেকে অনুমতি দিন।', 'error');
        return;
      }
      // চলমান কলে নিঃশব্দ ট্র্যাকের জায়গায় আসল মাইক বসাই
      try {
        const pc = voice.call && voice.call.peerConnection;
        const sender = pc && pc.getSenders().find(x => x.track && x.track.kind === 'audio');
        if (sender) sender.replaceTrack(s.getAudioTracks()[0]);
      } catch (err) { console.warn('Mic replace failed', err); }
      toast('মাইক চালু হয়েছে।', 'success');
      return;
    }
    const track = voice.stream.getAudioTracks()[0];
    if (!track) return;
    voice.muted = !voice.muted;
    track.enabled = !voice.muted;
    setMicLabel();
  });

  // কল ধরা (host)
  window.Net.on('peer', peer => {
    peer.on('call', async call => {
      const stream = await getMic();
      call.answer(stream || silentStream());
      call.on('stream', playRemote);
      call.on('close', () => { if (voice.call === call) voice.call = null; });
      voice.call = call;
    });
  });

  // কানেকশন হলে কল করা (guest)
  window.Net.on('connected', async () => {
    $('voice-widget').hidden = false;
    setMicLabel();
    const net = window.Net;
    const stream = await getMic();
    if (net.role === 'guest' && net.peer) {
      try {
        const call = net.peer.call(net.peerId, stream || silentStream());
        if (call) {
          call.on('stream', playRemote);
          call.on('close', () => { if (voice.call === call) voice.call = null; });
          voice.call = call;
        }
      } catch (err) {
        console.warn('Voice call failed', err);
      }
    }
  });
})();
