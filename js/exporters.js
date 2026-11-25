/* Graph Studio · exports
   PNG, CSV, project files, clipboard, PowerPoint, and Google Sheets / Slides. */
(function () {
  'use strict';
  const GS = (window.GS = window.GS || {});
  const C = GS.core;
  const PPTX_URL = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js';
  const GIS_URL = 'https://accounts.google.com/gsi/client';
  const clientId = ((window.GRAPH_STUDIO_CONFIG || {}).googleClientId || '').trim();

  const fileBase = (doc) => C.slugify(doc.title || 'graph');
  const dataUrlToBlob = async (url) => (await fetch(url)).blob();

  function png(doc, o) {
    o = o || {};
    const scale = o.scale || 2;
    const url = GS.engine.toImage(doc, { width: 1200, height: 675, dpr: scale, background: o.background || 'card', showTitle: o.showTitle !== false });
    C.download(fileBase(doc) + '.png', url);
    return url;
  }
  async function copyImage(doc, o) {
    o = o || {};
    const url = GS.engine.toImage(doc, { width: 1200, height: 675, dpr: 2, background: o.background || 'card', showTitle: o.showTitle !== false });
    const blob = await dataUrlToBlob(url);
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('Your browser can’t copy images. Download the PNG instead.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }
  function csv(doc) {
    const text = '﻿' + C.toDelimited(C.toTable(doc), ',');
    C.download(fileBase(doc) + '.csv', new Blob([text], { type: 'text/csv;charset=utf-8' }));
  }
  function projectFile(doc) {
    const text = JSON.stringify({ app: 'graph-studio', v: 2, doc }, null, 2);
    C.download(fileBase(doc) + '.graph.json', new Blob([text], { type: 'application/json' }));
  }
  function readProjectFile(text) {
    const j = JSON.parse(text);
    if (j && j.app === 'graph-studio' && j.doc) return C.normalize(j.doc);
    if (j && j.rows && j.datasets) return C.normalize(j);
    throw new Error('That file isn’t a Graph Studio project.');
  }
  async function copyForSheets(doc) {
    const ok = await C.copyText(C.toDelimited(C.toTable(doc), '\t'));
    window.open('https://sheets.new', '_blank', 'noopener');
    return ok;
  }

  /* ---------- PowerPoint (also the route into Google Slides) ---------- */
  async function buildPptx(doc) {
    await C.loadScript(PPTX_URL);
    const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
    pptx.title = doc.title || 'Graph';
    const dark = doc.look.card !== 'light';
    const bg = dark ? '16161B' : 'FFFFFF';
    const ink = dark ? 'F3F3F6' : '1B1B22';
    const muted = dark ? 'A6A6B2' : '62626E';
    const accent = 'FF5CA2';
    const font = 'Arial';

    const s1 = pptx.addSlide();
    s1.background = { color: bg };
    s1.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.55, w: 0.12, h: 1.5, fill: { color: accent }, line: { color: accent } });
    s1.addText(doc.title || 'Untitled graph', { x: 0.95, y: 2.4, w: 11.5, h: 1.1, fontFace: font, fontSize: 40, bold: true, color: ink });
    if (doc.subtitle) s1.addText(doc.subtitle, { x: 0.95, y: 3.45, w: 11.5, h: 0.7, fontFace: font, fontSize: 18, color: muted });

    const s2 = pptx.addSlide();
    s2.background = { color: bg };
    const img = GS.engine.toImage(doc, { width: 1280, height: 640, dpr: 2.5, background: 'card', showTitle: false });
    s2.addText(doc.title || 'Untitled graph', { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontFace: font, fontSize: 22, bold: true, color: ink });
    s2.addImage({ data: img, x: 0.5, y: 1.05, w: 12.33, h: 6.165 });

    const table = C.toTable(doc);
    const rowsPerSlide = 14;
    for (let i = 1; i < table.length; i += rowsPerSlide) {
      const s = pptx.addSlide();
      s.background = { color: bg };
      s.addText('Data', { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontFace: font, fontSize: 22, bold: true, color: ink });
      const chunk = [table[0]].concat(table.slice(i, i + rowsPerSlide));
      const rows = chunk.map((r, ri) => r.map((c) => ({
        text: ri > 0 && typeof c === 'number' ? C.fmtNum(c, doc.fmt) : String(c),
        options: { bold: ri === 0, color: ri === 0 ? ink : muted, fill: { color: ri === 0 ? (dark ? '2B2B33' : 'F1F1F4') : bg } },
      })));
      s.addTable(rows, { x: 0.5, y: 1.05, w: 12.3, fontFace: font, fontSize: 13, border: { type: 'solid', pt: 0.5, color: dark ? '33333D' : 'E2E2E8' }, rowH: 0.36 });
    }
    return pptx;
  }
  async function pptxFile(doc) {
    const pptx = await buildPptx(doc);
    await pptx.writeFile({ fileName: fileBase(doc) + '.pptx' });
  }

  /* ---------- Google (Drive + Sheets APIs, drive.file scope only) ---------- */
  let tokenCache = null;
  function preloadGoogle() { if (clientId) C.loadScript(GIS_URL).catch(() => {}); }
  async function googleToken() {
    if (!clientId) throw Object.assign(new Error('Add a Google client ID in js/config.js to create files in Google Drive.'), { code: 'gs/no-client-id' });
    if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.token;
    await C.loadScript(GIS_URL);
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res) => {
          if (res.error) return reject(new Error(res.error_description || res.error));
          tokenCache = { token: res.access_token, exp: Date.now() + (Number(res.expires_in) || 3600) * 1000 };
          resolve(res.access_token);
        },
        error_callback: (err) => reject(Object.assign(new Error(err && err.type === 'popup_closed' ? 'Google sign-in was closed.' : 'Google sign-in didn’t finish.'), { code: 'gs/google-' + ((err && err.type) || 'error') })),
      });
      client.requestAccessToken({ prompt: '' });
    });
  }
  async function driveUpload(tok, name, sourceMime, targetMime, blob) {
    const b = 'gs' + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: targetMime })}\r\n`,
      `--${b}\r\nContent-Type: ${sourceMime}\r\n\r\n`, blob, `\r\n--${b}--`,
    ]);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + b },
      body,
    });
    if (!res.ok) throw await apiError(res, 'Google Drive');
    return res.json();
  }
  async function apiError(res, what) {
    let msg = '';
    try { const j = await res.json(); msg = (j.error && (j.error.message || j.error.status)) || ''; } catch (e) { /* ignore */ }
    if (res.status === 403 && /not been used|disabled/i.test(msg)) msg = `Turn on the ${what} API for your Google Cloud project (see SETUP.md, step 7).`;
    if (res.status === 401) { tokenCache = null; msg = 'Google sign-in expired. Try again.'; }
    return new Error(msg || `${what} said no (${res.status}).`);
  }
  const rgb01 = (hex) => { const c = C.hexToRgb(hex); return { red: c.r / 255, green: c.g / 255, blue: c.b / 255 }; };

  async function googleSheet(doc) {
    const tok = await googleToken();
    const table = C.toTable(doc);
    const csvText = C.toDelimited(table, ',');
    const file = await driveUpload(tok, doc.title || 'Graph', 'text/csv', 'application/vnd.google-apps.spreadsheet', new Blob([csvText], { type: 'text/csv' }));
    const id = file.id;
    const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, { headers: { Authorization: 'Bearer ' + tok } });
    if (!meta.ok) throw await apiError(meta, 'Google Sheets');
    const sheetId = (await meta.json()).sheets[0].properties.sheetId;
    const nRows = table.length;
    const nCols = table[0].length;
    const series = C.seriesOf(doc);
    const range = (col) => ({ sheetId, startRowIndex: 0, endRowIndex: nRows, startColumnIndex: col, endColumnIndex: col + 1 });
    const t = doc.type;
    let spec;
    if (t === 'pie' || t === 'doughnut' || t === 'polarArea') {
      spec = { title: doc.title, pieChart: { legendPosition: 'RIGHT_LEGEND', domain: { sourceRange: { sources: [range(0)] } }, series: { sourceRange: { sources: [range(1)] } }, pieHole: t === 'doughnut' ? 0.5 : 0 } };
    } else {
      const kind = { bar: 'COLUMN', hbar: 'BAR', line: 'LINE', area: 'AREA', scatter: 'SCATTER' }[t] || 'COLUMN';
      const catTitle = doc.axes.cat.title, valTitle = doc.axes.val.title;
      spec = {
        title: doc.title,
        basicChart: {
          chartType: kind,
          legendPosition: series.length > 1 ? 'BOTTOM_LEGEND' : 'NO_LEGEND',
          headerCount: 1,
          stackedType: doc.look.stacked && kind !== 'SCATTER' ? 'STACKED' : 'NOT_STACKED',
          axis: kind === 'BAR'
            ? [{ position: 'BOTTOM_AXIS', title: valTitle }, { position: 'LEFT_AXIS', title: catTitle }]
            : [{ position: 'BOTTOM_AXIS', title: catTitle }, { position: 'LEFT_AXIS', title: valTitle }],
          domains: [{ domain: { sourceRange: { sources: [range(0)] } } }],
          series: series.map((s, i) => ({ series: { sourceRange: { sources: [range(i + 1)] } }, targetAxis: kind === 'BAR' ? 'BOTTOM_AXIS' : 'LEFT_AXIS', colorStyle: { rgbColor: rgb01(s.color) } })),
        },
      };
    }
    const requests = [
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
      { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: nCols } } },
      { addChart: { chart: { spec, position: { overlayPosition: { anchorCell: { sheetId, rowIndex: 1, columnIndex: nCols + 1 }, widthPixels: 760, heightPixels: 440 } } } } },
    ];
    const up = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
    if (!up.ok) throw await apiError(up, 'Google Sheets');
    const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    window.open(url, '_blank', 'noopener');
    return url;
  }
  async function googleSlides(doc) {
    const tok = await googleToken();
    const pptx = await buildPptx(doc);
    const blob = await pptx.write({ outputType: 'blob' });
    const file = await driveUpload(tok, doc.title || 'Graph', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.google-apps.presentation', blob);
    const url = `https://docs.google.com/presentation/d/${file.id}/edit`;
    window.open(url, '_blank', 'noopener');
    return url;
  }

  GS.exporters = { png, copyImage, csv, projectFile, readProjectFile, copyForSheets, pptxFile, googleSheet, googleSlides, preloadGoogle, hasGoogle: !!clientId };
})();
