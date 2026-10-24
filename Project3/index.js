/* ==========================================================
   Game Bazz - লবি (index.js)
   কাজ: Firebase Firestore (REST) থেকে রুম আনা, রুম তৈরি,
        পিন যাচাই, ৭ দিনের পুরনো রুম ডিলিট, গেম পেজে পাঠানো
   ========================================================== */

/* ---------- ১. কনফিগারেশন ---------- */
const FIREBASE_PROJECT_ID = 'tournament-2d6d4';
// ⚠️ এখানে আপনার সম্পূর্ণ API Key বসান (সাধারণত ৩৯ অক্ষরের, AIza দিয়ে শুরু)
const FIREBASE_API_KEY = 'AIzaSyCNvnJsIn4-oKHLVv7-oNHCTskjE8';

const ROOM_EXPIRY_DAYS = 7;          // রুম কতদিন থাকবে
const ROOM_NO_START = 111111;        // প্রথম রুমের নম্বর
const PEER_PREFIX = 'gamebazz-';     // PeerJS আইডির ভেতরের প্রিফিক্স (ব্যবহারকারী দেখবে না)
const HOME_PAGE = 'home.html';       // গেম পেজ
const REFRESH_INTERVAL_MS = 10000;   // তালিকা কত সেকেন্ড পর পর নিজে রিফ্রেশ হবে

// localStorage-এর কী (home.js-ও এগুলো ব্যবহার করবে)
const LS_SESSIONS = 'gamebazz_sessions'; // { "111111": { role, color, roomName } }
const LS_CURRENT = 'gamebazz_current';   // বর্তমানে যে রুমে খেলছি তার নম্বর

const DOCS_ROOT = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const API_BASE = `https://firestore.googleapis.com/v1/${DOCS_ROOT}`;

if (FIREBASE_API_KEY.length !== 39) {
    console.warn('API Key সম্ভবত অসম্পূর্ণ (দৈর্ঘ্য ' + FIREBASE_API_KEY.length + ', স্বাভাবিক ৩৯)।');
}

/* ---------- ২. DOM এলিমেন্ট ---------- */
const $ = (id) => document.getElementById(id);

const el = {
    createOpenBtn: $('create-room-open-btn'),
    refreshBtn: $('refresh-btn'),
    retryBtn: $('retry-btn'),
    resumeBanner: $('resume-banner'),
    resumeRoomName: $('resume-room-name'),
    resumeBtn: $('resume-btn'),
    roomsCount: $('rooms-count'),
    roomsLoading: $('rooms-loading'),
    roomsEmpty: $('rooms-empty'),
    roomsError: $('rooms-error'),
    roomsErrorText: $('rooms-error-text'),
    roomsList: $('rooms-list'),
    cardTemplate: $('room-card-template'),

    createModal: $('create-modal'),
    roomNameInput: $('room-name-input'),
    roomPinInput: $('room-pin-input'),
    createError: $('create-error'),
    createCancelBtn: $('create-cancel-btn'),
    createSubmitBtn: $('create-submit-btn'),

    pinModal: $('pin-modal'),
    pinRoomName: $('pin-room-name'),
    joinPinInput: $('join-pin-input'),
    pinError: $('pin-error'),
    pinCancelBtn: $('pin-cancel-btn'),
    pinSubmitBtn: $('pin-submit-btn'),

    toastContainer: $('toast-container')
};

/* ---------- ৩. অবস্থা (State) ---------- */
let rooms = [];            // বর্তমান রুমের তালিকা
let isFetching = false;    // একসাথে দুইবার ফেচ আটকাতে
let hasLoadedOnce = false; // প্রথমবার লোড হয়েছে কিনা
let pendingPinRoom = null; // যে প্রাইভেট রুমে জয়েন করতে চাইছে

/* ==========================================================
   ৪. ছোট ছোট সাহায্যকারী ফাংশন
   ========================================================== */

// সংখ্যাকে বাংলা অঙ্কে রূপান্তর
function toBn(n) {
    return String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
}

