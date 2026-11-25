/* Graph Studio · interface pieces
   Toasts, sheets (modals), popovers, colour picker, menus, tooltips,
   the command palette and the little celebration effects. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});
  const C = GS.core;
  const { h, esc } = C;
  const icon = (n, c) => GS.icon(n, c);

  /* ---------- layers: Escape always closes the top-most thing ---------- */
  const layers = [];
  function pushLayer(close) { layers.push(close); return () => { const i = layers.indexOf(close); if (i >= 0) layers.splice(i, 1); }; }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layers.length) { e.preventDefault(); e.stopPropagation(); layers[layers.length - 1](); }
  }, true);

  /* ---------- toasts ---------- */
  function toast(msg, opts) {
    opts = opts || {};
    const root = document.getElementById('toasts');
    const el = h(`<div class="toast ${opts.tone ? 'toast-' + opts.tone : ''}" role="status">${opts.icon ? icon(opts.icon) : ''}<span>${esc(msg)}</span>${opts.action ? `<button class="toast-act" type="button">${esc(opts.action.label)}</button>` : ''}</div>`);
    root.appendChild(el);
    while (root.children.length > 3) root.firstElementChild.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    let closed = false;
    const close = () => { if (closed) return; closed = true; el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 280); };
    if (opts.action) el.querySelector('.toast-act').addEventListener('click', () => { opts.action.fn(); close(); });
    setTimeout(close, opts.ms || (opts.action ? 5200 : 2800));
    return close;
  }

  /* ---------- sheets / modals ---------- */
  function modal(opts) {
    opts = opts || {};
    const back = h(`<div class="sheet-back"><div class="sheet ${opts.className || ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || 'Dialog')}"${opts.width ? ` style="--w:${opts.width}px"` : ''}>
      ${opts.title !== undefined ? `<header class="sheet-head"><h2>${esc(opts.title)}</h2><button class="icon-btn sheet-x" type="button" aria-label="Close">${icon('x')}</button></header>` : ''}
      <div class="sheet-body"></div></div></div>`);
    const body = back.querySelector('.sheet-body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    document.body.appendChild(back);
    const prev = document.activeElement;
    requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('in')));
    let closed = false;
    let unlayer;
    function close(val) {
      if (closed) return;
      closed = true;
      unlayer();
      back.classList.remove('in');
      back.classList.add('out');
      setTimeout(() => back.remove(), 260);
      if (opts.onClose) opts.onClose(val);
      if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
    }
    unlayer = pushLayer(() => close());
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    const x = back.querySelector('.sheet-x');
    if (x) x.addEventListener('click', () => close());
    back.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = Array.from(back.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((n) => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    setTimeout(() => { const f = back.querySelector('[autofocus]') || back.querySelector('.sheet-body input, .sheet-body button'); if (f) f.focus({ preventScroll: true }); }, 80);
    return { el: back.querySelector('.sheet'), body, close };
  }
  function confirm(text, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let answer = false;
      const m = modal({
        title: opts.title || 'Are you sure?',
        width: 420,
        body: `<p class="muted">${esc(text)}</p><div class="sheet-actions"><button class="btn" type="button" data-a="no">${esc(opts.cancelText || 'Cancel')}</button><button class="btn ${opts.danger ? 'danger' : 'primary'}" type="button" data-a="yes" autofocus>${esc(opts.okText || 'OK')}</button></div>`,
        onClose: () => resolve(answer),
      });
      m.body.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; answer = b.dataset.a === 'yes'; m.close(); });
    });
  }

  /* ---------- popovers ---------- */
  let openPop = null;
  function popover(anchor, content, opts) {
    opts = opts || {};
    if (openPop) openPop.close();
    const el = h(`<div class="pop ${opts.className || ''}" role="dialog"></div>`);
    if (typeof content === 'string') el.innerHTML = content; else el.appendChild(content);
    document.body.appendChild(el);
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const pw = el.offsetWidth, ph = el.offsetHeight, m = 8;
      let x = opts.align === 'end' ? r.right - pw : opts.align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
      let y = opts.side === 'top' ? r.top - ph - m : r.bottom + m;
      if (y + ph > innerHeight - 8) y = r.top - ph - m;
      if (y < 8) y = Math.min(innerHeight - ph - 8, r.bottom + m);
      x = C.clamp(x, 8, innerWidth - pw - 8);
      el.style.left = x + 'px';
      el.style.top = Math.max(8, y) + 'px';
      el.style.transformOrigin = `${C.clamp(r.left + r.width / 2 - x, 0, pw)}px ${y > r.top ? 0 : ph}px`;
    };
    place();
    requestAnimationFrame(() => el.classList.add('in'));
    let closed = false;
    const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) api.close(); };
    const onScroll = (e) => { if (!el.contains(e.target)) api.close(); };
    const unlayer = pushLayer(() => api.close());
    const api = {
      el,
      close() {
        if (closed) return;
        closed = true;
        unlayer();
        document.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', api.close);
        el.classList.remove('in');
        el.classList.add('out');
        setTimeout(() => el.remove(), 180);
        if (openPop === api) openPop = null;
        if (opts.onClose) opts.onClose();
      },
      place,
    };
    setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', api.close);
    });
    openPop = api;
    return api;
  }

  function menu(anchor, items, opts) {
    const box = h('<div class="menu" role="menu"></div>');
    items.forEach((it) => {
      if (!it) return;
      if (it.divider) { box.appendChild(h('<div class="menu-div"></div>')); return; }
      if (it.heading) { box.appendChild(h(`<div class="menu-head">${esc(it.heading)}</div>`)); return; }
      const b = h(`<button class="menu-item ${it.danger ? 'danger' : ''} ${it.on ? 'on' : ''}" role="menuitem" type="button" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon) : '<span class="ic"></span>'}<span>${esc(it.label)}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}${it.on ? icon('check', 'menu-check') : ''}</button>`);
      b.addEventListener('click', () => { pop.close(); it.run && it.run(); });
      box.appendChild(b);
    });
    const pop = popover(anchor, box, Object.assign({ className: 'pop-menu' }, opts));
    const first = box.querySelector('.menu-item:not([disabled])');
    if (first) first.focus({ preventScroll: true });
    box.addEventListener('keydown', (e) => {
      const list = Array.from(box.querySelectorAll('.menu-item:not([disabled])'));
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    });
    return pop;
  }

  /* ---------- colour picker ---------- */
  function colorPicker(anchor, value, onPick, opts) {
    opts = opts || {};
    value = C.normHex(value || '#338ced');
    const box = h(`<div class="cp">
      ${opts.title ? `<div class="cp-title">${esc(opts.title)}</div>` : ''}
      <div class="cp-grid">${C.SWATCHES.map((c) => `<button type="button" class="cp-sw" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
      <div class="cp-row">
        <label class="cp-native" style="--c:${value}" aria-label="Pick any colour"><input type="color" value="${value}"></label>
        <input class="cp-hex" value="${value}" spellcheck="false" maxlength="7" aria-label="Hex colour">
      </div></div>`);
    const hex = box.querySelector('.cp-hex');
    const nat = box.querySelector('input[type=color]');
    const mark = (c) => {
      box.querySelectorAll('.cp-sw').forEach((b) => b.classList.toggle('on', b.dataset.c === c));
      box.querySelector('.cp-native').style.setProperty('--c', c);
      if (document.activeElement !== hex) hex.value = c;
      nat.value = c;
    };
    const pick = (c) => { c = C.normHex(c); mark(c); onPick(c); };
    mark(value);
    box.addEventListener('click', (e) => { const b = e.target.closest('.cp-sw'); if (b) pick(b.dataset.c); });
    nat.addEventListener('input', () => pick(nat.value));
    hex.addEventListener('input', () => { if (C.validHex(hex.value)) pick(hex.value); });
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') pop.close(); });
    const pop = popover(anchor, box, { className: 'pop-cp' });
    return pop;
  }

  /* ---------- tooltips for [data-tip] ---------- */
  let tipEl = null, tipTimer = null, tipFor = null;
  function hideTip() { clearTimeout(tipTimer); tipFor = null; if (tipEl) tipEl.classList.remove('in'); }
  function showTip(t) {
    if (!document.contains(t)) return;
    if (!tipEl) { tipEl = h('<div class="tip" role="tooltip"></div>'); document.body.appendChild(tipEl); }
    tipEl.textContent = t.dataset.tip;
    const r = t.getBoundingClientRect();
    const w = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let y = r.top - th - 8;
    if (y < 6) y = r.bottom + 8;
    tipEl.style.left = C.clamp(r.left + r.width / 2 - w / 2, 6, innerWidth - w - 6) + 'px';
    tipEl.style.top = y + 'px';
    tipEl.classList.add('in');
  }
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || t === tipFor || e.pointerType === 'touch') return;
    hideTip();
    tipFor = t;
    tipTimer = setTimeout(() => showTip(t), 420);
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && !t.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener('pointerdown', hideTip, true);
  window.addEventListener('scroll', hideTip, true);

  /* ---------- celebration ---------- */
  const reduce = () => C.prefs.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function confetti(x, y, colors, count) {
    if (reduce()) return;
    colors = colors && colors.length ? colors : [C.accentSet(C.prefs.accent).light, '#338ced', '#ffb84d', '#2fd39a', '#9887ef'];
    count = count || 28;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 120;
      const p = h('<i class="confetto"></i>');
      p.style.cssText = `left:${x}px;top:${y}px;--c:${colors[i % colors.length]};--dx:${Math.cos(a) * v}px;--dy:${Math.sin(a) * v - 70}px;--fall:${90 + Math.random() * 90}px;--r:${Math.random() * 720 - 360}deg;--d:${700 + Math.random() * 500}ms;--w:${5 + Math.random() * 5}px`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1300);
    }
  }
  function emojiBurst(emoji, x, y) {
    const big = h(`<span class="emoji-burst" aria-hidden="true">${esc(emoji)}</span>`);
    big.style.left = x + 'px';
    big.style.top = y + 'px';
    document.body.appendChild(big);
    setTimeout(() => big.remove(), 1500);
    if (reduce()) return;
    for (let i = 0; i < 5; i++) {
      const s = h(`<span class="emoji-bit" aria-hidden="true">${esc(emoji)}</span>`);
      s.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.random() - 0.5) * 120}px;--dy:${-50 - Math.random() * 80}px;--r:${(Math.random() - 0.5) * 80}deg;--d:${800 + Math.random() * 500}ms`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1400);
    }
  }
  function countUp(el, value, format) {
    const to = typeof value === 'number' && isFinite(value) ? value : null;
    if (to === null) { el.textContent = '–'; el.dataset.v = ''; return; }
    const from = el.dataset.v === undefined || el.dataset.v === '' ? 0 : Number(el.dataset.v);
    el.dataset.v = String(to);
    if (reduce() || from === to) { el.textContent = format(to); return; }
    const t0 = performance.now();
    const dur = 650;
    const id = (el.$count = (el.$count || 0) + 1);
    const step = (t) => {
      if (el.$count !== id) return;
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = format(k === 1 ? to : from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- accent colour ---------- */
  // Sets every accent CSS variable from one colour, and recolours the tab icon.
  function applyAccent(hex, instant) {
    const a = C.accentSet(hex);
    const root = document.documentElement;
    if (instant) root.style.transition = 'none';
    const vars = {
      '--accent': a.main, '--accent-2': a.light, '--accent-btn': a.btn, '--on-accent': a.on,
      '--accent-soft': C.rgba(a.main, 0.16), '--accent-line': C.rgba(a.main, 0.45),
      '--accent-glow': C.rgba(a.main, 0.6), '--accent-faint': C.rgba(a.main, 0.1),
    };
    Object.keys(vars).forEach((k) => root.style.setProperty(k, vars[k]));
    if (instant) { void root.offsetWidth; requestAnimationFrame(() => { root.style.transition = ''; }); }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="${a.main}"/><path d="M10 22v-5M16 22V10M22 22v-8" stroke="${a.on}" stroke-width="3.2" stroke-linecap="round"/></svg>`;
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) icon.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    C.bus.emit('accent', a);
    return a;
  }
  function setAccent(hex) {
    C.prefs.accent = C.normHex(hex);
    C.savePrefs();
    return applyAccent(C.prefs.accent);
  }

  /* ---------- avatars ---------- */
  function initials(name) {
    const p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function hashColor(s) {
    let x = 0;
    for (const ch of String(s || '')) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return C.PALETTES.candy.colors[x % C.PALETTES.candy.colors.length];
  }
  function avatar(p, size, extra) {
    size = size || 32;
    p = p || {};
    const name = p.displayName || p.name || p.username || '?';
    const a = p.avatar || '';
    if (/^data:image\//.test(a)) return `<span class="av ${extra || ''}" style="--s:${size}px"><img src="${esc(a)}" alt=""></span>`;
    const bg = /^color:#[0-9a-f]{6}$/i.test(a) ? a.slice(6) : hashColor(p.uid || name);
    return `<span class="av ${extra || ''}" style="--s:${size}px;--c:${bg};color:${C.inkOn(bg)}"><b>${esc(initials(name))}</b></span>`;
  }

  /* ---------- command palette ---------- */
  function commandPalette(commands) {
    const box = h(`<div class="cmdk"><div class="cmdk-in">${icon('search')}<input placeholder="Type a command…" aria-label="Command" spellcheck="false"><kbd>esc</kbd></div><div class="cmdk-list" role="listbox"></div></div>`);
    const input = box.querySelector('input');
    const list = box.querySelector('.cmdk-list');
    let sel = 0, shown = [];
    const m = modal({ body: box, className: 'sheet-cmdk', width: 560 });
    const render = () => {
      const q = input.value.trim().toLowerCase();
      shown = commands.filter((c) => !q || (c.label + ' ' + (c.keywords || '')).toLowerCase().includes(q)).slice(0, 12);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length
        ? shown.map((c, i) => `<button type="button" class="cmdk-item ${i === sel ? 'on' : ''}" data-i="${i}" role="option">${icon(c.icon || 'zap')}<span>${esc(c.label)}</span>${c.hint ? `<kbd>${esc(c.hint)}</kbd>` : ''}</button>`).join('')
        : '<p class="cmdk-empty">No command matches that.</p>';
    };
    const run = (i) => { const c = shown[i]; if (!c) return; m.close(); setTimeout(() => c.run(), 30); };
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); render(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); render(); }
      if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    });
    list.addEventListener('click', (e) => { const b = e.target.closest('.cmdk-item'); if (b) run(Number(b.dataset.i)); });
    render();
    setTimeout(() => input.focus(), 60);
  }

  /* ---------- small form helpers ---------- */
  function seg(name, options, value) {
    return `<div class="seg" role="radiogroup" data-seg="${esc(name)}">${options.map((o) => `<button type="button" role="radio" aria-checked="${String(o[0]) === String(value)}" data-v="${esc(o[0])}" class="${String(o[0]) === String(value) ? 'on' : ''}">${o[2] ? icon(o[2]) : ''}${o[1] ? `<span>${esc(o[1])}</span>` : ''}</button>`).join('')}</div>`;
  }
  function setSeg(el, value) {
    el.querySelectorAll('button').forEach((b) => { const on = b.dataset.v === String(value); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  }

  GS.ui = { applyAccent, setAccent, toast, modal, confirm, popover, menu, colorPicker, confetti, emojiBurst, countUp, avatar, initials, hashColor, commandPalette, seg, setSeg, pushLayer, reduce, hideTip };
})();
