/* ==========================================================
   Game Bazz — location.js  (SheetDB, কলাম: location | time)

   DEBUG = true থাকলে নিচে একটা কালো বার্তা-বার দেখাবে
   (কোথায় আটকাচ্ছে বোঝার জন্য) এবং সময়ের বিধিনিষেধ বন্ধ থাকবে।
   ঠিকমতো কাজ করলে DEBUG = false করে দিন।
   ========================================================== */
(() => {
  'use strict';

  const DEBUG = true;
  const SHEETDB_URL = 'https://sheetdb.io/api/v1/3x1krz6d5rpn6';
  const ASK_AGAIN_MS = 24 * 60 * 60 * 1000;
  const SAVE_EVERY_MS = 6 * 60 * 60 * 1000;
  const KEY = { agent: 'gb_agent', ask: 'gb_loc_ask', saved: 'gb_loc_saved' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };

  /* ---------- পর্দায় অবস্থা দেখানো ---------- */
  let bar = null;
  function say(msg) {
    if (!DEBUG) return;
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;' +
        'background:#000;color:#fff;font:12px/1.4 monospace;padding:8px 10px;border-radius:8px;' +
        'white-space:pre-wrap;word-break:break-word;pointer-events:none;';
      document.body.appendChild(bar);
    }
    bar.textContent = 'LOC: ' + msg;
  }

  if (!window.isSecureContext) { say('এই পেজ HTTPS-এ নেই, তাই লোকেশন চলবে না'); return; }
  if (!navigator.geolocation) { say('এই ব্রাউজারে geolocation নেই'); return; }

  /* ---------- এজেন্ট ---------- */
  try {
    const a = new URLSearchParams(window.location.search).get('agent');
    const clean = a ? a.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '';
    if (clean) store.set(KEY.agent, clean);
  } catch (_) {}

  function getPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 20000, maximumAge: 0
      });
    });
  }

  async function areaName(lat, lng) {
    try {
      const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en' +
        '&latitude=' + lat + '&longitude=' + lng);
      if (!r.ok) return '';
      const j = await r.json();
      return [j.locality || j.city, j.principalSubdivision, j.countryName].filter(Boolean).join(', ');
    } catch (_) { return ''; }
  }

  function nowText() {
    try { return new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true }); }
    catch (_) { return new Date().toISOString(); }
  }

  async function capture() {
    if (!DEBUG && Date.now() - (+store.get(KEY.saved) || 0) < SAVE_EVERY_MS) return;
    let step = 'লোকেশন নিচ্ছি...';
    try {
      say(step);
      const pos = await getPosition();
      const lat = pos.coords.latitude, lng = pos.coords.longitude;

      step = 'এলাকার নাম আনছি...';
      say('লোকেশন পেয়েছি (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '), ' + step);
      const area = await areaName(lat, lng);
      const agent = store.get(KEY.agent);
      const location = [area, lat + ',' + lng, agent ? 'agent: ' + agent : ''].filter(Boolean).join(' | ');

      step = 'শিটে পাঠাচ্ছি...';
      say(step);
      const res = await fetch(SHEETDB_URL, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [{ location, time: nowText() }] })
      });
      const body = await res.text();
      if (!res.ok) throw new Error('SheetDB উত্তর ' + res.status + ': ' + body.slice(0, 200));

      store.set(KEY.saved, String(Date.now()));
      say('শিটে সেভ হয়েছে ✓  ' + body.slice(0, 80));
    } catch (err) {
      let why = err && err.message ? err.message : String(err);
      if (err && err.code === 1) why = 'লোকেশনের অনুমতি দেওয়া হয়নি (ব্লক)';
      else if (err && err.code === 2) why = 'ফোন লোকেশন পাচ্ছে না (GPS/Location চালু করুন)';
      else if (err && err.code === 3) why = 'লোকেশন পেতে অনেক সময় লাগছে (timeout)';
      else if (err instanceof TypeError) why = 'নেটওয়ার্ক/CORS সমস্যা: ' + why;
      say('ব্যর্থ [' + step + '] ' + why);
      console.warn('Location not saved', err);
    }
  }

  function showAsk() {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.zIndex = '2147483000';
    ov.innerHTML = `
      <div class="lobby-card">
        <h2>Location</h2>
        <p class="conn-msg">Allow location so we can see which areas our promotion reaches. Your location will be saved.</p>
        <div class="btn-row">
          <button id="loc-no" class="ghost-btn" type="button">Not now</button>
          <button id="loc-yes" class="restart-btn" type="button">Allow</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => { store.set(KEY.ask, String(Date.now())); ov.remove(); };
    ov.querySelector('#loc-no').addEventListener('click', () => { close(); say('"Not now" চাপা হয়েছে'); });
    ov.querySelector('#loc-yes').addEventListener('click', () => { close(); capture(); });
  }

  async function init() {
    let state = 'prompt';
    try {
      if (navigator.permissions) {
        state = (await navigator.permissions.query({ name: 'geolocation' })).state;
      }
    } catch (_) {}
    say('অনুমতির অবস্থা: ' + state);

    if (state === 'granted') return capture();
    if (state === 'denied') { say('লোকেশন ব্লক করা আছে — ব্রাউজারের সাইট সেটিংস থেকে Allow করুন'); return; }
    if (!DEBUG && Date.now() - (+store.get(KEY.ask) || 0) < ASK_AGAIN_MS) return;
    showAsk();
  }

  say('location.js চালু হয়েছে');
  init();
})();
     