// নিরাপদ localStorage (মেসেঞ্জারের ব্রাউজারে সমস্যা হলেও যেন ক্র্যাশ না করে)
function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* উপেক্ষা */ }
}
function lsRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* উপেক্ষা */ }
}

// সেশন (কোন রুমে আমি কোন রঙ) পড়া ও লেখা
function getSessions() {
    try { return JSON.parse(lsGet(LS_SESSIONS)) || {}; } catch (e) { return {}; }
}
function saveSession(roomNo, data) {
    const all = getSessions();
    all[roomNo] = data;
    lsSet(LS_SESSIONS, JSON.stringify(all));
}

// টোস্ট মেসেজ দেখানো
function showToast(message, type = '') {
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' toast-' + type : '');
    t.textContent = message;
    el.toastContainer.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 2800);
}

// পিন হ্যাশ (সরাসরি পিন Firebase-এ রাখা হবে না)
async function hashPin(pin, roomNo) {
    const text = `gamebazz:${roomNo}:${pin}`;
    try {
        if (window.crypto && crypto.subtle) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
        }
    } catch (e) { /* নিচের ফলব্যাক চলবে */ }
    // ফলব্যাক: সাধারণ হ্যাশ
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return 'x' + h.toString(16);
}

/* ==========================================================
   ৫. Firestore REST হেল্পার
   ========================================================== */

// সব রিকোয়েস্ট এখান দিয়ে যাবে
async function fsRequest(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${API_BASE}${path}${sep}key=${FIREBASE_API_KEY}`;

    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });

    let data = null;
    try { data = await res.json(); } catch (e) { /* খালি রেসপন্স */ }

    if (!res.ok) {
        const err = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        err.status = res.status;
        throw err;
    }
    return data;
}

// Firestore-এর ফিল্ড থেকে সাধারণ JS মান বের করা
function readField(field) {
    if (!field) return undefined;
    if ('stringValue' in field) return field.stringValue;
    if ('integerValue' in field) return Number(field.integerValue);
    if ('doubleValue' in field) return Number(field.doubleValue);
    if ('booleanValue' in field) return field.booleanValue;
    if ('timestampValue' in field) return field.timestampValue;
    if ('nullValue' in field) return null;
    return undefined;
}

// একটি ডকুমেন্টকে আমাদের রুম অবজেক্টে রূপান্তর
function parseRoomDoc(doc) {
    const f = doc.fields || {};
    const id = doc.name.split('/').pop();
    const createdAtStr = readField(f.createdAt) || doc.createTime;
    return {
        id: id,                                        // ডকুমেন্ট আইডি = রুম নম্বর (যেমন "111111")
        roomName: readField(f.roomName) || 'নামহীন রুম',
        status: readField(f.status) || 'waiting',
        hasPin: readField(f.hasPin) === true,
        pinHash: readField(f.pinHash) || '',
        createdAt: createdAtStr ? new Date(createdAtStr).getTime() : Date.now()
    };
}

// সব রুম আনা (দরকার হলে একাধিক পেজ)
async function fetchAllRooms() {
    const result = [];
    let pageToken = '';
    for (let i = 0; i < 5; i++) {
        const q = `/rooms?pageSize=100${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
        const data = await fsRequest('GET', q);
        (data.documents || []).forEach((d) => result.push(parseRoomDoc(d)));
        if (!data.nextPageToken) break;
        pageToken = data.nextPageToken;
    }
    return result;
}

// একটি রুম ডিলিট (শুধু ৭ দিন পার হলে অটো-ক্লিনআপের জন্য)
function deleteRoomDoc(id) {
    return fsRequest('DELETE', `/rooms/${id}`).catch(() => { /* ব্যর্থ হলে পরের বার চেষ্টা হবে */ });
}

// কাউন্টার ১ বাড়িয়ে নতুন মান ফেরত দেওয়া (অ্যাটমিক, তাই দুজন একসাথে করলেও একই নম্বর পাবে না)
async function nextCounterValue() {
    const body = {
        writes: [{
            update: { name: `${DOCS_ROOT}/meta/roomCounter`, fields: {} },
            updateMask: { fieldPaths: [] },
            updateTransforms: [{
                fieldPath: 'last',
                increment: { integerValue: '1' }
            }]
        }]
    };
    const data = await fsRequest('POST', ':commit', body);
    const val = data.writeResults[0].transformResults[0].integerValue;
    return Number(val);
}

