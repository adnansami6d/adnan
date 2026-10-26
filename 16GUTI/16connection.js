/* ==========================================================
   Game Bazz — 16connection.js (ষোলো গুটি)
   শুধু PeerJS কানেকশন। ডাটাবেজ নেই, লিংক নেই।

   পিয়ার আইডি = "Sholo-guti" + ৩ সংখ্যার পিন   (যেমন Sholo-guti123)
   - রুম খোলে:  new Peer("Sholo-guti123")            → host
   - জয়েন করে: new Peer() → connect("Sholo-guti123") → guest
   - যে কেউ বেরিয়ে গেলে খেলা শেষ।

   গেমের সাথে যোগাযোগ (16game.js যা দেয়):
   - Game.start(role)       : কানেকশন হলে ডাকা হয় ('host' | 'guest')
   - Game.handleRemote(msg) : বন্ধুর পাঠানো মেসেজ
   - Game.stop()            : কানেকশন কাটলে ডাকা হয়
   রং বাছাই ও কে আগে চালবে — host ঠিক করে START মেসেজে পাঠায় (16game.js-এ)।

   ইভেন্ট (16extras.js শোনে):
   peer, waiting(pin), joining(pin), connected({role,pin}), disconnected, error(text)
   ========================================================== */
(() => {
  'use strict';

  const PREFIX = 'Sholo-guti';
  const JOIN_TIMEOUT_MS = 12000;

  const listeners = {};
  let joinTimer = null;

  const Net = {
    peer: null,
    conn: null,
    role: null,      // 'host' | 'guest'
    pin: null,
    peerId: null
  };

  Net.on = (name, fn) => {
    (listeners[name] = listeners[name] || []).push(fn);
  };

  function emit(name, data) {
    (listeners[name] || []).forEach(fn => {
      try { fn(data); } catch (err) { console.error(err); }
    });
  }

  function cleanup() {
    clearTimeout(joinTimer);
    const c = Net.conn;
    const p = Net.peer;
    Net.conn = null;
    Net.peer = null;
    try { if (c) c.close(); } catch (_) {}
    try { if (p) p.destroy(); } catch (_) {}
  }

  function validPin(pin) {
    return /^\d{3}$/.test(pin);
  }

  Net.send = data => {
    try {
      if (Net.conn && Net.conn.open) Net.conn.send(data);
    } catch (err) {
      console.warn('Send failed', err);
    }
  };

  function bind(c) {
    let opened = false;

    c.on('open', () => {
      if (opened || Net.conn !== c) return;
      opened = true;
      clearTimeout(joinTimer);
      // আগে গেমকে জানাই (host এখানেই START পাঠায়), তারপর UI-কে
      window.Game.start(Net.role);
      emit('connected', { role: Net.role, pin: Net.pin });
    });

    c.on('data', data => {
      if (Net.conn !== c) return;
      window.Game.handleRemote(data);
    });

    c.on('close', () => {
      if (Net.conn !== c) return;
      window.Game.stop();
      emit('disconnected');
    });

    c.on('error', err => {
      console.warn('Connection error', err);
      if (Net.conn !== c) return;
      window.Game.stop();
      emit('disconnected');
    });
  }

  /* ---------- নতুন রুম খোলা ---------- */
  Net.createRoom = pin => {
    if (!validPin(pin)) {
      emit('error', 'পিন ঠিক ৩টি সংখ্যার হতে হবে।');
      return;
    }
    if (!window.Peer) {
      emit('error', 'PeerJS লোড হয়নি। ইন্টারনেট দেখে পেজ রিফ্রেশ করুন।');
      return;
    }

    cleanup();
    Net.role = 'host';
    Net.pin = pin;
    Net.peerId = PREFIX + pin;

    let p;
    try {
      p = new Peer(Net.peerId);
    } catch (err) {
      emit('error', 'PeerJS চালু করা যায়নি।');
      return;
    }
    Net.peer = p;
    emit('peer', p);

    p.on('open', () => emit('waiting', pin));

    p.on('connection', incoming => {
      if (Net.conn && Net.conn.open) {
        // রুমে আগেই দুজন — তৃতীয় জনকে ফিরিয়ে দিই
        incoming.on('open', () => { try { incoming.close(); } catch (_) {} });
        return;
      }
      Net.conn = incoming;
      bind(incoming);
    });

    p.on('error', err => {
      console.warn('Peer error', err);
      if (Net.conn && Net.conn.open) return;
      cleanup();
      if (err.type === 'unavailable-id') {
        emit('error', 'এই পিনে আগেই একটি রুম খোলা আছে। অন্য পিন দিন।');
      } else {
        emit('error', 'রুম খুলতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
      }
    });

    p.on('disconnected', () => {
      if (!p.destroyed) {
        try { p.reconnect(); } catch (_) {}
      }
    });
  };

  /* ---------- পিন দিয়ে জয়েন ---------- */
  Net.joinRoom = pin => {
    if (!validPin(pin)) {
      emit('error', 'পিন ঠিক ৩টি সংখ্যার হতে হবে।');
      return;
    }
    if (!window.Peer) {
      emit('error', 'PeerJS লোড হয়নি। ইন্টারনেট দেখে পেজ রিফ্রেশ করুন।');
      return;
    }

    cleanup();
    Net.role = 'guest';
    Net.pin = pin;
    Net.peerId = PREFIX + pin;

    let p;
    try {
      p = new Peer();
    } catch (err) {
      emit('error', 'PeerJS চালু করা যায়নি।');
      return;
    }
    Net.peer = p;
    emit('peer', p);
    emit('joining', pin);

    p.on('open', () => {
      const c = p.connect(Net.peerId, { reliable: true });
      Net.conn = c;
      bind(c);

      joinTimer = setTimeout(() => {
        if (!c.open) {
          cleanup();
          emit('error', 'রুমে যুক্ত হওয়া যায়নি। পিন ঠিক আছে কি না দেখুন।');
        }
      }, JOIN_TIMEOUT_MS);
    });

    p.on('error', err => {
      console.warn('Peer error', err);
      if (Net.conn && Net.conn.open) return;
      cleanup();
      if (err.type === 'peer-unavailable') {
        emit('error', 'এই পিনে কোনো রুম পাওয়া যায়নি।');
      } else {
        emit('error', 'কানেকশনে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
      }
    });

    p.on('disconnected', () => {
      if (!p.destroyed) {
        try { p.reconnect(); } catch (_) {}
      }
    });
  };

  Net.leave = () => {
    cleanup();
    window.Game.stop();
  };

  window.Game.send = Net.send;
  window.Net = Net;
})();
