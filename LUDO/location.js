/* ==========================================================
   Game Bazz — location.js
   ব্যবহারকারীর কাছ থেকে লোকেশনের অনুমতি নেয় এবং এলাকা
   SheetDB (Google Sheet)-এ জমা রাখে। Firebase লাগে না।

   এজেন্টের প্রচার-লিংক: https://আপনার-সাইট/?agent=rahim
   (agent নামটি একবার সেভ হয়ে যায়, তাই পরে রুম লিংকে ঢুকলেও মনে থাকে)

   Google Sheet-এর প্রথম সারিতে (header) এই কলামগুলো থাকতে হবে:
   device_id | agent | lat | lng | accuracy | area | district | country | first_seen | last_seen | visits
   ========================================================== */
(() => {
  'use strict';

  const SHEETDB_URL = 'https://sheetdb.io/api/v1/3x1krz6d5rpn6';
  const ASK_AGAIN_MS = 24 * 60 * 60 * 1000;   // "Not now" চাপলে ২৪ ঘণ্টা আর জিজ্ঞেস করবে না
  const KEY = { device: 'gb_device', agent: 'gb_agent', ask: 'gb_loc_ask' };
  const JSON_HEADERS = { 'Accept': 'application/json', 'Content-Type': 'application/json' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };

  if (!navigator.geolocation) return;

  /* ---------- এজেন্ট ও ডিভাইস ---------- */
  try {
    const a = new URLSearchParams(window.location.search).get('agent');
    const clean = a ? a.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '';
    if (clean) store.set(KEY.agent, clean);
  } catch (_) {}

  let deviceId = store.get(KEY.device);
  if (!deviceId) {
    deviceId = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    store.set(KEY.device, deviceId);
  }

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
      if (!r.ok) return {};
      const j = await r.json();
      return {
        area: j.locality || j.city || '',
        district: j.principalSubdivision || '',
        country: j.countryName || ''
      };
    } catch (_) {
      return {};
    }
  }

  /* ---------- SheetDB-এ সেভ ---------- */
  // এই ডিভাইসের আগের সারি আছে কি না দেখে (থাকলে null আর না থাকলে null-ই দেয়)
  async function findRow() {
    try {
      const r = await fetch(SHEETDB_URL + '/search?device_id=' + encodeURIComponent(deviceId),
        { headers: { 'Accept': 'application/json' } });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    } catch (_) {
      return null;
    }
  }

  async function capture() {
    try {
      const pos = await getPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const place = await areaName(lat, lng);
      const now = new Date().toISOString();

      const data = {
        device_id: deviceId,
        agent: store.get(KEY.agent) || '',
        lat: String(lat),
        lng: String(lng),
        accuracy: String(Math.round(pos.coords.accuracy || 0)),
        area: place.area || '',
        district: place.district || '',
        country: place.country || '',
        last_seen: now
      };

      const existing = await findRow();
      let res;
      if (existing) {
        // আগের সারি আপডেট: ভিজিট +১, প্রথম দেখার সময় অপরিবর্তিত
        data.visits = String((parseInt(existing.visits, 10) || 0) + 1);
        if (!data.agent) delete data.agent;
        res = await fetch(SHEETDB_URL + '/device_id/' + encodeURIComponent(deviceId), {
          method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ data })
        });
      } else {
        // নতুন সারি
        data.first_seen = now;
        data.visits = '1';
        res = await fetch(SHEETDB_URL, {
          method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ data: [data] })
        });
      }
      if (!res.ok) throw new Error('SheetDB ' + res.status);
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
    document.body.appendChild(ov);   // সবার ওপরে দেখাতে সবশেষে যোগ
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

    if (state === 'granted') return capture();   // আগেই অনুমতি দেওয়া: চুপচাপ সেভ
    if (state === 'denied') return;              // ব্লক করা: আর বিরক্ত নয়
    if (Date.now() - (+store.get(KEY.ask) || 0) < ASK_AGAIN_MS) return;
    showAsk();
  }

  init();
})();
