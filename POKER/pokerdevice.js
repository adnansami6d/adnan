/* =====================================================================
   NEON TEXAS HOLD'EM  -  js/pokerdevice.js
   ফোন/ব্রাউজারের সাথে সম্পর্কিত সব কিছু:
     ১) ফুলস্ক্রিন ও ল্যান্ডস্কেপ লক
     ২) ফোন সোজা (পোর্ট্রেট) ধরা থাকলেও গেম জোর করে ল্যান্ডস্কেপে দেখানো
     ৩) ব্যালেন্স localStorage এ সেভ/লোড
     ৪) খেলার সময় স্ক্রিন বন্ধ না হওয়া, জুম/মেনু বন্ধ

   --------- জোর করে ল্যান্ডস্কেপ কীভাবে কাজ করে ---------
   সব কিছু index.html এর <div id="stage"> এর ভেতরে থাকে। এই ফাইল <html> এ এগুলো বসায়:
     --stage-w, --stage-h : স্টেজের মাপ (সবসময় চওড়া > উঁচু, অর্থাৎ ল্যান্ডস্কেপ)
     --view-w             : ব্রাউজারের আসল চওড়া
     --u                  : পুরো গেমের মাপের একক (style.css এর সব মাপ এর উপর নির্ভর করে)
     class "rotated"      : ফোন পোর্ট্রেটে থাকলে বসে
   style.css এ লাগবে (শেষ দফায় দেব):
     #stage { position: fixed; left: 0; top: 0; width: var(--stage-w); height: var(--stage-h); overflow: hidden; }
     html.rotated #stage { transform: translateX(var(--view-w)) rotate(90deg); transform-origin: 0 0; }

   স্টেজ ঘুরে গেলে getBoundingClientRect() এর মান স্ক্রিনের কোঅর্ডিনেট। উড়ন্ত কয়েন/কার্ডের
   জন্য সেগুলোকে স্টেজের কোঅর্ডিনেটে বদলাতে PokerDevice.centerOf(el) ব্যবহার করুন।
   ===================================================================== */
'use strict';

