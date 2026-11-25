/* Graph Studio · pages and account dialogs
   Sign in, profile (photo + bio), settings, the community wall,
   the public preview page and user profiles. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});
  const C = GS.core, U = GS.ui, E = GS.engine;
  const { $, $$, esc, h } = C;
  const icon = (n, c) => GS.icon(n, c);
  const R = () => GS.router;

  const AUTH_ERRORS = {
    'auth/invalid-credential': 'That email and password don’t match.',
    'auth/wrong-password': 'That email and password don’t match.',
    'auth/user-not-found': 'There’s no account with that email yet. Create one instead.',
    'auth/email-already-in-use': 'There’s already an account with this email. Sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for your password.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
    'auth/unauthorized-domain': 'This website isn’t on your Firebase “Authorized domains” list yet (Authentication → Settings).',
    'auth/operation-not-allowed': 'Turn on this sign-in method in Firebase → Authentication → Sign-in method.',
    'auth/network-request-failed': 'Can’t reach Firebase. Check your connection.',
    'auth/popup-blocked': 'Your browser blocked the Google pop-up. Allow pop-ups for this site and try again.',
  };
  const authMsg = (e) => AUTH_ERRORS[e && e.code] || (e && e.message) || 'Something went wrong.';

  /* ======================= sign in ======================= */
  function authModal(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!GS.cloud.configured) {
        U.modal({ title: 'Accounts need Firebase', width: 460, body: `<p class="muted">Paste your Firebase config into <code>js/config.js</code> to turn on sign-in, the community and live editing. SETUP.md walks you through it.</p>` });
        return resolve(null);
      }
      let mode = opts.mode || 'signin';
      let result = null;
      const m = U.modal({
        title: '', width: 420, className: 'sheet-auth',
        onClose: () => resolve(result),
        body: `<div class="auth">
          <div class="auth-mark">${icon('bar')}</div>
          <h2 id="auTitle"></h2>
          ${opts.reason ? `<p class="muted">${esc(opts.reason)}</p>` : ''}
          <button class="btn google" type="button" id="auGoogle"><svg viewBox="0 0 48 48" class="ic" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span>Continue with Google</span></button>
          <div class="or"><span>or</span></div>
          <form id="auForm" novalidate>
            <label class="flabel" for="auEmail">Email</label><input class="field" id="auEmail" type="email" autocomplete="email" required>
            <label class="flabel" for="auPass">Password</label><input class="field" id="auPass" type="password" autocomplete="current-password" minlength="6" required>
            <p class="form-err" id="auErr" role="alert"></p>
            <button class="btn primary wide" type="submit" id="auGo"></button>
          </form>
          <div class="auth-foot"><button class="linkish" type="button" id="auSwap"></button><button class="linkish" type="button" id="auForgot">Forgot password?</button></div>
        </div>`,
      });
      const b = m.body;
      const set = () => {
        $('#auTitle', b).textContent = mode === 'signin' ? 'Welcome back' : 'Create your account';
        $('#auGo', b).textContent = mode === 'signin' ? 'Sign in' : 'Create account';
        $('#auSwap', b).textContent = mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in';
        $('#auForgot', b).hidden = mode !== 'signin';
        $('#auPass', b).autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
        $('#auErr', b).textContent = '';
      };
      set();
      const done = async (user) => {
        result = user;
        m.close();
        U.toast(mode === 'signup' ? 'Account created' : 'Signed in', { icon: 'check' });
        await C.sleep(250);
        if (!GS.cloud.profile) await profileModal({ first: true });
      };
      $('#auSwap', b).addEventListener('click', () => { mode = mode === 'signin' ? 'signup' : 'signin'; set(); });
      $('#auForgot', b).addEventListener('click', async () => {
        const email = $('#auEmail', b).value.trim();
        if (!email) { $('#auErr', b).textContent = 'Type your email above, then click “Forgot password?” again.'; return; }
        try { await GS.cloud.resetPassword(email); U.toast('Check your inbox for a reset link', { icon: 'mail' }); } catch (e) { $('#auErr', b).textContent = authMsg(e); }
      });
      $('#auGoogle', b).addEventListener('click', async () => {
        try { await done(await GS.cloud.signInGoogle()); } catch (e) { if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') $('#auErr', b).textContent = authMsg(e); }
      });
      $('#auForm', b).addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#auEmail', b).value.trim(), pass = $('#auPass', b).value;
        const go = $('#auGo', b);
        go.disabled = true; go.classList.add('busy');
        try { await done(mode === 'signin' ? await GS.cloud.signIn(email, pass) : await GS.cloud.signUp(email, pass)); }
        catch (err) { $('#auErr', b).textContent = authMsg(err); }
        finally { go.disabled = false; go.classList.remove('busy'); }
      });
    });
  }

  /* ======================= profile ======================= */
  async function squareImage(file, size) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      let out = c.toDataURL('image/webp', 0.82);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.82);
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  function profileModal(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!GS.cloud.user) return resolve(null);
      const p = GS.cloud.profile || {};
      const email = GS.cloud.user.email || '';
      const guessName = GS.cloud.user.displayName || email.split('@')[0] || '';
      const st = { avatar: p.avatar || 'color:' + U.hashColor(GS.cloud.user.uid), usernameOk: !!p.username };
      let saved = null;
      const m = U.modal({
        title: opts.first ? 'Set up your profile' : 'Edit profile', width: 480,
        onClose: () => resolve(saved),
        body: `<div class="prof">
          <div class="prof-av"><div id="pfAv"></div>
            <div class="prof-av-acts"><label class="btn sm file-btn">${icon('upload')}<span>Upload photo</span><input type="file" id="pfFile" accept="image/*"></label>
            <div class="prof-colors">${C.PALETTES.candy.colors.slice(0, 6).map((c) => `<button type="button" class="dot" style="--c:${c}" data-c="${c}" aria-label="Use colour ${c}"></button>`).join('')}</div></div></div>
          <label class="flabel" for="pfName">Display name</label><input class="field" id="pfName" maxlength="40" value="${esc(p.displayName || guessName)}" autocomplete="name">
          <label class="flabel" for="pfUser">Username</label>
          <div class="at-row"><span>@</span><input class="field" id="pfUser" maxlength="20" value="${esc(p.username || C.cleanSlug(guessName).replace(/-/g, '_').slice(0, 20))}" spellcheck="false" autocomplete="username"></div>
          <p class="slug-state" id="pfUState"></p>
          <label class="flabel" for="pfBio">Bio <span class="count" id="pfCount"></span></label><textarea class="field area" id="pfBio" rows="3" maxlength="280" placeholder="A line about you">${esc(p.bio || '')}</textarea>
          <p class="form-err" id="pfErr" role="alert"></p>
          <div class="sheet-actions">${!opts.first ? `<button class="btn ghost" type="button" id="pfOut">${icon('logout')}<span>Sign out</span></button><span class="grow"></span>` : ''}<button class="btn primary" type="button" id="pfSave">Save profile</button></div></div>`,
      });
      const b = m.body;
      const drawAv = () => { $('#pfAv', b).innerHTML = U.avatar({ uid: GS.cloud.user.uid, displayName: $('#pfName', b).value || '?', avatar: st.avatar }, 84); };
      drawAv();
      $('#pfName', b).addEventListener('input', drawAv);
      C.on(b, 'click', '.prof-colors .dot', (e, d) => { st.avatar = 'color:' + d.dataset.c; drawAv(); });
      $('#pfFile', b).addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try { st.avatar = await squareImage(f, 192); drawAv(); } catch (err) { U.toast('Couldn’t read that image', { tone: 'warn' }); }
      });
      const count = () => { $('#pfCount', b).textContent = `${$('#pfBio', b).value.length}/280`; };
      count();
      $('#pfBio', b).addEventListener('input', count);
      const uIn = $('#pfUser', b), uState = $('#pfUState', b);
      const check = C.debounce(async () => {
        const v = uIn.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (v !== uIn.value) uIn.value = v;
        if (!/^[a-z0-9_]{3,20}$/.test(v)) { st.usernameOk = false; uState.className = 'slug-state bad'; uState.textContent = '3–20 letters, numbers or underscores.'; return; }
        if (v === p.username) { st.usernameOk = true; uState.className = 'slug-state good'; uState.textContent = 'That’s you'; return; }
        uState.className = 'slug-state'; uState.textContent = 'Checking…';
        try {
          const owner = await GS.cloud.uidForUsername(v);
          if (uIn.value !== v) return;
          st.usernameOk = !owner || owner === GS.cloud.user.uid;
          uState.className = 'slug-state ' + (st.usernameOk ? 'good' : 'bad');
          uState.textContent = st.usernameOk ? 'Available' : 'Taken. Try another.';
        } catch (e) { st.usernameOk = true; uState.textContent = ''; }
      }, 280);
      uIn.addEventListener('input', check);
      check();
      const out = $('#pfOut', b);
      if (out) out.addEventListener('click', async () => { m.close(); await GS.cloud.signOut(); U.toast('Signed out'); });
      $('#pfSave', b).addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const displayName = $('#pfName', b).value.trim();
        const username = uIn.value.trim();
        if (!displayName) { $('#pfErr', b).textContent = 'Add a display name.'; return; }
        check.flush();
        await C.sleep(60);
        if (!st.usernameOk) { $('#pfErr', b).textContent = 'Pick a different username.'; return; }
        btn.disabled = true; btn.classList.add('busy');
        try {
          saved = await GS.cloud.saveProfile({ displayName, username, bio: $('#pfBio', b).value.trim(), avatar: st.avatar });
          m.close();
          U.toast('Profile saved', { icon: 'check' });
        } catch (err) {
          console.warn(err);
          $('#pfErr', b).textContent = /permission/i.test(err.message) ? 'That username was just taken, or your database rules aren’t set up yet.' : err.message;
        } finally { btn.disabled = false; btn.classList.remove('busy'); }
      });
    });
  }

  /* ======================= settings ======================= */
  function settingsModal() {
    const cfgOn = GS.cloud.configured;
    const m = U.modal({
      title: 'Settings', width: 480,
      body: `<h3 class="sub-h" style="margin-top:0">Accent colour</h3>
        <div class="accents" id="stAccents">${C.ACCENTS.map(([c, n]) => `<button type="button" class="acc" data-acc="${c}" style="--c:${c}" aria-label="${n}" data-tip="${n}"></button>`).join('')}<button type="button" class="acc acc-custom" id="stAccCustom" aria-label="Pick any colour" data-tip="Any colour">+</button></div>
        <p class="pnote">Used for buttons, the + button, highlights and links. Saved on this device.</p>
        <div class="set-list">
        <label class="set-row"><span><b>Reduce motion</b><small>Turns off entrance animations and celebration effects.</small></span><span class="switch"><input type="checkbox" id="stMotion" ${C.prefs.reduceMotion ? 'checked' : ''}><span></span></span></label>
        <label class="set-row"><span><b>Show other people’s cursors</b><small>In live graphs.</small></span><span class="switch"><input type="checkbox" id="stCursors" ${C.prefs.cursors ? 'checked' : ''}><span></span></span></label>
        </div>
        <h3 class="sub-h">Keyboard</h3>
        <div class="keys">${[['⌘K', 'Command menu'], ['⌘Z / ⇧⌘Z', 'Undo / redo'], ['⌘E', 'Export'], ['Enter', 'Next row (adds one at the end)'], ['V  H  Z', 'Point, pan, box-zoom'], ['Ctrl + scroll', 'Zoom the graph'], ['F', 'Focus mode'], ['R', 'Replay animation'], ['0', 'Reset zoom']].map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div>
        <h3 class="sub-h">Cloud</h3>
        <p class="muted">${cfgOn ? `Connected to the Firebase project <b>${esc(((window.GRAPH_STUDIO_CONFIG || {}).firebase || {}).projectId || '')}</b>.` : 'Not connected. Paste your Firebase config into <code>js/config.js</code> to turn on accounts, publishing and live editing.'}</p>`,
    });
    const markAccent = () => {
      const cur = C.normHex(C.prefs.accent);
      const preset = C.ACCENTS.some(([c]) => c === cur);
      $$('#stAccents .acc[data-acc]', m.body).forEach((b) => b.classList.toggle('on', b.dataset.acc === cur));
      const custom = $('#stAccCustom', m.body);
      custom.classList.toggle('on', !preset);
      custom.style.setProperty('--c', cur);
    };
    markAccent();
    C.on(m.body, 'click', '#stAccents [data-acc]', (e, b) => { U.setAccent(b.dataset.acc); markAccent(); });
    $('#stAccCustom', m.body).addEventListener('click', (e) => {
      U.colorPicker(e.currentTarget, C.prefs.accent, (c) => { U.setAccent(c); markAccent(); }, { title: 'Accent colour' });
    });
    $('#stMotion', m.body).addEventListener('change', (e) => { C.prefs.reduceMotion = e.target.checked; C.savePrefs(); document.documentElement.classList.toggle('reduce', C.prefs.reduceMotion); });
    $('#stCursors', m.body).addEventListener('change', (e) => { C.prefs.cursors = e.target.checked; C.savePrefs(); });
  }

  /* ======================= shared bits ======================= */
  function notice(root, title, text, actions) {
    root.innerHTML = `<div class="page-msg"><div class="blocker-card">${icon('cloudOff')}<h2>${esc(title)}</h2><p>${text}</p><div class="blocker-acts">${(actions || []).map((a, i) => `<a class="btn ${a[2] || ''}" href="${esc(a[1])}" data-link>${esc(a[0])}</a>`).join('')}</div></div></div>`;
  }
  const notConfigured = (root, what) => notice(root, `${what} needs Firebase`, 'Paste your Firebase config into <code>js/config.js</code> to turn this on. SETUP.md walks you through it, free and without any terminal.', [['Open the studio', R().href('studio'), 'primary']]);

  function card(post, likeInfo) {
    const color = (C.seriesOf(C.normalize(post.doc))[0] || {}).color || '#ff5ca2';
    return `<article class="gcard" data-pid="${esc(post.pid)}" style="--accent:${color}">
      <a class="gcard-link" href="${esc(R().href(`graph/${post.slug}/preview`))}" data-link aria-label="Open ${esc(post.title)}"></a>
      <div class="gcard-viz"><canvas></canvas></div>
      <div class="gcard-body"><h3>${esc(post.title)}</h3>${post.description ? `<p>${esc(post.description)}</p>` : ''}</div>
      <footer class="gcard-foot"><a class="gcard-author" href="${esc(R().href('u/' + (post.ownerUsername || '')))}" data-link><span class="gcard-av" data-uid="${esc(post.owner)}">${U.avatar({ uid: post.owner, displayName: post.ownerName }, 24)}</span><span>${esc(post.ownerName || 'Someone')}</span></a>
      <span class="gcard-time">${esc(C.timeAgo(post.publishedAt))}</span>
      <button class="like sm ${likeInfo && likeInfo.mine ? 'on' : ''}" type="button" data-like="${esc(post.pid)}" aria-pressed="${!!(likeInfo && likeInfo.mine)}" aria-label="Like">${icon('heart')}<b>${likeInfo ? likeInfo.count : ''}</b></button></footer>
    </article>`;
  }
  function mountCards(wall, posts) {
    const charts = [];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const post = posts.find((p) => p.pid === en.target.dataset.pid);
        if (!post) return;
        try { charts.push(E.create(en.target.querySelector('canvas'), C.normalize(post.doc), { interactive: false, mini: true, showTitle: false })); } catch (e) { console.warn(e); }
      });
    }, { rootMargin: '80px' });
    $$('.gcard', wall).forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 12)); io.observe(el); });
    posts.forEach((p) => {
      GS.cloud.getProfile(p.owner).then((pr) => { const el = wall.querySelector(`.gcard-av[data-uid="${p.owner}"]`); if (pr && el) $$(`.gcard-av[data-uid="${p.owner}"]`, wall).forEach((x) => { x.innerHTML = U.avatar(pr, 24); }); }).catch(() => {});
      GS.cloud.likes(p.pid).then((l) => setLikeBtn(wall.querySelector(`[data-like="${p.pid}"]`), l)).catch(() => {});
    });
    return () => { io.disconnect(); charts.forEach((c) => c.destroy()); };
  }
  function setLikeBtn(btn, l) {
    if (!btn) return;
    btn.classList.toggle('on', !!l.mine);
    btn.setAttribute('aria-pressed', !!l.mine);
    btn.querySelector('b').textContent = l.count ? String(l.count) : '';
    btn.$l = l;
  }
  async function toggleLike(btn, pid) {
    if (!GS.cloud.configured) return;
    if (!GS.cloud.user) { const u = await authModal({ reason: 'Sign in to like graphs.' }); if (!u) return; }
    const l = btn.$l || { count: 0, mine: false };
    const next = { count: l.count + (l.mine ? -1 : 1), mine: !l.mine };
    setLikeBtn(btn, next);
    if (next.mine) {
      btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
      const r = btn.getBoundingClientRect();
      const a = C.accentSet(C.prefs.accent);
      U.confetti(r.left + r.width / 2, r.top + r.height / 2, [a.main, a.light, C.mix(a.main, '#ffffff', 0.6)], 16);
    }
    try { await GS.cloud.setLike(pid, next.mine); } catch (e) { setLikeBtn(btn, l); U.toast('Couldn’t save that like', { tone: 'warn' }); }
  }

  /* ======================= community wall ======================= */
  async function community(root) {
    GS.router.setWallpaper('dots');
    document.title = 'Community – Graph Studio';
    let cleanup = null;
    root.innerHTML = `<div class="page wall-page">
      <header class="page-head"><div><h1>Community</h1><p>Graphs people have published. Open one to watch it animate, or remix it into your own studio.</p></div>
      <div class="wall-ctl">${U.seg('sort', [['latest', 'Latest'], ['liked', 'Most liked']], 'latest').replace('class="seg"', 'class="seg" id="wSort"')}<label class="search">${icon('search')}<input id="wSearch" placeholder="Search" aria-label="Search graphs"></label></div></header>
      <div class="wall" id="wall"><div class="wall-loading"><div class="spinner"></div></div></div>
      <a class="fab fab-fixed" href="${esc(R().href('studio'))}" data-link aria-label="Make a graph">${icon('fab')}</a></div>`;
    if (!(await GS.cloud.ready)) return notConfigured(root, 'The community');
    let posts = [];
    try { posts = await GS.cloud.listPosts(80); } catch (e) {
      console.warn(e);
      return notice(root, 'Couldn’t load the community', /permission/i.test(e.message) ? 'Firebase refused to share the list. Paste the rules from <code>database.rules.json</code> into Realtime Database → Rules.' : esc(e.message), [['Try again', R().href('community'), 'primary']]);
    }
    const wall = $('#wall', root);
    if (!wall) return;
    const likeCache = {};
    let sort = 'latest', q = '';
    const draw = async () => {
      if (cleanup) cleanup();
      let list = posts.filter((p) => !q || (p.title + ' ' + (p.description || '') + ' ' + (p.ownerName || '')).toLowerCase().includes(q));
      if (sort === 'liked') {
        await Promise.all(list.map(async (p) => { if (!likeCache[p.pid]) likeCache[p.pid] = await GS.cloud.likes(p.pid).catch(() => ({ count: 0 })); }));
        list = list.slice().sort((a, b) => (likeCache[b.pid].count || 0) - (likeCache[a.pid].count || 0));
      }
      if (!document.contains(wall)) return;
      wall.innerHTML = list.length ? list.map((p) => card(p, likeCache[p.pid])).join('')
        : posts.length ? '<p class="wall-empty">No graphs match that search.</p>'
        : `<div class="wall-empty"><b>Nothing published yet.</b><p>Make a graph, then Share → Publish to put the first one on the wall.</p><a class="btn primary" href="${esc(R().href('studio'))}" data-link>Open the studio</a></div>`;
      cleanup = mountCards(wall, list);
    };
    await draw();
    C.on(root, 'click', '#wSort button', (e, b) => { sort = b.dataset.v; U.setSeg($('#wSort', root), sort); draw(); });
    $('#wSearch', root).addEventListener('input', C.debounce((e) => { q = e.target.value.trim().toLowerCase(); draw(); }, 200));
    C.on(wall, 'click', '[data-like]', (e, b) => { e.preventDefault(); e.stopPropagation(); toggleLike(b, b.dataset.like); });
    return () => cleanup && cleanup();
  }

  /* ======================= profile page ======================= */
  async function profilePage(root, route) {
    GS.router.setWallpaper('dusk');
    root.innerHTML = `<div class="page"><div class="wall-loading"><div class="spinner"></div></div></div>`;
    if (!(await GS.cloud.ready)) return notConfigured(root, 'Profiles');
    let p = null;
    try { p = await GS.cloud.profileByUsername(route.username); } catch (e) { console.warn(e); }
    if (!p) return notice(root, 'No one by that name', `There’s no profile at @${esc(route.username)}.`, [['Go to the community', R().href('community'), 'primary']]);
    document.title = `${p.displayName} – Graph Studio`;
    const mine = GS.cloud.user && GS.cloud.user.uid === p.uid;
    root.innerHTML = `<div class="page prof-page">
      <header class="prof-head">${U.avatar(p, 96, 'prof-big')}<div><h1>${esc(p.displayName)}</h1><p class="handle">@${esc(p.username)}</p>${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}<p class="muted small">Joined ${esc(new Date(p.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</p>
      ${mine ? `<button class="btn sm" type="button" id="ppEdit">${icon('pencil')}<span>Edit profile</span></button>` : ''}</div></header>
      <h2 class="sub-h">Published graphs</h2><div class="wall" id="wall"><div class="wall-loading"><div class="spinner"></div></div></div></div>`;
    if (mine) $('#ppEdit', root).addEventListener('click', async () => { const np = await profileModal(); if (np) R().go('u/' + np.username); });
    let posts = [];
    try { posts = await GS.cloud.listPostsBy(p.uid); } catch (e) { console.warn(e); }
    const wall = $('#wall', root);
    if (!wall) return;
    wall.innerHTML = posts.length ? posts.map((x) => card(x)).join('') : `<p class="wall-empty">${mine ? 'You haven’t published a graph yet. Open one in the studio and use Share → Publish.' : 'Nothing published yet.'}</p>`;
    const cleanup = mountCards(wall, posts);
    C.on(wall, 'click', '[data-like]', (e, b) => { e.preventDefault(); e.stopPropagation(); toggleLike(b, b.dataset.like); });
    return cleanup;
  }

  /* ======================= public preview ======================= */
  async function preview(root, route) {
    const embed = !!route.embed;
    document.documentElement.classList.toggle('embed', embed);
    root.innerHTML = `<div class="page"><div class="wall-loading"><div class="spinner"></div></div></div>`;
    let doc, author, meta = {}, post = null;
    try {
      if (route.packed) {
        const p = await C.unpack(route.packed);
        doc = C.normalize(p.d);
        author = { displayName: p.n || 'Someone', name: p.n || 'Someone', avatar: '' };
        meta = { at: p.t };
      } else {
        if (!(await GS.cloud.ready)) return notConfigured(root, 'This link');
        post = await GS.cloud.getPostBySlug(route.slug);
        if (!post) return notice(root, 'This graph isn’t here', 'It may have been unpublished, or the link has a typo.', [['See the community', R().href('community'), 'primary']]);
        doc = C.normalize(post.doc);
        author = (await GS.cloud.getProfile(post.owner).catch(() => null)) || { uid: post.owner, displayName: post.ownerName, username: post.ownerUsername };
        meta = { at: post.publishedAt, updated: post.updatedAt };
      }
    } catch (e) {
      console.warn(e);
      return notice(root, 'This link looks broken', 'Part of it may be missing. Ask whoever sent it to copy it again.', [['Open the studio', R().href('studio'), 'primary']]);
    }
    const title = (post && post.title) || doc.title || 'Untitled graph';
    const desc = (post && post.description) || doc.subtitle || '';
    document.title = `${title} – Graph Studio`;
    GS.router.setWallpaper(doc.look.wallpaper);
    const series = C.seriesOf(doc);
    const rows = C.rowsOf(doc);
    const f = (v) => C.fmtNum(v, doc.fmt);
    const pathLabel = route.packed ? 'shared link' : `graph/${route.slug}`;
    const all = [];
    rows.forEach((r) => series.forEach((s) => { if (!s.hidden && r.values[s.id] !== undefined) all.push(r.values[s.id]); }));
    const st = C.statsOf(all);
    const profileHref = author.username ? R().href('u/' + author.username) : null;
    root.innerHTML = `<div class="page pv ${embed ? 'pv-embed' : ''}">
      ${embed ? '' : `<header class="pv-head rise" style="--d:0">
        ${profileHref ? `<a href="${esc(profileHref)}" data-link class="pv-av">${U.avatar(author, 60)}</a>` : `<span class="pv-av">${U.avatar(author, 60)}</span>`}
        <div class="pv-titles"><h1>${esc(title)}</h1>${desc ? `<p class="pv-desc">${esc(desc)}</p>` : ''}
          <p class="pv-meta">Made by ${profileHref ? `<a href="${esc(profileHref)}" data-link>${esc(author.displayName || 'Someone')}</a>` : `<b>${esc(author.displayName || 'Someone')}</b>`}${meta.at ? `<span>${esc(new Date(meta.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</span>` : ''}</p></div>
        <div class="pv-acts">
          ${post ? `<button class="like" type="button" id="pvLike" aria-pressed="false" aria-label="Like">${icon('heart')}<b></b></button>` : ''}
          <button class="btn" type="button" id="pvCopy">${icon('link')}<span>Copy link</span></button>
          <button class="btn primary" type="button" id="pvRemix">${icon('pencil')}<span>Remix in studio</span></button>
        </div></header>`}
      <div class="pv-grid">
        <article class="post pv-chart rise" style="--d:1">
          <div class="pv-bar"><span class="pv-path">${icon(C.TYPE[doc.type].icon)}${esc(pathLabel)}</span><button class="icon-btn sm" type="button" id="pvReplay" data-tip="Replay animation" aria-label="Replay animation">${icon('play')}</button>${embed ? `<a class="btn sm" href="${esc(location.href.replace(/[?&]embed=1/, ''))}" target="_blank" rel="noopener">Open</a>` : ''}</div>
          <div class="stage pv-stage"><canvas id="pvCanvas" role="img" aria-label="${esc(C.TYPE[doc.type].name)} graph: ${esc(title)}"></canvas></div>
          <div class="legend-strip ro" id="pvLegend"></div>
        </article>
        ${embed ? '' : `<aside class="pv-side">
          <article class="post pv-creator rise" style="--d:2">${U.avatar(author, 64)}<div><b>${esc(author.displayName || 'Someone')}</b>${author.username ? `<span class="handle">@${esc(author.username)}</span>` : ''}${author.bio ? `<p>${esc(author.bio)}</p>` : ''}${profileHref ? `<a class="btn sm" href="${esc(profileHref)}" data-link>See profile</a>` : ''}</div></article>
          <article class="post pv-stats rise" style="--d:3"><h2>At a glance</h2><div class="stats mini">
            ${[['sum', 'Total'], ['mean', 'Average'], ['max', 'Highest'], ['min', 'Lowest']].map(([k, n]) => `<div class="stat"><span class="stat-n">${n}</span><b class="stat-v" data-k="${k}">–</b></div>`).join('')}</div></article>
        </aside>
        <article class="post pv-table rise" style="--d:4"><header class="post-head"><h2>Data</h2><span class="muted small">Hover a row to find it on the graph</span></header>
          <div class="grid-scroll"><table class="dtable"><thead><tr><th>${esc(doc.axes.cat.title || (doc.type === 'scatter' ? 'X' : 'Label'))}</th>${series.map((s) => `<th><span class="dot static" style="--c:${s.color}"></span>${esc(s.name)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r, i) => `<tr data-i="${i}"><td>${C.isRowColored(doc) ? `<span class="dot static" style="--c:${r.color}"></span>` : ''}${esc(r.label)}</td>${series.map((s) => `<td class="num">${esc(f(r.values[s.id]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></article>`}
      </div>
      ${embed ? '' : `<footer class="pv-foot">Made with Graph Studio. <a href="${esc(R().href('studio'))}" data-link>Make your own graph</a></footer>`}
    </div>`;
    const canvas = $('#pvCanvas', root);
    let chart = null;
    const play = () => { if (chart) chart.destroy(); chart = E.create(canvas, doc, { interactive: true, hover: true, showTitle: false }); };
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); setTimeout(play, embed ? 0 : 220); } });
    io.observe(canvas);
    $('#pvReplay', root).addEventListener('click', play);
    const legend = $('#pvLegend', root);
    const items = C.isRowColored(doc) ? rows.map((r) => [r.label, r.color]) : series.filter((s) => !s.hidden).map((s) => [s.name, s.color]);
    legend.innerHTML = items.length > 1 ? items.map(([n, c]) => `<span class="chip"><span class="dot static" style="--c:${c}"></span><span class="chip-name">${esc(n)}</span></span>`).join('') : '';
    if (!embed) {
      $$('.pv-stats .stat-v', root).forEach((el) => setTimeout(() => U.countUp(el, st[el.dataset.k], f), 500));
      C.on(root, 'pointerover', '.dtable tbody tr', (e, tr) => {
        if (!chart || C.TYPE[doc.type].circular && !chart.getDataVisibility(Number(tr.dataset.i))) return;
        const i = Number(tr.dataset.i);
        const els = [];
        chart.data.datasets.forEach((ds, di) => { if (chart.isDatasetVisible(di) && chart.getDatasetMeta(di).data[i]) els.push({ datasetIndex: di, index: i }); });
        if (!els.length || doc.type === 'scatter') return;
        chart.setActiveElements(els);
        chart.tooltip.setActiveElements(els, { x: 0, y: 0 });
        chart.update();
      });
      C.on(root, 'pointerout', '.dtable tbody', (e) => { if (chart && !e.currentTarget) return; if (chart && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.dtable tbody'))) { chart.setActiveElements([]); chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update(); } });
      $('#pvCopy', root).addEventListener('click', async (e) => {
        const url = route.packed ? location.href : R().absolute(`graph/${route.slug}/preview`, false);
        await C.copyText(url);
        U.toast('Link copied', { icon: 'link' });
      });
      $('#pvRemix', root).addEventListener('click', () => {
        const copy = C.clone(doc);
        copy.title = title;
        C.Library.create(C.normalize(copy));
        R().go('studio');
        setTimeout(() => U.toast('Remixed. This copy is yours to change.', { icon: 'pencil' }), 300);
      });
      const like = $('#pvLike', root);
      if (like && post) {
        GS.cloud.likes(post.pid).then((l) => setLikeBtn(like, l)).catch(() => {});
        like.addEventListener('click', () => toggleLike(like, post.pid));
      }
    }
    return () => { io.disconnect(); if (chart) chart.destroy(); document.documentElement.classList.remove('embed'); };
  }

  GS.pages = { authModal, profileModal, settingsModal, community, profilePage, preview };
})();
