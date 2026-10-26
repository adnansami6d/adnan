/* =====================================================================
   NEON TEXAS HOLD'EM  -  js/pokeraudio.js
   সব সাউন্ড এখানে। ফাইলের নাম ও ভলিউম pokerconfig.js এর SOUND অংশে।

     coin       -> কেউ বেট/চাল দিয়ে কয়েন ডিলারের কাছে দিলে   (sounds/coin.mp3)
     collect    -> কয়েন কালেক্ট: এন্ট্রি ফি ও বিজয়ীর পট       (sounds/bordcoin.mp3)
     win        -> কেউ জিতলে                                   (sounds/win.mp3)
     tick / go  -> কাউন্টডাউন। sounds/countdown.mp3 থাকলে সেটা, না থাকলে
                   ব্রাউজারেই বানানো বিপ শব্দ (ফাইল লাগে না)

   ফাইল না থাকলে গেম থামে না, শুধু ওই শব্দ হয় না।
   মোবাইল ব্রাউজার ইউজারের ট্যাপের আগে শব্দ বাজতে দেয় না, তাই START বাটনের
   ক্লিকের ভেতরেই PokerAudio.unlock() ডাকতে হবে।

   ব্যবহার:
     PokerAudio.unlock();          // START ক্লিকে একবার
     PokerAudio.coin();  PokerAudio.collect();  PokerAudio.win();
     PokerAudio.tick();  PokerAudio.go();
     PokerAudio.toggle();          // সাউন্ড অন/অফ (মনে রাখে)
   ===================================================================== */
'use strict';

const PokerAudio = (() => {
  const K = PokerConfig;
  const S = K.SOUND;

  // এক শব্দ একসাথে কতবার বাজতে পারবে (বেশি কয়েন একসাথে পড়লে)
  const POOL = { coin: 4, collect: 2, win: 2, countdown: 2 };
  // একই শব্দ দুইবার বাজার ন্যূনতম বিরতি (ms)
  const MIN_GAP = { coin: 70, collect: 150, win: 400, countdown: 200 };

  let enabled = S.enabled;
  let unlocked = false;
  let ctx = null;
  const bank = {};          // name -> {els:[], next:0, last:0}

  /* ---------- অন/অফ মনে রাখা ---------- */
  try {
    const saved = localStorage.getItem(K.SOUND_KEY);
    if (saved === '0') enabled = false;
    else if (saved === '1') enabled = true;
  } catch (e) { /* ignore */ }

  function saveEnabled() {
    try { localStorage.setItem(K.SOUND_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  /* ---------- ফাইল লোড ---------- */
  function build() {
    if (typeof Audio === 'undefined') return;
    for (const name of Object.keys(S.files)) {
      if (bank[name]) continue;
      const entry = { els: [], next: 0, last: 0 };
      const n = POOL[name] || 2;
      for (let i = 0; i < n; i++) {
        const a = new Audio();
        a.preload = 'auto';
        a.volume = Math.min(1, Math.max(0, S.volume));
        a.src = S.files[name];
        entry.els.push(a);
      }
      bank[name] = entry;
    }
  }

  function fileState(name) {
    const e = bank[name];
    if (!e) return 'unloaded';
    if (e.els.every(a => a.error)) return 'missing';
    return e.els.some(a => a.readyState >= 3) ? 'ready' : 'loading';
  }

  /* ---------- ব্রাউজারে বানানো বিপ ---------- */
  function ensureCtx() {
    if (ctx) return ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  function beep(freq, ms) {
    if (!enabled) return;
    const c = ensureCtx();
    if (!c) return;
    try {
      if (c.state === 'suspended') c.resume().catch(() => {});
      const t = c.currentTime, dur = ms / 1000;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.002, S.volume * 0.35), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  }

  /* ---------- ফাইল বাজানো ---------- */
  function play(name) {
    if (!enabled) return false;
    if (!bank[name]) build();
    const e = bank[name];
    if (!e || e.els.every(a => a.error)) return false;       // ফাইল নেই: চুপচাপ বাদ
    const now = Date.now();
    if (now - e.last < (MIN_GAP[name] || 0)) return false;
    e.last = now;
    const a = e.els[e.next++ % e.els.length];
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { return false; }
    return true;
  }

  /* ---------- START ক্লিকে একবার: মোবাইলে শব্দের অনুমতি খোলা ---------- */
  function unlock() {
    build();
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    if (unlocked) return;
    unlocked = true;
    // প্রতিটা ফাইল একবার নিঃশব্দে চালিয়ে থামানো, এতে পরে নিজে থেকে বাজানো যায়
    for (const name of Object.keys(bank)) {
      for (const a of bank[name].els) {
        try {
          a.muted = true;
          const p = a.play();
          const done = () => { try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ } a.muted = false; };
          if (p && p.then) p.then(done, () => { a.muted = false; }); else done();
        } catch (e) { a.muted = false; }
      }
    }
  }

  function stopAll() {
    for (const name of Object.keys(bank)) {
      for (const a of bank[name].els) { try { a.pause(); a.currentTime = 0; } catch (e) { /* ignore */ } }
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        stopAll();
        if (ctx && ctx.suspend) ctx.suspend().catch(() => {});
      } else if (ctx && ctx.resume && enabled) {
        ctx.resume().catch(() => {});
      }
    });
  }

  /* ---------- অন/অফ ---------- */
  function setEnabled(v) {
    enabled = !!v;
    saveEnabled();
    if (!enabled) stopAll();
    return enabled;
  }
  function toggle() { return setEnabled(!enabled); }
  function isEnabled() { return enabled; }

  /* ---------- সহজ নাম ---------- */
  const coin = () => play('coin');
  const collect = () => play('collect');
  const win = () => play('win');

  // কাউন্টডাউনের প্রতি সেকেন্ডে: countdown.mp3 থাকলে সেটা, নইলে বিপ
  function tick() {
    if (!enabled) return;
    if (!bank.countdown) build();
    if (fileState('countdown') === 'ready' && play('countdown')) return;
    if (S.beep && S.beep.tick) beep(S.beep.tick.freq, S.beep.tick.ms);
  }
  // কাউন্টডাউন শেষ ("DEAL!")
  function go() {
    if (S.beep && S.beep.go) beep(S.beep.go.freq, S.beep.go.ms);
  }

  // কোন ফাইল লোড হয়েছে (ডিবাগের জন্য)
  function status() {
    const files = {};
    for (const name of Object.keys(S.files)) files[name] = fileState(name);
    return { enabled, unlocked, files };
  }

  return { unlock, play, coin, collect, win, tick, go, beep, stopAll, setEnabled, toggle, isEnabled, status };
})();