// নতুন রুম ডকুমেন্ট তৈরি (ডকুমেন্ট আইডি = রুম নম্বর, তাই আগে থেকে থাকলে 409 আসবে)
async function createRoomDoc(roomNo, roomName, pinHash) {
    const fields = {
        roomNo: { integerValue: String(roomNo) },
        peerId: { stringValue: PEER_PREFIX + roomNo },
        roomName: { stringValue: roomName },
        hasPin: { booleanValue: !!pinHash },
        status: { stringValue: 'waiting' },
        createdAt: { timestampValue: new Date().toISOString() }
    };
    if (pinHash) fields.pinHash = { stringValue: pinHash };

    return fsRequest('POST', `/rooms?documentId=${roomNo}`, { fields });
}

/* ==========================================================
   ৬. রুম তালিকা লোড ও দেখানো
   ========================================================== */

// কোন বক্স দেখাবে: loading | empty | error | list
function showState(state) {
    el.roomsLoading.hidden = state !== 'loading';
    el.roomsEmpty.hidden = state !== 'empty';
    el.roomsError.hidden = state !== 'error';
    el.roomsList.hidden = state !== 'list';
}

async function loadRooms() {
    if (isFetching) return;
    isFetching = true;
    if (!hasLoadedOnce) showState('loading');

    try {
        const all = await fetchAllRooms();

        // ৭ দিনের বেশি পুরনো রুম আলাদা করে ডিলিট
        const limit = Date.now() - ROOM_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        const fresh = [];
        all.forEach((r) => {
            if (r.createdAt < limit) deleteRoomDoc(r.id);
            else fresh.push(r);
        });

        // সাজানো: অপেক্ষায় থাকা রুম আগে, তারপর নতুনগুলো আগে
        fresh.sort((a, b) => {
            const aw = a.status === 'waiting' ? 0 : 1;
            const bw = b.status === 'waiting' ? 0 : 1;
            if (aw !== bw) return aw - bw;
            return b.createdAt - a.createdAt;
        });

        rooms = fresh;
        hasLoadedOnce = true;
        renderRooms();
        updateResumeBanner();
    } catch (err) {
        console.error('রুম লোড ব্যর্থ:', err);
        // আগে থেকে তালিকা থাকলে চুপচাপ থাকি, না থাকলে এরর দেখাই
        if (!hasLoadedOnce) {
            el.roomsErrorText.textContent = friendlyError(err);
            showState('error');
        }
    } finally {
        isFetching = false;
    }
}

// এররকে সহজ বাংলায় বলা
function friendlyError(err) {
    if (err.status === 400) return 'API Key ঠিক নেই বা অসম্পূর্ণ। index.js-এ Key যাচাই করুন।';
    if (err.status === 403) return 'Firebase অনুমতি দিচ্ছে না। Firestore Rules/টেস্ট মোড চেক করুন।';
    if (err.status === 404) return 'Firebase প্রজেক্ট বা Firestore ডাটাবেজ পাওয়া যায়নি।';
    if (err instanceof TypeError) return 'ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।';
    return 'রুম লোড করা যায়নি। আবার চেষ্টা করুন।';
}

