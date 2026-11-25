/* Graph Studio · chart engine
   Turns a graph document into a Chart.js config, keeps live charts in sync
   (so edits morph instead of redrawing), and renders still images for export. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});
  const C = GS.core;

  const FONTS = {
    figtree: "'Figtree', ui-sans-serif, system-ui, sans-serif",
    rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', 'Figtree', sans-serif",
    serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
    mono: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace",
  };
  const EASING = { smooth: 'easeOutQuart', snappy: 'easeOutExpo', springy: 'easeOutBack', linear: 'linear' };

  function theme(surface) {
    const acc = C.accentSet(C.prefs.accent);
    return surface === 'light'
      ? { bg: '#ffffff', text: '#1b1b22', muted: '#62626e', grid: 'rgba(20,20,35,.08)', tipBg: '#1b1b22', tipText: '#ffffff', tipLine: 'rgba(0,0,0,.08)', ring: '#ffffff', pill: 'rgba(20,20,35,.07)', accent: acc.btn, cross: 'rgba(20,20,35,.22)' }
      : { bg: '#1f1f26', text: '#f3f3f6', muted: '#a6a6b2', grid: 'rgba(255,255,255,.07)', tipBg: '#2c2c36', tipText: '#f3f3f6', tipLine: 'rgba(255,255,255,.12)', ring: '#1f1f26', pill: 'rgba(255,255,255,.09)', accent: acc.light, cross: 'rgba(255,255,255,.22)' };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- plugins ---------- */
  const BgPlugin = {
    id: 'gsBg',
    beforeDraw(chart, _a, o) {
      if (!o || !o.color) return;
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = o.color;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },
  };

  const RefPlugin = {
    id: 'gsRef',
    afterDatasetsDraw(chart, _a, o) {
      if (!o || !o.lines || !o.lines.length) return;
      const axis = chart.scales[o.axis];
      if (!axis) return;
      const area = chart.chartArea;
      const ctx = chart.ctx;
      o.lines.forEach((L) => {
        const p = axis.getPixelForValue(L.v);
        if (!isFinite(p)) return;
        const horiz = axis.isHorizontal();
        if (horiz ? p < area.left - 1 || p > area.right + 1 : p < area.top - 1 || p > area.bottom + 1) return;
        ctx.save();
        ctx.setLineDash(L.dash);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = L.color;
        ctx.beginPath();
        if (horiz) { ctx.moveTo(p, area.top); ctx.lineTo(p, area.bottom); } else { ctx.moveTo(area.left, p); ctx.lineTo(area.right, p); }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '600 11px ' + o.font;
        const tw = ctx.measureText(L.label).width;
        let x, y;
        if (horiz) { x = Math.min(p + 6, area.right - tw - 12); y = area.top + 4; } else { x = area.right - tw - 14; y = p - 22 < area.top ? p + 4 : p - 22; }
        ctx.fillStyle = o.pill;
        roundRect(ctx, x, y, tw + 12, 18, 9);
        ctx.fill();
        ctx.fillStyle = o.text;
        ctx.textBaseline = 'middle';
        ctx.fillText(L.label, x + 6, y + 9.5);
        ctx.restore();
      });
    },
  };

  const LabelsPlugin = {
    id: 'gsLabels',
    afterDatasetsDraw(chart, _a, o) {
      if (!o || !o.enabled) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '700 11px ' + o.font;
      ctx.lineJoin = 'round';
      chart.data.datasets.forEach((ds, di) => {
        if (!chart.isDatasetVisible(di)) return;
        const meta = chart.getDatasetMeta(di);
        const t = meta.type;
        const circ = t === 'pie' || t === 'doughnut' || t === 'polarArea';
        meta.data.forEach((el, i) => {
          if (circ && !chart.getDataVisibility(i)) return;
          const raw = ds.data[i];
          const v = raw !== null && typeof raw === 'object' ? raw.y : raw;
          if (v === null || v === undefined || !isFinite(v)) return;
          let x, y, align = 'center', base = 'bottom';
          if (circ) { const c = el.tooltipPosition(true); x = c.x; y = c.y; base = 'middle'; }
          else if (t === 'bar') {
            if (chart.options.indexAxis === 'y') { x = el.x + (v >= 0 ? 6 : -6); y = el.y; align = v >= 0 ? 'left' : 'right'; base = 'middle'; }
            else { x = el.x; y = v >= 0 ? el.y - 5 : el.y + 5; base = v >= 0 ? 'bottom' : 'top'; }
          } else { x = el.x; y = el.y - 9; }
          const s = o.fmt(v);
          ctx.textAlign = align;
          ctx.textBaseline = base;
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = o.halo;
          ctx.strokeText(s, x, y);
          ctx.fillStyle = o.color;
          ctx.fillText(s, x, y);
        });
      });
      ctx.restore();
    },
  };

  const CrossPlugin = {
    id: 'gsCross',
    afterDatasetsDraw(chart, _a, o) {
      if (!o || !o.enabled || !chart.tooltip) return;
      const act = chart.tooltip.getActiveElements();
      if (!act || !act.length) return;
      const x = act[0].element.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  let registered = false;
  function register() {
    if (registered || !window.Chart) return;
    registered = true;
    Chart.register(BgPlugin, RefPlugin, LabelsPlugin, CrossPlugin);
    Chart.defaults.font.family = FONTS.figtree;
    Chart.defaults.color = '#a6a6b2';
  }

  /* ---------- animation presets ---------- */
  function animationFor(doc, ctx) {
    const { intro, reduce, n, kind } = ctx;
    const a = doc.anim;
    if (reduce || a.preset === 'none') return { animation: false };
    if (!intro) return { animation: { duration: 520, easing: 'easeOutQuart' } };
    const duration = a.duration;
    const easing = EASING[a.easing] || 'easeOutQuart';
    const stagger = C.clamp(duration / Math.max(4, n + 2), 18, 150);
    let done = false;
    const delay = (c) => (!done && c.type === 'data' && c.mode === 'default' ? c.dataIndex * stagger + c.datasetIndex * stagger * 0.5 : 0);
    const onComplete = () => { done = true; };
    switch (a.preset) {
      case 'rise':
        return { animation: { duration, easing, onComplete } };
      case 'pop':
        return { animation: { duration, easing: 'easeOutBack', delay, onComplete, animateScale: true, animateRotate: true } };
      case 'bounce':
        return { animation: { duration: duration * 1.2, easing: 'easeOutBounce', delay, onComplete } };
      case 'spin':
        return { animation: { duration: duration * 1.15, easing, animateRotate: true, animateScale: true, onComplete } };
      case 'draw': {
        if (kind !== 'line') return { animation: { duration, easing, delay, onComplete } };
        const step = duration / Math.max(1, n);
        const prevY = (c) => {
          if (c.index === 0) return c.chart.scales.y ? c.chart.scales.y.getPixelForValue(c.chart.scales.y.min) : 0;
          const m = c.chart.getDatasetMeta(c.datasetIndex);
          const prev = m.data[c.index - 1];
          return prev ? prev.getProps(['y'], true).y : 0;
        };
        return {
          animation: {
            onComplete,
            x: { type: 'number', easing: 'linear', duration: step, from: NaN, delay(c) { if (c.type !== 'data' || c.xStarted) return 0; c.xStarted = true; return c.index * step; } },
            y: { type: 'number', easing: 'linear', duration: step, from: prevY, delay(c) { if (c.type !== 'data' || c.yStarted) return 0; c.yStarted = true; return c.index * step; } },
          },
        };
      }
      case 'cascade':
      default:
        return { animation: { duration, easing, delay, onComplete } };
    }
  }

  const num = (v) => (v === null || v === undefined || v === '' || !isFinite(v) ? undefined : Number(v));

  /* ---------- document → Chart.js config ---------- */
  function build(doc, o) {
    o = o || {};
    const surface = o.surface || doc.look.card || 'dark';
    const T = theme(surface);
    const fam = FONTS[doc.look.font] || FONTS.figtree;
    const type = doc.type;
    const info = C.TYPE[type] || C.TYPE.bar;
    const rows = C.rowsOf(doc);
    const series = C.seriesOf(doc);
    const circular = !!info.circular;
    const radial = !!info.radial;
    const cartesian = !!info.cartesian;
    const horizontal = type === 'hbar';
    const colorByRow = C.isRowColored(doc);
    const stacked = !!doc.look.stacked && ['bar', 'hbar', 'line', 'area'].includes(type);
    const fillA = C.clamp(doc.look.fill, 0, 100) / 100;
    const fmt = (v) => C.fmtNum(v, doc.fmt);
    const chartType = type === 'hbar' ? 'bar' : type === 'area' ? 'line' : type;
    const mini = !!o.mini;

    const datasets = series.map((s, si) => {
      const override = cartesian && type !== 'scatter' && s.kind !== 'auto' ? s.kind : null;
      const eff = override || chartType;
      const lineLike = eff === 'line' || type === 'radar';
      const c = s.color;
      const ds = { label: s.name, hidden: !!s.hidden, gsId: s.id };
      if (override) ds.type = override;
      if (type === 'scatter') {
        ds.data = rows
          .map((r, i) => { const y = r.values[s.id]; if (y === undefined) return null; const x = C.parseNum(r.label); return { x: x === null ? i + 1 : x, y }; })
          .filter(Boolean);
      } else ds.data = rows.map((r) => (r.values[s.id] === undefined ? null : r.values[s.id]));

      if (colorByRow && !override) {
        const rc = rows.map((r) => r.color);
        ds.backgroundColor = type === 'polarArea' ? rc.map((x) => C.rgba(x, 0.82)) : rc;
        ds.hoverBackgroundColor = rc;
        ds.borderColor = circular ? T.ring : rc;
      } else if (lineLike) {
        ds.borderColor = c;
        ds.backgroundColor = C.rgba(c, fillA);
        ds.pointBackgroundColor = c;
        ds.pointBorderColor = T.ring;
        ds.pointHoverBackgroundColor = c;
        ds.pointHoverBorderColor = T.ring;
      } else {
        ds.backgroundColor = c;
        ds.hoverBackgroundColor = c;
        ds.borderColor = c;
      }

      if (eff === 'bar' && !circular) {
        Object.assign(ds, {
          borderRadius: doc.look.radius,
          borderSkipped: 'start',
          borderWidth: stacked ? (horizontal ? { right: 2 } : { top: 2 }) : 0,
          maxBarThickness: mini ? 22 : 64,
          categoryPercentage: 0.74,
          barPercentage: 0.88,
        });
        if (stacked) ds.borderColor = T.ring;
      }
      if (lineLike && type !== 'scatter') {
        Object.assign(ds, {
          borderWidth: doc.look.lineWidth,
          tension: type === 'radar' ? Math.min(doc.look.smooth, 0.25) : doc.look.smooth,
          pointRadius: mini ? Math.min(2, doc.look.points) : doc.look.points,
          pointHoverRadius: doc.look.points + 3,
          pointBorderWidth: 2,
          pointHoverBorderWidth: 2,
          spanGaps: true,
          fill: type === 'area' ? (stacked ? (si === 0 ? 'origin' : '-1') : 'origin') : type === 'radar',
        });
      }
      if (type === 'scatter') {
        Object.assign(ds, {
          backgroundColor: c, borderColor: T.ring, borderWidth: 2,
          pointRadius: mini ? 3 : Math.max(4, doc.look.points + 1), pointHoverRadius: Math.max(6, doc.look.points + 4),
        });
      }
      if (circular) {
        Object.assign(ds, {
          borderWidth: 2,
          hoverOffset: mini ? 0 : type === 'polarArea' ? 4 : 10,
          borderRadius: type === 'doughnut' ? Math.min(doc.look.radius, 10) : 0,
        });
      }
      return ds;
    });

    /* scales */
    const tickFont = { family: fam, size: mini ? 9 : 12, weight: '500' };
    const titleFont = { family: fam, size: 12.5, weight: '600' };
    const ax = doc.axes;
    const scales = {};
    if (cartesian) {
      const vKey = horizontal ? 'x' : 'y';
      const cKey = horizontal ? 'y' : 'x';
      const step = num(ax.val.step);
      scales[vKey] = {
        type: ax.val.log ? 'logarithmic' : 'linear',
        beginAtZero: !ax.val.log && !!ax.val.zero,
        min: num(ax.val.min),
        max: num(ax.val.max),
        reverse: !!ax.val.reverse,
        stacked,
        grace: ax.val.log ? 0 : (ax.val.grace || 0) + '%',
        grid: { display: !!ax.val.grid, color: T.grid, drawTicks: false, lineWidth: 1 },
        border: { display: false },
        ticks: { display: !mini, color: T.muted, font: tickFont, padding: 8, stepSize: ax.val.log ? undefined : step, maxTicksLimit: step ? undefined : 8, callback: (v) => fmt(v) },
        title: { display: !mini && !!ax.val.title, text: ax.val.title, color: T.muted, font: titleFont, padding: { top: 4, bottom: 6 } },
      };
      scales[cKey] = {
        type: type === 'scatter' ? 'linear' : 'category',
        reverse: !!ax.cat.reverse,
        grid: { display: !!ax.cat.grid, color: T.grid, drawTicks: false },
        border: { display: false },
        ticks: { display: !mini, color: T.muted, font: tickFont, padding: 8, autoSkip: true, maxRotation: horizontal ? 0 : ax.cat.angle, minRotation: horizontal ? 0 : ax.cat.angle },
        title: { display: !mini && !!ax.cat.title, text: ax.cat.title, color: T.muted, font: titleFont, padding: { top: 6, bottom: 4 } },
      };
      if (type !== 'scatter') scales[cKey].stacked = stacked;
    }
    if (radial) {
      scales.r = {
        beginAtZero: !!ax.val.zero,
        min: num(ax.val.min),
        max: num(ax.val.max),
        reverse: !!ax.val.reverse,
        grid: { display: !!ax.val.grid, color: T.grid },
        angleLines: { display: true, color: T.grid },
        ticks: { display: !mini, color: T.muted, backdropColor: 'transparent', font: { family: fam, size: 10.5, weight: '500' }, stepSize: num(ax.val.step), maxTicksLimit: 6, callback: (v) => fmt(v), z: 1 },
        pointLabels: type === 'radar'
          ? { display: !mini, color: T.text, font: { family: fam, size: 12, weight: '600' }, padding: 8 }
          : { display: !mini, centerPointLabels: true, color: T.text, font: { family: fam, size: 11.5, weight: '600' } },
      };
    }

    /* reference lines */
    let ref = null;
    if (cartesian && type !== 'scatter' && (doc.look.avg || doc.look.target !== null)) {
      const lines = [];
      if (doc.look.avg) {
        const all = [];
        series.forEach((s) => { if (!s.hidden) rows.forEach((r) => { if (r.values[s.id] !== undefined) all.push(r.values[s.id]); }); });
        const st = C.statsOf(all);
        if (st.count) lines.push({ v: st.mean, label: 'Average ' + fmt(st.mean), color: T.muted, dash: [4, 4] });
      }
      if (doc.look.target !== null) lines.push({ v: doc.look.target, label: (doc.look.targetLabel || 'Target') + ' ' + fmt(doc.look.target), color: T.accent, dash: [7, 4] });
      ref = { lines, axis: horizontal ? 'x' : 'y', font: fam, pill: T.pill, text: T.text };
    }

    /* legend */
    const legendAuto = circular || series.length >= 2;
    const showLegend = !mini && (doc.legend.mode === 'on' ? true : doc.legend.mode === 'off' ? false : legendAuto);
    const marker = doc.legend.marker;

    const interaction = circular ? { mode: 'nearest', intersect: true }
      : type === 'scatter' ? { mode: 'nearest', intersect: true }
      : radial ? { mode: 'index', intersect: false }
      : { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' };

    const tool = o.tool || 'pointer';
    const zoomable = cartesian && o.interactive && !mini;
    const anim = animationFor(doc, { intro: !!o.intro, reduce: !!o.reduce || C.prefs.reduceMotion, n: rows.length, kind: chartType === 'line' ? 'line' : chartType });

    const config = {
      type: chartType,
      data: { labels: type === 'scatter' ? undefined : rows.map((r) => r.label), datasets },
      options: Object.assign(
        {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: horizontal ? 'y' : 'x',
          layout: { padding: o.exportMode ? { top: 22, right: 26, bottom: 18, left: 18 } : mini ? 4 : { top: 6, right: 10, bottom: 2, left: 2 } },
          interaction,
          events: o.interactive === false && !o.hover ? [] : undefined,
          cutout: type === 'doughnut' ? '58%' : undefined,
          scales,
          plugins: {
            title: { display: o.showTitle !== false && !mini && !!doc.title, text: doc.title, color: T.text, align: 'start', font: { family: fam, size: doc.look.titleSize, weight: '800' }, padding: { top: 2, bottom: doc.subtitle ? 4 : 16 } },
            subtitle: { display: o.showTitle !== false && !mini && !!doc.subtitle, text: doc.subtitle, color: T.muted, align: 'start', font: { family: fam, size: 13.5, weight: '500' }, padding: { bottom: 16 } },
            legend: {
              display: showLegend,
              position: doc.legend.position,
              align: doc.legend.align,
              onClick: o.onLegendToggle ? (e, item) => o.onLegendToggle(item) : undefined,
              labels: {
                color: T.text,
                font: { family: fam, size: 12.5, weight: '600' },
                usePointStyle: marker !== 'square',
                pointStyle: marker === 'line' ? 'line' : 'circle',
                boxWidth: marker === 'line' ? 22 : marker === 'square' ? 11 : 8,
                boxHeight: marker === 'square' ? 11 : 8,
                useBorderRadius: marker === 'square',
                borderRadius: 3,
                padding: 16,
              },
            },
            tooltip: {
              enabled: !mini && o.tooltips !== false,
              backgroundColor: T.tipBg, titleColor: T.tipText, bodyColor: T.tipText, borderColor: T.tipLine, borderWidth: 1,
              padding: { x: 12, y: 10 }, cornerRadius: 12, boxPadding: 6, caretSize: 6, usePointStyle: true,
              titleFont: { family: fam, weight: '700', size: 12.5 }, bodyFont: { family: fam, weight: '500', size: 12.5 },
              callbacks: {
                title: (items) => (type === 'scatter' || !items.length ? '' : items[0].label),
                label: (c) => {
                  const raw = c.raw;
                  if (type === 'scatter') return ` ${c.dataset.label}: ${fmt(raw.x)}, ${fmt(raw.y)}`;
                  const name = circular ? c.label : c.dataset.label;
                  let s = ` ${name}: ${fmt(raw)}`;
                  if (circular) {
                    const total = c.dataset.data.reduce((a, b, i) => a + (c.chart.getDataVisibility(i) ? Number(b) || 0 : 0), 0);
                    if (total) s += `  (${Math.round((raw / total) * 1000) / 10}%)`;
                  }
                  return s;
                },
                labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
              },
            },
            zoom: zoomable
              ? {
                  pan: { enabled: tool === 'hand', mode: 'xy', threshold: 3, onPanComplete: o.onZoom },
                  zoom: {
                    wheel: { enabled: true, speed: 0.08, modifierKey: tool === 'pointer' ? 'ctrl' : undefined },
                    pinch: { enabled: true },
                    drag: { enabled: tool === 'zoom', backgroundColor: C.rgba(T.accent, 0.12), borderColor: T.accent, borderWidth: 1 },
                    mode: 'xy',
                    onZoomComplete: o.onZoom,
                  },
                }
              : { pan: { enabled: false }, zoom: { wheel: { enabled: false }, pinch: { enabled: false }, drag: { enabled: false } } },
            gsBg: { color: o.background || null },
            gsRef: ref,
            gsLabels: { enabled: !!doc.look.labels && !mini, font: fam, color: T.text, halo: T.ring, fmt },
            gsCross: { enabled: !mini && (type === 'line' || type === 'area'), color: T.cross },
          },
          onHover: o.interactive ? (e, els) => { const t = e.native && e.native.target; if (t) t.style.cursor = els.length && circular ? 'pointer' : ''; } : undefined,
        },
        anim
      ),
    };
    if (o.dpr) config.options.devicePixelRatio = o.dpr;
    return config;
  }

  /* ---------- live charts ---------- */
  function syncVisibility(chart, doc) {
    if (!C.TYPE[doc.type].circular) return false;
    let changed = false;
    C.rowsOf(doc).forEach((r, i) => {
      if (i < chart.data.labels.length && chart.getDataVisibility(i) === !!r.hidden) { chart.toggleDataVisibility(i); changed = true; }
    });
    return changed;
  }
  function create(canvas, doc, o) {
    register();
    const chart = new Chart(canvas, build(doc, Object.assign({}, o, { intro: o && o.intro !== false })));
    chart.$gsType = doc.type;
    if (syncVisibility(chart, doc)) chart.update('none');
    return chart;
  }
  function update(chart, doc, o) {
    if (!chart || chart.$gsType !== doc.type) {
      const canvas = chart.canvas;
      chart.destroy();
      return create(canvas, doc, o);
    }
    let zoom = null;
    if (chart.isZoomedOrPanned && chart.isZoomedOrPanned()) {
      zoom = {};
      ['x', 'y'].forEach((k) => { if (chart.scales[k]) zoom[k] = { min: chart.scales[k].min, max: chart.scales[k].max }; });
    }
    const cfg = build(doc, Object.assign({}, o, { intro: false }));
    chart.data.labels = cfg.data.labels;
    const cur = chart.data.datasets;
    const next = cfg.data.datasets;
    for (let i = 0; i < next.length; i++) {
      if (cur[i] && cur[i].gsId === next[i].gsId) {
        Object.keys(cur[i]).forEach((k) => { if (!(k in next[i])) delete cur[i][k]; });
        Object.assign(cur[i], next[i]);
      } else cur[i] = next[i];
    }
    cur.length = next.length;
    if (zoom) Object.keys(zoom).forEach((k) => { if (cfg.options.scales[k]) Object.assign(cfg.options.scales[k], zoom[k]); });
    chart.options = cfg.options;
    syncVisibility(chart, doc);
    chart.update(o && o.mode);
    return chart;
  }

  /* ---------- still images ---------- */
  function toImage(doc, opts) {
    register();
    const o = Object.assign({ width: 1200, height: 675, dpr: 2, surface: doc.look.card, background: 'card', showTitle: true }, opts);
    const T = theme(o.surface);
    const bg = o.background === 'transparent' ? null : o.background === 'white' ? '#ffffff' : o.background === 'card' ? T.bg : o.background;
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:-20000px;top:0;width:${o.width}px;height:${o.height}px;pointer-events:none;`;
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);
    const cfg = build(doc, { surface: o.surface, interactive: false, intro: false, exportMode: true, showTitle: o.showTitle, background: bg, dpr: o.dpr });
    cfg.options.animation = false;
    const chart = new Chart(canvas, cfg);
    if (syncVisibility(chart, doc)) chart.update('none');
    const url = canvas.toDataURL('image/png');
    chart.destroy();
    wrap.remove();
    return url;
  }

  GS.engine = { build, create, update, toImage, theme, FONTS, register };
})();
