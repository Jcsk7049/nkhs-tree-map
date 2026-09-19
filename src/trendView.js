import { toSeries, dailyMedian, layoutChart, parseHistoryResponse } from './trend.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOX = { width: 320, height: 170, pad: { left: 40, right: 12, top: 12, bottom: 28 } };

export async function fetchHistory(apiUrl, treeId, fetchImpl = fetch) {
  const res = await fetchImpl(`${apiUrl}?action=history&treeId=${encodeURIComponent(treeId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseHistoryResponse(await res.json());
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function buildChart({ title, unit, color }, series) {
  const figure = document.createElement('figure');
  figure.style.margin = '12px 0';
  const caption = document.createElement('figcaption');
  caption.style.fontWeight = 'bold';
  caption.textContent = `${title}(${unit})`;
  figure.append(caption);

  if (series.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#777';
    empty.textContent = '尚無資料';
    figure.append(empty);
    return figure;
  }

  const daily = dailyMedian(series);
  const { dots, line, yTicks, xTicks } = layoutChart(series, daily, BOX);
  const { width, height, pad } = BOX;
  const latest = series[series.length - 1];

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' });
  svg.setAttribute('aria-label', `${title}歷年變化,共 ${series.length} 筆,最新 ${latest.v} ${unit}`);

  for (const tick of yTicks) {
    svg.append(svgEl('line', { x1: pad.left, x2: width - pad.right, y1: tick.y, y2: tick.y, stroke: '#e0e0e0', 'stroke-width': 1 }));
    const label = svgEl('text', { x: pad.left - 6, y: tick.y + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#555' });
    label.textContent = tick.label;
    svg.append(label);
  }
  for (const tick of xTicks) {
    const label = svgEl('text', { x: tick.x, y: height - 8, 'text-anchor': 'middle', 'font-size': 11, fill: '#555' });
    label.textContent = tick.label;
    svg.append(label);
  }

  if (line.length > 1) {
    svg.append(svgEl('polyline', { points: line.map((p) => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2 }));
  }
  for (const p of line) svg.append(svgEl('circle', { cx: p.x, cy: p.y, r: 4, fill: color }));
  for (const d of dots) svg.append(svgEl('circle', { cx: d.x, cy: d.y, r: 3, fill: color, 'fill-opacity': 0.35 }));

  figure.append(svg);
  return figure;
}

function formatDateTime(iso) {
  const d = new Date(Date.parse(iso) + 8 * 3600000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function buildRecentTable(points) {
  const recent = points.slice(-5).reverse();
  const table = document.createElement('table');
  table.style.cssText = 'width:100%; border-collapse:collapse; font-size:14px; margin-top:8px';
  const head = table.createTHead().insertRow();
  for (const text of ['時間(台灣)', '樹高(m)', '樹圍(cm)']) {
    const th = document.createElement('th');
    th.textContent = text;
    th.style.cssText = 'text-align:left; border-bottom:1px solid #ccc; padding:4px';
    head.append(th);
  }
  const body = table.createTBody();
  for (const p of recent) {
    const row = body.insertRow();
    for (const text of [formatDateTime(p.at), String(p.height), p.girth ? String(p.girth) : '—']) {
      const td = row.insertCell();
      td.textContent = text;
      td.style.padding = '4px';
    }
  }
  return table;
}

export function renderHistory(container, points) {
  container.textContent = '';
  if (points.length === 0) {
    container.textContent = '這棵樹還沒有量測紀錄,您送出的會是第一筆。';
    return;
  }
  const note = document.createElement('div');
  note.style.cssText = 'color:#555; font-size:13px';
  note.textContent = `共 ${points.length} 筆。淡色圓點是每一筆量測,實心點與折線是「每天的中位數」。`;
  container.append(
    note,
    buildChart({ title: '樹高', unit: 'm', color: '#1565c0' }, toSeries(points, 'height')),
    buildChart({ title: '樹圍', unit: 'cm', color: '#2e7d32' }, toSeries(points, 'girth')),
    buildRecentTable(points),
  );
}