function renderRooms() {
    el.roomsList.innerHTML = '';
    el.roomsCount.textContent = rooms.length ? `${toBn(rooms.length)}টি রুম` : '';

    if (rooms.length === 0) {
        showState('empty');
        return;
    }

    const sessions = getSessions();

    rooms.forEach((room) => {
        const node = el.cardTemplate.content.cloneNode(true);

        node.querySelector('.room-name').textContent = room.roomName;

        // স্ট্যাটাস ব্যাজ
        const st = node.querySelector('.badge-status');
        if (room.status === 'playing') {
            st.textContent = '🎮 চলছে';
            st.classList.add('badge-playing');
        } else {
            st.textContent = '⏳ অপেক্ষায়';
            st.classList.add('badge-waiting');
        }

        // পাবলিক / প্রাইভেট ব্যাজ
        const tp = node.querySelector('.badge-type');
        if (room.hasPin) {
            tp.textContent = '🔒 প্রাইভেট';
            tp.classList.add('badge-private');
        } else {
            tp.textContent = '🌐 পাবলিক';
            tp.classList.add('badge-public');
        }

        // জয়েন বাটন (আগে এই রুমে থাকলে "ফিরে যান")
        const btn = node.querySelector('.btn-join');
        btn.textContent = sessions[room.id] ? 'ফিরে যান' : 'জয়েন';
        btn.addEventListener('click', () => onJoinClick(room));

        el.roomsList.appendChild(node);
    });

    showState('list');
}

/* ==========================================================
   ৭. আগের অসমাপ্ত ম্যাচে ফেরার ব্যানার
   ========================================================== */
function updateResumeBanner() {
    const currentId = lsGet(LS_CURRENT);
    const sessions = getSessions();
    const room = rooms.find((r) => r.id === currentId);

    if (currentId && room && sessions[currentId]) {
        el.resumeRoomName.textContent = room.roomName;
        el.resumeBanner.hidden = false;
    } else {
        el.resumeBanner.hidden = true;
        // রুমটি আর নেই (মেয়াদ শেষ) হলে "বর্তমান" মুছে ফেলি
        if (currentId && hasLoadedOnce && !room) lsRemove(LS_CURRENT);
    }
}

/* ==========================================================
   ৮. জয়েন করার লজিক
   ========================================================== */

// গেম পেজে পাঠানো (URL-এ কোনো নম্বর দেখানো হয় না)
function goToRoom(roomId) {
    lsSet(LS_CURRENT, roomId);
    window.location.href = HOME_PAGE;
}

function onJoinClick(room) {
    const sessions = getSessions();

    // আগে এই রুমে ছিলাম -> পিন ছাড়াই সরাসরি ফিরে যাব
    if (sessions[room.id]) {
        goToRoom(room.id);
        return;
    }

    // প্রাইভেট রুম হলে পিন চাইব
    if (room.hasPin) {
        openPinModal(room);
        return;
    }

    // পাবলিক রুম -> সরাসরি জয়েন (অতিথি = হলুদ)
    joinRoom(room);
}

function joinRoom(room) {
    saveSession(room.id, { role: 'guest', color: 'yellow', roomName: room.roomName });
    goToRoom(room.id);
}

/* ---------- পিন পপআপ ---------- */
function openPinModal(room) {
    pendingPinRoom = room;
    el.pinRoomName.textContent = room.roomName;
    el.joinPinInput.value = '';
    el.pinError.hidden = true;
    el.pinModal.hidden = false;
    setTimeout(() => el.joinPinInput.focus(), 50);
}

function closePinModal() {
    el.pinModal.hidden = true;
    pendingPinRoom = null;
}

async function submitPin() {
    if (!pendingPinRoom) return;
    const pin = el.joinPinInput.value.trim();

    if (!pin) {
        showFormError(el.pinError, 'পিন লিখুন।');
        return;
    }

    el.pinSubmitBtn.disabled = true;
    const hash = await hashPin(pin, pendingPinRoom.id);
    el.pinSubmitBtn.disabled = false;

    if (hash !== pendingPinRoom.pinHash) {
        showFormError(el.pinError, 'পিন ভুল হয়েছে। আবার চেষ্টা করুন।');
        el.joinPinInput.select();
        return;
    }

    const room = pendingPinRoom;
    closePinModal();
    joinRoom(room);
}

function showFormError(node, message) {
    node.textContent = message;
    node.hidden = false;
}

/* ==========================================================
   ৯. নতুন রুম তৈরি
   ========================================================== */
function openCreateModal() {
    el.roomNameInput.value = '';
    el.roomPinInput.value = '';
    el.createError.hidden = true;
    el.createModal.hidden = false;
    setTimeout(() => el.roomNameInput.focus(), 50);
}

