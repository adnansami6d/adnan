/* ==========================================================
   Game Bazz — connection.js
   শুধু PeerJS কানেকশন। ডাটাবেজ নেই, লিংক নেই।

   পিয়ার আইডি = "GAMEBUzz" + ৩ সংখ্যার পিন   (যেমন GAMEBUzz123)
   - রুম খোলে: new Peer("GAMEBUzz123")  → লাল
   - জয়েন করে: new Peer() → connect("GAMEBUzz123") → হলুদ
   - যে কেউ বেরিয়ে গেলে খেলা শেষ (Project 2-এর মতোই)।
   ========================================================== */
(() => {
  'use strict';

  const PREFIX = 'GAMEBUzz';
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
    c.on('open', () => {
      clearTimeout(joinTimer);
      const color = Net.role === 'host' ? 'red' : 'yellow';
      window.Game.start(color);
      emit('connected', { color, pin: Net.pin });
    });

    c.on('data', data => window.Game.handleRemote(data));

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
      if (err.type === 'unavailable-id') {
        cleanup();
        emit('error', 'এই পিনে আগেই একটি রুম খোলা আছে। অন্য পিন দিন।');
      } else {
        cleanup();
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
      if (err.type === 'peer-unavailable') {
        cleanup();
        emit('error', 'এই পিনে কোনো রুম পাওয়া যায়নি।');
      } else {
        cleanup();
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
