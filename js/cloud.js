/* Graph Studio · cloud (Firebase)
   Accounts, profiles, publishing to the community, likes,
   live graphs shared with collaborators, and presence (cursors).
   Everything here is optional: without a config the studio still works. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});
  const C = GS.core;
  const SDK = 'https://www.gstatic.com/firebasejs/13.4.0/';
  const cfg = (window.GRAPH_STUDIO_CONFIG || {}).firebase || {};
  const configured = !!(cfg.apiKey && cfg.databaseURL && !/PASTE|YOUR_|your-project/i.test(cfg.apiKey + cfg.databaseURL));

  let F = null; // { A, U, D, app, auth, db }
  let user = null;
  let profile = null;
  let connected = false;
  let serverOffset = 0;
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  const profiles = new Map();

  async function init() {
    if (!configured) { resolveReady(false); return; }
    try {
      const [A, U, D] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-database.js')]);
      const app = A.initializeApp(cfg);
      F = { A, U, D, app, auth: U.getAuth(app), db: D.getDatabase(app) };
      D.onValue(D.ref(F.db, '.info/connected'), (s) => { connected = !!s.val(); C.bus.emit('cloud:connection', connected); });
      D.onValue(D.ref(F.db, '.info/serverTimeOffset'), (s) => { serverOffset = Number(s.val()) || 0; });
      let first = true;
      U.onAuthStateChanged(F.auth, async (u) => {
        user = u;
        profile = null;
        if (u) { try { profile = await getProfile(u.uid, true); } catch (e) { console.warn(e); } }
        C.bus.emit('auth', { user, profile });
        if (first) { first = false; resolveReady(true); }
      });
    } catch (e) {
      console.warn('[Graph Studio] Firebase could not start. Check js/config.js.', e);
      resolveReady(false);
    }
  }

  const need = () => { if (!F) throw Object.assign(new Error('Firebase is not set up yet. Add your config in js/config.js.'), { code: 'gs/not-configured' }); };
  const needUser = () => { need(); if (!user) throw Object.assign(new Error('Sign in first.'), { code: 'gs/signed-out' }); };
  const r = (p) => F.D.ref(F.db, p);
  const root = () => F.D.ref(F.db);
  const now = () => Date.now() + serverOffset;
  const token = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
  const forDb = (doc) => JSON.parse(JSON.stringify(doc));

  /* ---------- auth ---------- */
  async function signUp(email, password) { need(); return (await F.U.createUserWithEmailAndPassword(F.auth, email, password)).user; }
  async function signIn(email, password) { need(); return (await F.U.signInWithEmailAndPassword(F.auth, email, password)).user; }
  async function signInGoogle() {
    need();
    const p = new F.U.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return (await F.U.signInWithPopup(F.auth, p)).user;
  }
  async function signOut() { need(); C.bus.emit('cloud:signing-out'); await F.U.signOut(F.auth); }
  async function resetPassword(email) { need(); await F.U.sendPasswordResetEmail(F.auth, email); }

  /* ---------- profiles ---------- */
  async function getProfile(uid, fresh) {
    need();
    if (!fresh && profiles.has(uid)) return profiles.get(uid);
    const s = await F.D.get(r('users/' + uid));
    const p = s.exists() ? Object.assign({ uid }, s.val()) : null;
    profiles.set(uid, p);
    return p;
  }
  async function uidForUsername(name) {
    need();
    const s = await F.D.get(r('usernames/' + name));
    return s.exists() ? s.val() : null;
  }
  async function profileByUsername(name) {
    const uid = await uidForUsername(name);
    return uid ? getProfile(uid) : null;
  }
  async function saveProfile(p) {
    needUser();
    const uid = user.uid;
    const old = profile && profile.username;
    const data = {
      username: p.username,
      displayName: p.displayName,
      bio: p.bio || '',
      avatar: p.avatar || '',
      createdAt: (profile && profile.createdAt) || Date.now(),
    };
    const upd = {};
    upd['users/' + uid] = data;
    if (old !== p.username) {
      upd['usernames/' + p.username] = uid;
      if (old) upd['usernames/' + old] = null;
    }
    await F.D.update(root(), upd);
    profile = Object.assign({ uid }, data);
    profiles.set(uid, profile);
    C.bus.emit('auth', { user, profile });
    return profile;
  }

  /* ---------- community: published graphs ---------- */
  async function slugOwner(slug) { need(); const s = await F.D.get(r('slugs/' + slug)); return s.exists() ? s.val() : null; }
  async function publish({ pid, title, description, slug, doc, graphId }) {
    needUser();
    if (!profile) throw Object.assign(new Error('Set up your profile first.'), { code: 'gs/no-profile' });
    pid = pid || F.D.push(r('public')).key;
    const prev = (await F.D.get(r('public/' + pid))).val();
    if (prev && prev.owner !== user.uid) pid = F.D.push(r('public')).key;
    const t = Date.now();
    const post = {
      owner: user.uid,
      ownerName: profile.displayName,
      ownerUsername: profile.username,
      title,
      description: description || '',
      slug,
      doc: forDb(doc),
      publishedAt: prev && prev.owner === user.uid ? prev.publishedAt : t,
      updatedAt: t,
    };
    if (graphId) post.graphId = graphId;
    const upd = {};
    upd['public/' + pid] = post;
    upd['slugs/' + slug] = pid;
    if (prev && prev.owner === user.uid && prev.slug && prev.slug !== slug) upd['slugs/' + prev.slug] = null;
    await F.D.update(root(), upd);
    return { pid, slug };
  }
  async function unpublish(pid) {
    needUser();
    const post = (await F.D.get(r('public/' + pid))).val();
    if (!post) return;
    const upd = { ['public/' + pid]: null, ['likes/' + pid]: null };
    if (post.slug) upd['slugs/' + post.slug] = null;
    await F.D.update(root(), upd);
  }
  async function getPost(pid) { need(); const s = await F.D.get(r('public/' + pid)); return s.exists() ? Object.assign({ pid }, s.val()) : null; }
  async function getPostBySlug(slug) { const pid = await slugOwner(slug); return pid ? getPost(pid) : null; }
  async function listPosts(limit) {
    need();
    const q = F.D.query(r('public'), F.D.orderByChild('publishedAt'), F.D.limitToLast(limit || 60));
    const s = await F.D.get(q);
    const out = [];
    s.forEach((c) => { out.push(Object.assign({ pid: c.key }, c.val())); });
    return out.reverse();
  }
  async function listPostsBy(uid) {
    need();
    const s = await F.D.get(F.D.query(r('public'), F.D.orderByChild('owner'), F.D.equalTo(uid)));
    const out = [];
    s.forEach((c) => { out.push(Object.assign({ pid: c.key }, c.val())); });
    return out.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  }
  async function likes(pid) {
    need();
    const v = (await F.D.get(r('likes/' + pid))).val() || {};
    return { count: Object.keys(v).length, mine: !!(user && v[user.uid]) };
  }
  async function setLike(pid, on) { needUser(); await F.D.set(r(`likes/${pid}/${user.uid}`), on ? Date.now() : null); }

  /* ---------- live graphs (collaboration) ---------- */
  async function createGraph(doc) {
    needUser();
    const gid = F.D.push(r('graphs')).key;
    const t = Date.now();
    const title = (doc.title || 'Untitled graph').slice(0, 120);
    const upd = {};
    upd[`graphs/${gid}/meta`] = { owner: user.uid, title, createdAt: t, updatedAt: t };
    upd[`graphs/${gid}/doc`] = forDb(doc);
    upd[`graphs/${gid}/members/${user.uid}`] = 'owner';
    upd[`invites/${gid}`] = { token: token() };
    upd[`userGraphs/${user.uid}/${gid}`] = { title, role: 'owner', updatedAt: t };
    await F.D.update(root(), upd);
    return gid;
  }
  function watchGraph(gid, h) {
    need();
    const u1 = F.D.onValue(r(`graphs/${gid}/doc`), (s) => h.onDoc(s.val()), (e) => h.onError && h.onError(e));
    const u2 = F.D.onValue(r(`graphs/${gid}/meta`), (s) => h.onMeta && h.onMeta(s.val()), () => {});
    const u3 = F.D.onValue(r(`graphs/${gid}/members`), (s) => h.onMembers && h.onMembers(s.val() || {}), () => {});
    return () => { u1(); u2(); u3(); };
  }
  function pushPatch(gid, patch) {
    needUser();
    const upd = {};
    Object.keys(patch).forEach((p) => { upd[`graphs/${gid}/doc/${p}`] = patch[p]; });
    upd[`graphs/${gid}/meta/updatedAt`] = Date.now();
    if ('title' in patch) upd[`graphs/${gid}/meta/title`] = String(patch.title || 'Untitled graph').slice(0, 120);
    return F.D.update(root(), upd);
  }
  async function setGraphMeta(gid, meta) {
    needUser();
    const upd = {};
    Object.keys(meta).forEach((k) => { upd[`graphs/${gid}/meta/${k}`] = meta[k]; });
    await F.D.update(root(), upd);
  }
  async function isMember(gid) {
    needUser();
    try { const s = await F.D.get(r(`graphs/${gid}/members/${user.uid}`)); return s.exists(); } catch (e) { return false; }
  }
  async function joinGraph(gid, tok) {
    needUser();
    if (await isMember(gid)) return 'member';
    await F.D.set(r(`graphs/${gid}/members/${user.uid}`), tok);
    const meta = (await F.D.get(r(`graphs/${gid}/meta`))).val() || {};
    await F.D.set(r(`userGraphs/${user.uid}/${gid}`), { title: meta.title || 'Untitled graph', role: 'editor', updatedAt: Date.now() });
    return 'joined';
  }
  async function inviteToken(gid) { needUser(); const s = await F.D.get(r(`invites/${gid}/token`)); return s.val(); }
  async function newInviteToken(gid) { needUser(); const t = token(); await F.D.set(r(`invites/${gid}/token`), t); return t; }
  async function removeMember(gid, uid) { needUser(); await F.D.set(r(`graphs/${gid}/members/${uid}`), null); }
  async function leaveGraph(gid) {
    needUser();
    await F.D.update(root(), { [`graphs/${gid}/members/${user.uid}`]: null, [`userGraphs/${user.uid}/${gid}`]: null });
  }
  async function deleteGraph(gid) {
    needUser();
    await F.D.update(root(), { [`graphs/${gid}`]: null, [`invites/${gid}`]: null, [`presence/${gid}`]: null, [`userGraphs/${user.uid}/${gid}`]: null });
  }
  async function myGraphs() {
    needUser();
    const v = (await F.D.get(r('userGraphs/' + user.uid))).val() || {};
    return Object.keys(v).map((gid) => Object.assign({ gid }, v[gid])).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  async function touchMyGraph(gid, title, role) {
    if (!user) return;
    try { await F.D.update(r(`userGraphs/${user.uid}/${gid}`), { title: (title || 'Untitled graph').slice(0, 120), role: role || 'editor', updatedAt: Date.now() }); } catch (e) { /* ignore */ }
  }

  /* ---------- presence: who's here and where their cursor is ---------- */
  function presence(gid, me, onPeers) {
    needUser();
    const mine = r(`presence/${gid}/${user.uid}`);
    let alive = true;
    let last = {};
    const base = () => ({ name: me.name, color: me.color, t: F.D.serverTimestamp() });
    const unConn = F.D.onValue(r('.info/connected'), (s) => {
      if (s.val() !== true || !alive) return;
      F.D.onDisconnect(mine).remove().then(() => { if (alive) F.D.set(mine, Object.assign(base(), last)).catch(() => {}); }).catch(() => {});
    });
    const unPeers = F.D.onValue(r(`presence/${gid}`), (s) => onPeers(s.val() || {}), () => {});
    const send = C.throttle((pos) => {
      if (!alive) return;
      F.D.update(mine, Object.assign({}, pos, { t: F.D.serverTimestamp() })).catch(() => {});
    }, 60);
    return {
      move(pos) { last = Object.assign(last, pos); send(pos); },
      set(patch) { if (!alive) return; last = Object.assign(last, patch); F.D.update(mine, Object.assign({}, patch, { t: F.D.serverTimestamp() })).catch(() => {}); },
      react(emoji) { if (!alive) return; F.D.update(mine, { r: emoji, rt: F.D.serverTimestamp() }).catch(() => {}); },
      leave() { alive = false; unConn(); unPeers(); F.D.remove(mine).catch(() => {}); F.D.onDisconnect(mine).cancel().catch(() => {}); },
    };
  }

  GS.cloud = {
    configured, ready, init,
    get user() { return user; },
    get profile() { return profile; },
    get connected() { return connected; },
    now,
    signUp, signIn, signInGoogle, signOut, resetPassword,
    getProfile, profileByUsername, uidForUsername, saveProfile,
    slugOwner, publish, unpublish, getPost, getPostBySlug, listPosts, listPostsBy, likes, setLike,
    createGraph, watchGraph, pushPatch, setGraphMeta, isMember, joinGraph, inviteToken, newInviteToken, removeMember, leaveGraph, deleteGraph, myGraphs, touchMyGraph,
    presence,
  };
})();