function closeCreateModal() {
    el.createModal.hidden = true;
}

async function submitCreateRoom() {
    const name = el.roomNameInput.value.trim();
    const pin = el.roomPinInput.value.trim();

    // যাচাই
    if (name.length < 2) {
        showFormError(el.createError, 'রুমের নাম কমপক্ষে ২ অক্ষরের দিন।');
        return;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
        showFormError(el.createError, 'পিন ৪ থেকে ৬ সংখ্যার হতে হবে (শুধু সংখ্যা)।');
        return;
    }
    el.createError.hidden = true;

    el.createSubmitBtn.disabled = true;
    el.createSubmitBtn.textContent = 'তৈরি হচ্ছে...';

    try {
        let roomNo = null;

        // নম্বর খালি আছে কিনা নিশ্চিত করতে সর্বোচ্চ ৫ বার চেষ্টা
        for (let attempt = 0; attempt < 5; attempt++) {
            const counter = await nextCounterValue();
            const candidate = ROOM_NO_START + counter - 1; // কাউন্টার ১ হলে 111111
            const pinHash = pin ? await hashPin(pin, candidate) : '';

            try {
                await createRoomDoc(candidate, name, pinHash);
                roomNo = candidate;
                break;
            } catch (err) {
                if (err.status === 409) continue; // নম্বরটি আগে থেকেই আছে, পরেরটা নিই
                throw err;
            }
        }

        if (roomNo === null) throw new Error('রুম নম্বর বরাদ্দ করা যায়নি');

        // সেশন সেভ: আমি হোস্ট, লাল গুটি
        const roomId = String(roomNo);
        saveSession(roomId, { role: 'host', color: 'red', roomName: name });
        showToast('রুম তৈরি হয়েছে!', 'success');
        goToRoom(roomId);
    } catch (err) {
        console.error('রুম তৈরি ব্যর্থ:', err);
        showFormError(el.createError, friendlyError(err));
        el.createSubmitBtn.disabled = false;
        el.createSubmitBtn.textContent = 'তৈরি করুন';
    }
}

/* ==========================================================
   ১০. ইভেন্ট সংযোগ ও শুরু
   ========================================================== */
function bindEvents() {
    el.createOpenBtn.addEventListener('click', openCreateModal);
    el.createCancelBtn.addEventListener('click', closeCreateModal);
    el.createSubmitBtn.addEventListener('click', submitCreateRoom);

    el.pinCancelBtn.addEventListener('click', closePinModal);
    el.pinSubmitBtn.addEventListener('click', submitPin);

    el.refreshBtn.addEventListener('click', () => {
        showToast('রিফ্রেশ হচ্ছে...');
        loadRooms();
    });
    el.retryBtn.addEventListener('click', () => {
        hasLoadedOnce = false;
        loadRooms();
    });

    el.resumeBtn.addEventListener('click', () => {
        const id = lsGet(LS_CURRENT);
        if (id) goToRoom(id);
    });

    // এন্টার চাপলে সাবমিট
    el.roomNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCreateRoom(); });
    el.roomPinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCreateRoom(); });
    el.joinPinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });

    // পপআপের বাইরে চাপলে বন্ধ
    el.createModal.addEventListener('click', (e) => { if (e.target === el.createModal) closeCreateModal(); });
    el.pinModal.addEventListener('click', (e) => { if (e.target === el.pinModal) closePinModal(); });

    // Esc চাপলে বন্ধ
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCreateModal();
            closePinModal();
        }
    });

    // ট্যাবে ফিরে এলে সাথে সাথে তালিকা আপডেট (মেসেঞ্জার থেকে ফিরলেও কাজ করবে)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadRooms();
    });
    // bfcache থেকে ফিরলে (ব্যাক বাটন)
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) loadRooms();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadRooms();

    // নির্দিষ্ট সময় পর পর নিজে নিজে রিফ্রেশ (ট্যাব দৃশ্যমান থাকলে)
    setInterval(() => {
        if (!document.hidden) loadRooms();
    }, REFRESH_INTERVAL_MS);
});
