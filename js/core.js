/* Graph Studio · core
   Helpers, the graph document model, patches (for undo + live sync),
   local storage, share-link packing and CSV parsing. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});

  /* ---------------- DOM ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }
  function on(root, type, sel, fn, opts) {
    const l = (e) => {
      const t = e.target && e.target.closest ? e.target.closest(sel) : null;
      if (t && root.contains(t)) fn(e, t);
    };
    root.addEventListener(type, l, opts);
    return () => root.removeEventListener(type, l, opts);
  }

  /* ---------------- tiny event bus ---------------- */
  const handlers = {};
  const bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || new Set()).add(fn); return () => handlers[ev].delete(fn); },
    emit(ev, data) { (handlers[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  /* ---------------- numbers ---------------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function parseNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s) return null;
    s = s.replace(/[\s_]/g, '').replace(/^[$€£₹¥]/, '').replace(/^(-)[$€£₹¥]/, '$1').replace(/%$/, '');
    const commas = (s.match(/,/g) || []).length;
    if (commas === 1 && !s.includes('.') && !/,\d{3}$/.test(s)) s = s.replace(',', '.'); // 1,5 → 1.5
    else s = s.replace(/,/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  function fmtNum(v, f, extra) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    f = f || {};
    const o = {};
    const d = f.decimals === 'auto' || f.decimals === undefined || f.decimals === null || f.decimals === '' ? null : Number(f.decimals);
    if (f.compact && Math.abs(v) >= 1000) {
      o.notation = 'compact';
      o.maximumFractionDigits = d === null ? 1 : d;
    } else if (d === null) {
      o.maximumFractionDigits = Math.abs(v) < 1 && v !== 0 ? 3 : 2;
    } else {
      o.minimumFractionDigits = d;
      o.maximumFractionDigits = d;
    }
    if (extra && extra.max !== undefined) o.maximumFractionDigits = Math.min(o.maximumFractionDigits, extra.max);
    let s;
    try { s = new Intl.NumberFormat(undefined, o).format(Math.abs(v)); } catch (e) { s = String(Math.abs(v)); }
    return (v < 0 ? '-' : '') + (f.prefix || '') + s + (f.suffix || '');
  }
  function statsOf(values) {
    const v = values.filter((x) => typeof x === 'number' && isFinite(x));
    const n = v.length;
    if (!n) return { count: 0, sum: null, mean: null, median: null, min: null, max: null, range: null, sd: null };
    const s = [...v].sort((a, b) => a - b);
    const sum = v.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0;
    return { count: n, sum, mean, median, min: s[0], max: s[n - 1], range: s[n - 1] - s[0], sd };
  }

  /* ---------------- colour ---------------- */
  function hexToRgb(hex) {
    let x = String(hex || '').replace('#', '').trim();
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    const n = parseInt(x.slice(0, 6), 16);
    if (isNaN(n)) return { r: 128, g: 128, b: 128 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; };
  function lum(hex) {
    const c = hexToRgb(hex);
    const f = (u) => { u /= 255; return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  const inkOn = (hex) => { const L = lum(hex); return 1.05 / (L + 0.05) >= (L + 0.05) / 0.058 ? '#ffffff' : '#15151b'; };
  const validHex = (s) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(s || '').trim());
  function normHex(s) {
    let x = String(s || '').trim().replace('#', '').toLowerCase();
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    return '#' + x;
  }

  function mix(a, b, t) {
    const x = hexToRgb(a), y = hexToRgb(b);
    const c = (u, v) => Math.round(u + (v - u) * t).toString(16).padStart(2, '0');
    return '#' + c(x.r, y.r) + c(x.g, y.g) + c(x.b, y.b);
  }
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  /* ---------------- accent colour ---------------- */
  const ACCENTS = [['#f43f8c', 'Pink'], ['#ff6b4a', 'Coral'], ['#f5a524', 'Amber'], ['#8bd63f', 'Lime'], ['#22c58b', 'Mint'], ['#2fa8ff', 'Sky'], ['#6c7bff', 'Iris'], ['#a55cff', 'Violet']];
  // From one colour, works out the shades the interface needs:
  // light = readable text/outlines on the dark cards, btn = dark enough for white button text,
  // on = black or white for icons sitting on the accent itself.
  function accentSet(hex) {
    const main = validHex(hex) ? normHex(hex) : '#f43f8c';
    let light = main, t = 0;
    while (contrast(light, '#1f1f26') < 4.5 && t < 0.9) { t += 0.05; light = mix(main, '#ffffff', t); }
    let btn = main; t = 0;
    while (contrast(btn, '#ffffff') < 4.5 && t < 0.9) { t += 0.05; btn = mix(main, '#000000', t); }
    return { main, light, btn, on: inkOn(main) };
  }

  /* ---------------- misc ---------------- */
  const rid = (p) => (p || '') + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3);
  const clone = (o) => (o === undefined || o === null ? o : JSON.parse(JSON.stringify(o)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function debounce(fn, ms) {
    let t, last;
    const d = (...a) => { last = a; clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = () => { if (t) { clearTimeout(t); t = null; fn(...(last || [])); } };
    d.cancel = () => clearTimeout(t);
    return d;
  }
  function throttle(fn, ms) {
    let lastRun = 0, timer = null, args;
    return (...a) => {
      args = a;
      const wait = ms - (Date.now() - lastRun);
      if (wait <= 0) { lastRun = Date.now(); fn(...args); }
      else if (!timer) timer = setTimeout(() => { timer = null; lastRun = Date.now(); fn(...args); }, wait);
    };
  }
  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 7) { const d = Math.round(s / 86400); return d + (d === 1 ? ' day ago' : ' days ago'); }
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const slugify = (s) =>
    String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'graph';
  const cleanSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '').slice(0, 48);
  function download(name, data) {
    const a = document.createElement('a');
    const url = data instanceof Blob ? URL.createObjectURL(data) : data;
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (data instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => res();
        s.onerror = () => { delete scripts[src]; rej(new Error('Could not load ' + src)); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (err) { /* ignore */ }
      ta.remove();
      return ok;
    }
  }

  /* ---------------- palettes, wallpapers, chart types ---------------- */
  // "Studio" is the default: checked for colour-blind separation and 3:1 contrast on the dark card.
  const PALETTES = {
    studio: { name: 'Studio', colors: ['#338ced', '#e76624', '#00a888', '#d28e05', '#e24d8b', '#0aac23', '#9887ef', '#eb6263'] },
    candy: { name: 'Candy', colors: ['#ff5ca2', '#8f7bff', '#36b3ff', '#ffb84d', '#2fd39a', '#ff7f50', '#c77dff', '#3fd3d3'] },
    ocean: { name: 'Ocean', colors: ['#3a8dde', '#22b3c4', '#4fd1a5', '#7aa2ff', '#1f6fb2', '#9ad8e8', '#5b6ee1', '#2a9d8f'] },
    sunset: { name: 'Sunset', colors: ['#ff7a59', '#ffb347', '#f25f7a', '#c75dbe', '#ffd166', '#8e6fd8', '#ff9f80', '#e63e6d'] },
    forest: { name: 'Forest', colors: ['#3fae6a', '#a3c45a', '#d6a84a', '#2f8f83', '#7fb685', '#c97b4a', '#5c9e3f', '#b6c98a'] },
    neon: { name: 'Neon', colors: ['#00e5ff', '#ff2bd6', '#b6ff3b', '#ffe14d', '#8a6bff', '#ff7b1c', '#39ffb0', '#ff4f6d'] },
    pastel: { name: 'Pastel', colors: ['#9cc9ff', '#ffb1cf', '#ffe08a', '#a6e8c4', '#cdb8ff', '#ffc6a0', '#a8e3ea', '#f6b0b0'] },
    mono: { name: 'Graphite', colors: ['#e9e9ee', '#9696a3', '#c4c4cd', '#6e6e7b', '#b0b0bb', '#55555f', '#d9d9e0', '#83838f'] },
  };
  const SWATCHES = [
    '#338ced', '#36b3ff', '#22b3c4', '#00a888', '#0aac23', '#2fd39a', '#a3c45a', '#d28e05',
    '#ffb84d', '#ffd166', '#e76624', '#ff7f50', '#eb6263', '#e63e6d', '#e24d8b', '#ff5ca2',
    '#c77dff', '#9887ef', '#8f7bff', '#5b6ee1', '#ffffff', '#c4c4cd', '#83838f', '#3a3a44',
  ];
  const WALLPAPERS = {
    dusk: { name: 'Dusk', css: 'radial-gradient(120% 80% at 0% 0%, #2d1b4a 0%, rgba(45,27,74,0) 55%), radial-gradient(90% 70% at 100% 100%, #162c4a 0%, rgba(22,44,74,0) 55%), #121218' },
    charcoal: { name: 'Charcoal', css: '#141419' },
    dots: { name: 'Dot grid', css: 'radial-gradient(rgba(255,255,255,.075) 1px, transparent 1.4px) 0 0 / 22px 22px, #141419' },
    deepsea: { name: 'Deep sea', css: 'linear-gradient(165deg, #0b2836 0%, #0f1a2b 55%, #111118 100%)' },
    ember: { name: 'Ember', css: 'radial-gradient(90% 60% at 0% 100%, #46190f 0%, rgba(70,25,15,0) 60%), radial-gradient(80% 60% at 100% 0%, #3a1430 0%, rgba(58,20,48,0) 60%), #141216' },
    forest: { name: 'Forest', css: 'linear-gradient(170deg, #11261c 0%, #10171a 60%, #121214 100%)' },
    aurora: { name: 'Aurora', css: 'radial-gradient(60% 50% at 18% 8%, rgba(52,211,153,.17), transparent 70%), radial-gradient(50% 50% at 86% 18%, rgba(129,140,248,.2), transparent 70%), radial-gradient(60% 60% at 50% 100%, rgba(236,72,153,.13), transparent 70%), #101015' },
    plum: { name: 'Plum', css: 'linear-gradient(180deg, #2a1730 0%, #17121c 100%)' },
  };
  const TYPES = [
    { id: 'bar', name: 'Bar', icon: 'bar', cartesian: true },
    { id: 'hbar', name: 'Sideways', icon: 'hbar', cartesian: true },
    { id: 'line', name: 'Line', icon: 'line', cartesian: true },
    { id: 'area', name: 'Area', icon: 'area', cartesian: true },
    { id: 'pie', name: 'Pie', icon: 'pie', circular: true },
    { id: 'doughnut', name: 'Doughnut', icon: 'doughnut', circular: true },
    { id: 'polarArea', name: 'Polar', icon: 'polar', circular: true, radial: true },
    { id: 'radar', name: 'Radar', icon: 'radar', radial: true },
    { id: 'scatter', name: 'Scatter', icon: 'scatter', cartesian: true },
  ];
  const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));

  /* ---------------- the graph document ---------------- */
  function blankDoc() {
    return {
      v: 2,
      title: 'Untitled graph',
      subtitle: '',
      type: 'bar',
      datasets: {},
      rows: {},
      axes: {
        cat: { title: '', grid: false, reverse: false, angle: 0 },
        val: { title: '', grid: true, log: false, zero: true, reverse: false, min: null, max: null, step: null, grace: 6 },
      },
      legend: { mode: 'auto', position: 'top', align: 'start', marker: 'circle' },
      look: {
        palette: 'studio', colorBy: 'series', stacked: false, card: 'dark', font: 'figtree', titleSize: 22,
        radius: 6, smooth: 0.35, lineWidth: 2, points: 4, fill: 18, labels: false,
        avg: false, target: null, targetLabel: 'Target', wallpaper: 'dusk',
      },
      anim: { preset: 'cascade', duration: 1100, easing: 'smooth' },
      fmt: { prefix: '', suffix: '', decimals: 'auto', compact: false },
    };
  }
  function mergeShape(def, raw) {
    const out = {};
    for (const k of Object.keys(def)) {
      const d = def[k];
      const r = raw && typeof raw === 'object' ? raw[k] : undefined;
      if (d !== null && typeof d === 'object') out[k] = mergeShape(d, r);
      else if (d === null) out[k] = typeof r === 'number' && isFinite(r) ? r : null;
      else if (typeof d === 'number') out[k] = typeof r === 'number' && isFinite(r) ? r : d;
      else if (typeof d === 'boolean') out[k] = typeof r === 'boolean' ? r : d;
      else out[k] = typeof r === 'string' ? r : d;
    }
    return out;
  }
  const byOrder = (a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const rowsOf = (doc) => Object.keys(doc.rows || {}).map((id) => Object.assign({ id }, doc.rows[id])).sort(byOrder);
  const seriesOf = (doc) => Object.keys(doc.datasets || {}).map((id) => Object.assign({ id }, doc.datasets[id])).sort(byOrder);
  const nextOrder = (obj) => { let m = 0; for (const k in obj) m = Math.max(m, Number(obj[k].order) || 0); return m + 1; };
  const paletteColors = (doc) => (PALETTES[doc.look && doc.look.palette] || PALETTES.studio).colors;
  const isRowColored = (doc) => !!(TYPE[doc.type] && TYPE[doc.type].circular) || (doc.look.colorBy === 'row' && (doc.type === 'bar' || doc.type === 'hbar'));

  function normalize(raw) {
    const base = blankDoc();
    if (!raw || typeof raw !== 'object') return base;
    const d = mergeShape(base, raw);
    d.datasets = {};
    d.rows = {};
    if (!TYPE[d.type]) d.type = 'bar';
    const pal = paletteColors(d);
    const ds = raw.datasets && typeof raw.datasets === 'object' ? raw.datasets : {};
    Object.keys(ds).forEach((id) => {
      const s = ds[id];
      if (!s || typeof s !== 'object') return;
      d.datasets[id] = {
        name: typeof s.name === 'string' ? s.name : 'Series',
        color: validHex(s.color) ? normHex(s.color) : '',
        order: Number(s.order) || 0,
        kind: s.kind === 'bar' || s.kind === 'line' ? s.kind : 'auto',
        hidden: !!s.hidden,
      };
    });
    seriesOf(d).forEach((s, i) => { if (!d.datasets[s.id].color) d.datasets[s.id].color = pal[i % pal.length]; });
    const rs = raw.rows && typeof raw.rows === 'object' ? raw.rows : {};
    Object.keys(rs).forEach((id) => {
      const r = rs[id];
      if (!r || typeof r !== 'object') return;
      const values = {};
      const rv = r.values && typeof r.values === 'object' ? r.values : {};
      Object.keys(rv).forEach((k) => { if (d.datasets[k]) { const n = parseNum(rv[k]); if (n !== null) values[k] = n; } });
      d.rows[id] = {
        label: r.label === undefined || r.label === null ? '' : String(r.label),
        order: Number(r.order) || 0,
        color: validHex(r.color) ? normHex(r.color) : '',
        hidden: !!r.hidden,
        values,
      };
    });
    rowsOf(d).forEach((r, i) => { if (!d.rows[r.id].color) d.rows[r.id].color = pal[i % pal.length]; });
    return d;
  }

  function addSeries(doc, name, color) {
    const id = rid('s');
    const n = Object.keys(doc.datasets).length;
    const pal = paletteColors(doc);
    doc.datasets[id] = { name: name || 'Series ' + (n + 1), color: color || pal[n % pal.length], order: nextOrder(doc.datasets), kind: 'auto', hidden: false };
    return id;
  }
  function addRow(doc, label, values, order) {
    const id = rid('r');
    const n = Object.keys(doc.rows).length;
    const pal = paletteColors(doc);
    doc.rows[id] = {
      label: label === undefined || label === null ? '' : String(label),
      order: order === undefined ? nextOrder(doc.rows) : order,
      color: pal[n % pal.length],
      hidden: false,
      values: values || {},
    };
    return id;
  }
  function applyPalette(doc, key) {
    const pal = (PALETTES[key] || PALETTES.studio).colors;
    doc.look.palette = key;
    seriesOf(doc).forEach((s, i) => { doc.datasets[s.id].color = pal[i % pal.length]; });
    rowsOf(doc).forEach((r, i) => { doc.rows[r.id].color = pal[i % pal.length]; });
  }

  const SAMPLES = {
    sales: {
      name: 'Monthly sales', title: 'Monthly sales', subtitle: 'Online and in-store, first half of the year', type: 'bar',
      series: ['Online', 'In store'], cat: '', val: 'Sales', prefix: '$', suffix: 'k',
      rows: [['Jan', 120, 86], ['Feb', 95, 92], ['Mar', 150, 104], ['Apr', 180, 121], ['May', 135, 118], ['Jun', 168, 130]],
    },
    grades: {
      name: 'Grades 2025', title: 'Grades 2025', subtitle: 'Term scores by subject', type: 'radar',
      series: ['Term 1', 'Term 2'], rows: [['Maths', 72, 84], ['Science', 81, 88], ['English', 90, 86], ['History', 64, 75], ['Art', 95, 97], ['PE', 88, 91]],
    },
    coffee: {
      name: 'Coffee this week', title: 'Coffee this week', subtitle: 'Cups per day', type: 'line', series: ['Cups'], val: 'Cups',
      rows: [['Mon', 3], ['Tue', 4], ['Wed', 2], ['Thu', 5], ['Fri', 6], ['Sat', 1], ['Sun', 2]], preset: 'draw',
    },
    traffic: {
      name: 'Where visitors come from', title: 'Where visitors come from', subtitle: 'Share of sessions in October', type: 'doughnut',
      series: ['Sessions'], rows: [['Search', 4200], ['Social', 2600], ['Direct', 1900], ['Email', 900], ['Referral', 650]], preset: 'spin',
    },
    heights: {
      name: 'Height and shoe size', title: 'Height and shoe size', subtitle: 'Class 9B', type: 'scatter', series: ['Students'],
      cat: 'Height (cm)', val: 'Shoe size (EU)', zero: false,
      rows: [[150, 37], [155, 38], [158, 38], [160, 39], [162, 40], [168, 41], [171, 42], [175, 42], [180, 44], [183, 45]],
    },
  };
  function docFromSample(key, keep) {
    const s = SAMPLES[key] || SAMPLES.sales;
    const d = blankDoc();
    if (keep) { d.look = clone(keep.look); d.anim = clone(keep.anim); }
    d.title = s.title; d.subtitle = s.subtitle || ''; d.type = s.type;
    d.axes.cat.title = s.cat || ''; d.axes.val.title = s.val || '';
    d.fmt.prefix = s.prefix || ''; d.fmt.suffix = s.suffix || '';
    if (s.zero === false) d.axes.val.zero = false;
    if (s.preset && !keep) d.anim.preset = s.preset;
    const ids = s.series.map((n) => addSeries(d, n));
    s.rows.forEach((r) => { const v = {}; ids.forEach((id, j) => { if (r[j + 1] !== undefined) v[id] = r[j + 1]; }); addRow(d, r[0], v); });
    return normalize(d);
  }

  /* table <-> document (for CSV, paste and Sheets) */
  function toTable(doc) {
    const series = seriesOf(doc);
    const head = [doc.axes.cat.title || (doc.type === 'scatter' ? 'X' : 'Label'), ...series.map((s) => s.name)];
    return [head, ...rowsOf(doc).map((r) => [r.label, ...series.map((s) => (r.values[s.id] === undefined ? '' : r.values[s.id]))])];
  }
  function docFromTable(table, base) {
    const d = base ? clone(base) : blankDoc();
    const old = base ? seriesOf(base) : [];
    d.rows = {}; d.datasets = {};
    const rows = (table || []).filter((r) => r && r.some((c) => String(c).trim() !== ''));
    if (!rows.length) return normalize(d);
    const width = Math.max(...rows.map((r) => r.length));
    const first = rows[0];
    const rest = first.slice(1).map((c) => String(c).trim());
    const header = rows.length > 1 && rest.some((c) => c !== '') && rest.every((c) => c === '' || parseNum(c) === null);
    const body = header ? rows.slice(1) : rows;
    if (width === 1) {
      const id = addSeries(d, header ? String(first[0]) : 'Values', old[0] && old[0].color);
      body.forEach((r, i) => { const n = parseNum(r[0]); addRow(d, String(i + 1), n === null ? {} : { [id]: n }); });
      return normalize(d);
    }
    const ids = [];
    for (let j = 1; j < width; j++) ids.push(addSeries(d, (header && String(first[j] || '').trim()) || 'Series ' + j, old[j - 1] && old[j - 1].color));
    body.forEach((r) => {
      const v = {};
      ids.forEach((id, j) => { const n = parseNum(r[j + 1]); if (n !== null) v[id] = n; });
      addRow(d, String(r[0] === undefined ? '' : r[0]).trim(), v);
    });
    if (header && String(first[0] || '').trim()) d.axes.cat.title = String(first[0]).trim();
    return normalize(d);
  }

  /* ---------------- patches: path → value (null deletes) ---------------- */
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  function diff(a, b, base, out) {
    out = out || {};
    base = base || '';
    if (isObj(a) && isObj(b)) {
      const keys = new Set(Object.keys(a).concat(Object.keys(b)));
      keys.forEach((k) => diff(a[k], b[k], base ? base + '/' + k : k, out));
      return out;
    }
    const an = a === undefined ? null : a;
    const bn = b === undefined ? null : b;
    if (an === bn) return out;
    if (isObj(an) || isObj(bn)) {
      if (JSON.stringify(an) !== JSON.stringify(bn)) out[base] = bn === null ? null : clone(bn);
    } else out[base] = bn;
    return out;
  }
  function getPath(obj, path) {
    return String(path).split('/').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const keys = String(path).split('/');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!isObj(o[keys[i]])) o[keys[i]] = {};
      o = o[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (val === null || val === undefined) delete o[last];
    else o[last] = clone(val);
  }
  function applyPatch(obj, patch) {
    Object.keys(patch).sort((x, y) => x.length - y.length).forEach((p) => setPath(obj, p, patch[p]));
    return obj;
  }

  /* ---------------- local storage ---------------- */
  const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const prefs = Object.assign({ reduceMotion: false, cursors: true, shareName: '', tool: 'pointer', accent: '#f43f8c' }, store.get('gs.prefs', {}));
  const savePrefs = () => store.set('gs.prefs', prefs);

  const Library = {
    index() { return store.get('gs.lib', {}); },
    list() {
      const idx = this.index();
      return Object.keys(idx).map((id) => Object.assign({ id }, idx[id])).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    load(id) { const d = store.get('gs.doc.' + id, null); return d ? normalize(d) : null; },
    save(id, doc) {
      const ok = store.set('gs.doc.' + id, doc);
      const idx = this.index();
      idx[id] = Object.assign({}, idx[id], { title: doc.title || 'Untitled graph', type: doc.type, updatedAt: Date.now() });
      store.set('gs.lib', idx);
      return ok;
    },
    meta(id, patch) {
      const idx = this.index();
      if (!idx[id]) return {};
      if (patch) { idx[id] = Object.assign({}, idx[id], patch); store.set('gs.lib', idx); }
      return idx[id];
    },
    create(doc) { const id = rid('g'); this.save(id, doc); this.setCurrent(id); return id; },
    remove(id) { const idx = this.index(); delete idx[id]; store.set('gs.lib', idx); store.del('gs.doc.' + id); if (this.currentId() === id) store.del('gs.current'); },
    currentId() { return store.get('gs.current', null); },
    setCurrent(id) { store.set('gs.current', id); },
    current() {
      let id = this.currentId();
      if (id && this.load(id)) return id;
      const list = this.list();
      if (list.length) { this.setCurrent(list[0].id); return list[0].id; }
      return this.create(migrateOld() || docFromSample('sales'));
    },
  };
  // Brings over a graph saved by the first version of Graph Studio.
  function migrateOld() {
    const old = store.get('graphStudioProject', null);
    if (!old || !Array.isArray(old.rows) || store.get('gs.migrated', false)) return null;
    store.set('gs.migrated', true);
    const d = blankDoc();
    d.title = old.title || 'Untitled graph';
    d.type = TYPE[old.graphType] ? old.graphType : 'bar';
    d.axes.cat.title = old.xAxis || '';
    d.axes.val.title = old.yAxis || '';
    const id = addSeries(d, 'Values');
    old.rows.forEach((r) => { const n = parseNum(r.value); if ((r.label || '') !== '' || n !== null) addRow(d, r.label || '', n === null ? {} : { [id]: n }); });
    return Object.keys(d.rows).length ? normalize(d) : null;
  }

  /* ---------------- share links: the graph lives inside the link ---------------- */
  function b64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function pack(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream !== 'undefined') {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return 'z' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
      } catch (e) { /* fall through */ }
    }
    return 'j' + b64url(bytes);
  }
  async function unpack(str) {
    const kind = str[0];
    const bytes = unb64url(str.slice(1));
    if (kind === 'z') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return JSON.parse(await new Response(stream).text());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /* ---------------- CSV / TSV ---------------- */
  function toDelimited(rows, delim) {
    delim = delim || ',';
    const needs = delim === '\t' ? /[\t\r\n"]/ : /[",\r\n]/;
    return rows.map((r) => r.map((c) => { const s = c === null || c === undefined ? '' : String(c); return needs.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(delim)).join('\r\n');
  }
  function parseDelimited(text) {
    text = String(text || '').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  GS.core = {
    $, $$, esc, h, on, bus, clamp, parseNum, fmtNum, statsOf,
    hexToRgb, rgba, lum, inkOn, validHex, normHex, mix, contrast, ACCENTS, accentSet,
    rid, clone, sleep, debounce, throttle, timeAgo, slugify, cleanSlug, download, loadScript, copyText,
    PALETTES, SWATCHES, WALLPAPERS, TYPES, TYPE, SAMPLES,
    blankDoc, normalize, rowsOf, seriesOf, addSeries, addRow, applyPalette, paletteColors, isRowColored,
    docFromSample, toTable, docFromTable,
    diff, getPath, setPath, applyPatch,
    store, prefs, savePrefs, Library,
    pack, unpack, toDelimited, parseDelimited,
  };
})();
