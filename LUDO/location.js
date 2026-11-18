/* ==========================================================
   Game Bazz — location.js
   ব্যবহারকারীর কাছ থেকে লোকেশনের অনুমতি নেয় এবং এলাকা
   Firebase Firestore-এর "visitors" কালেকশনে জমা রাখে।

   এজেন্টের প্রচার-লিংক: https://আপনার-সাইট/?agent=rahim
   (agent নামটি একবার সেভ হয়ে যায়, তাই পরে রুম লিংকে ঢুকলেও মনে থাকে)
   ========================================================== */
(() => {
  'use strict';

  const firebaseConfig = {
    apiKey: "PASTE_FULL_API_KEY_HERE",
    authDomain: "chat-70f4c.firebaseapp.com",
    projectId: "chat-70f4c",
    storageBucket: "chat-70f4c.firebasestorage.app",
    messagingSenderId: "984842293346",
    appId: "PASTE_APP_ID_FROM_FIREBASE_CONSOLE"
  };

  const COLLECTION = 'visitors';
  const ASK_AGAIN_MS = 24 * 60 * 60 * 1000;   // "Not now" চাপলে ২৪ ঘণ্টা আর জিজ্ঞেস করবে না
  const KEY = { device: 'gb_device', agent: 'gb_agent', ask: 'gb_loc_ask', sent: 'gb_loc_sent' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };

  if (!window.firebase || !navigator.geolocation) return;

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

  let db;
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  } catch (err) {
    console.warn('Firebase init failed', err);
    return;
  }

  /* ---------- লোকেশন নেওয়া ও সেভ ---------- */
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

  async function capture() {
    try {
      const pos = await getPosition();
      // ব্রাউজার যা দেয় সেটাই পুরো নির্ভুলতায় জমা হয়
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const place = await areaName(lat, lng);
      const ts = firebase.firestore.FieldValue.serverTimestamp();

      const data = {
        lat, lng,
        accuracy: Math.round(pos.coords.accuracy || 0),
        lastSeen: ts,
        visits: firebase.firestore.FieldValue.increment(1)
      };
      const agent = store.get(KEY.agent);
      if (agent) data.agent = agent;
      if (place.area) data.area = place.area;
      if (place.district) data.district = place.district;
      if (place.country) data.country = place.country;
      if (!store.get(KEY.sent)) data.firstSeen = ts;

      await db.collection(COLLECTION).doc(deviceId).set(data, { merge: true });
      store.set(KEY.sent, '1');
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
