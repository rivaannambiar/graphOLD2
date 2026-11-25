/* Graph Studio · the studio board
   Chart post, data grid, stats, customize panel, the + button,
   zoom tools, undo/redo, and live collaboration with cursors. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});
  const C = GS.core, U = GS.ui, E = GS.engine, X = GS.exporters;
  const { $, $$, esc, h } = C;
  const icon = (n, c) => GS.icon(n, c);

  const S = {
    root: null, doc: null, mode: 'local', localId: null, gid: null, meta: null, members: {},
    chart: null, tool: C.prefs.tool || 'pointer', panelOpen: false, tab: 'series', statsSel: 'all',
    hist: { undo: [], redo: [], key: null, t: 0 },
    gridSig: '', gridRows: new Set(), legendSig: '', statsSig: '', panelSig: '',
    pending: null, remoteFlash: false, fabOpen: false, focus: false,
    unwatch: null, pres: null, peers: {}, cursorEls: {}, raf: 0, myColor: '#ff5ca2', lastPointer: null,
    cleanups: [], saveState: 'saved', fabLayer: null, focusLayer: null,
  };
  const TABS = [['series', 'Series', 'layers'], ['axes', 'Axes', 'ruler'], ['legend', 'Legend', 'list'], ['look', 'Look', 'palette'], ['motion', 'Motion', 'zap']];
  const PRESETS = [
    ['rise', 'Rise', 'Grows up from the axis'], ['cascade', 'Cascade', 'One after another'], ['pop', 'Pop', 'Overshoots, then settles'],
    ['bounce', 'Bounce', 'Drops in and bounces'], ['draw', 'Draw', 'Lines draw themselves'], ['spin', 'Spin', 'Pies sweep round'], ['none', 'None', 'Appears instantly'],
  ];
  const REACTIONS = ['🎉', '👍', '❤️', '🔥', '😂', '👀'];
  const fmtCell = (v) => (v === undefined || v === null ? '' : String(v));
  const typeInfo = () => C.TYPE[S.doc.type] || C.TYPE.bar;
  const router = () => GS.router;

  /* ======================= template ======================= */
  function template() {
    return `
<div class="studio" id="studio">
  <div class="board-wrap">
    <header class="board-head" data-anchor="head">
      <div class="bh-left">
        <div class="bh-avatar" id="bhAvatar"></div>
        <div class="bh-titles">
          <input id="docTitle" class="bh-title" aria-label="Graph title" maxlength="120" spellcheck="false" autocomplete="off">
          <textarea id="docSub" class="bh-sub" rows="1" aria-label="Description" placeholder="Add a short description" maxlength="300"></textarea>
          <div class="bh-meta"><span class="save-dot" id="saveDot"></span><span id="saveText">Saved on this device</span></div>
        </div>
      </div>
      <div class="bh-actions">
        <div class="presence" id="presence"></div>
        <button class="icon-btn" id="btnUndo" type="button" data-tip="Undo  ⌘Z" aria-label="Undo">${icon('undo')}</button>
        <button class="icon-btn" id="btnRedo" type="button" data-tip="Redo  ⇧⌘Z" aria-label="Redo">${icon('redo')}</button>
        <button class="btn" id="btnCustomize" type="button" aria-expanded="false">${icon('sliders')}<span>Customize</span></button>
        <button class="btn" id="btnExport" type="button">${icon('download')}<span>Export</span></button>
        <button class="btn primary" id="btnShare" type="button">${icon('share')}<span>Share</span></button>
      </div>
    </header>

    <main class="board" id="board">
      <article class="post post-chart" id="chartPost" data-anchor="chart">
        <div class="types-scroll"><div class="types" id="types" role="tablist" aria-label="Graph type">
          <span class="types-ind" id="typesInd"></span>
          ${C.TYPES.map((t) => `<button class="type" type="button" role="tab" data-t="${t.id}" aria-selected="false">${icon(t.icon)}<span>${t.name}</span></button>`).join('')}
        </div></div>
        <div class="stage" id="stage">
          <canvas id="chartCanvas" role="img" aria-label="Graph"></canvas>
          <div class="stage-empty" id="stageEmpty">
            <p><b>Nothing to draw yet.</b> Type some numbers into the data table and they’ll appear here.</p>
            <button class="btn sm" type="button" data-act="samples">${icon('table')}<span>Try sample data</span></button>
          </div>
        </div>
        <div class="chart-foot">
          <div class="legend-strip" id="legendStrip" aria-label="Series"></div>
          <div class="tools" id="tools">
            <div class="zoom-tools">
              ${U.seg('tool', [['pointer', '', 'pointer'], ['hand', '', 'hand'], ['zoom', '', 'boxZoom']], S.tool).replace('class="seg"', 'class="seg seg-icons" id="toolSeg"')}
              <button class="icon-btn sm" type="button" data-act="zoom-out" data-tip="Zoom out" aria-label="Zoom out">${icon('zoomOut')}</button>
              <span class="zoom-read" id="zoomRead">100%</span>
              <button class="icon-btn sm" type="button" data-act="zoom-in" data-tip="Zoom in" aria-label="Zoom in">${icon('zoomIn')}</button>
              <button class="icon-btn sm" type="button" data-act="zoom-reset" id="btnZoomReset" data-tip="Reset zoom  0" aria-label="Reset zoom">${icon('reset')}</button>
              <span class="tools-sep"></span>
            </div>
            <button class="icon-btn sm" type="button" data-act="replay" data-tip="Replay animation  R" aria-label="Replay animation">${icon('play')}</button>
            <button class="icon-btn sm" type="button" data-act="focus" id="btnFocus" data-tip="Focus mode  F" aria-label="Focus mode">${icon('maximize')}</button>
          </div>
        </div>
      </article>

      <article class="post post-data" id="dataPost" data-anchor="data">
        <header class="post-head">
          <h2>Data</h2>
          <div class="post-acts">
            <button class="icon-btn sm" type="button" data-act="import" data-tip="Paste or import data" aria-label="Paste or import data">${icon('upload')}</button>
            <button class="icon-btn sm" type="button" data-act="add-series" data-tip="Add series" aria-label="Add series">${icon('layers')}</button>
          </div>
        </header>
        <div class="grid-scroll"><table class="grid" id="grid"></table></div>
        <button class="add-row" id="addRow" type="button">${icon('plus')}<span>Add row</span></button>
      </article>

      <article class="post post-stats" id="statsPost" data-anchor="stats">
        <header class="post-head"><h2>Stats</h2><div class="stats-pick" id="statsPick"></div></header>
        <div class="stats" id="stats">
          ${[['sum', 'Total'], ['mean', 'Average'], ['median', 'Median'], ['max', 'Highest'], ['min', 'Lowest'], ['sd', 'Std deviation'], ['range', 'Range'], ['count', 'Values']]
            .map(([k, n]) => `<div class="stat" data-k="${k}"><span class="stat-n">${n}</span><b class="stat-v" data-v="">–</b><span class="stat-sub"></span></div>`).join('')}
        </div>
      </article>
    </main>
  </div>

  <aside class="panel" id="panel" aria-label="Customize" data-anchor="panel">
    <header class="panel-head"><h2>Customize</h2><button class="icon-btn" type="button" id="panelClose" aria-label="Close">${icon('x')}</button></header>
    <nav class="panel-tabs" role="tablist">${TABS.map(([k, n, ic]) => `<button type="button" role="tab" data-tab="${k}" class="${k === S.tab ? 'on' : ''}">${icon(ic)}<span>${n}</span></button>`).join('')}</nav>
    <div class="panel-body" id="panelBody"></div>
  </aside>

  <div class="fab-wrap" id="fabWrap">
    <div class="fab-menu" id="fabMenu" role="menu">
      <button class="fab-item" type="button" role="menuitem" data-fab="row">${icon('plus')}<span>Add row</span></button>
      <button class="fab-item" type="button" role="menuitem" data-fab="series">${icon('layers')}<span>Add series</span></button>
      <button class="fab-item" type="button" role="menuitem" data-fab="import">${icon('upload')}<span>Paste or import data</span></button>
      <button class="fab-item" type="button" role="menuitem" data-fab="samples">${icon('table')}<span>Sample graphs</span></button>
      <button class="fab-item" type="button" role="menuitem" data-fab="new">${icon('fileText')}<span>New graph</span></button>
    </div>
    <button class="fab" id="fab" type="button" aria-label="Add" aria-expanded="false">${icon('fab')}</button>
  </div>
  <div class="drop" id="drop"><div class="drop-card">${icon('upload')}<b>Drop to import</b><span>CSV, TSV or a Graph Studio project file</span></div></div>
</div>`;
  }

  /* ======================= mount ======================= */
  async function mount(root, route) {
    S.root = root;
    root.innerHTML = template();
    bind();
    S.tool = C.prefs.tool || 'pointer';
    $('#stage').dataset.tool = S.tool;
    if (route.gid) await openCloud(route.gid, route.join);
    else openLocal(route.localId || C.Library.current());
  }
  function unmount() {
    if (S.mode === 'local' && S.saveLocal) S.saveLocal.flush();
    stopCloud();
    if (S.chart) { S.chart.destroy(); S.chart = null; }
    S.cleanups.forEach((f) => f());
    S.cleanups = [];
    if (S.focusLayer) { S.focusLayer(); S.focusLayer = null; }
    if (S.fabLayer) { S.fabLayer(); S.fabLayer = null; }
    document.body.classList.remove('focus-lock');
    S.root = null;
    S.doc = null;
  }
  function resetViewState() {
    S.hist = { undo: [], redo: [], key: null, t: 0 };
    S.gridSig = ''; S.legendSig = ''; S.statsSig = ''; S.panelSig = '';
    S.gridRows = new Set();
    S.statsSel = 'all';
    if (S.chart) { S.chart.destroy(); S.chart = null; }
  }

  function openLocal(id) {
    stopCloud();
    S.mode = 'local';
    S.gid = null;
    S.localId = id;
    C.Library.setCurrent(id);
    S.doc = C.Library.load(id) || C.docFromSample('sales');
    S.saveLocal = C.debounce(() => { if (S.mode === 'local' && S.localId === id && S.doc) { C.Library.save(id, S.doc); setSave('saved'); } }, 450);
    resetViewState();
    setSave('saved');
    renderAll(true);
  }

  /* ---------- live graphs ---------- */
  function stopCloud() {
    if (S.unwatch) { S.unwatch(); S.unwatch = null; }
    stopPresence();
  }
  async function openCloud(gid, joinToken) {
    S.mode = 'cloud';
    S.gid = gid;
    S.doc = null;
    resetViewState();
    blocker({ title: 'Opening live graph…', text: '', busy: true });
    const ok = await GS.cloud.ready;
    if (!S.root) return;
    if (!ok) {
      return blocker({ title: 'Live graphs need Firebase', text: 'Paste your Firebase config into js/config.js to share graphs and edit them together. SETUP.md walks through it.', actions: [['Open my studio', () => router().go('studio')]] });
    }
    if (!GS.cloud.user) {
      return blocker({
        title: 'Sign in to open this graph', text: 'Someone shared a live graph with you. Sign in or create an account to edit it together.',
        actions: [['Sign in', async () => { const u = await GS.pages.authModal({ reason: 'Sign in to open the shared graph.' }); if (u && S.root) openCloud(gid, joinToken); }, 'primary'], ['Not now', () => router().go('studio')]],
      });
    }
    if (joinToken) {
      try {
        const res = await GS.cloud.joinGraph(gid, joinToken);
        if (res === 'joined') U.toast('You joined the graph', { icon: 'users' });
      } catch (e) {
        console.warn(e);
        return blocker({ title: 'That invite link doesn’t work any more', text: 'Ask the person who shared it for a new link.', actions: [['Open my studio', () => router().go('studio')]] });
      }
      router().replace('studio/' + gid);
    }
    let first = true;
    S.unwatch = GS.cloud.watchGraph(gid, {
      onDoc: (val) => {
        if (!S.root || S.gid !== gid) return;
        if (val === null) {
          if (first) return blocker({ title: 'This graph doesn’t exist', text: 'It may have been deleted by its owner.', actions: [['Open my studio', () => router().go('studio')]] });
          U.toast('The owner deleted this graph', { tone: 'warn' });
          return router().go('studio');
        }
        const next = C.normalize(val);
        if (first) {
          first = false;
          S.doc = next;
          unblock();
          setSave('live');
          renderAll(true);
          startPresence();
          GS.cloud.touchMyGraph(gid, S.doc.title, S.meta && S.meta.owner === GS.cloud.user.uid ? 'owner' : 'editor');
          return;
        }
        const patch = C.diff(S.doc, next);
        if (!Object.keys(patch).length) return;
        S.doc = next;
        S.remoteFlash = true;
        schedule();
      },
      onMeta: (m) => { S.meta = m; renderHeader(); },
      onMembers: (m) => { S.members = m; if (GS.cloud.user && first === false && !m[GS.cloud.user.uid]) { U.toast('You were removed from this graph', { tone: 'warn' }); router().go('studio'); } },
      onError: (e) => {
        console.warn(e);
        blocker({ title: 'You don’t have access to this graph', text: 'Ask its owner to send you an invite link.', actions: [['Open my studio', () => router().go('studio')]] });
      },
    });
  }
  function blocker(o) {
    if (!S.root) return;
    let el = $('#blocker', S.root);
    if (!el) { el = h('<div class="blocker" id="blocker"></div>'); $('#studio', S.root).appendChild(el); }
    $('#studio', S.root).classList.add('is-blocked');
    el.innerHTML = `<div class="blocker-card">${o.busy ? '<div class="spinner" aria-hidden="true"></div>' : icon('cloud')}<h2>${esc(o.title)}</h2>${o.text ? `<p>${esc(o.text)}</p>` : ''}<div class="blocker-acts">${(o.actions || []).map((a, i) => `<button class="btn ${a[2] || ''}" type="button" data-i="${i}">${esc(a[0])}</button>`).join('')}</div></div>`;
    el.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) o.actions[Number(b.dataset.i)][1](); };
  }
  function unblock() { const el = S.root && $('#blocker', S.root); if (el) el.remove(); if (S.root) $('#studio', S.root).classList.remove('is-blocked'); }

  /* ======================= changes & history ======================= */
  function mutate(fn, opts) {
    if (!S.doc) return false;
    opts = opts || {};
    const before = C.clone(S.doc);
    fn(S.doc);
    S.doc = C.normalize(S.doc);
    const fwd = C.diff(before, S.doc);
    if (!Object.keys(fwd).length) return false;
    const inv = C.diff(S.doc, before);
    if (opts.history !== false) record(fwd, inv, opts.key || null);
    committed(fwd);
    return true;
  }
  function record(fwd, inv, key) {
    const H = S.hist, t = Date.now();
    const top = H.undo[H.undo.length - 1];
    if (key && key === H.key && t - H.t < 1400 && top) {
      Object.assign(top.fwd, fwd);
      Object.keys(inv).forEach((p) => { if (!(p in top.inv)) top.inv[p] = inv[p]; });
    } else {
      H.undo.push({ fwd, inv });
      if (H.undo.length > 300) H.undo.shift();
    }
    H.redo = [];
    H.key = key;
    H.t = t;
  }
  function committed(patch) {
    schedule();
    if (S.mode === 'cloud') {
      GS.cloud.pushPatch(S.gid, patch).catch((e) => { console.warn(e); U.toast('Couldn’t sync that change. Check your connection.', { tone: 'warn' }); });
    } else {
      setSave('saving');
      S.saveLocal();
    }
  }
  function applyHistory(patch) {
    C.applyPatch(S.doc, patch);
    S.doc = C.normalize(S.doc);
    committed(patch);
  }
  function undo() {
    const e = S.hist.undo.pop();
    if (!e) return U.toast('Nothing to undo');
    applyHistory(e.inv);
    S.hist.redo.push(e);
    S.hist.key = null;
  }
  function redo() {
    const e = S.hist.redo.pop();
    if (!e) return U.toast('Nothing to redo');
    applyHistory(e.fwd);
    S.hist.undo.push(e);
    S.hist.key = null;
  }
  function setSave(state) {
    S.saveState = state;
    const t = S.root && $('#saveText', S.root);
    if (!t) return;
    const dot = $('#saveDot', S.root);
    if (S.mode === 'cloud') {
      const online = GS.cloud.connected;
      t.textContent = online ? 'Live. Changes sync as you type' : 'Offline. Changes will sync when you’re back';
      dot.className = 'save-dot ' + (online ? 'live' : 'off');
    } else {
      t.textContent = state === 'saving' ? 'Saving…' : 'Saved on this device';
      dot.className = 'save-dot ' + (state === 'saving' ? 'busy' : '');
    }
  }

  /* ======================= rendering ======================= */
  function schedule() {
    if (S.pending) return;
    S.pending = requestAnimationFrame(() => { S.pending = null; renderAll(false); });
  }
  function flush() { if (S.pending) { cancelAnimationFrame(S.pending); S.pending = null; renderAll(false); } }
  function renderAll(intro) {
    if (!S.root || !S.doc) return;
    renderHeader();
    renderTypes();
    renderGrid();
    renderChart(intro);
    renderLegend();
    renderStats();
    renderPanel();
    S.remoteFlash = false;
  }

  function renderHeader() {
    if (!S.root || !S.doc) return;
    const ti = $('#docTitle'), sub = $('#docSub');
    if (document.activeElement !== ti && ti.value !== S.doc.title) ti.value = S.doc.title;
    if (document.activeElement !== sub && sub.value !== S.doc.subtitle) sub.value = S.doc.subtitle;
    autosize(sub);
    document.title = (S.doc.title || 'Untitled graph') + ' – Graph Studio';
    GS.router.setWallpaper(S.doc.look.wallpaper);
    $('#btnUndo').disabled = !S.hist.undo.length;
    $('#btnRedo').disabled = !S.hist.redo.length;
    const av = $('#bhAvatar');
    const ownerUid = S.mode === 'cloud' && S.meta ? S.meta.owner : null;
    const show = (p) => { av.innerHTML = U.avatar(p, 52); };
    if (ownerUid && GS.cloud.configured) GS.cloud.getProfile(ownerUid).then((p) => show(p || { name: '?' })).catch(() => show({ name: '?' }));
    else show(GS.cloud.profile || { name: C.prefs.shareName || 'You', avatar: 'color:' + C.accentSet(C.prefs.accent).main });
    setSave(S.saveState);
  }
  function autosize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

  function renderTypes() {
    const t = S.doc.type;
    $$('#types .type').forEach((b) => { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    moveTypeInd();
  }
  function moveTypeInd() {
    const on = $('#types .type.on');
    const ind = $('#typesInd');
    if (!on || !ind) return;
    ind.style.width = on.offsetWidth + 'px';
    ind.style.transform = `translateX(${on.offsetLeft}px)`;
  }

  function chartOpts(extra) {
    return Object.assign({ interactive: true, tool: S.tool, showTitle: false, onZoom: updateZoomRead, onLegendToggle: legendToggle }, extra);
  }
  function renderChart(intro) {
    const canvas = $('#chartCanvas');
    if (!canvas) return;
    if (!S.chart || intro) {
      if (S.chart) S.chart.destroy();
      S.chart = E.create(canvas, S.doc, chartOpts());
    } else S.chart = E.update(S.chart, S.doc, chartOpts());
    const empty = !C.rowsOf(S.doc).some((r) => Object.keys(r.values).length);
    $('#stage').classList.toggle('is-empty', empty);
    $('#tools').classList.toggle('no-zoom', !typeInfo().cartesian);
    canvas.setAttribute('aria-label', `${C.TYPE[S.doc.type].name} graph: ${S.doc.title}`);
    updateZoomRead();
  }
  function updateZoomRead() {
    const z = S.chart && S.chart.getZoomLevel ? S.chart.getZoomLevel() : 1;
    const el = $('#zoomRead');
    if (el) el.textContent = Math.round(z * 100) + '%';
    const b = $('#btnZoomReset');
    if (b) b.disabled = !(S.chart && S.chart.isZoomedOrPanned && S.chart.isZoomedOrPanned());
  }
  function replay() {
    renderChart(true);
    const b = $('[data-act="replay"]');
    if (b) { b.classList.remove('spin-once'); void b.offsetWidth; b.classList.add('spin-once'); }
  }
  function setTool(t) {
    S.tool = t;
    C.prefs.tool = t;
    C.savePrefs();
    U.setSeg($('#toolSeg'), t);
    $('#stage').dataset.tool = t;
    if (S.chart) S.chart = E.update(S.chart, S.doc, chartOpts({ mode: 'none' }));
  }
  function toggleFocus(force) {
    S.focus = force === undefined ? !S.focus : force;
    const post = $('#chartPost');
    post.classList.toggle('is-focus', S.focus);
    document.body.classList.toggle('focus-lock', S.focus);
    $('#btnFocus').innerHTML = icon(S.focus ? 'minimize' : 'maximize');
    if (S.focus) S.focusLayer = U.pushLayer(() => toggleFocus(false));
    else if (S.focusLayer) { S.focusLayer(); S.focusLayer = null; }
    setTimeout(moveTypeInd, 360);
  }

  /* ---------- grid ---------- */
  function gridHead(series, rowColor) {
    const catLabel = S.doc.axes.cat.title || (S.doc.type === 'scatter' ? 'X value' : 'Label');
    return `<thead><tr>
      ${rowColor ? '<th class="g-sw"><span class="sr">Colour</span></th>' : ''}
      <th class="g-label"><span>${esc(catLabel)}</span></th>
      ${series.map((s) => `<th class="g-ds ${s.hidden ? 'is-hidden' : ''}" data-s="${s.id}"><div class="g-ds-in">
        ${rowColor ? '' : `<button class="dot" type="button" data-act="ds-color" data-s="${s.id}" style="--c:${s.color}" aria-label="Colour of ${esc(s.name)}"></button>`}
        <input class="g-ds-name" data-s="${s.id}" value="${esc(s.name)}" aria-label="Series name" spellcheck="false" autocomplete="off">
        <button class="icon-btn xs" type="button" data-act="ds-menu" data-s="${s.id}" aria-label="Series options">${icon('more')}</button>
      </div></th>`).join('')}
      <th class="g-add"><button class="icon-btn xs" type="button" data-act="add-series" data-tip="Add series" aria-label="Add series">${icon('plus')}</button></th>
    </tr></thead>`;
  }
  function gridRow(r, series, rowColor) {
    return `<tr data-r="${r.id}" class="${r.hidden ? 'is-hidden' : ''}">
      ${rowColor ? `<td class="g-sw"><button class="dot" type="button" data-act="row-color" data-r="${r.id}" style="--c:${r.color}" aria-label="Colour of ${esc(r.label || 'row')}"></button></td>` : ''}
      <td class="g-label"><input class="cell" data-r="${r.id}" data-c="label" value="${esc(r.label)}" aria-label="Label" spellcheck="false" autocomplete="off" placeholder="Label"></td>
      ${series.map((s) => `<td><input class="cell num" data-r="${r.id}" data-c="${s.id}" inputmode="decimal" value="${esc(fmtCell(r.values[s.id]))}" aria-label="${esc(s.name)}" autocomplete="off"></td>`).join('')}
      <td class="g-del"><button class="icon-btn xs" type="button" data-act="del-row" data-r="${r.id}" aria-label="Delete row">${icon('x')}</button></td>
    </tr>`;
  }
  function renderGrid() {
    const grid = $('#grid');
    if (!grid) return;
    const rows = C.rowsOf(S.doc), series = C.seriesOf(S.doc);
    const rowColor = C.isRowColored(S.doc);
    const sig = rows.map((r) => r.id).join(',') + '|' + series.map((s) => s.id).join(',') + '|' + rowColor + '|' + S.doc.type + '|' + S.doc.axes.cat.title;
    if (sig !== S.gridSig) {
      const a = document.activeElement;
      const keep = a && grid.contains(a) ? { r: a.dataset.r, c: a.dataset.c, s: a.dataset.s, cls: a.className, from: a.selectionStart, to: a.selectionEnd } : null;
      grid.innerHTML = gridHead(series, rowColor) + `<tbody>${rows.map((r) => gridRow(r, series, rowColor)).join('')}</tbody>`;
      const firstRender = !S.gridSig;
      if (!firstRender) rows.forEach((r) => { if (!S.gridRows.has(r.id)) { const tr = grid.querySelector(`tr[data-r="${r.id}"]`); if (tr) tr.classList.add('row-in'); } });
      S.gridRows = new Set(rows.map((r) => r.id));
      S.gridSig = sig;
      if (keep) {
        const sel = keep.cls.includes('g-ds-name') ? `.g-ds-name[data-s="${keep.s}"]` : `.cell[data-r="${keep.r}"][data-c="${keep.c}"]`;
        const n = grid.querySelector(sel);
        if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(keep.from, keep.to); } catch (e) { /* ignore */ } }
      }
    }
    $$('.cell', grid).forEach((inp) => {
      if (inp === document.activeElement) return;
      const r = S.doc.rows[inp.dataset.r];
      if (!r) return;
      const v = inp.dataset.c === 'label' ? r.label : fmtCell(r.values[inp.dataset.c]);
      if (inp.value !== v) {
        inp.value = v;
        inp.classList.remove('bad');
        if (S.remoteFlash) { const td = inp.parentElement; td.classList.remove('flash'); void td.offsetWidth; td.classList.add('flash'); }
      }
    });
    $$('.g-ds-name', grid).forEach((inp) => { const s = S.doc.datasets[inp.dataset.s]; if (s && inp !== document.activeElement && inp.value !== s.name) inp.value = s.name; });
    $$('[data-act="ds-color"]', grid).forEach((b) => { const s = S.doc.datasets[b.dataset.s]; if (s) b.style.setProperty('--c', s.color); });
    $$('[data-act="row-color"]', grid).forEach((b) => { const r = S.doc.rows[b.dataset.r]; if (r) b.style.setProperty('--c', r.color); });
    $$('th.g-ds', grid).forEach((th) => { const s = S.doc.datasets[th.dataset.s]; if (s) th.classList.toggle('is-hidden', !!s.hidden); });
    $$('tbody tr', grid).forEach((tr) => { const r = S.doc.rows[tr.dataset.r]; if (r) tr.classList.toggle('is-hidden', !!r.hidden); });
    renderPeerCells();
  }
  function focusCell(rowId, col, select) {
    const inp = $(`#grid .cell[data-r="${rowId}"][data-c="${col}"]`);
    if (!inp) return;
    inp.focus();
    if (select !== false) inp.select();
    inp.scrollIntoView({ block: 'nearest' });
  }
  function addRow(focusCol) {
    let id;
    mutate((d) => { id = C.addRow(d, '', {}); });
    flush();
    focusCell(id, focusCol || 'label');
    return id;
  }
  function addSeries() {
    let id;
    mutate((d) => { id = C.addSeries(d); });
    flush();
    const n = $(`#grid .g-ds-name[data-s="${id}"]`);
    if (n) { n.focus(); n.select(); }
    return id;
  }
  function deleteRow(id, then) {
    const tr = $(`#grid tr[data-r="${id}"]`);
    const go = () => {
      mutate((d) => { delete d.rows[id]; });
      U.toast('Row deleted', { action: { label: 'Undo', fn: undo } });
      if (then) then();
    };
    if (tr && !U.reduce()) { tr.classList.add('row-out'); setTimeout(go, 170); } else go();
  }
  function deleteSeries(id) {
    const s = S.doc.datasets[id];
    if (!s) return;
    mutate((d) => { delete d.datasets[id]; Object.values(d.rows).forEach((r) => { delete r.values[id]; }); });
    U.toast(`Deleted “${s.name}”`, { action: { label: 'Undo', fn: undo } });
  }
  function moveSeries(id, dir) {
    const list = C.seriesOf(S.doc);
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    mutate((d) => { const a = d.datasets[list[i].id].order; d.datasets[list[i].id].order = d.datasets[list[j].id].order; d.datasets[list[j].id].order = a; if (a === d.datasets[list[i].id].order) d.datasets[list[i].id].order += dir * 0.5; });
  }
  function replaceData(table, verb) {
    if (!table.length) return U.toast('There was no data in that.', { tone: 'warn' });
    let n = 0;
    mutate((d) => {
      const nd = C.docFromTable(table, d);
      d.rows = nd.rows;
      d.datasets = nd.datasets;
      if (nd.axes.cat.title) d.axes.cat.title = nd.axes.cat.title;
      n = Object.keys(nd.rows).length;
    });
    U.toast(`${verb} ${n} ${n === 1 ? 'row' : 'rows'}`, { action: { label: 'Undo', fn: undo }, icon: 'table' });
  }
  function pasteBlock(rowId, col, block) {
    const rows = C.rowsOf(S.doc);
    if (rows.length && rowId === rows[0].id && col === 'label') return replaceData(block, 'Pasted');
    mutate((d) => {
      const rlist = C.rowsOf(d);
      const cols = ['label'].concat(C.seriesOf(d).map((s) => s.id));
      let ri = rlist.findIndex((r) => r.id === rowId);
      if (ri < 0) ri = rlist.length;
      const ci = Math.max(0, cols.indexOf(col));
      const width = Math.max(...block.map((b) => b.length));
      while (cols.length < ci + width) cols.push(C.addSeries(d));
      block.forEach((line, k) => {
        let row = rlist[ri + k];
        if (!row) { const id = C.addRow(d, '', {}); row = { id }; rlist.push(row); }
        line.forEach((cell, j) => {
          const c = cols[ci + j];
          const target = d.rows[row.id];
          if (c === 'label') target.label = String(cell).trim();
          else { const v = C.parseNum(cell); if (v === null) delete target.values[c]; else target.values[c] = v; }
        });
      });
    });
    U.toast(`Pasted ${block.length} ${block.length === 1 ? 'row' : 'rows'}`, { action: { label: 'Undo', fn: undo } });
  }

  function onGridInput(e) {
    const t = e.target;
    if (t.classList.contains('g-ds-name')) {
      const id = t.dataset.s;
      mutate((d) => { if (d.datasets[id]) d.datasets[id].name = t.value; }, { key: 'dsname:' + id });
      return;
    }
    if (!t.classList.contains('cell')) return;
    const rid = t.dataset.r, c = t.dataset.c;
    if (c === 'label') { mutate((d) => { if (d.rows[rid]) d.rows[rid].label = t.value; }, { key: 'cell:' + rid + ':label' }); return; }
    const n = C.parseNum(t.value);
    t.classList.toggle('bad', t.value.trim() !== '' && n === null);
    mutate((d) => { const row = d.rows[rid]; if (!row) return; if (n === null) delete row.values[c]; else row.values[c] = n; }, { key: 'cell:' + rid + ':' + c });
  }
  function onGridKey(e) {
    const t = e.target;
    if (t.classList.contains('g-ds-name') && e.key === 'Enter') { e.preventDefault(); const r = C.rowsOf(S.doc)[0]; if (r) focusCell(r.id, t.dataset.s); return; }
    if (!t.classList.contains('cell')) return;
    const rows = C.rowsOf(S.doc);
    const i = rows.findIndex((r) => r.id === t.dataset.r);
    const go = (j) => { const r = rows[j]; if (!r) return false; focusCell(r.id, t.dataset.c); return true; };
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!go(i + 1)) addRow(t.dataset.c); }
    else if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'Backspace' && t.value === '' && t.dataset.c === 'label' && rows.length > 1) {
      const r = rows[i];
      if (r && !r.label && !Object.keys(r.values).length) { e.preventDefault(); const prev = rows[i - 1] || rows[i + 1]; deleteRow(r.id, () => prev && focusCell(prev.id, 'label')); }
    }
  }
  function onGridPaste(e) {
    const t = e.target;
    if (!t.classList.contains('cell')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const block = C.parseDelimited(text);
    if (block.length) pasteBlock(t.dataset.r, t.dataset.c, block);
  }
  function onGridAct(e, b) {
    const act = b.dataset.act;
    if (act === 'ds-color') {
      const id = b.dataset.s, s = S.doc.datasets[id];
      U.colorPicker(b, s.color, (c) => mutate((d) => { if (d.datasets[id]) d.datasets[id].color = c; }, { key: 'dscolor:' + id }), { title: s.name });
    } else if (act === 'row-color') {
      const id = b.dataset.r, r = S.doc.rows[id];
      U.colorPicker(b, r.color, (c) => mutate((d) => { if (d.rows[id]) d.rows[id].color = c; }, { key: 'rowcolor:' + id }), { title: r.label || 'Row colour' });
    } else if (act === 'ds-menu') seriesMenu(b, b.dataset.s);
    else if (act === 'add-series') addSeries();
    else if (act === 'del-row') deleteRow(b.dataset.r);
  }
  function seriesMenu(anchor, id) {
    const s = S.doc.datasets[id];
    if (!s) return;
    const mixed = typeInfo().cartesian && S.doc.type !== 'scatter';
    U.menu(anchor, [
      mixed && { heading: 'Draw as' },
      mixed && { label: 'Same as graph', icon: C.TYPE[S.doc.type].icon, on: s.kind === 'auto', run: () => mutate((d) => { d.datasets[id].kind = 'auto'; }) },
      mixed && { label: 'Bars', icon: 'bar', on: s.kind === 'bar', run: () => mutate((d) => { d.datasets[id].kind = 'bar'; }) },
      mixed && { label: 'Line', icon: 'line', on: s.kind === 'line', run: () => mutate((d) => { d.datasets[id].kind = 'line'; }) },
      mixed && { divider: true },
      { label: s.hidden ? 'Show series' : 'Hide series', icon: s.hidden ? 'eye' : 'eyeOff', run: () => mutate((d) => { d.datasets[id].hidden = !d.datasets[id].hidden; }) },
      { label: 'Move left', icon: 'chevronRight', run: () => moveSeries(id, -1) },
      { label: 'Move right', icon: 'chevronRight', run: () => moveSeries(id, 1) },
      { divider: true },
      { label: 'Delete series', icon: 'trash', danger: true, run: () => deleteSeries(id) },
    ], { align: 'end' });
  }

  /* ---------- legend strip ---------- */
  function legendItems() {
    return C.isRowColored(S.doc)
      ? C.rowsOf(S.doc).map((r) => ({ k: 'row', id: r.id, name: r.label || 'Untitled', color: r.color, hidden: r.hidden }))
      : C.seriesOf(S.doc).map((s) => ({ k: 'ds', id: s.id, name: s.name || 'Untitled', color: s.color, hidden: s.hidden }));
  }
  function renderLegend() {
    const el = $('#legendStrip');
    if (!el) return;
    const items = legendItems();
    const sig = JSON.stringify(items);
    if (sig === S.legendSig) return;
    S.legendSig = sig;
    el.innerHTML = items.map((it) => `<span class="chip ${it.hidden ? 'off' : ''}" data-k="${it.k}" data-id="${it.id}">
      <button class="dot" type="button" data-act="chip-color" style="--c:${it.color}" aria-label="Change colour of ${esc(it.name)}"></button>
      <button class="chip-name" type="button" data-act="chip-toggle" aria-pressed="${!it.hidden}">${esc(it.name)}</button></span>`).join('');
  }
  function onLegendAct(e, b) {
    const chip = b.closest('.chip');
    const id = chip.dataset.id, k = chip.dataset.k;
    const bag = k === 'row' ? 'rows' : 'datasets';
    if (b.dataset.act === 'chip-toggle') mutate((d) => { if (d[bag][id]) d[bag][id].hidden = !d[bag][id].hidden; });
    else U.colorPicker(b, S.doc[bag][id].color, (c) => mutate((d) => { if (d[bag][id]) d[bag][id].color = c; }, { key: 'color:' + id }), { title: k === 'row' ? S.doc.rows[id].label : S.doc.datasets[id].name });
  }
  function legendToggle(item) {
    if (C.isRowColored(S.doc) && C.TYPE[S.doc.type].circular) {
      const r = C.rowsOf(S.doc)[item.index];
      if (r) mutate((d) => { d.rows[r.id].hidden = !d.rows[r.id].hidden; });
    } else {
      const s = C.seriesOf(S.doc)[item.datasetIndex];
      if (s) mutate((d) => { d.datasets[s.id].hidden = !d.datasets[s.id].hidden; });
    }
  }

  /* ---------- stats ---------- */
  function renderStats() {
    const series = C.seriesOf(S.doc);
    if (S.statsSel !== 'all' && !S.doc.datasets[S.statsSel]) S.statsSel = 'all';
    const pick = $('#statsPick');
    const sig = series.map((s) => s.id + s.name + s.color).join('|') + S.statsSel;
    if (sig !== S.statsSig) {
      S.statsSig = sig;
      pick.innerHTML = series.length > 1
        ? `<select aria-label="Stats for">${['<option value="all">All series</option>'].concat(series.map((s) => `<option value="${s.id}" ${S.statsSel === s.id ? 'selected' : ''}>${esc(s.name)}</option>`)).join('')}</select>`
        : '';
      const sel = pick.querySelector('select');
      if (sel) sel.value = S.statsSel;
    }
    const chosen = S.statsSel === 'all' ? series.filter((s) => !s.hidden) : series.filter((s) => s.id === S.statsSel);
    const items = [];
    C.rowsOf(S.doc).forEach((r) => chosen.forEach((s) => { const v = r.values[s.id]; if (v !== undefined) items.push({ v, label: r.label, s: s.name }); }));
    const st = C.statsOf(items.map((x) => x.v));
    const f = (v) => C.fmtNum(v, S.doc.fmt);
    const plain = (v) => C.fmtNum(v, { decimals: 'auto' });
    const multi = chosen.length > 1;
    const who = (v) => { const it = items.find((x) => x.v === v); return it ? (it.label || 'Untitled') + (multi ? ', ' + it.s : '') : ''; };
    $$('#stats .stat').forEach((el) => {
      const k = el.dataset.k;
      const vEl = el.querySelector('.stat-v');
      const val = st[k];
      U.countUp(vEl, val, k === 'count' ? (x) => String(Math.round(x)) : k === 'sd' || k === 'range' ? (x) => plain(x) : f);
      el.querySelector('.stat-sub').textContent = k === 'max' || k === 'min' ? (st.count ? who(val) : '') : '';
    });
  }

  /* ======================= customize panel ======================= */
  function ctl(kind, path, label, extra) {
    extra = extra || {};
    const id = 'p_' + path.replace(/\//g, '_');
    let input = '';
    if (kind === 'seg') input = U.seg(path, extra.options, '').replace('class="seg"', `class="seg" data-path="${path}" data-kind="seg"`);
    else if (kind === 'toggle') input = `<label class="switch"><input type="checkbox" id="${id}" data-path="${path}" data-kind="toggle"><span></span></label>`;
    else if (kind === 'text') input = `<input class="field" id="${id}" data-path="${path}" data-kind="text" placeholder="${esc(extra.ph || '')}" maxlength="${extra.max || 80}" autocomplete="off">`;
    else if (kind === 'num') input = `<input class="field num" id="${id}" data-path="${path}" data-kind="num" inputmode="decimal" placeholder="${esc(extra.ph || 'Auto')}" autocomplete="off">`;
    else if (kind === 'range') input = `<div class="range"><input type="range" id="${id}" data-path="${path}" data-kind="range" min="${extra.min}" max="${extra.max}" step="${extra.step || 1}"><output data-for="${path}"></output></div>`;
    const wide = kind === 'seg' || kind === 'range';
    return `<div class="prow ${wide ? 'wide' : ''}"><label class="plabel" for="${id}">${esc(label)}</label>${input}</div>`;
  }
  const section = (title, body, note) => `<section class="psec"><h3>${esc(title)}</h3>${body}${note ? `<p class="pnote">${note}</p>` : ''}</section>`;
  const unit = { 'axes/val/grace': '%', 'axes/cat/angle': '°', 'look/fill': '%', 'look/radius': 'px', 'look/lineWidth': 'px', 'look/points': 'px', 'anim/duration': ' ms', 'look/titleSize': 'px' };

  function panelHTML(tab) {
    const d = S.doc, t = d.type, info = typeInfo();
    const barish = t === 'bar' || t === 'hbar';
    const stackable = ['bar', 'hbar', 'line', 'area'].includes(t);
    const lineish = ['line', 'area', 'radar'].includes(t) || C.seriesOf(d).some((s) => s.kind === 'line');
    if (tab === 'series') {
      const pals = Object.keys(C.PALETTES).map((k) => `<button type="button" class="pal ${d.look.palette === k ? 'on' : ''}" data-pal="${k}"><span class="pal-dots">${C.PALETTES[k].colors.slice(0, 6).map((c) => `<i style="--c:${c}"></i>`).join('')}</span><span>${C.PALETTES[k].name}</span></button>`).join('');
      const mixed = info.cartesian && t !== 'scatter';
      const list = C.seriesOf(d).map((s) => `<div class="srow ${s.hidden ? 'is-hidden' : ''}" data-s="${s.id}">
          <button class="dot" type="button" data-act="ps-color" style="--c:${s.color}" aria-label="Colour of ${esc(s.name)}"></button>
          <input class="field" data-act="ps-name" value="${esc(s.name)}" aria-label="Series name" autocomplete="off">
          ${mixed ? `<select class="field sm" data-act="ps-kind" aria-label="Draw as"><option value="auto" ${s.kind === 'auto' ? 'selected' : ''}>Auto</option><option value="bar" ${s.kind === 'bar' ? 'selected' : ''}>Bars</option><option value="line" ${s.kind === 'line' ? 'selected' : ''}>Line</option></select>` : ''}
          <button class="icon-btn xs" type="button" data-act="ps-hide" aria-label="${s.hidden ? 'Show' : 'Hide'}">${icon(s.hidden ? 'eyeOff' : 'eye')}</button>
          <button class="icon-btn xs" type="button" data-act="ps-del" aria-label="Delete series">${icon('trash')}</button>
        </div>`).join('');
      return section('Palette', `<div class="pals">${pals}</div>`, 'Picks colours for every series and bar at once. You can still change any single colour afterwards.')
        + section('Series', `<div class="slist">${list}</div><button class="btn sm ghost" type="button" data-act="ps-add">${icon('plus')}<span>Add series</span></button>`
          + (barish ? ctl('seg', 'look/colorBy', 'Colour', { options: [['series', 'By series'], ['row', 'Each bar']] }) : '')
          + (stackable ? ctl('toggle', 'look/stacked', 'Stack series') : ''),
          mixed ? 'Mix bars and lines by changing “Auto” on a series.' : '');
    }
    if (tab === 'axes') {
      const valName = info.cartesian ? (t === 'hbar' ? 'Value axis (X)' : 'Value axis (Y)') : 'Scale';
      let out = section(valName,
        (info.cartesian ? ctl('text', 'axes/val/title', 'Title', { ph: 'e.g. Sales' }) : '')
        + (info.cartesian ? ctl('seg', 'axes/val/log', 'Scale', { options: [['false', 'Linear'], ['true', 'Log']] }) : '')
        + `<div class="pgrid3">${ctl('num', 'axes/val/min', 'Min')}${ctl('num', 'axes/val/max', 'Max')}${ctl('num', 'axes/val/step', 'Step')}</div>`
        + ctl('toggle', 'axes/val/zero', 'Start at zero')
        + (info.cartesian ? ctl('range', 'axes/val/grace', 'Headroom', { min: 0, max: 40 }) : '')
        + ctl('toggle', 'axes/val/grid', 'Gridlines')
        + ctl('toggle', 'axes/val/reverse', 'Reverse'),
        'Leave min, max and step empty to fit the data automatically.');
      if (info.cartesian) {
        out += section(t === 'hbar' ? 'Label axis (Y)' : t === 'scatter' ? 'X axis' : 'Label axis (X)',
          ctl('text', 'axes/cat/title', 'Title', { ph: t === 'scatter' ? 'e.g. Height (cm)' : 'e.g. Month' })
          + (t !== 'hbar' && t !== 'scatter' ? ctl('range', 'axes/cat/angle', 'Label angle', { min: 0, max: 90, step: 5 }) : '')
          + ctl('toggle', 'axes/cat/grid', 'Gridlines')
          + ctl('toggle', 'axes/cat/reverse', 'Reverse'));
      }
      out += section('Numbers',
        `<div class="pgrid2">${ctl('text', 'fmt/prefix', 'Before', { ph: '$', max: 6 })}${ctl('text', 'fmt/suffix', 'After', { ph: '%', max: 8 })}</div>`
        + ctl('seg', 'fmt/decimals', 'Decimals', { options: [['auto', 'Auto'], ['0', '0'], ['1', '1'], ['2', '2']] })
        + ctl('toggle', 'fmt/compact', 'Short numbers (1.2K)'));
      if (info.cartesian && t !== 'scatter') {
        out += section('Reference lines',
          ctl('toggle', 'look/avg', 'Average line')
          + `<div class="pgrid2">${ctl('num', 'look/target', 'Target', { ph: 'None' })}${ctl('text', 'look/targetLabel', 'Label', { ph: 'Target', max: 24 })}</div>`);
      }
      return out;
    }
    if (tab === 'legend') {
      return section('Legend',
        ctl('seg', 'legend/mode', 'Show', { options: [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']] })
        + ctl('seg', 'legend/position', 'Position', { options: [['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']] })
        + ctl('seg', 'legend/align', 'Align', { options: [['start', 'Start'], ['center', 'Center'], ['end', 'End']] })
        + ctl('seg', 'legend/marker', 'Marker', { options: [['circle', 'Circle'], ['square', 'Square'], ['line', 'Line']] }),
        'Auto shows the legend when there’s more than one series, or slices to tell apart. The chips under the graph work too: click a name to hide it, click its dot to recolour.');
    }
    if (tab === 'look') {
      const walls = Object.keys(C.WALLPAPERS).map((k) => `<button type="button" class="wp ${d.look.wallpaper === k ? 'on' : ''}" data-wall="${k}" style="--w:${C.WALLPAPERS[k].css.replace(/"/g, "'")}" aria-label="${C.WALLPAPERS[k].name}"><span>${C.WALLPAPERS[k].name}</span></button>`).join('');
      return section('Wallpaper', `<div class="wps">${walls}</div>`, 'Shows behind your board and on the shared preview page.')
        + section('Graph',
          ctl('seg', 'look/card', 'Card', { options: [['dark', 'Dark'], ['light', 'Light']] })
          + ctl('seg', 'look/font', 'Font', { options: [['figtree', 'Figtree'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Mono']] })
          + ctl('range', 'look/titleSize', 'Title size in exports', { min: 14, max: 40 })
          + ctl('toggle', 'look/labels', 'Value labels'))
        + section('Shapes',
          ((t === 'bar' || t === 'hbar' || t === 'doughnut' || C.seriesOf(d).some((s) => s.kind === 'bar')) ? ctl('range', 'look/radius', 'Corner radius', { min: 0, max: 20 }) : '')
          + (lineish ? ctl('range', 'look/smooth', 'Curve', { min: 0, max: 0.5, step: 0.05 }) + ctl('range', 'look/lineWidth', 'Line width', { min: 1, max: 6, step: 0.5 }) : '')
          + (lineish || t === 'scatter' ? ctl('range', 'look/points', 'Point size', { min: 0, max: 10 }) : '')
          + (['area', 'radar', 'line'].includes(t) ? ctl('range', 'look/fill', 'Fill opacity', { min: 0, max: 80, step: 2 }) : ''));
    }
    if (tab === 'motion') {
      const cards = PRESETS.map(([k, n, desc]) => `<button type="button" class="preset ${d.anim.preset === k ? 'on' : ''}" data-preset="${k}">
        <span class="preset-viz pv-${k}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><b>${n}</b><span>${desc}</span></button>`).join('');
      return section('Entrance', `<div class="presets">${cards}</div>`)
        + section('Timing',
          ctl('range', 'anim/duration', 'Duration', { min: 200, max: 3000, step: 100 })
          + ctl('seg', 'anim/easing', 'Easing', { options: [['smooth', 'Smooth'], ['snappy', 'Snappy'], ['springy', 'Springy'], ['linear', 'Linear']] })
          + `<button class="btn sm" type="button" data-act="p-replay">${icon('play')}<span>Replay</span></button>`,
          'Shared links and the preview page play this animation when they open.');
    }
    return '';
  }
  function renderPanel(force) {
    const body = $('#panelBody');
    if (!body || !S.doc) return;
    const d = S.doc;
    const sig = S.tab + '|' + d.type + '|' + d.look.colorBy + '|' + C.seriesOf(d).map((s) => s.id + s.kind + s.hidden + s.color).join(',') + '|' + d.look.palette + d.look.wallpaper + d.anim.preset;
    if (force || sig !== S.panelSig) {
      const focused = document.activeElement && body.contains(document.activeElement) ? (document.activeElement.dataset.path || null) : null;
      const scroll = body.scrollTop;
      body.innerHTML = panelHTML(S.tab);
      body.scrollTop = scroll;
      S.panelSig = sig;
      if (focused) { const f = body.querySelector(`[data-path="${focused}"]`); if (f) f.focus({ preventScroll: true }); }
    }
    syncPanel();
  }
  function syncPanel() {
    const body = $('#panelBody');
    $$('[data-path]', body).forEach((el) => {
      const path = el.dataset.path;
      const v = C.getPath(S.doc, path);
      const kind = el.dataset.kind;
      if (kind === 'seg') U.setSeg(el, String(v));
      else if (kind === 'toggle') el.checked = !!v;
      else if (el === document.activeElement) return;
      else if (kind === 'text') el.value = v || '';
      else if (kind === 'num') el.value = v === null || v === undefined ? '' : String(v);
      else if (kind === 'range') { el.value = v; const o = body.querySelector(`output[data-for="${path}"]`); if (o) o.textContent = (path === 'look/smooth' ? Number(v).toFixed(2) : v) + (unit[path] || ''); }
    });
    $$('.srow', body).forEach((row) => {
      const s = S.doc.datasets[row.dataset.s];
      if (!s) return;
      const n = row.querySelector('[data-act="ps-name"]');
      if (n !== document.activeElement && n.value !== s.name) n.value = s.name;
    });
  }
  function coerce(path, raw) {
    const def = C.getPath(C.blankDoc(), path);
    if (typeof def === 'boolean') return raw === true || raw === 'true';
    if (typeof def === 'number') return Number(raw);
    if (def === null) return C.parseNum(raw);
    return String(raw);
  }
  function setOpt(path, raw, key) {
    const v = coerce(path, raw);
    mutate((d) => { C.setPath(d, path, v === undefined ? null : v); if (v === null) C.setPath(d, path, null); }, { key: key || 'opt:' + path });
  }
  function bindPanel() {
    const panel = $('#panel'), body = $('#panelBody');
    C.on(panel, 'click', '.panel-tabs [data-tab]', (e, b) => {
      S.tab = b.dataset.tab;
      $$('.panel-tabs [data-tab]', panel).forEach((x) => x.classList.toggle('on', x === b));
      renderPanel(true);
      body.scrollTop = 0;
    });
    C.on(body, 'click', '.seg[data-path] button', (e, b) => setOpt(b.closest('.seg').dataset.path, b.dataset.v, null));
    body.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.kind === 'toggle') setOpt(t.dataset.path, t.checked, null);
      if (t.dataset.act === 'ps-kind') { const id = t.closest('.srow').dataset.s; mutate((d) => { d.datasets[id].kind = t.value; }); }
    });
    body.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.kind === 'text' || t.dataset.kind === 'num' || t.dataset.kind === 'range') {
        setOpt(t.dataset.path, t.value);
        if (t.dataset.kind === 'range') { const o = body.querySelector(`output[data-for="${t.dataset.path}"]`); if (o) o.textContent = (t.dataset.path === 'look/smooth' ? Number(t.value).toFixed(2) : t.value) + (unit[t.dataset.path] || ''); }
      }
      if (t.dataset.act === 'ps-name') { const id = t.closest('.srow').dataset.s; mutate((d) => { d.datasets[id].name = t.value; }, { key: 'dsname:' + id }); }
    });
    C.on(body, 'click', '[data-pal]', (e, b) => {
      const k = b.dataset.pal;
      mutate((d) => C.applyPalette(d, k));
      U.toast(`Applied the ${C.PALETTES[k].name} palette`, { action: { label: 'Undo', fn: undo }, icon: 'palette' });
    });
    C.on(body, 'click', '[data-wall]', (e, b) => mutate((d) => { d.look.wallpaper = b.dataset.wall; }));
    C.on(body, 'click', '[data-preset]', (e, b) => { mutate((d) => { d.anim.preset = b.dataset.preset; }); flush(); replay(); });
    C.on(body, 'click', '[data-act]', (e, b) => {
      const act = b.dataset.act;
      const row = b.closest('.srow');
      const id = row && row.dataset.s;
      if (act === 'ps-color') U.colorPicker(b, S.doc.datasets[id].color, (c) => mutate((d) => { d.datasets[id].color = c; }, { key: 'dscolor:' + id }), { title: S.doc.datasets[id].name });
      else if (act === 'ps-hide') mutate((d) => { d.datasets[id].hidden = !d.datasets[id].hidden; });
      else if (act === 'ps-del') deleteSeries(id);
      else if (act === 'ps-add') addSeries();
      else if (act === 'p-replay') replay();
    });
    $('#panelClose').addEventListener('click', () => togglePanel(false));
  }
  let panelLayer = null;
  function togglePanel(open) {
    S.panelOpen = open === undefined ? !S.panelOpen : open;
    $('#studio').classList.toggle('panel-open', S.panelOpen);
    $('#btnCustomize').setAttribute('aria-expanded', S.panelOpen);
    $('#btnCustomize').classList.toggle('on', S.panelOpen);
    if (S.panelOpen) { renderPanel(true); panelLayer = U.pushLayer(() => togglePanel(false)); }
    else if (panelLayer) { panelLayer(); panelLayer = null; }
    setTimeout(moveTypeInd, 420);
  }
  function openPanelTab(tab) {
    S.tab = tab;
    $$('.panel-tabs [data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    if (!S.panelOpen) togglePanel(true); else renderPanel(true);
  }

  /* ======================= + button ======================= */
  function toggleFab(open) {
    S.fabOpen = open === undefined ? !S.fabOpen : open;
    $('#fabWrap').classList.toggle('open', S.fabOpen);
    $('#fab').setAttribute('aria-expanded', S.fabOpen);
    $('#fab').setAttribute('aria-label', S.fabOpen ? 'Close' : 'Add');
    if (S.fabOpen) S.fabLayer = U.pushLayer(() => toggleFab(false));
    else if (S.fabLayer) { S.fabLayer(); S.fabLayer = null; }
  }
  function fabAction(k) {
    toggleFab(false);
    if (k === 'row') addRow();
    else if (k === 'series') addSeries();
    else if (k === 'import') importDialog();
    else if (k === 'samples') samplesDialog();
    else if (k === 'new') newGraph();
  }

  /* ======================= dialogs ======================= */
  function newGraph(doc) {
    const d = doc || (() => {
      const b = C.blankDoc();
      const id = C.addSeries(b, 'Series 1');
      ['', '', '', ''].forEach((l) => C.addRow(b, l, {}));
      b.datasets[id].name = 'Series 1';
      return C.normalize(b);
    })();
    const lid = C.Library.create(d);
    if (S.mode === 'local' && router().current().name === 'studio') { openLocal(lid); U.toast('New graph', { icon: 'fileText' }); }
    else router().go('studio');
    setTimeout(() => { const ti = $('#docTitle'); if (ti && !doc) { ti.focus(); ti.select(); } }, 80);
  }
  function samplesDialog() {
    const list = Object.keys(C.SAMPLES).map((k) => { const s = C.SAMPLES[k]; return `<button type="button" class="sample" data-k="${k}">${icon(C.TYPE[s.type].icon)}<b>${esc(s.name)}</b><span>${esc(C.TYPE[s.type].name)} graph, ${s.rows.length} rows</span></button>`; }).join('');
    const m = U.modal({ title: 'Sample graphs', width: 520, body: `<p class="muted">Each one opens as a new graph, so your current one stays as it is.</p><div class="samples">${list}</div>` });
    m.body.addEventListener('click', (e) => { const b = e.target.closest('.sample'); if (!b) return; m.close(); newGraph(C.docFromSample(b.dataset.k)); });
  }
  function importDialog() {
    const m = U.modal({
      title: 'Paste or import data', width: 560,
      body: `<p class="muted">Paste straight from Excel, Google Sheets or a CSV. Put labels in the first column and one column per series. A header row becomes the series names.</p>
        <textarea class="field area" id="impText" rows="8" placeholder="Month,Online,In store&#10;Jan,120,86&#10;Feb,95,92" spellcheck="false"></textarea>
        <div class="sheet-actions spread"><label class="btn ghost file-btn">${icon('upload')}<span>Choose a file</span><input type="file" id="impFile" accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json"></label>
        <span class="grow"></span><button class="btn" type="button" data-a="cancel">Cancel</button><button class="btn primary" type="button" data-a="go">Replace data</button></div>`,
    });
    m.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'cancel') return m.close();
      const text = $('#impText', m.body).value;
      if (!text.trim()) return U.toast('Paste some data first', { tone: 'warn' });
      m.close();
      replaceData(C.parseDelimited(text), 'Imported');
    });
    $('#impFile', m.body).addEventListener('change', (e) => { const f = e.target.files[0]; if (f) { m.close(); importFile(f); } });
  }
  async function importFile(f) {
    try {
      const text = await f.text();
      if (/\.json$/i.test(f.name) || /^\s*\{/.test(text)) {
        const nd = X.readProjectFile(text);
        mutate((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, nd); });
        U.toast(`Opened ${f.name}`, { action: { label: 'Undo', fn: undo }, icon: 'fileText' });
        renderChart(true);
      } else replaceData(C.parseDelimited(text), 'Imported');
    } catch (e) { U.toast(e.message || 'Couldn’t read that file', { tone: 'warn' }); }
  }

  function exportDialog() {
    X.preloadGoogle();
    const o = { scale: 2, background: 'card', showTitle: true };
    const gNote = X.hasGoogle ? '' : '<p class="ex-note">Want files made straight in your Google Drive? Add a Google client ID in js/config.js (SETUP.md, step 7).</p>';
    const m = U.modal({
      title: 'Export', width: 620,
      body: `<div class="ex-list">
        <section class="ex"><div class="ex-ic">${icon('image')}</div><div class="ex-main"><h3>Image</h3><p>A sharp PNG for docs, chats and slides.</p>
          <div class="ex-opts">${U.seg('scale', [['1', '1×'], ['2', '2×'], ['3', '3×']], '2').replace('class="seg"', 'class="seg sm" id="exScale"')}
          ${U.seg('bg', [['card', 'Card'], ['white', 'White'], ['transparent', 'Clear']], 'card').replace('class="seg"', 'class="seg sm" id="exBg"')}
          <label class="check"><input type="checkbox" id="exTitle" checked> Title</label></div></div>
          <div class="ex-btns"><button class="btn sm" type="button" data-x="copy">${icon('copy')}<span>Copy</span></button><button class="btn sm primary" type="button" data-x="png">${icon('download')}<span>PNG</span></button></div></section>
        <section class="ex"><div class="ex-ic">${icon('table')}</div><div class="ex-main"><h3>CSV</h3><p>Opens in Excel, Numbers and Google Sheets.</p></div>
          <div class="ex-btns"><button class="btn sm" type="button" data-x="csv">${icon('download')}<span>CSV</span></button></div></section>
        <section class="ex"><div class="ex-ic g-sheets">${icon('sheet')}</div><div class="ex-main"><h3>Google Sheets</h3><p>${X.hasGoogle ? 'Make a new sheet with your data and a matching chart.' : 'Copies the table and opens a new sheet. Paste with Ctrl+V (⌘V on a Mac).'}</p></div>
          <div class="ex-btns">${X.hasGoogle ? `<button class="btn sm" type="button" data-x="tsv">${icon('copy')}<span>Copy</span></button><button class="btn sm primary" type="button" data-x="gsheet">${icon('sheet')}<span>Create sheet</span></button>` : `<button class="btn sm" type="button" data-x="tsv">${icon('external')}<span>Copy and open</span></button>`}</div></section>
        <section class="ex"><div class="ex-ic g-slides">${icon('slides')}</div><div class="ex-main"><h3>Google Slides or PowerPoint</h3><p>A title slide, the graph and the data table.${X.hasGoogle ? '' : ' Import the .pptx into Google Slides with File → Import slides.'}</p></div>
          <div class="ex-btns"><button class="btn sm" type="button" data-x="pptx">${icon('download')}<span>.pptx</span></button>${X.hasGoogle ? `<button class="btn sm primary" type="button" data-x="gslides">${icon('slides')}<span>Create slides</span></button>` : ''}</div></section>
        <section class="ex"><div class="ex-ic">${icon('braces')}</div><div class="ex-main"><h3>Project file</h3><p>Everything about this graph, to open again later.</p></div>
          <div class="ex-btns"><label class="btn sm file-btn">${icon('upload')}<span>Open</span><input type="file" id="exOpen" accept=".json,application/json"></label><button class="btn sm" type="button" data-x="json">${icon('download')}<span>Save</span></button></div></section>
      </div>${gNote}`,
    });
    C.on(m.body, 'click', '#exScale button', (e, b) => { o.scale = Number(b.dataset.v); U.setSeg($('#exScale', m.body), b.dataset.v); });
    C.on(m.body, 'click', '#exBg button', (e, b) => { o.background = b.dataset.v; U.setSeg($('#exBg', m.body), b.dataset.v); });
    $('#exTitle', m.body).addEventListener('change', (e) => { o.showTitle = e.target.checked; });
    $('#exOpen', m.body).addEventListener('change', (e) => { const f = e.target.files[0]; if (f) { m.close(); importFile(f); } });
    C.on(m.body, 'click', '[data-x]', async (e, b) => {
      const x = b.dataset.x;
      const busy = (on) => { b.disabled = on; b.classList.toggle('busy', on); };
      try {
        if (x === 'png') { X.png(S.doc, o); U.toast('PNG downloaded', { icon: 'image' }); }
        else if (x === 'copy') { busy(true); await X.copyImage(S.doc, o); U.toast('Image copied', { icon: 'copy' }); }
        else if (x === 'csv') { X.csv(S.doc); U.toast('CSV downloaded', { icon: 'table' }); }
        else if (x === 'json') { X.projectFile(S.doc); U.toast('Project file saved', { icon: 'braces' }); }
        else if (x === 'tsv') { await X.copyForSheets(S.doc); U.toast('Table copied. Paste it into the new sheet.', { icon: 'sheet', ms: 5000 }); }
        else if (x === 'pptx') { busy(true); await X.pptxFile(S.doc); U.toast('PowerPoint downloaded', { icon: 'slides' }); }
        else if (x === 'gsheet') { busy(true); const url = await X.googleSheet(S.doc); U.toast('Google Sheet created', { icon: 'sheet', action: { label: 'Open', fn: () => window.open(url, '_blank', 'noopener') } }); }
        else if (x === 'gslides') { busy(true); const url = await X.googleSlides(S.doc); U.toast('Google Slides created', { icon: 'slides', action: { label: 'Open', fn: () => window.open(url, '_blank', 'noopener') } }); }
      } catch (err) {
        console.warn(err);
        if (!/closed/i.test(err.message || '')) U.toast(err.message || 'That export didn’t work', { tone: 'warn', ms: 6000 });
      } finally { busy(false); }
    });
  }

  async function libraryDialog() {
    const local = C.Library.list();
    const row = (it, kind) => `<div class="lib-row ${kind === 'local' && it.id === S.localId && S.mode === 'local' ? 'on' : ''}">
      <span class="lib-ic">${icon(((C.TYPE[it.type] || {}).icon) || (kind === 'cloud' ? 'users' : 'bar'))}</span>
      <div class="lib-main"><b>${esc(it.title || 'Untitled graph')}</b><span>${kind === 'cloud' ? (it.role === 'owner' ? 'Live, you own it' : 'Live, shared with you') : 'On this device'}, ${esc(C.timeAgo(it.updatedAt))}</span></div>
      <button class="btn sm" type="button" data-open-${kind}="${esc(it.id || it.gid)}">Open</button>
      ${kind === 'local' ? `<button class="icon-btn xs" type="button" data-del="${esc(it.id)}" aria-label="Delete">${icon('trash')}</button>` : ''}</div>`;
    const m = U.modal({
      title: 'My graphs', width: 600,
      body: `<div class="lib"><h3>On this device</h3>${local.map((it) => row(it, 'local')).join('') || '<p class="muted">No graphs yet.</p>'}
        <div id="libCloud">${GS.cloud.user ? '<h3>Live graphs</h3><p class="muted">Loading…</p>' : ''}</div></div>
        <div class="sheet-actions"><button class="btn primary" type="button" data-new>${icon('plus')}<span>New graph</span></button></div>`,
    });
    if (GS.cloud.user) {
      GS.cloud.myGraphs().then((list) => {
        const el = $('#libCloud', m.body);
        if (el) el.innerHTML = '<h3>Live graphs</h3>' + (list.map((it) => row(Object.assign({ id: it.gid }, it), 'cloud')).join('') || '<p class="muted">None yet. Start one from Share → Live.</p>');
      }).catch(() => { const el = $('#libCloud', m.body); if (el) el.innerHTML = ''; });
    }
    m.body.addEventListener('click', async (e) => {
      const b = e.target.closest('button, label');
      if (!b) return;
      if (b.dataset.openLocal) { m.close(); C.Library.setCurrent(b.dataset.openLocal); if (router().current().name === 'studio' && S.mode === 'local') openLocal(b.dataset.openLocal); else router().go('studio'); }
      else if (b.dataset.openCloud) { m.close(); router().go('studio/' + b.dataset.openCloud); }
      else if (b.dataset.del) {
        const id = b.dataset.del;
        const ok = await U.confirm('This removes the graph from this device. Shared links you already sent keep working.', { title: 'Delete this graph?', okText: 'Delete', danger: true });
        if (!ok) return;
        C.Library.remove(id);
        b.closest('.lib-row').remove();
        if (S.mode === 'local' && S.localId === id) openLocal(C.Library.current());
        U.toast('Graph deleted');
      } else if (b.hasAttribute('data-new')) { m.close(); newGraph(); }
    });
  }

  /* ---------- share: link / publish / live ---------- */
  const pubKey = () => (S.mode === 'cloud' ? 'cloud:' + S.gid : 'local:' + S.localId);
  const pubInfo = (v) => { const all = C.store.get('gs.pubs', {}); if (v !== undefined) { if (v) all[pubKey()] = v; else delete all[pubKey()]; C.store.set('gs.pubs', all); } return all[pubKey()] || null; };

  async function shareDialog(startTab) {
    let tab = startTab || 'link';
    const m = U.modal({
      title: 'Share', width: 560,
      body: `<div class="tabs" role="tablist">${[['link', 'Link', 'link'], ['publish', 'Publish', 'globe'], ['live', 'Live together', 'users']].map(([k, n, ic]) => `<button type="button" role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}">${icon(ic)}<span>${n}</span></button>`).join('')}</div><div class="tab-body" id="shBody"></div>`,
    });
    const body = $('#shBody', m.body);
    const show = (t) => { tab = t; $$('.tabs [data-tab]', m.body).forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); body.innerHTML = ''; ({ link: shareLink, publish: sharePublish, live: shareLive })[t](body, m); };
    C.on(m.body, 'click', '.tabs [data-tab]', (e, b) => show(b.dataset.tab));
    const off = C.bus.on('auth', () => { if (document.contains(body)) show(tab); else off(); });
    show(tab);
  }
  function cloudGate(body, what, then) {
    if (!GS.cloud.configured) {
      body.innerHTML = `<div class="notice">${icon('cloudOff')}<div><b>${esc(what)} needs Firebase</b><p>Paste your Firebase config into <code>js/config.js</code>. SETUP.md walks you through it in about ten minutes, for free.</p></div></div>`;
      return false;
    }
    if (!GS.cloud.user) {
      body.innerHTML = `<div class="notice">${icon('user')}<div><b>Sign in first</b><p>${esc(what)} uses your Graph Studio account.</p><button class="btn primary sm" type="button" data-signin>Sign in or create account</button></div></div>`;
      body.querySelector('[data-signin]').addEventListener('click', () => GS.pages.authModal().then((u) => { if (u && then) then(); }));
      return false;
    }
    if (!GS.cloud.profile) {
      body.innerHTML = `<div class="notice">${icon('user')}<div><b>Set up your profile</b><p>Pick a username so people know who made it.</p><button class="btn primary sm" type="button" data-prof>Set up profile</button></div></div>`;
      body.querySelector('[data-prof]').addEventListener('click', () => GS.pages.profileModal().then(() => then && then()));
      return false;
    }
    return true;
  }
  async function shareLink(body) {
    const name = C.prefs.shareName || (GS.cloud.profile && GS.cloud.profile.displayName) || '';
    body.innerHTML = `<p class="muted">Anyone with this link sees the graph, its animation and the data table. No account needed.</p>
      <label class="flabel" for="shName">Show as made by</label><input class="field" id="shName" value="${esc(name)}" placeholder="Your name (optional)" maxlength="40" autocomplete="off">
      <div class="url-row"><input class="field" id="shUrl" readonly value="Making link…" aria-label="Share link"><button class="btn primary" type="button" id="shCopy">${icon('copy')}<span>Copy link</span></button></div>
      <div class="sheet-actions spread"><p class="pnote">The graph is stored inside the link, so later edits won’t change it. Publish if you want one link that stays up to date.</p><a class="btn sm" id="shOpen" target="_blank" rel="noopener">${icon('external')}<span>Open preview</span></a></div>`;
    const make = async () => {
      const n = $('#shName', body).value.trim();
      C.prefs.shareName = n; C.savePrefs();
      const packed = await C.pack({ d: S.doc, n, t: Date.now() });
      const url = router().absolute('view/' + packed, true);
      if (!document.contains(body)) return;
      $('#shUrl', body).value = url;
      $('#shOpen', body).href = url;
      return url;
    };
    await make();
    $('#shName', body).addEventListener('input', C.debounce(make, 300));
    $('#shCopy', body).addEventListener('click', async (e) => {
      const url = await make();
      await C.copyText(url);
      U.toast('Link copied', { icon: 'link' });
      const r = e.currentTarget.getBoundingClientRect();
      U.confetti(r.left + r.width / 2, r.top, null, 14);
    });
  }
  async function sharePublish(body, m) {
    const again = () => { body.innerHTML = ''; sharePublish(body, m); };
    if (!cloudGate(body, 'Publishing', again)) return;
    const info = pubInfo();
    let post = null;
    if (info) { try { post = await GS.cloud.getPost(info.pid); } catch (e) { post = null; } if (!post) pubInfo(null); }
    if (!document.contains(body)) return;
    const slug0 = (post && post.slug) || C.slugify(S.doc.title);
    body.innerHTML = `<p class="muted">Put this graph on the community wall with its own link.</p>
      <label class="flabel" for="pbTitle">Name</label><input class="field" id="pbTitle" maxlength="80" value="${esc((post && post.title) || S.doc.title)}" autocomplete="off">
      <label class="flabel" for="pbDesc">Description</label><textarea class="field area" id="pbDesc" rows="3" maxlength="500" placeholder="What does this graph show?">${esc((post && post.description) || S.doc.subtitle || '')}</textarea>
      <label class="flabel" for="pbSlug">Link</label>
      <div class="slug-row"><span class="slug-pre">${esc(router().absolute('graph/', false).replace(/^https?:\/\//, ''))}</span><input class="field" id="pbSlug" value="${esc(slug0)}" maxlength="48" spellcheck="false" autocomplete="off"><span class="slug-post">/preview</span></div>
      <p class="slug-state" id="pbState"></p>
      <div id="pbDone"></div>
      <div class="sheet-actions">${post ? `<button class="btn danger ghost" type="button" id="pbUnpub">Unpublish</button><span class="grow"></span>` : ''}<button class="btn primary" type="button" id="pbGo">${icon('globe')}<span>${post ? 'Update' : 'Publish'}</span></button></div>`;
    const slugIn = $('#pbSlug', body), state = $('#pbState', body), go = $('#pbGo', body);
    let okSlug = false;
    const check = C.debounce(async () => {
      const s = C.cleanSlug(slugIn.value);
      if (s.length < 3) { okSlug = false; state.className = 'slug-state bad'; state.textContent = 'Use at least 3 letters or numbers.'; return; }
      if (['graph', 'studio', 'community', 'view', 'preview', 'index'].includes(s)) { okSlug = false; state.className = 'slug-state bad'; state.textContent = 'That word is used by the app itself. Try another.'; return; }
      state.className = 'slug-state'; state.textContent = 'Checking…';
      try {
        const owner = await GS.cloud.slugOwner(s);
        if (C.cleanSlug(slugIn.value) !== s) return;
        okSlug = !owner || (post && owner === post.pid);
        state.className = 'slug-state ' + (okSlug ? 'good' : 'bad');
        state.textContent = !owner ? 'Available' : okSlug ? 'This is your link' : 'Someone already uses this link. Try another.';
      } catch (e) { state.textContent = ''; okSlug = true; }
    }, 280);
    slugIn.addEventListener('input', () => { const c = C.cleanSlug(slugIn.value); if (c !== slugIn.value) slugIn.value = c; check(); });
    check();
    go.addEventListener('click', async () => {
      const title = $('#pbTitle', body).value.trim();
      const slug = C.cleanSlug(slugIn.value);
      if (!title) return U.toast('Give it a name first', { tone: 'warn' });
      check.flush();
      await C.sleep(50);
      if (!okSlug) return U.toast('Pick a different link', { tone: 'warn' });
      go.disabled = true; go.classList.add('busy');
      try {
        const res = await GS.cloud.publish({ pid: post && post.pid, title, description: $('#pbDesc', body).value.trim(), slug, doc: S.doc, graphId: S.mode === 'cloud' ? S.gid : undefined });
        pubInfo(res);
        post = Object.assign({}, post, { pid: res.pid, slug: res.slug });
        const url = router().absolute(`graph/${res.slug}/preview`, false);
        $('#pbDone', body).innerHTML = `<div class="done-box">${icon('check')}<div><b>Published</b><div class="url-row"><input class="field" readonly value="${esc(url)}"><button class="btn sm" type="button" data-copy>${icon('copy')}<span>Copy</span></button><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">${icon('external')}<span>Open</span></a></div></div></div>`;
        $('#pbDone [data-copy]', body).addEventListener('click', () => C.copyText(url).then(() => U.toast('Link copied', { icon: 'link' })));
        go.querySelector('span').textContent = 'Update';
        const r = go.getBoundingClientRect();
        U.confetti(r.left + r.width / 2, r.top, C.seriesOf(S.doc).map((s) => s.color).concat([C.accentSet(C.prefs.accent).light]), 34);
      } catch (e) {
        console.warn(e);
        U.toast(/permission/i.test(e.message) ? 'Firebase refused that. Check that you pasted the rules from database.rules.json.' : e.message, { tone: 'warn', ms: 6000 });
      } finally { go.disabled = false; go.classList.remove('busy'); }
    });
    const un = $('#pbUnpub', body);
    if (un) un.addEventListener('click', async () => {
      const ok = await U.confirm('It disappears from the community wall and its link stops working.', { title: 'Unpublish this graph?', okText: 'Unpublish', danger: true });
      if (!ok) return;
      try { await GS.cloud.unpublish(post.pid); pubInfo(null); U.toast('Unpublished'); again(); } catch (e) { U.toast(e.message, { tone: 'warn' }); }
    });
  }
  async function shareLive(body, m) {
    const again = () => { body.innerHTML = ''; shareLive(body, m); };
    if (!cloudGate(body, 'Live editing', again)) return;
    if (S.mode !== 'cloud') {
      body.innerHTML = `<div class="live-hero"><div class="live-cursors" aria-hidden="true">${cursorSVG()}${cursorSVG()}</div>
        <p>Start a live session and anyone you invite can edit this graph with you. You’ll see their cursors and their changes as they make them.</p></div>
        <div class="sheet-actions"><button class="btn primary" type="button" id="lvStart">${icon('users')}<span>Start live session</span></button></div>`;
      $('#lvStart', body).addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.classList.add('busy');
        try {
          const gid = await GS.cloud.createGraph(S.doc);
          m.close();
          router().go('studio/' + gid);
          setTimeout(() => shareDialog('live'), 700);
        } catch (err) {
          console.warn(err);
          U.toast(/permission/i.test(err.message) ? 'Firebase refused that. Check that you pasted the rules from database.rules.json.' : err.message, { tone: 'warn', ms: 6000 });
          b.disabled = false; b.classList.remove('busy');
        }
      });
      return;
    }
    const isOwner = S.meta && GS.cloud.user && S.meta.owner === GS.cloud.user.uid;
    body.innerHTML = `<p class="muted">Anyone with this link can join and edit with you after they sign in.</p>
      <div class="url-row"><input class="field" id="lvUrl" readonly value="Loading…" aria-label="Invite link"><button class="btn primary" type="button" id="lvCopy">${icon('copy')}<span>Copy invite</span></button></div>
      ${isOwner ? `<button class="btn sm ghost" type="button" id="lvNew">${icon('refresh')}<span>Make a new link</span></button><p class="pnote">A new link stops the old one from working. People who already joined stay in.</p>` : ''}
      <h3 class="sub-h">People</h3><div class="people" id="lvPeople"><p class="muted">Loading…</p></div>
      ${!isOwner ? `<div class="sheet-actions"><button class="btn danger ghost" type="button" id="lvLeave">Leave this graph</button></div>` : ''}`;
    const setUrl = (tok) => { const el = $('#lvUrl', body); if (el) el.value = tok ? router().absolute(`studio/${S.gid}?join=${tok}`, false) : 'Only members can see the invite link.'; };
    GS.cloud.inviteToken(S.gid).then(setUrl).catch(() => setUrl(null));
    $('#lvCopy', body).addEventListener('click', async () => { const v = $('#lvUrl', body).value; if (/^https?:/.test(v)) { await C.copyText(v); U.toast('Invite link copied', { icon: 'link' }); } });
    const nb = $('#lvNew', body);
    if (nb) nb.addEventListener('click', async () => { try { setUrl(await GS.cloud.newInviteToken(S.gid)); U.toast('New invite link made'); } catch (e) { U.toast(e.message, { tone: 'warn' }); } });
    const lb = $('#lvLeave', body);
    if (lb) lb.addEventListener('click', async () => {
      const ok = await U.confirm('You’ll need a new invite link to come back.', { title: 'Leave this graph?', okText: 'Leave', danger: true });
      if (!ok) return;
      try { await GS.cloud.leaveGraph(S.gid); m.close(); router().go('studio'); U.toast('You left the graph'); } catch (e) { U.toast(e.message, { tone: 'warn' }); }
    });
    const uids = Object.keys(S.members || {});
    const ps = await Promise.all(uids.map((u) => GS.cloud.getProfile(u).catch(() => null)));
    const box = $('#lvPeople', body);
    if (!box) return;
    box.innerHTML = uids.map((u, i) => {
      const p = ps[i] || { uid: u, displayName: 'Someone' };
      const role = S.members[u] === 'owner' ? 'Owner' : 'Editor';
      const here = !!S.peers[u] || (GS.cloud.user && u === GS.cloud.user.uid);
      return `<div class="person">${U.avatar(Object.assign({ uid: u }, p), 34)}<div><b>${esc(p.displayName || 'Someone')}${GS.cloud.user && u === GS.cloud.user.uid ? ' (you)' : ''}</b><span>${role}${here ? ', here now' : ''}</span></div>${isOwner && S.members[u] !== 'owner' ? `<button class="btn sm ghost" type="button" data-rm="${esc(u)}">Remove</button>` : ''}</div>`;
    }).join('');
    C.on(box, 'click', '[data-rm]', async (e, b) => { try { await GS.cloud.removeMember(S.gid, b.dataset.rm); b.closest('.person').remove(); U.toast('Removed'); } catch (err) { U.toast(err.message, { tone: 'warn' }); } });
  }

  /* ======================= collaboration: cursors ======================= */
  function cursorSVG() {
    return '<svg class="cursor-arrow" width="22" height="24" viewBox="0 0 22 24" aria-hidden="true"><path d="M3.4 2.3c-.7-.4-1.5.2-1.4 1l2.4 17.4c.1.9 1.2 1.2 1.8.5l4.3-5.1c.3-.3.7-.5 1.1-.5l6.6-.3c.9 0 1.3-1.1.7-1.7z" fill="var(--c)" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  }
  function startPresence() {
    if (S.mode !== 'cloud' || !GS.cloud.user || S.pres) return;
    const p = GS.cloud.profile;
    S.myColor = U.hashColor(GS.cloud.user.uid);
    S.pres = GS.cloud.presence(S.gid, { name: (p && p.displayName) || (GS.cloud.user.email || 'Someone').split('@')[0], color: S.myColor }, onPeers);
    const move = (e) => onPointerMove(e);
    const leave = () => { if (S.pres) S.pres.move({ a: null }); };
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    S.presOff = () => { document.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); };
    S.raf = requestAnimationFrame(cursorLoop);
    renderPresence();
  }
  function stopPresence() {
    if (S.pres) { S.pres.leave(); S.pres = null; }
    if (S.presOff) { S.presOff(); S.presOff = null; }
    cancelAnimationFrame(S.raf);
    Object.values(S.cursorEls).forEach((el) => el.remove());
    S.cursorEls = {};
    S.peers = {};
    const p = S.root && $('#presence', S.root);
    if (p) p.innerHTML = '';
    S.presSig = '';
  }
  function onPointerMove(e) {
    if (!S.pres || !S.root) return;
    S.lastPointer = { x: e.clientX, y: e.clientY };
    const el = e.target && e.target.closest ? e.target.closest('#studio [data-anchor]') : null;
    let pos;
    if (el && (el.dataset.anchor !== 'panel' || S.panelOpen)) {
      const r = el.getBoundingClientRect();
      pos = { a: el.dataset.anchor, x: Math.round(((e.clientX - r.left) / r.width) * 10000) / 10000, y: Math.round(((e.clientY - r.top) / r.height) * 10000) / 10000 };
    } else pos = { a: 'view', x: Math.round((e.clientX / innerWidth) * 10000) / 10000, y: Math.round((e.clientY / innerHeight) * 10000) / 10000 };
    S.pres.move(pos);
  }
  function peerScreenPos(p) {
    if (!p || !p.a || typeof p.x !== 'number') return null;
    if (p.a === 'view') return { x: p.x * innerWidth, y: p.y * innerHeight };
    if (p.a === 'panel' && !S.panelOpen) return null;
    const el = $(`#studio [data-anchor="${p.a}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.left + p.x * r.width, y: r.top + p.y * r.height };
  }
  function onPeers(all) {
    const me = GS.cloud.user && GS.cloud.user.uid;
    const nowT = GS.cloud.now();
    const peers = {};
    Object.keys(all).forEach((u) => {
      const p = all[u];
      if (u === me || !p || !p.name) return;
      if (p.t && nowT - p.t > 15 * 60 * 1000) return;
      peers[u] = p;
    });
    Object.keys(peers).forEach((u) => {
      const p = peers[u], prev = S.peers[u];
      if (p.r && p.rt && (!prev || prev.rt !== p.rt) && nowT - p.rt < 6000) {
        const pos = peerScreenPos(p) || { x: innerWidth / 2, y: innerHeight / 2 };
        U.emojiBurst(p.r, pos.x, pos.y);
      }
    });
    const joined = Object.keys(peers).filter((u) => !S.peers[u]);
    if (joined.length && Object.keys(S.peers).length + joined.length > 0 && S.presReady) joined.forEach((u) => U.toast(`${peers[u].name} joined`, { icon: 'users', ms: 2200 }));
    S.presReady = true;
    S.peers = peers;
    renderPresence();
    renderPeerCells();
  }
  function cursorLoop() {
    if (!S.pres) return;
    const layer = document.getElementById('cursors');
    const k = U.reduce() ? 1 : 0.3;
    Object.keys(S.peers).forEach((u) => {
      const p = S.peers[u];
      let el = S.cursorEls[u];
      if (!el) {
        el = h(`<div class="cursor" style="--c:${esc(p.color || '#ff5ca2')}">${cursorSVG()}<span class="cursor-name"></span></div>`);
        layer.appendChild(el);
        S.cursorEls[u] = el;
        el.$x = null;
      }
      el.style.setProperty('--c', p.color || '#ff5ca2');
      const name = el.querySelector('.cursor-name');
      if (name.textContent !== p.name) { name.textContent = p.name; name.style.color = C.inkOn(p.color || '#ff5ca2'); }
      const target = C.prefs.cursors ? peerScreenPos(p) : null;
      if (!target) { el.classList.add('gone'); return; }
      el.classList.remove('gone');
      if (el.$x === null) { el.$x = target.x; el.$y = target.y; }
      el.$x += (target.x - el.$x) * k;
      el.$y += (target.y - el.$y) * k;
      el.style.transform = `translate3d(${el.$x.toFixed(1)}px, ${el.$y.toFixed(1)}px, 0)`;
      el.classList.toggle('idle', !!(p.t && GS.cloud.now() - p.t > 45000));
    });
    Object.keys(S.cursorEls).forEach((u) => {
      if (S.peers[u]) return;
      const el = S.cursorEls[u];
      delete S.cursorEls[u];
      el.classList.add('gone');
      setTimeout(() => el.remove(), 300);
    });
    S.raf = requestAnimationFrame(cursorLoop);
  }
  function renderPresence() {
    const box = S.root && $('#presence', S.root);
    if (!box) return;
    if (S.mode !== 'cloud' || !S.pres) { box.innerHTML = ''; S.presSig = ''; return; }
    if (!box.querySelector('#btnReact')) {
      // Built once, so the button stays clickable while cursors stream in.
      box.innerHTML = `<div class="pres-avs"></div><button class="icon-btn" type="button" id="btnReact" data-tip="Send a reaction" aria-label="Send a reaction">${icon('smile')}</button>`;
      S.presSig = '';
      $('#btnReact', box).addEventListener('click', (e) => {
        const bar = h(`<div class="react-bar">${REACTIONS.map((r) => `<button type="button" data-r="${r}" aria-label="React ${r}">${r}</button>`).join('')}</div>`);
        const pop = U.popover(e.currentTarget, bar, { align: 'end', className: 'pop-react' });
        bar.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-r]');
          if (!b || !S.pres) return;
          pop.close();
          S.pres.react(b.dataset.r);
          const at = S.lastPointer || { x: innerWidth / 2, y: innerHeight / 2 };
          U.emojiBurst(b.dataset.r, at.x, at.y);
        });
      });
    }
    const list = Object.keys(S.peers).map((u) => ({ uid: u, name: S.peers[u].name, avatar: 'color:' + (S.peers[u].color || '#ff5ca2') }));
    const me = GS.cloud.profile ? Object.assign({ uid: GS.cloud.user.uid }, GS.cloud.profile) : { uid: GS.cloud.user.uid, name: 'You', avatar: 'color:' + S.myColor };
    const sig = JSON.stringify([me.uid, me.displayName || me.name, me.avatar, list]);
    if (sig === S.presSig) return;
    S.presSig = sig;
    $('.pres-avs', box).innerHTML = [me].concat(list).slice(0, 5).map((p, i) => `<span class="pres-av" style="--i:${i}" data-tip="${esc(i === 0 ? 'You' : p.name)}">${U.avatar(p, 30)}</span>`).join('')
      + (list.length > 4 ? `<span class="pres-more">+${list.length - 4}</span>` : '');
  }
  function renderPeerCells() {
    if (!S.root) return;
    $$('#grid td.peer').forEach((td) => { td.classList.remove('peer'); td.removeAttribute('data-peer'); td.style.removeProperty('--pc'); });
    if (S.mode !== 'cloud') return;
    Object.keys(S.peers).forEach((u) => {
      const p = S.peers[u];
      if (!p.cell) return;
      const [rId, col] = String(p.cell).split(':');
      const inp = $(`#grid .cell[data-r="${rId}"][data-c="${col}"]`);
      if (!inp) return;
      const td = inp.parentElement;
      td.classList.add('peer');
      td.dataset.peer = p.name;
      td.style.setProperty('--pc', p.color || '#ff5ca2');
    });
  }

  /* ======================= command palette ======================= */
  function commands() {
    const cmds = C.TYPES.map((t) => ({ label: `Make it a ${t.name.toLowerCase()} graph`, icon: t.icon, keywords: 'type chart ' + t.id, run: () => mutate((d) => { d.type = t.id; }) }));
    return cmds.concat([
      { label: 'Add row', icon: 'plus', hint: 'Enter', run: () => addRow() },
      { label: 'Add series', icon: 'layers', run: () => addSeries() },
      { label: 'Paste or import data', icon: 'upload', run: importDialog },
      { label: 'Export', icon: 'download', hint: '⌘E', keywords: 'png csv sheets slides pptx', run: exportDialog },
      { label: 'Download PNG', icon: 'image', run: () => { X.png(S.doc, {}); U.toast('PNG downloaded'); } },
      { label: 'Download CSV', icon: 'table', run: () => { X.csv(S.doc); U.toast('CSV downloaded'); } },
      { label: 'Copy share link', icon: 'link', run: () => shareDialog('link') },
      { label: 'Publish to the community', icon: 'globe', run: () => shareDialog('publish') },
      { label: 'Edit live with others', icon: 'users', run: () => shareDialog('live') },
      { label: 'Customize colours and series', icon: 'palette', run: () => openPanelTab('series') },
      { label: 'Axes and scale', icon: 'ruler', run: () => openPanelTab('axes') },
      { label: 'Legend', icon: 'list', run: () => openPanelTab('legend') },
      { label: 'Wallpaper and look', icon: 'wallpaper', run: () => openPanelTab('look') },
      { label: 'Animation', icon: 'zap', run: () => openPanelTab('motion') },
      { label: 'Replay animation', icon: 'play', hint: 'R', run: replay },
      { label: 'Focus mode', icon: 'maximize', hint: 'F', run: () => toggleFocus() },
      { label: 'Reset zoom', icon: 'reset', hint: '0', run: () => { if (S.chart && S.chart.resetZoom) S.chart.resetZoom(); updateZoomRead(); } },
      { label: 'Undo', icon: 'undo', hint: '⌘Z', run: undo },
      { label: 'Redo', icon: 'redo', hint: '⇧⌘Z', run: redo },
      { label: 'New graph', icon: 'fileText', run: () => newGraph() },
      { label: 'Sample graphs', icon: 'table', run: samplesDialog },
      { label: 'My graphs', icon: 'grid', run: libraryDialog },
      { label: 'Go to the community wall', icon: 'globe', run: () => router().go('community') },
      { label: 'Change accent colour', icon: 'palette', keywords: 'theme color colour settings', run: () => GS.pages.settingsModal() },
    ]);
  }

  /* ======================= events ======================= */
  function bind() {
    const root = S.root;
    const grid = $('#grid');
    grid.addEventListener('input', onGridInput);
    grid.addEventListener('keydown', onGridKey);
    grid.addEventListener('paste', onGridPaste);
    C.on(grid, 'click', '[data-act]', onGridAct);
    grid.addEventListener('focusin', (e) => { const t = e.target; if (t.classList.contains('cell') && S.pres) S.pres.set({ cell: t.dataset.r + ':' + t.dataset.c }); });
    grid.addEventListener('focusout', (e) => {
      const t = e.target;
      if (S.pres && t.classList.contains('cell')) S.pres.set({ cell: null });
      if (t.classList.contains('cell') && t.classList.contains('bad')) { t.classList.remove('bad'); schedule(); S.gridSig = S.gridSig + ''; renderGrid(); }
    });
    $('#addRow').addEventListener('click', () => addRow());
    C.on(root, 'click', '#dataPost .post-acts [data-act]', (e, b) => { if (b.dataset.act === 'import') importDialog(); else addSeries(); });
    C.on($('#legendStrip'), 'click', '[data-act]', onLegendAct);
    $('#statsPick').addEventListener('change', (e) => { S.statsSel = e.target.value; S.statsSig = ''; renderStats(); });

    C.on($('#types'), 'click', '.type', (e, b) => { if (b.dataset.t !== S.doc.type) mutate((d) => { d.type = b.dataset.t; }); });
    C.on(root, 'click', '#toolSeg button', (e, b) => setTool(b.dataset.v));
    C.on(root, 'click', '#tools [data-act], .stage-empty [data-act]', (e, b) => {
      const a = b.dataset.act;
      if (a === 'zoom-in' && S.chart) S.chart.zoom(1.25);
      else if (a === 'zoom-out' && S.chart) S.chart.zoom(0.8);
      else if (a === 'zoom-reset' && S.chart) S.chart.resetZoom();
      else if (a === 'replay') replay();
      else if (a === 'focus') toggleFocus();
      else if (a === 'samples') samplesDialog();
      updateZoomRead();
    });

    const ti = $('#docTitle'), sub = $('#docSub');
    ti.addEventListener('input', () => mutate((d) => { d.title = ti.value; }, { key: 'title' }));
    ti.addEventListener('blur', () => { if (!ti.value.trim()) mutate((d) => { d.title = 'Untitled graph'; }); });
    ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sub.focus(); } });
    sub.addEventListener('input', () => { autosize(sub); mutate((d) => { d.subtitle = sub.value; }, { key: 'subtitle' }); });
    sub.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sub.blur(); } });

    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#btnCustomize').addEventListener('click', () => togglePanel());
    $('#btnExport').addEventListener('click', exportDialog);
    $('#btnShare').addEventListener('click', () => shareDialog());
    bindPanel();

    $('#fab').addEventListener('click', () => toggleFab());
    C.on($('#fabMenu'), 'click', '[data-fab]', (e, b) => fabAction(b.dataset.fab));
    const outside = (e) => { if (S.fabOpen && !e.target.closest('#fabWrap')) toggleFab(false); };
    document.addEventListener('pointerdown', outside);
    S.cleanups.push(() => document.removeEventListener('pointerdown', outside));

    const drop = $('#drop');
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const studio = $('#studio');
    studio.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); drop.classList.add('on'); });
    drop.addEventListener('dragleave', (e) => { if (e.target === drop) drop.classList.remove('on'); });
    studio.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); drop.classList.remove('on'); const f = e.dataTransfer.files[0]; if (f) importFile(f); });

    const onKey = (e) => {
      if (!S.doc) return;
      const mod = e.metaKey || e.ctrlKey;
      const t = e.target;
      const typing = t && t.matches && t.matches('input, textarea, select, [contenteditable]');
      const inGrid = t && t.closest && t.closest('#grid');
      const k = (e.key || '').toLowerCase();
      if (mod && k === 'z' && (!typing || inGrid)) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y' && (!typing || inGrid)) { e.preventDefault(); redo(); return; }
      if (mod && k === 'k') { e.preventDefault(); U.commandPalette(commands()); return; }
      if (mod && k === 'e') { e.preventDefault(); exportDialog(); return; }
      if (mod && k === 's') { e.preventDefault(); if (S.mode === 'local') { S.saveLocal.flush(); U.toast('Saved on this device'); } else U.toast('Live graphs save as you type'); return; }
      if (typing || mod || e.altKey || document.querySelector('.sheet-back, .pop')) return;
      if (k === 'v') setTool('pointer');
      else if (k === 'h') setTool('hand');
      else if (k === 'z' && typeInfo().cartesian) setTool('zoom');
      else if (k === 'f') toggleFocus();
      else if (k === 'r') replay();
      else if (k === '0' && S.chart && S.chart.resetZoom) { S.chart.resetZoom(); updateZoomRead(); }
    };
    document.addEventListener('keydown', onKey);
    S.cleanups.push(() => document.removeEventListener('keydown', onKey));
    const onResize = C.debounce(moveTypeInd, 120);
    window.addEventListener('resize', onResize);
    S.cleanups.push(() => window.removeEventListener('resize', onResize));
    S.cleanups.push(C.bus.on('cloud:connection', () => setSave(S.saveState)));
    S.cleanups.push(C.bus.on('auth', () => { if (S.root && S.doc) renderHeader(); }));
    S.cleanups.push(C.bus.on('fonts', () => { if (S.chart) S.chart.update('none'); moveTypeInd(); }));
    S.cleanups.push(C.bus.on('accent', () => { if (S.chart && S.doc) S.chart = E.update(S.chart, S.doc, chartOpts({ mode: 'none' })); if (S.doc) renderHeader(); }));
    S.cleanups.push(C.bus.on('cloud:signing-out', () => { if (S.mode === 'cloud') { stopCloud(); router().go('studio'); } }));
  }

  GS.studio = {
    mount, unmount, shareDialog, exportDialog, libraryDialog, samplesDialog, newGraph, commands,
    get doc() { return S.doc; },
    get mode() { return S.mode; },
  };
})();
