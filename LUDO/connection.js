/* ==========================================================
   Game Bazz — connection.js
   শুধু PeerJS কানেকশন। ডাটাবেজ নেই, পিন নেই।

   রুম আইডি = ৮ অক্ষরের র‍্যান্ডম (যেমন k3m9tq7x)
   পিয়ার আইডি = "gbludo-" + রুম আইডি
   শেয়ার লিংক = পেজের ঠিকানা + "?room=" + রুম আইডি

   - রুম খোলে (হোস্ট): new Peer("gbludo-xxxx") → লাল
   - লিংকে ঢুকে (গেস্ট): new Peer() → connect("gbludo-xxxx") → হলুদ
   - হোস্ট কানেকশন নিয়ে WELCOME পাঠায়, গেস্ট WELCOME পেলে তবেই খেলা শুরু।
   - রুমে আগেই কেউ থাকলে হোস্ট FULL পাঠিয়ে কানেকশন বন্ধ করে দেয়।
   - যে কেউ বেরিয়ে গেলে খেলা শেষ।
   ========================================================== */
(() => {
  'use strict';

  const PREFIX = 'gbludo-';
  const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
  const ID_LENGTH = 8;
  const JOIN_TIMEOUT_MS = 15000;
  const MAX_CREATE_TRIES = 3;
  const ID_PATTERN = new RegExp('^[' + ID_CHARS + ']{' + ID_LENGTH + '}$');

  const listeners = {};
  let joinTimer = null;

  const Net = {
    peer: null,
    conn: null,
    role: null,      // 'host' | 'guest'
    roomId: null,
    peerId: null,
    ready: false     // দুজন যুক্ত হয়ে খেলা শুরু হয়েছে কি না
  };

  Net.on = (name, fn) => {
    (listeners[name] = listeners[name] || []).push(fn);
  };

  function emit(name, data) {
    (listeners[name] || []).forEach(fn => {
      try { fn(data); } catch (err) { console.error(err); }
    });
  }

  /* ---------- ছোট সাহায্যকারী ---------- */
  function makeRoomId() {
    const bytes = new Uint8Array(ID_LENGTH);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    let id = '';
    for (let i = 0; i < bytes.length; i++) id += ID_CHARS[bytes[i] % ID_CHARS.length];
    return id;
  }

  function validRoomId(id) {
    return typeof id === 'string' && ID_PATTERN.test(id);
  }

  // URL-এ ?room=xxxx থাকলে বৈধ আইডি ফেরত দেয়, নইলে null
  Net.roomFromUrl = () => {
    try {
      const raw = new URLSearchParams(window.location.search).get('room');
      const id = raw ? raw.toLowerCase() : '';
      return validRoomId(id) ? id : null;
    } catch (_) {
      return null;
    }
  };

  // URL-এ room প্যারামিটার আছে কি না (বৈধ না হলেও)
  Net.urlHasRoom = () => {
    try {
      return new URLSearchParams(window.location.search).has('room');
    } catch (_) {
      return false;
    }
  };

  Net.linkFor = id => window.location.origin + window.location.pathname + '?room=' + id;

  Net.clearUrl = () => {
    try { window.history.replaceState(null, '', window.location.pathname); } catch (_) {}
  };

  function cleanup() {
    clearTimeout(joinTimer);
    joinTimer = null;
    const c = Net.conn;
    const p = Net.peer;
    Net.conn = null;
    Net.peer = null;
    Net.ready = false;
    try { if (c) c.close(); } catch (_) {}
    try { if (p) p.destroy(); } catch (_) {}
  }

  function fail(code, message) {
    cleanup();
    emit('error', { code, message });
  }

  Net.send = data => {
    try {
      if (Net.conn && Net.conn.open) Net.conn.send(data);
    } catch (err) {
      console.warn('Send failed', err);
    }
  };

  /* ---------- খেলা শুরু / কানেকশন হারানো ---------- */
  function begin() {
    clearTimeout(joinTimer);
    joinTimer = null;
    Net.ready = true;
    const color = Net.role === 'host' ? 'red' : 'yellow';
    window.Game.start(color);
    emit('connected', { color, roomId: Net.roomId });
  }

  function lost() {
    if (!Net.ready) {
      // খেলা শুরুর আগেই কানেকশন গেলে সেটা এরর
      fail('failed', 'Connection failed');
      return;
    }
    Net.ready = false;
    window.Game.stop();
    emit('disconnected');
  }

  function bind(c) {
    c.on('open', () => {
      if (Net.conn !== c) return;
      if (Net.role === 'host') {
        Net.send({ type: 'WELCOME' });
        begin();
      }
      // গেস্ট এখানে অপেক্ষা করে: WELCOME এলে শুরু, FULL এলে এরর
    });

    c.on('data', data => {
      if (Net.conn !== c || !data) return;
      if (Net.role === 'guest' && !Net.ready) {
        if (data.type === 'WELCOME') begin();
        else if (data.type === 'FULL') fail('full', 'Room is full');
        return;
      }
      window.Game.handleRemote(data);
    });

    c.on('close', () => {
      if (Net.conn !== c) return;
      lost();
    });

    c.on('error', err => {
      console.warn('Connection error', err);
      if (Net.conn !== c) return;
      lost();
    });
  }

  /* ---------- নতুন রুম খোলা (হোস্ট) ---------- */
  Net.createRoom = (attempt = 0) => {
    if (!window.Peer) {
      fail('failed', 'Connection failed');
      return;
    }

    cleanup();
    Net.role = 'host';
    Net.roomId = makeRoomId();
    Net.peerId = PREFIX + Net.roomId;

    let p;
    try {
      p = new Peer(Net.peerId);
    } catch (err) {
      fail('failed', 'Connection failed');
      return;
    }
    Net.peer = p;
    emit('peer', p);

    p.on('open', () => {
      if (Net.peer !== p) return;
      emit('waiting', { roomId: Net.roomId, link: Net.linkFor(Net.roomId) });
    });

    p.on('connection', incoming => {
      if (Net.peer !== p) return;
      if (Net.conn) {
        // রুমে আগেই একজন এসেছে: তৃতীয় জনকে জানিয়ে ফিরিয়ে দিই
        incoming.on('open', () => {
          try { incoming.send({ type: 'FULL' }); } catch (_) {}
          setTimeout(() => { try { incoming.close(); } catch (_) {} }, 400);
        });
        return;
      }
      Net.conn = incoming;
      bind(incoming);
    });

    p.on('error', err => {
      console.warn('Peer error', err);
      if (Net.peer !== p || Net.ready) return;
      if (err.type === 'unavailable-id' && attempt + 1 < MAX_CREATE_TRIES) {
        Net.createRoom(attempt + 1);   // নতুন আইডি দিয়ে আবার
        return;
      }
      fail('failed', 'Connection failed');
    });

    p.on('disconnected', () => {
      if (Net.peer !== p) return;
      if (!p.destroyed) {
        try { p.reconnect(); } catch (_) {}
      }
    });
  };

  /* ---------- লিংকের আইডি দিয়ে জয়েন (গেস্ট) ---------- */
  Net.joinRoom = id => {
    if (!validRoomId(id)) {
      fail('notfound', 'Room not found');
      return;
    }
    if (!window.Peer) {
      fail('failed', 'Connection failed');
      return;
    }

    cleanup();
    Net.role = 'guest';
    Net.roomId = id;
    Net.peerId = PREFIX + id;

    let p;
    try {
      p = new Peer();
    } catch (err) {
      fail('failed', 'Connection failed');
      return;
    }
    Net.peer = p;
    emit('peer', p);
    emit('joining', id);

    // সব মিলিয়ে নির্দিষ্ট সময়ের মধ্যে খেলা শুরু না হলে এরর
    joinTimer = setTimeout(() => {
      if (Net.peer === p && !Net.ready) fail('failed', 'Connection failed');
    }, JOIN_TIMEOUT_MS);

    p.on('open', () => {
      if (Net.peer !== p) return;
      const c = p.connect(Net.peerId, { reliable: true });
      Net.conn = c;
      bind(c);
    });

    p.on('error', err => {
      console.warn('Peer error', err);
      if (Net.peer !== p || Net.ready) return;
      if (err.type === 'peer-unavailable') fail('notfound', 'Room not found');
      else fail('failed', 'Connection failed');
    });

    p.on('disconnected', () => {
      if (Net.peer !== p) return;
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