const PokerDevice = (() => {
  const K = PokerConfig;
  const root = document.documentElement;

  /* ===================== localStorage (ব্যালেন্স) ===================== */
  const mem = {};   // localStorage বন্ধ থাকলে (প্রাইভেট মোড) সাময়িক মেমোরি
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return k in mem ? mem[k] : null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { mem[k] = String(v); } }

  function loadBalance() {
    const raw = lsGet(K.STORAGE_KEY);
    const n = parseInt(raw, 10);
    if (raw === null || !Number.isFinite(n) || n < 0) {    // প্রথমবার: 100,000 (1L)
      lsSet(K.STORAGE_KEY, K.START_BALANCE);
      return K.START_BALANCE;
    }
    return n;
  }
  function saveBalance(v) { lsSet(K.STORAGE_KEY, Math.max(0, Math.round(v))); }
  function resetBalance() { lsSet(K.STORAGE_KEY, K.START_BALANCE); return K.START_BALANCE; }

  /* ===================== ফুলস্ক্রিন ও ল্যান্ডস্কেপ লক ===================== */
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  function lockLandscape() {
    try {
      const o = screen.orientation;
      if (o && o.lock) return o.lock('landscape').then(() => true, () => false);
    } catch (e) { /* iOS Safari সাপোর্ট করে না, তখন নিচের ঘোরানো স্টেজ কাজ করে */ }
    return Promise.resolve(false);
  }

  // START বাটনের ক্লিকের ভেতর থেকেই ডাকতে হবে (ব্রাউজার ইউজারের ক্লিক ছাড়া ফুলস্ক্রিন দেয় না)
  function enterFullscreen() {
    const req = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
    if (!req) { lockLandscape(); return Promise.resolve(false); }
    let p;
    try { p = req.call(root, { navigationUI: 'hide' }); }
    catch (e) { try { p = req.call(root); } catch (e2) { p = null; } }
    return Promise.resolve(p).then(() => { lockLandscape(); return true; }, () => { lockLandscape(); return false; });
  }

  function exitFullscreen() {
    try {
      const ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (isFullscreen() && ex) Promise.resolve(ex.call(document)).catch(() => {});
    } catch (e) { /* ignore */ }
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* ignore */ }
  }

  function toggleFullscreen() { return isFullscreen() ? (exitFullscreen(), Promise.resolve(false)) : enterFullscreen(); }

  /* ===================== স্টেজ: জোর করে ল্যান্ডস্কেপ ===================== */
  let rotated = false;
  let size = { w: 0, h: 0, viewW: 0, viewH: 0 };
  const listeners = [];

  function wantsRotation(vw, vh) {
    if (vh <= vw) return false;                                  // আগে থেকেই ল্যান্ডস্কেপ
    // ডেস্কটপে লম্বা জানালা ঘোরানো হয় না, শুধু ফোন/ট্যাবলেটে
    let coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    return coarse || vw <= 820;
  }

  function update() {
    const vw = window.innerWidth, vh = window.innerHeight;
    rotated = wantsRotation(vw, vh);
    const w = rotated ? vh : vw;
    const h = rotated ? vw : vh;
    size = { w, h, viewW: vw, viewH: vh };

    root.classList.toggle('rotated', rotated);
    root.style.setProperty('--stage-w', w + 'px');
    root.style.setProperty('--stage-h', h + 'px');
    root.style.setProperty('--view-w', vw + 'px');
    // style.css এর পুরোনো সূত্র ছিল min(1vw, 1.75vh); এখন স্টেজের মাপ থেকে
    root.style.setProperty('--u', Math.min(w / 100, h * 0.0175) + 'px');

    listeners.forEach(f => { try { f(size, rotated); } catch (e) { /* ignore */ } });
  }

  let raf = 0;
  function scheduleUpdate() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; update(); });
  }

  function isRotated() { return rotated; }
  function getSize() { return size; }
  function onChange(fn) { listeners.push(fn); }

  // স্ক্রিনের কোঅর্ডিনেট (clientX/Y) -> স্টেজের ভেতরের কোঅর্ডিনেট
  function toStage(cx, cy) {
    const el = document.getElementById('stage');
    if (!el) return { x: cx, y: cy };
    const r = el.getBoundingClientRect();
    return rotated ? { x: cy - r.top, y: r.right - cx } : { x: cx - r.left, y: cy - r.top };
  }

  // কোনো এলিমেন্টের মাঝখান, স্টেজের কোঅর্ডিনেটে
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return toStage(r.left + r.width / 2, r.top + r.height / 2);
  }

  /* ===================== স্ক্রিন জাগিয়ে রাখা ===================== */
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { wakeLock = null; }
  }
  function release() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
    wakeLock = null;
  }

  /* ===================== শুরু ===================== */
  let started = false;
  let playing = false;                 // গেম স্ক্রিন খোলা থাকলে true (স্ক্রিন জাগিয়ে রাখার জন্য)
  function setPlaying(v) { playing = !!v; if (playing) keepAwake(); else release(); }

  function init() {
    if (started) return;
    started = true;
    update();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('orientationchange', () => { scheduleUpdate(); setTimeout(update, 250); setTimeout(update, 700); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleUpdate);
    const onFs = () => { scheduleUpdate(); setTimeout(update, 300); if (isFullscreen()) lockLandscape(); };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && playing) keepAwake(); });
    // জুম ও লং-প্রেস মেনু বন্ধ
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  init();

  return {
    loadBalance, saveBalance, resetBalance,
    enterFullscreen, exitFullscreen, toggleFullscreen, isFullscreen, lockLandscape,
    update, isRotated, getSize, onChange, toStage, centerOf,
    keepAwake, release, setPlaying, init
  };
})();
