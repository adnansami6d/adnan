/* ==========================================================
   Game Bazz — extras.js
   লবি (রুম তৈরি / লিংক কপি-শেয়ার / অটো জয়েন), বাটন, টোস্ট,
   ইন-অ্যাপ ব্রাউজার সতর্কবার, ভয়েস চ্যাট।

   লবির ভেতরের অংশ এই ফাইলই বানায়, তাই home.html-এ লবির পুরনো
   পিন-ইনপুট থাকলেও সেটা এখানে বদলে যায়।
   ========================================================== */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const Net = window.Net;

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
    }, 2400);
  }

  function setDot(on) {
    const dot = $('conn-dot');
    if (!dot) return;
    dot.classList.toggle('conn-on', on);
    dot.classList.toggle('conn-off', !on);
  }

  /* ==========================================================
     লবি
     চারটি দৃশ্য: home (Create Room) → wait (লিংক, Copy, Share)
                  join (Joining...) → error
     ========================================================== */
  const overlay = $('lobby-overlay');

  overlay.innerHTML = `
    <div class="lobby-card">
      <div id="lobby-home">
        <h2>Ludo</h2>
        <button id="create-room-btn" class="restart-btn" type="button" style="width:100%">Create Room</button>
      </div>

      <div id="lobby-wait" hidden>
        <input id="room-link" type="text" readonly autocomplete="off"
               style="width:100%;box-sizing:border-box;text-align:center;font-size:13px;margin:0 0 4px;">
        <div class="btn-row">
          <button id="copy-btn" class="restart-btn" type="button">Copy</button>
          <button id="share-btn" class="ghost-btn" type="button">Share</button>
        </div>
        <p class="conn-msg">Waiting for friend...</p>
        <div class="spinner"></div>
        <button id="wait-cancel-btn" class="ghost-btn" type="button" style="width:100%;margin-top:6px">Cancel</button>
      </div>

      <div id="lobby-join" hidden>
        <div class="spinner"></div>
        <p class="conn-msg" style="margin-bottom:0">Joining...</p>
      </div>

      <div id="lobby-error" hidden>
        <p id="lobby-error-text" class="conn-msg" style="color:#ff8a9b"></p>
        <button id="error-create-btn" class="restart-btn" type="button" style="width:100%">Create Room</button>
      </div>
    </div>`;

  const views = {
    home: $('lobby-home'),
    wait: $('lobby-wait'),
    join: $('lobby-join'),
    error: $('lobby-error')
  };
  const createBtn = $('create-room-btn');
  const linkInput = $('room-link');
  const copyBtn = $('copy-btn');
  const shareBtn = $('share-btn');
  const errorText = $('lobby-error-text');

  function showView(name) {
    overlay.hidden = false;
    Object.keys(views).forEach(key => { views[key].hidden = key !== name; });
  }

  function resetCreateBtn() {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Room';
  }

  function startCreate() {
    Net.clearUrl();
    showView('home');
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
    Net.createRoom();
  }

  /* ---------- কপি ও শেয়ার ---------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  async function doCopy() {
    const ok = await copyText(linkInput.value);
    if (ok) {
      copyBtn.textContent = 'Copied';
      toast('Copied', 'success');
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } else {
      linkInput.focus();
      linkInput.select();
      toast('Press and hold to copy', 'error');
    }
  }

  copyBtn.addEventListener('click', doCopy);

  shareBtn.addEventListener('click', async () => {
    const url = linkInput.value;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Ludo', url });
      } catch (err) {
        if (err && err.name !== 'AbortError') doCopy();
      }
      return;
    }
    doCopy();
  });

  /* ---------- বাটন ---------- */
  createBtn.addEventListener('click', startCreate);
  $('error-create-btn').addEventListener('click', startCreate);

  $('wait-cancel-btn').addEventListener('click', () => {
    Net.leave();
    Net.clearUrl();
    resetCreateBtn();
    showView('home');
  });

  /* ---------- কানেকশনের ঘটনা ---------- */
  Net.on('waiting', ({ link }) => {
    linkInput.value = link;
    resetCreateBtn();
    showView('wait');
  });

  Net.on('joining', () => {
    showView('join');
  });

  Net.on('error', err => {
    resetCreateBtn();
    errorText.textContent = (err && err.message) || 'Connection failed';
    $('conn-overlay').hidden = true;
    setDot(false);
    showView('error');
  });

  Net.on('connected', ({ color }) => {
    overlay.hidden = true;
    $('conn-overlay').hidden = true;
    setDot(true);
    if (color === 'red') toast('Friend joined', 'success');
  });

  Net.on('disconnected', () => {
    setDot(false);
    $('win-overlay').hidden = true;
    $('confirm-overlay').hidden = true;
    const title = $('conn-title');
    if (title) title.textContent = 'Connection lost';
    $('conn-msg').textContent = '';
    $('conn-overlay').hidden = false;
  });

  /* ---------- ওপরের বাটন ও পপআপ ---------- */
  function goHome() {
    try { Net.leave(); } catch (_) {}
    Net.clearUrl();          // নইলে রিলোডে আবার ওই রুমে ঢুকে যাবে
    window.location.reload();
  }

  const lobbyBtn = $('lobby-btn');
  const connLobbyBtn = $('conn-lobby-btn');
  if (connLobbyBtn) connLobbyBtn.textContent = 'Home';

  lobbyBtn.addEventListener('click', goHome);
  connLobbyBtn.addEventListener('click', goHome);
  $('win-lobby-btn').addEventListener('click', goHome);

  $('reset-btn').addEventListener('click', () => {
    if (Net.conn && Net.conn.open) $('confirm-overlay').hidden = false;
  });
  $('confirm-no-btn').addEventListener('click', () => { $('confirm-overlay').hidden = true; });
  $('confirm-yes-btn').addEventListener('click', () => {
    window.Game.reset(true);
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
    if (/Android/i.test(navigator.userAgent || '')) {
      // অ্যান্ড্রয়েডে সরাসরি Chrome-এ খোলার চেষ্টা
      window.location.href =
        'intent://' + window.location.host + window.location.pathname + window.location.search +
        '#Intent;scheme=https;package=com.android.chrome;end';
    } else {
      toast('Open this page in your browser');
    }
  });

  /* ==========================================================
     ভয়েস চ্যাট
     - জয়েন করা প্লেয়ার (হলুদ) কানেকশন হলে হোস্টকে কল করে
     - হোস্ট (লাল) কল ধরে
     ========================================================== */
  const voice = { stream: null, muted: false, call: null };
  const micBtn = $('mic-btn');
  micBtn.classList.remove('muted');   // আইকন: মাইক চালু

  async function getMic() {
    if (voice.stream) return voice.stream;
    try {
      voice.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
    } catch (err) {
      console.warn('Microphone unavailable', err);
      voice.stream = null;
      micBtn.classList.add('muted');
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

  micBtn.addEventListener('click', async () => {
    if (!voice.stream) {
      const s = await getMic();
      if (!s) {
        toast('Microphone blocked', 'error');
      } else {
        toast('Microphone ready');
        micBtn.classList.remove('muted');
      }
      return;
    }
    const track = voice.stream.getAudioTracks()[0];
    if (!track) return;
    voice.muted = !voice.muted;
    track.enabled = !voice.muted;
    micBtn.classList.toggle('muted', voice.muted);
  });

  // কল ধরা (হোস্ট)
  Net.on('peer', peer => {
    peer.on('call', async call => {
      const stream = await getMic();
      call.answer(stream || new MediaStream());
      call.on('stream', playRemote);
      voice.call = call;
    });
  });

  // কানেকশন হলে কল করা (জয়েন করা প্লেয়ার)
  Net.on('connected', async () => {
    $('voice-widget').hidden = false;
    const stream = await getMic();
    if (Net.role === 'guest' && Net.peer) {
      try {
        const call = Net.peer.call(Net.peerId, stream || new MediaStream());
        if (call) {
          call.on('stream', playRemote);
          voice.call = call;
        }
      } catch (err) {
        console.warn('Voice call failed', err);
      }
    }
  });

  /* ==========================================================
     শুরু: লিংকে ?room= থাকলে সরাসরি জয়েন, নইলে হোম
     ========================================================== */
  const roomFromLink = Net.roomFromUrl();
  if (roomFromLink) {
    showView('join');
    Net.joinRoom(roomFromLink);
  } else if (Net.urlHasRoom()) {
    Net.clearUrl();
    errorText.textContent = 'Room not found';
    showView('error');
  } else {
    showView('home');
  }
})();
