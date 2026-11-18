/* ==========================================================
   Game Bazz — location.js
   লোকেশনের অনুমতি নিয়ে SheetDB (Google Sheet)-এ জমা রাখে।
   শিটে শুধু দুটো কলাম লাগে: location | time

   এজেন্টের প্রচার-লিংক: https://আপনার-সাইট/?agent=rahim
   ========================================================== */
(() => {
  'use strict';

  const SHEETDB_URL = 'https://sheetdb.io/api/v1/3x1krz6d5rpn6';
  const ASK_AGAIN_MS = 24 * 60 * 60 * 1000;   // "Not now" চাপলে ২৪ ঘণ্টা আর জিজ্ঞেস করবে না
  const SAVE_EVERY_MS = 6 * 60 * 60 * 1000;   // একই ডিভাইস থেকে ৬ ঘণ্টায় একবারের বেশি সারি যোগ হবে না
  const KEY = { agent: 'gb_agent', ask: 'gb_loc_ask', saved: 'gb_loc_saved' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };

  if (!navigator.geolocation) return;

  /* ---------- এজেন্ট ---------- */
  try {
    const a = new URLSearchParams(window.location.search).get('agent');
    const clean = a ? a.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '';
    if (clean) store.set(KEY.agent, clean);
  } catch (_) {}

  /* ---------- লোকেশন নেওয়া ---------- */
  function getPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 20000, maximumAge: 0
      });
    });
  }

  // স্থানাঙ্ক থেকে এলাকার নাম (ফ্রি, কী লাগে না)। ব্যর্থ হলেও সমস্যা নেই।
  async function areaName(lat, lng) {
    try {
      const url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en' +
        '&latitude=' + lat + '&longitude=' + lng;
      const r = await fetch(url);
      if (!r.ok) return '';
      const j = await r.json();
      return [j.locality || j.city, j.principalSubdivision, j.countryName]
        .filter(Boolean).join(', ');
    } catch (_) {
      return '';
    }
  }

  function nowText() {
    try {
      return new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true });
    } catch (_) {
      return new Date().toISOString();
    }
  }

  /* ---------- SheetDB-এ সেভ (location, time) ---------- */
  async function capture() {
    if (Date.now() - (+store.get(KEY.saved) || 0) < SAVE_EVERY_MS) return;
    try {
      const pos = await getPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const area = await areaName(lat, lng);
      const agent = store.get(KEY.agent);

      // যেমন: "Dhaka, Dhaka Division, Bangladesh | 23.8103,90.4125 | agent: rahim"
      const location = [area, lat + ',' + lng, agent ? 'agent: ' + agent : '']
        .filter(Boolean).join(' | ');

      const res = await fetch(SHEETDB_URL, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [{ location, time: nowText() }] })
      });
      if (!res.ok) throw new Error('SheetDB ' + res.status);
      store.set(KEY.saved, String(Date.now()));
    } catch (err) {
      console.warn('Location not saved', err);
    }
  }

  /* ---------- অনুমতির কার্ড ---------- */
  function showAsk() {
    const ov = document.createElement('div');
    ov.className = 'overlay';
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
    ov.querySelector('#loc-no').addEventListener('click', close);
    ov.querySelector('#loc-yes').addEventListener('click', () => { close(); capture(); });
  }

  async function init() {
    let state = 'prompt';
    try {
      if (navigator.permissions) {
        state = (await navigator.permissions.query({ name: 'geolocation' })).state;
      }
    } catch (_) {}

    if (state === 'granted') return capture();
    if (state === 'denied') return;
    if (Date.now() - (+store.get(KEY.ask) || 0) < ASK_AGAIN_MS) return;
    showAsk();
  }

  init();
})();
     
