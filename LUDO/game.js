/* ==========================================================
   Game Bazz — game.js
   গেমের সব লজিক: নিয়ম, ডাইস, চাল, গুটি খাওয়া, জয়, বোর্ড দেখানো।
   কানেকশন নিয়ে এখানে কিছু নেই — সেটা connection.js-এ।

   কাজের নিয়ম (Project 2-এর মতোই):
   - দুজনেই নিজের ফোনে গেম চালায়।
   - যে ডাইস ফেলে সে মানটা পাঠায়, যে গুটি চালে সে গুটির নাম পাঠায়।
   - পাওয়া মেসেজ লাইনে (queue) দাঁড়ায়, একটার পর একটা চলে —
     তাই দুজনের ফোনে সবসময় একই ক্রমে একই কাজ হয়।
   ========================================================== */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const SAFE_CELLS = [22, 93, 122, 187, 204, 133, 104, 39];

  const PATHS = {
    red: [22,37,52,67,82,96,95,94,93,92,91,106,121,122,123,124,125,126,142,157,172,187,202,217,218,219,204,189,174,159,144,130,131,132,133,134,135,120,105,104,103,102,101,100,84,69,54,39,24,9,8,23,38,53,68,83,'home-bottom'],
    yellow: [204,189,174,159,144,130,131,132,133,134,135,120,105,104,103,102,101,100,84,69,54,39,24,9,8,7,22,37,52,67,82,96,95,94,93,92,91,106,121,122,123,124,125,126,142,157,172,187,202,217,218,203,188,173,158,143,'home-top']
  };

  /* ---------- সাউন্ড ---------- */
  const sounds = {};
  ['dice-roll', 'six', 'move', 'eat1', 'eat2', 'home', 'win'].forEach(name => {
    try { sounds[name] = new Audio(`${name}.mp3`); }
    catch (_) { sounds[name] = null; }
  });

  function play(name, maxMs) {
    const a = sounds[name];
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
    if (maxMs) {
      setTimeout(() => {
        try { a.pause(); a.currentTime = 0; } catch (_) {}
      }, maxMs);
    }
  }

  let eatSound = null;
  function startEatSound() {
    eatSound = sounds['eat' + (1 + Math.floor(Math.random() * 2))];
    if (!eatSound) return;
    try {
      eatSound.currentTime = 0;
      eatSound.loop = true;
      const p = eatSound.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }
  function stopEatSound() {
    if (!eatSound) return;
    try {
      eatSound.pause();
      eatSound.currentTime = 0;
      eatSound.loop = false;
    } catch (_) {}
    eatSound = null;
  }

  /* ---------- অবস্থা ---------- */
  function freshState() {
    const tokens = {};
    ['red', 'yellow'].forEach(color => {
      [1, 2, 3, 4].forEach(n => {
        tokens[`${color}-${n}`] = { color, pathIndex: -1, isFinished: false };
      });
    });
    return {
      currentPlayer: 'red',
      diceValue: 0,
      hasRolled: false,
      consecutiveSixes: 0,
      sixCounts: { red: 0, yellow: 0 },
      luckPenalty: { red: 0, yellow: 0 },
      tokens,
      winner: null
    };
  }

  let state = freshState();
  let myColor = null;       // 'red' (রুম যে খুলেছে) অথবা 'yellow' (যে জয়েন করেছে)
  let started = false;      // দুজন যুক্ত হলে true
  let animating = false;    // ডাইস ঘুরছে বা গুটি চলছে
  let epoch = 0;            // রিসেট হলে বাড়ে, পুরনো অ্যানিমেশন থেমে যায়
  let pending = 0;          // লাইনে কতগুলো কাজ বাকি
  let chain = Promise.resolve();

  const Game = { send: () => {} };   // connection.js এটা বসিয়ে দেবে

  /* ---------- কাজের লাইন ---------- */
  function enqueue(task) {
    const ep = epoch;
    pending++;
    chain = chain
      .then(() => (ep === epoch ? task(ep) : null))
      .catch(err => console.warn('Game task error', err))
      .finally(() => {
        pending--;
        if (pending === 0) renderState();
      });
    return chain;
  }

  /* ---------- গুটি চলার নিয়ম ---------- */
  function getMoveable(color = state.currentPlayer) {
    if (!state.hasRolled || state.diceValue < 1 || state.diceValue > 6) return [];
    return Object.keys(state.tokens).filter(id => {
      const t = state.tokens[id];
      if (t.color !== color || t.isFinished) return false;
      if (t.pathIndex === -1) return state.diceValue === 6;
      return t.pathIndex + state.diceValue < PATHS[color].length;
    });
  }

  function switchTurn() {
    state.currentPlayer = state.currentPlayer === 'red' ? 'yellow' : 'red';
    state.hasRolled = false;
    state.diceValue = 0;
    state.consecutiveSixes = 0;
  }

  /* ---------- স্মার্ট ডাইস (আগের মতোই) ---------- */
  function weightedRandom(target, probability, penalty = 0) {
    const p = Math.max(0.01, probability - penalty);
    if (Math.random() < p) return target;
    const rest = [1, 2, 3, 4, 5, 6].filter(v => v !== target);
    return rest[Math.floor(Math.random() * rest.length)];
  }

  function generateDiceValue() {
    const me = state.currentPlayer;
    const opp = me === 'red' ? 'yellow' : 'red';
    const penalty = state.luckPenalty[me] || 0;

    if (state.consecutiveSixes >= 2) return Math.floor(Math.random() * 5) + 1;

    const myTokens = Object.keys(state.tokens).filter(id => state.tokens[id].color === me && !state.tokens[id].isFinished);
    const oppTokens = Object.keys(state.tokens).filter(id => state.tokens[id].color === opp && !state.tokens[id].isFinished);

    let canEat = false;
    let eatDistance = 0;

    for (const myId of myTokens) {
      const mt = state.tokens[myId];
      if (mt.pathIndex === -1) continue;
      const myCell = PATHS[me][mt.pathIndex];
      if (typeof myCell !== 'number') continue;

      for (const oppId of oppTokens) {
        const ot = state.tokens[oppId];
        if (ot.pathIndex === -1) continue;
        const oppCell = PATHS[opp][ot.pathIndex];
        if (typeof oppCell !== 'number' || SAFE_CELLS.includes(oppCell)) continue;

        for (let dist = 1; dist <= 6; dist++) {
          const idx = mt.pathIndex + dist;
          if (idx < PATHS[me].length && PATHS[me][idx] === oppCell) {
            canEat = true;
            eatDistance = dist;
            break;
          }
        }
        if (canEat) break;
      }
      if (canEat) break;
    }

    if (canEat) return weightedRandom(eatDistance, 0.40, penalty);

    if (myTokens.every(id => state.tokens[id].pathIndex === -1)) {
      return weightedRandom(6, 0.60, penalty);
    }

    for (const id of myTokens) {
      const t = state.tokens[id];
      if (t.pathIndex >= 0) {
        const toHome = (PATHS[me].length - 1) - t.pathIndex;
        if (toHome === 1 || toHome === 2) return weightedRandom(toHome, 0.50, penalty);
      }
    }

    const myActive = Object.values(state.tokens).filter(t => t.color === me && t.pathIndex > -1).length;
    const oppActive = Object.values(state.tokens).filter(t => t.color === opp && t.pathIndex > -1).length;
    if (myActive > oppActive && Math.random() < Math.max(0.01, 0.08 - penalty)) {
      const good = [4, 5, 6];
      return good[Math.floor(Math.random() * good.length)];
    }

    let sixProb = 0.05;
    if ((state.sixCounts[opp] || 0) - (state.sixCounts[me] || 0) >= 2) sixProb = 0.90;
    if (Math.random() < Math.max(0.01, sixProb - penalty)) return 6;

    return Math.floor(Math.random() * 6) + 1;
  }

  /* ---------- দেখানো (রেন্ডার) ---------- */
  function renderTokens() {
    document.querySelectorAll('.cell[data-count]').forEach(el => el.removeAttribute('data-count'));

    Object.keys(state.tokens).forEach(id => {
      const token = state.tokens[id];
      const el = $(id);
      if (!el) return;

      let parent;
      if (token.pathIndex < 0) {
        parent = document.querySelector(
          token.color === 'red'
            ? '#bottom-left-home .home-inner-box'
            : '#top-right-home .home-inner-box'
        );
      } else {
        const cell = PATHS[token.color][token.pathIndex];
        parent = typeof cell === 'number' ? $(`cell-${cell}`) : $(cell);
      }
      if (parent && el.parentElement !== parent) parent.appendChild(el);
    });

    const groups = new Map();
    document.querySelectorAll('#board .token').forEach(el => {
      const p = el.parentElement;
      if (!p) return;
      if (p.classList.contains('cell') || p.classList.contains('triangle')) {
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(el);
      }
    });

    groups.forEach((items, parent) => {
      if (parent.classList.contains('cell')) {
        parent.dataset.count = String(Math.min(items.length, 5));
      }
      items.forEach((el, i) => { el.dataset.slot = String(i % 9); });
    });

    document.querySelectorAll('.token').forEach(el => {
      if (!groups.has(el.parentElement)) el.removeAttribute('data-slot');
    });
  }

  function setBounce() {
    document.querySelectorAll('.token').forEach(el => {
      el.classList.remove('active-turn');
      el.style.animation = '';
    });

    if (!started || state.winner || !state.hasRolled || animating) return;

    getMoveable().forEach(id => {
      const el = $(id);
      if (el) {
        el.classList.add('active-turn');
        el.style.animation = 'bounce .5s infinite alternate';
      }
    });
  }

  function renderState() {
    renderTokens();
    document.body.classList.toggle('flipped', myColor === 'yellow');

    const myTurn = state.currentPlayer === myColor;

    const badge = $('turn-badge');
    if (badge) {
      badge.hidden = !started;
      badge.textContent = state.winner
        ? `${state.winner === 'red' ? 'লাল' : 'হলুদ'} জয়ী!`
        : (myTurn ? '🎯 আপনার চাল' : '⏳ বন্ধুর চাল');
      badge.classList.toggle('turn-mine', myTurn && !state.winner);
      badge.classList.toggle('turn-opp', !myTurn || !!state.winner);
    }

    const redDice = $('dice-bottom-left');
    const yellowDice = $('dice-top-right');
    const canRollNow = started && !state.winner && !state.hasRolled;

    [[redDice, 'red'], [yellowDice, 'yellow']].forEach(([dice, color]) => {
      if (!dice) return;
      const itsTurn = state.currentPlayer === color;
      dice.style.opacity = itsTurn ? '1' : '.4';
      const clickable = canRollNow && itsTurn && myColor === color;
      dice.style.pointerEvents = clickable ? 'auto' : 'none';
      dice.style.animation = clickable ? 'bounce .6s infinite alternate' : '';
    });

    const mineLabel = myColor === 'red' ? 'আপনি • লাল' : 'আপনি • হলুদ';
    const friendLabel = myColor === 'red' ? 'বন্ধু • হলুদ' : 'বন্ধু • লাল';
    const labelBottom = $('label-bottom');
    const labelTop = $('label-top');
    if (labelBottom) {
      labelBottom.textContent = started ? mineLabel : '';
      labelBottom.classList.toggle('active', started && myTurn && !state.winner);
    }
    if (labelTop) {
      labelTop.textContent = started ? friendLabel : '';
      labelTop.classList.toggle('active', started && !myTurn && !state.winner);
    }

    setBounce();

    const win = $('win-overlay');
    if (win) {
      win.hidden = !state.winner;
      if (state.winner && $('win-message')) {
        $('win-message').textContent =
          `🎉 ${state.winner === 'red' ? 'লাল (Red)' : 'হলুদ (Yellow)'} প্লেয়ার জয়ী হয়েছেন!`;
      }
    }
  }

  function animateDice(color, value) {
    const dice = $(color === 'red' ? 'dice-bottom-left' : 'dice-top-right');
    const cube = dice ? dice.querySelector('.cube') : null;
    if (!cube) return;

    const rotations = {
      1: [0, 0], 2: [-90, 0], 3: [0, -90],
      4: [0, 90], 5: [90, 0], 6: [0, 180]
    };
    const [xDeg, yDeg] = rotations[value];
    const xSpin = (Math.floor(Math.random() * 4) + 4) * 360;
    const ySpin = (Math.floor(Math.random() * 4) + 4) * 360;
    cube.style.transform = `rotateX(${xSpin + xDeg}deg) rotateY(${ySpin + yDeg}deg)`;
  }

  /* ---------- ডাইস ফেলা ---------- */
  async function applyRoll(value, ep) {
    const roller = state.currentPlayer;

    state.diceValue = value;
    state.hasRolled = true;

    if (value === 6) {
      state.consecutiveSixes++;
      state.sixCounts[roller]++;
      play('six', 1900);
    } else {
      state.consecutiveSixes = 0;
      play('dice-roll');
    }

    animateDice(roller, value);
    animating = true;
    renderState();

    await sleep(1000);
    animating = false;
    if (ep !== epoch) return;

    const movable = getMoveable();

    if (movable.length === 0) {
      // চালার মতো গুটি নেই
      state.hasRolled = false;
      state.diceValue = 0;
      if (value !== 6) switchTurn();
      renderState();
      return;
    }

    if (movable.length === 1) {
      // একটাই গুটি চলতে পারে — নিজে থেকেই চলবে (দুজনের ফোনেই)
      renderState();
      await sleep(250);
      if (ep !== epoch) return;
      await applyMove(movable[0], ep);
      return;
    }

    renderState(); // একাধিক গুটি — খেলোয়াড় বেছে নেবে
  }

  /* ---------- গুটি চালা ---------- */
  async function sendBack(id, ep) {
    const t = state.tokens[id];
    if (t.pathIndex < 0) return;

    state.luckPenalty[t.color] += 0.02;
    startEatSound();

    const stepDelay = Math.max(10, Math.min(100, Math.floor(1200 / (t.pathIndex + 1))));
    for (let i = t.pathIndex - 1; i >= 0; i--) {
      t.pathIndex = i;
      renderTokens();
      await sleep(stepDelay);
      if (ep !== epoch) { stopEatSound(); return; }
    }

    t.pathIndex = -1;
    t.isFinished = false;
    renderTokens();
    stopEatSound();
  }

  async function applyMove(id, ep) {
    if (state.winner || !state.hasRolled) return;
    if (!getMoveable().includes(id)) return;

    const token = state.tokens[id];
    const color = token.color;
    const roll = state.diceValue;

    animating = true;
    setBounce();

    try {
      if (token.pathIndex === -1) {
        token.pathIndex = 0;
        renderTokens();
        play('move');
        await sleep(250);
        if (ep !== epoch) return;
      } else {
        for (let i = 0; i < roll; i++) {
          token.pathIndex++;
          renderTokens();
          play('move');
          await sleep(220);
          if (ep !== epoch) return;
        }
      }

      if (token.pathIndex === PATHS[color].length - 1) {
        token.isFinished = true;
        play('home');
      }

      // প্রতিপক্ষের গুটি খাওয়া
      let ate = false;
      if (!token.isFinished) {
        const cell = PATHS[color][token.pathIndex];
        if (typeof cell === 'number' && !SAFE_CELLS.includes(cell)) {
          const victims = Object.keys(state.tokens).filter(otherId => {
            const o = state.tokens[otherId];
            return o.color !== color && o.pathIndex >= 0 && !o.isFinished &&
                   PATHS[o.color][o.pathIndex] === cell;
          });
          for (const victimId of victims) {
            ate = true;
            await sendBack(victimId, ep);
            if (ep !== epoch) return;
          }
        }
      }

      // জয়?
      const won = Object.values(state.tokens)
        .filter(t => t.color === color)
        .every(t => t.isFinished);
      if (won) {
        state.winner = color;
        play('win');
      }

      const anotherTurn = roll === 6 || ate || token.isFinished;
      state.hasRolled = false;
      state.diceValue = 0;
      if (!state.winner && !anotherTurn) switchTurn();
    } finally {
      animating = false;
    }

    renderState();
  }

  /* ---------- নিজের ক্লিক ---------- */
  function onDiceClick(color) {
    if (!started || state.winner || pending > 0) return;
    if (myColor !== color || state.currentPlayer !== color || state.hasRolled) return;

    const value = generateDiceValue();
    Game.send({ type: 'ROLL', value });
    enqueue(ep => applyRoll(value, ep));
  }

  function onTokenClick(id) {
    if (!started || state.winner || pending > 0) return;
    if (state.currentPlayer !== myColor || !state.hasRolled) return;
    if (state.tokens[id].color !== myColor) return;
    if (!getMoveable(myColor).includes(id)) return;

    Game.send({ type: 'MOVE', tokenId: id });
    enqueue(ep => applyMove(id, ep));
  }

  /* ---------- বন্ধুর পাঠানো মেসেজ ---------- */
  function handleRemote(msg) {
    if (!started || !msg || typeof msg.type !== 'string') return;
    const opp = myColor === 'red' ? 'yellow' : 'red';

    if (msg.type === 'ROLL') {
      const value = Number(msg.value);
      if (!(value >= 1 && value <= 6)) return;
      enqueue(ep => {
        if (state.winner || state.hasRolled || state.currentPlayer !== opp) return null;
        return applyRoll(value, ep);
      });
    } else if (msg.type === 'MOVE') {
      enqueue(ep => {
        if (state.currentPlayer !== opp) return null;
        return applyMove(String(msg.tokenId), ep);
      });
    } else if (msg.type === 'RESET') {
      reset(false);
    }
  }

  /* ---------- শুরু / রিসেট / শেষ ---------- */
  function reset(broadcast) {
    epoch++;
    animating = false;
    stopEatSound();
    state = freshState();
    if (broadcast) Game.send({ type: 'RESET' });
    renderState();
    const confirmBox = $('confirm-overlay');
    if (confirmBox) confirmBox.hidden = true;
  }

  function start(color) {
    myColor = color;
    started = true;
    reset(false);
  }

  function stop() {
    started = false;
    epoch++;
    animating = false;
    stopEatSound();
    renderState();
  }

  /* ---------- ক্লিক বসানো ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    ['red', 'yellow'].forEach(color => {
      [1, 2, 3, 4].forEach(n => {
        const id = `${color}-${n}`;
        const el = $(id);
        if (el) el.addEventListener('click', () => onTokenClick(id));
      });
    });

    const redDice = $('dice-bottom-left');
    const yellowDice = $('dice-top-right');
    if (redDice) redDice.addEventListener('click', () => onDiceClick('red'));
    if (yellowDice) yellowDice.addEventListener('click', () => onDiceClick('yellow'));

    renderState();
  });

  Game.start = start;
  Game.stop = stop;
  Game.reset = reset;
  Game.handleRemote = handleRemote;
  window.Game = Game;
})();
