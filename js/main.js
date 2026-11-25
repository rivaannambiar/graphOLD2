/* Graph Studio · app shell
   Routing (pretty links or #links), the top bar, and start-up. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});
  const C = GS.core, U = GS.ui;
  const { $, esc } = C;
  const icon = (n, c) => GS.icon(n, c);
  const BASE = window.GS_BASE || '/';
  const cfgRouting = ((window.GRAPH_STUDIO_CONFIG || {}).routing || 'auto').toLowerCase();
  let mode = 'hash';
  let view = null; // { name, cleanup }
  let current = { name: 'studio' };

  /* ---------- which kind of links work on this host ---------- */
  async function detectMode() {
    if (cfgRouting === 'hash' || cfgRouting === 'path') return cfgRouting;
    if (location.protocol === 'file:') return 'hash';
    const rel = location.pathname.slice(BASE.length).replace(/^index\.html$/, '');
    if (rel || new URLSearchParams(location.search).has('r')) return 'path';
    if (/\.(netlify\.app|github\.io|vercel\.app|pages\.dev)$/i.test(location.hostname)) return 'path';
    try {
      const res = await fetch(BASE + 'community', { cache: 'no-store' });
      if (res.ok) return 'path';
      if ((await res.text()).includes('graph-studio-404')) return 'path';
    } catch (e) { /* ignore */ }
    return 'hash';
  }

  function parse(str) {
    const [path, query] = String(str || '').split('?');
    const q = new URLSearchParams(query || '');
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (!seg.length || seg[0] === 'index.html') return { name: 'studio' };
    if (seg[0] === 'studio') return seg[1] ? { name: 'studio', gid: seg[1], join: q.get('join') } : { name: 'studio' };
    if (seg[0] === 'graph' && seg[1]) return { name: 'preview', slug: seg[1].toLowerCase(), embed: q.get('embed') === '1' };
    if (seg[0] === 'view' && seg[1]) return { name: 'preview', packed: seg[1], embed: q.get('embed') === '1' };
    if (seg[0] === 'community') return { name: 'community' };
    if (seg[0] === 'u' && seg[1]) return { name: 'profile', username: seg[1].toLowerCase() };
    return { name: 'missing' };
  }
  function readLocation() {
    const params = new URLSearchParams(location.search);
    if (params.has('r')) {
      // Arrived through 404.html on GitHub Pages: restore the pretty URL.
      const r = params.get('r');
      history.replaceState(null, '', BASE + r.replace(/^\//, '') + location.hash);
    }
    if (location.hash.startsWith('#/')) return parse(location.hash.slice(2));
    return parse(location.pathname.slice(BASE.length) + location.search);
  }

  const router = {
    get mode() { return mode; },
    current: () => current,
    href(path) { path = String(path || '').replace(/^\//, ''); return mode === 'path' ? BASE + path : BASE + (path ? '#/' + path : ''); },
    absolute(path, forceHash) {
      path = String(path || '').replace(/^\//, '');
      const origin = location.protocol === 'file:' ? location.href.split('#')[0].replace(/[^/]*$/, '') : location.origin + BASE;
      return mode === 'path' && !forceHash ? origin + path : origin + '#/' + path;
    },
    go(path) {
      const href = router.href(path);
      if (mode === 'path') { history.pushState(null, '', href); render(); }
      else if (location.hash === href.slice(href.indexOf('#'))) render();
      else location.hash = '#/' + String(path || '').replace(/^\//, '');
      window.scrollTo(0, 0);
    },
    replace(path) {
      const href = router.href(path);
      if (mode === 'path') history.replaceState(null, '', href);
      else history.replaceState(null, '', location.pathname + location.search + '#/' + String(path || '').replace(/^\//, ''));
      current = parse(String(path || ''));
    },
    setWallpaper(key) {
      const w = C.WALLPAPERS[key] || C.WALLPAPERS.dusk;
      document.documentElement.style.setProperty('--wall', w.css);
    },
  };
  GS.router = router;

  /* ---------- top bar ---------- */
  function topbar() {
    const bar = $('#topbar');
    const u = GS.cloud.user, p = GS.cloud.profile;
    const tab = current.name === 'community' || current.name === 'profile' ? 'community' : current.name === 'studio' ? 'studio' : '';
    bar.innerHTML = `
      <a class="brand" href="${esc(router.href('studio'))}" data-link aria-label="Graph Studio home"><span class="brand-mark">${icon('bar')}</span><span class="brand-name">Graph Studio</span></a>
      <nav class="nav">
        <a href="${esc(router.href('studio'))}" data-link class="${tab === 'studio' ? 'on' : ''}">Studio</a>
        <a href="${esc(router.href('community'))}" data-link class="${tab === 'community' ? 'on' : ''}">Community</a>
        <button type="button" id="tbGraphs">My graphs</button>
      </nav>
      <span class="grow"></span>
      <button class="icon-btn" type="button" id="tbCmd" data-tip="Command menu  ⌘K" aria-label="Command menu">${icon('command')}</button>
      <button class="icon-btn gear" type="button" id="tbSettings" data-tip="Settings" aria-label="Settings">${icon('settings')}</button>
      ${u ? `<button class="me" type="button" id="tbMe" aria-label="Your account">${U.avatar(p ? Object.assign({ uid: u.uid }, p) : { uid: u.uid, name: u.email || '?' }, 32)}</button>`
          : `<button class="btn sm" type="button" id="tbSignin">${icon('login')}<span>Sign in</span></button>`}`;
    $('#tbSettings').addEventListener('click', () => GS.pages.settingsModal());
    $('#tbCmd').addEventListener('click', openCommands);
    $('#tbGraphs').addEventListener('click', () => { if (current.name === 'studio' && GS.studio.doc) GS.studio.libraryDialog(); else { router.go('studio'); setTimeout(() => GS.studio.libraryDialog(), 400); } });
    const si = $('#tbSignin');
    if (si) si.addEventListener('click', () => GS.pages.authModal());
    const me = $('#tbMe');
    if (me) me.addEventListener('click', () => U.menu(me, [
      p && { heading: p.displayName + ' (@' + p.username + ')' },
      p && { label: 'My profile', icon: 'user', run: () => router.go('u/' + p.username) },
      { label: p ? 'Edit profile' : 'Set up profile', icon: 'pencil', run: () => GS.pages.profileModal() },
      { label: 'My graphs', icon: 'grid', run: () => $('#tbGraphs').click() },
      { divider: true },
      { label: 'Sign out', icon: 'logout', run: async () => { await GS.cloud.signOut(); U.toast('Signed out'); } },
    ], { align: 'end' }));
  }
  function openCommands() {
    if (current.name === 'studio' && GS.studio.doc) return U.commandPalette(GS.studio.commands());
    U.commandPalette([
      { label: 'Open the studio', icon: 'bar', run: () => router.go('studio') },
      { label: 'Community wall', icon: 'globe', run: () => router.go('community') },
      { label: 'My graphs', icon: 'grid', run: () => $('#tbGraphs').click() },
      { label: 'Settings', icon: 'settings', run: () => GS.pages.settingsModal() },
      { label: 'Change accent colour', icon: 'palette', keywords: 'theme color colour', run: () => GS.pages.settingsModal() },
    ]);
  }

  /* ---------- views ---------- */
  async function render() {
    const next = readLocation();
    const root = $('#app');
    if (view && view.cleanup) { try { view.cleanup(); } catch (e) { console.warn(e); } }
    if (view && view.name === 'studio') GS.studio.unmount();
    U.hideTip();
    current = next;
    view = { name: next.name, cleanup: null };
    document.documentElement.dataset.view = next.name;
    document.documentElement.classList.remove('embed');
    topbar();
    root.classList.remove('view-in');
    void root.offsetWidth;
    root.classList.add('view-in');
    if (next.name === 'studio') await GS.studio.mount(root, next);
    else if (next.name === 'community') view.cleanup = await GS.pages.community(root);
    else if (next.name === 'profile') view.cleanup = await GS.pages.profilePage(root, next);
    else if (next.name === 'preview') view.cleanup = await GS.pages.preview(root, next);
    else {
      router.setWallpaper('dusk');
      root.innerHTML = `<div class="page-msg"><div class="blocker-card">${icon('help')}<h2>There’s nothing at this address</h2><p>Check the link, or head back to your graphs.</p><div class="blocker-acts"><a class="btn primary" href="${esc(router.href('studio'))}" data-link>Open the studio</a></div></div></div>`;
    }
  }

  async function boot() {
    document.documentElement.classList.toggle('reduce', !!C.prefs.reduceMotion);
    U.applyAccent(C.prefs.accent, true);
    if (!window.Chart) {
      $('#app').innerHTML = '<div class="page-msg"><div class="blocker-card"><h2>Couldn’t load the graph library</h2><p>Check your internet connection and reload. Graph Studio loads Chart.js from cdn.jsdelivr.net.</p></div></div>';
      return;
    }
    GS.engine.register();
    mode = await detectMode();
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-link]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      const path = mode === 'path' ? url.pathname.slice(BASE.length) + url.search : (url.hash || '#/').slice(2);
      router.go(path);
    });
    window.addEventListener('popstate', () => { if (mode === 'path') render(); });
    window.addEventListener('hashchange', () => { if (mode === 'hash' || location.hash.startsWith('#/')) render(); });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === 'k' && current.name !== 'studio') { e.preventDefault(); openCommands(); }
    });
    C.bus.on('auth', () => topbar());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => C.bus.emit('fonts'));
    GS.cloud.init();
    if (!location.hash.startsWith('#/') && mode === 'hash') {
      const rel = location.pathname.slice(BASE.length).replace(/^index\.html$/, '');
      if (rel) history.replaceState(null, '', BASE + '#/' + rel + location.search);
    }
    await render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
