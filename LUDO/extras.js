/* ==========================================================
   Game Bazz — extras.js
   বাকি সব: লবি পপআপ, বাটন, টোস্ট, মেসেঞ্জার সতর্কবার, ভয়েস চ্যাট।
   ========================================================== */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ---------- টোস্ট ---------- */
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

  /* ---------- পিন ঠিক করা (বাংলা অঙ্ক → ইংরেজি, শুধু সংখ্যা) ---------- */
  function cleanPin(value) {
    return String(value || '')
      .replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d))
      .replace(/\D/g, '')
      .slice(0, 3);
  }

  /* ---------- লবি পপআপ ---------- */
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

  function showMenu(errorText) {
    lobby.overlay.hidden = false;
    lobby.menu.hidden = false;
    lobby.wait.hidden = true;
    lobby.createBtn.disabled = false;
    lobby.joinBtn.disabled = false;
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

  function setDot(on) {
    const dot = $('conn-dot');
    if (!dot) return;
    dot.classList.toggle('conn-on', on);
    dot.classList.toggle('conn-off', !on);
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
    showMenu();
  });

  /* ---------- কানেকশনের ঘটনা ---------- */
  window.Net.on('waiting', pin => showWaiting(pin));

  window.Net.on('error', text => {
    lobby.joinBtn.textContent = '🔑 জয়েন করুন';
    showMenu(text);
  });

  window.Net.on('connected', ({ color, pin }) => {
    lobby.joinBtn.textContent = '🔑 জয়েন করুন';
    lobby.overlay.hidden = true;
    $('conn-overlay').hidden = true;
    setDot(true);
    const title = $('room-title');
    if (title) title.textContent = `রুম ${pin}`;
    toast(color === 'red' ? 'বন্ধু যুক্ত হয়েছে! আপনি লাল।' : 'যুক্ত হয়েছেন! আপনি হলুদ।', 'success');
  });

  window.Net.on('disconnected', () => {
    setDot(false);
    $('win-overlay').hidden = true;
    $('confirm-overlay').hidden = true;
    $('conn-msg').textContent = 'গেম কানেকশন বিচ্ছিন্ন হয়েছে! নতুন খেলা শুরু করুন।';
    $('conn-overlay').hidden = false;
  });

  /* ---------- ওপরের বাটন ও পপআপ ---------- */
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
    window.Game.reset(true);
    toast('নতুন খেলা শুরু হয়েছে।', 'success');
  });
  $('win-restart-btn').addEventListener('click', () => {
    window.Game.reset(true);
  });

  /* ---------- মেসেঞ্জার/ফেসবুক ব্রাউজারের সতর্কবার ---------- */
  if (/FBAN|FBAV|Instagram|Messenger/i.test(navigator.userAgent || '')) {
    $('inapp-banner').hidden = false;
  }
  $('inapp-close-btn').addEventListener('click', () => { $('inapp-banner').hidden = true; });
  $('open-chrome-btn').addEventListener('click', () => {
    toast('ব্রাউজারের মেনু থেকে “Open in Chrome” নির্বাচন করুন।');
  });

  /* ==========================================================
     ভয়েস চ্যাট
     - জয়েন করা প্লেয়ার (হলুদ) কানেকশন হলে হোস্টকে কল করে
     - হোস্ট (লাল) কল ধরে
     ========================================================== */
  const voice = { stream: null, muted: false, call: null };

  async function getMic() {
    if (voice.stream) return voice.stream;
    try {
      voice.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
    } catch (err) {
      console.warn('মাইক পাওয়া যায়নি', err);
      voice.stream = null;
      const btn = $('mic-btn');
      if (btn) btn.textContent = '❌ ব্লকড';
    }
    return voice.stream;
  }

  function playRemote(stream) {
    const audio = $('remote-voice');
    if (!audio) return;
    audio.srcObject = stream;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }

  function showMicWidget() {
    $('voice-widget').hidden = false;
  }

  $('mic-btn').addEventListener('click', async () => {
    const btn = $('mic-btn');
    if (!voice.stream) {
      const s = await getMic();
      if (!s) {
        toast('মাইকের অনুমতি দেওয়া নেই। ব্রাউজার সেটিং থেকে অনুমতি দিন।', 'error');
      } else {
        toast('মাইকের অনুমতি পাওয়া গেছে। ভয়েস পরের বার রুমে ঢুকলে চালু হবে।');
        btn.textContent = '🔊 চালু';
      }
      return;
    }
    const track = voice.stream.getAudioTracks()[0];
    if (!track) return;
    voice.muted = !voice.muted;
    track.enabled = !voice.muted;
    btn.textContent = voice.muted ? '🔇 বন্ধ' : '🔊 চালু';
  });

  // কল ধরা (হোস্ট)
  window.Net.on('peer', peer => {
    peer.on('call', async call => {
      const stream = await getMic();
      call.answer(stream || new MediaStream());
      call.on('stream', playRemote);
      voice.call = call;
    });
  });

  // কানেকশন হলে কল করা (জয়েন করা প্লেয়ার)
  window.Net.on('connected', async () => {
    showMicWidget();
    const net = window.Net;
    const stream = await getMic();
    if (net.role === 'guest' && net.peer) {
      try {
        const call = net.peer.call(net.peerId, stream || new MediaStream());
        if (call) {
          call.on('stream', playRemote);
          voice.call = call;
        }
      } catch (err) {
        console.warn('Voice call failed', err);
      }
    }
  });
})();
