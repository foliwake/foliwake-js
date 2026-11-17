// The drawing kit of the documentation diagrams (scripts/diagrams.mjs): colours for the light and the dark theme,
// icons, cards, groups, arrows and labels, each written as an SVG string.
//
// Every function takes the theme `t` first, so one layout gives both files of a diagram.
// Sizes follow an 8px grid; text widths are estimated (no font is measured), so layouts leave some room.

/** Colours of one theme. `tones` give each kind of actor its accent. */
export const THEMES = {
  light: {
    name: 'light',
    canvas: ['#fbfcfd', '#f2f5f8'],
    canvasEdge: ['#0f172a', 0.07],
    glow: { teal: ['#5eead4', 0.28], violet: ['#c4b5fd', 0.26], amber: ['#fcd34d', 0.18] },
    card: ['#ffffff', '#f9fafc'],
    cardEdge: ['#0f172a', 0.09],
    shadow: ['#0f172a', 0.08],
    heading: '#0f172a',
    text: '#475569',
    muted: '#64748b',
    code: '#334155',
    line: '#94a3b8',
    label: { fill: '#ffffff', edge: ['#0f172a', 0.1], text: '#475569' },
    group: { fill: ['#ffffff', 0.6] },
    tones: {
      slate: { fg: '#475569', badge: '#eef2f6', edge: '#94a3b8', tint: '#f6f8fa' },
      teal: { fg: '#0f766e', badge: '#d5f5ef', edge: '#2dd4bf', tint: '#effcf9' },
      violet: { fg: '#6d28d9', badge: '#ede9fe', edge: '#a78bfa', tint: '#f6f3ff' },
      amber: { fg: '#b45309', badge: '#fdf0cf', edge: '#f5b83d', tint: '#fffaeb' },
    },
  },
  dark: {
    name: 'dark',
    canvas: ['#17191f', '#111317'],
    canvasEdge: ['#ffffff', 0.07],
    glow: { teal: ['#14b8a6', 0.2], violet: ['#8b5cf6', 0.18], amber: ['#f59e0b', 0.1] },
    card: ['#20242b', '#1a1d23'],
    cardEdge: ['#ffffff', 0.09],
    shadow: ['#000000', 0.45],
    heading: '#eef1f5',
    text: '#a9b2bf',
    muted: '#828b99',
    code: '#c7ced8',
    line: '#5f6877',
    label: { fill: '#1b1e24', edge: ['#ffffff', 0.12], text: '#a9b2bf' },
    group: { fill: ['#ffffff', 0.025] },
    tones: {
      slate: { fg: '#cbd5e1', badge: '#2a2f38', edge: '#64748b', tint: '#1f2229' },
      teal: { fg: '#5eead4', badge: '#123a37', edge: '#2dd4bf', tint: '#15292a' },
      violet: { fg: '#c4b5fd', badge: '#2b2448', edge: '#a78bfa', tint: '#1f1b31' },
      amber: { fg: '#fcd34d', badge: '#3a2d12', edge: '#f5b83d', tint: '#272116' },
    },
  },
};

const SANS = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Type sizes: `desktop` for the wide layouts, `phone` for the narrow ones. */
export const TYPE = {
  desktop: { title: 22, subtitle: 14, card: 15, body: 13, code: 12.5, label: 11.5, group: 12 },
  phone: { title: 19, subtitle: 13, card: 14.5, body: 12.5, code: 12, label: 11.5, group: 12 },
};

// Icons: 24×24 outline paths, drawn with a round 1.6px stroke at any size.
const ICONS = {
  browser: 'M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z'
    + 'M3 9h18M6.5 6.5h.01M9 6.5h.01',
  server: 'M5 4h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 13h14a1 1 0 0 1 1 1v5'
    + 'a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1zM8 7.5h.01M8 16.5h.01',
  cloud: 'M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.9 8.6 4.5 4.5 0 0 1 17.5 18.5z',
  package: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9M8 5.25l8 4.5',
  document: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  commit: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3 12h6M15 12h6',
  branch: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9a9 9 0 0 1-9 9',
  merge: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9v12M6 9a9 9 0 0 0 9 9',
  shieldCheck: 'M12 3l7 3v5.5c0 4.4-2.9 7.9-7 9.5-4.1-1.6-7-5.1-7-9.5V6zM9 12l2 2 4-4',
  refresh: 'M20 11a8 8 0 0 0-14.6-4.4L4 8M4 3.5V8h4.5M4 13a8 8 0 0 0 14.6 4.4L20 16M20 20.5V16h-4.5',
  rocket: 'M12 15l-3-3c1-4 3.5-7.5 9-9 0 5.5-3.5 8-6 12zM9 12H5l2-4h4M12 15v4l4-2v-4M6 17c-1.5 1-2 3-2 3s2-.5 3-2',
  live: 'M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8 8a6 6 0 0 0 0 8M16 8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14'
    + 'M19 5a10 10 0 0 1 0 14',
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  envelope: 'M4 6h16a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1zM3.5 7l8.5 6 8.5-6',
  wand: 'M4 20L15 9M13 7l4 4M18 3v3M16.5 4.5h3M7 4v2M6 5h2M19.5 14v3M18 15.5h3',
  layout: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 9h16M10 9v11',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  blocks: 'M4 10h6v10H5a1 1 0 0 1-1-1zM10 14h10v5a1 1 0 0 1-1 1h-9M14 4h5a1 1 0 0 1 1 1v5h-6z',
  proxy: 'M4 8h15M15.5 4.5L19 8l-3.5 3.5M20 16H5M8.5 12.5L5 16l3.5 3.5',
  code: 'M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5',
  image: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 8.5a1.5 1.5 0 1 1 0 3 '
    + '1.5 1.5 0 0 1 0-3zM20 15l-4.5-4.5L6 20',
  key: 'M14.5 4a5.5 5.5 0 1 1-4.2 9.05L4 19.5V16h2.5v-2.5H9l1.3-1.3A5.5 5.5 0 0 1 14.5 4zM16 7.5h.01',
  lock: 'M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3',
};

// ---------- small helpers ----------

/** Rounds to one decimal, so the files stay short. */
const n = (value) => Math.round(value * 10) / 10;

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A colour with an opacity, as the two SVG attributes (`fill` or `stroke`). */
function paint(attr, [colour, opacity]) {
  return opacity === 1 ? `${attr}="${colour}"` : `${attr}="${colour}" ${attr}-opacity="${opacity}"`;
}

/** A text line is a string or a list of segments: strings and `{ t, mono }`. */
function segments(line) {
  const list = Array.isArray(line) ? line : [line];
  return list.map((seg) => (typeof seg === 'string' ? { t: seg } : seg));
}

/** The estimated width of a line of text: monospace is exact, the sans-serif font is an average. */
export function textWidth(line, size) {
  return segments(line).reduce((sum, seg) => sum + seg.t.length * size * (seg.mono ? 0.6 : 0.5), 0);
}

/** One `<text>` element; monospace segments become `<tspan>`s. */
export function text(x, y, line, { size, fill, weight = 400, anchor = 'start', mono = false, spacing } = {}) {
  const family = mono ? MONO : SANS;
  const parts = segments(line).map((seg) => (seg.mono && !mono
    ? `<tspan font-family="${MONO}" font-size="${n(size * 0.94)}">${escape(seg.t)}</tspan>`
    : escape(seg.t)));
  const extra = spacing ? ` letter-spacing="${spacing}"` : '';
  return `<text x="${n(x)}" y="${n(y)}" font-family="${family}" font-size="${size}" font-weight="${weight}" `
    + `fill="${fill}" text-anchor="${anchor}"${extra}>${parts.join('')}</text>`;
}

/** An icon from ICONS, `size` pixels wide, its top left corner at (x, y). */
export function icon(name, x, y, size, colour) {
  const scale = n(size / 24 * 100) / 100;
  return `<path transform="translate(${n(x)} ${n(y)}) scale(${scale})" d="${ICONS[name]}" fill="none" `
    + `stroke="${colour}" stroke-width="${n(1.6 / scale)}" stroke-linecap="round" `
    + 'stroke-linejoin="round"/>';
}

/** A rounded square with the icon in the tone's colours. */
function badge(t, name, tone, x, y, size) {
  const colours = t.tones[tone];
  const inset = size * 0.21;
  return `<rect x="${n(x)}" y="${n(y)}" width="${size}" height="${size}" rx="${n(size * 0.3)}" `
    + `fill="${colours.badge}"/>${icon(name, x + inset, y + inset, size - 2 * inset, colours.fg)}`;
}

// ---------- the canvas ----------

/** Gradients, the card shadow and the arrowhead, shared by everything in one file. */
export function defs(t, width, height) {
  const glow = (id, [colour, opacity]) => `<radialGradient id="${id}"><stop offset="0" stop-color="${colour}" `
    + `stop-opacity="${opacity}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`;
  const tints = Object.entries(t.tones).map(([tone, c]) => `<linearGradient id="tint-${tone}" x1="0" y1="0" `
    + `x2="0" y2="1"><stop offset="0" stop-color="${c.tint}"/><stop offset="1" stop-color="${t.card[1]}"/>`
    + '</linearGradient>');
  return [
    '<defs>',
    `<linearGradient id="canvas" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.canvas[0]}"/>`
      + `<stop offset="1" stop-color="${t.canvas[1]}"/></linearGradient>`,
    `<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.card[0]}"/>`
      + `<stop offset="1" stop-color="${t.card[1]}"/></linearGradient>`,
    ...tints,
    glow('glow-teal', t.glow.teal),
    glow('glow-violet', t.glow.violet),
    glow('glow-amber', t.glow.amber),
    `<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" `
      + `stdDeviation="6" flood-color="${t.shadow[0]}" flood-opacity="${t.shadow[1]}"/></filter>`,
    `<marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" `
      + `markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1.2L8.6 5L1 8.8z" fill="${t.line}" `
      + `stroke="${t.line}" stroke-width="1" stroke-linejoin="round"/></marker>`,
    '</defs>',
    `<rect width="${width}" height="${height}" rx="20" fill="url(#canvas)"/>`,
    `<ellipse cx="${n(width * 0.12)}" cy="0" rx="${n(width * 0.45)}" ry="${n(Math.min(height, 520) * 0.55)}" `
      + 'fill="url(#glow-teal)"/>',
    `<ellipse cx="${n(width * 0.92)}" cy="${n(height * 0.9)}" rx="${n(width * 0.45)}" `
      + `ry="${n(Math.min(height, 520) * 0.6)}" fill="url(#glow-violet)"/>`,
    `<ellipse cx="${n(width * 0.75)}" cy="0" rx="${n(width * 0.3)}" ry="${n(Math.min(height, 520) * 0.35)}" `
      + 'fill="url(#glow-amber)"/>',
    `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="19.5" fill="none" `
      + `${paint('stroke', t.canvasEdge)}/>`,
  ].join('\n');
}

/** The diagram's title and the lines of its subtitle, left aligned. */
export function heading(t, type, x, y, title, subtitle) {
  const lines = [text(x, y, title, { size: type.title, weight: 700, fill: t.heading })];
  subtitle.forEach((line, i) => {
    lines.push(text(x, y + 26 + i * (type.subtitle + 5), line, { size: type.subtitle, fill: t.text }));
  });
  return lines.join('\n');
}

/** A note under the diagram with an icon in front, centred on `cx`; several lines when it wraps. */
export function footnote(t, type, cx, y, lines, iconName = 'lock') {
  const size = type.subtitle;
  // The estimate is cautious for cards; a long sentence runs about 8% narrower.
  const widest = Math.max(...lines.map((line) => textWidth(line, size))) * 0.92;
  const left = cx - (widest + 22) / 2;
  const out = [icon(iconName, left, y - size + 1, size + 2, t.muted)];
  lines.forEach((line, i) => {
    out.push(text(left + 22, y + i * (size + 6), line, { size, fill: t.text }));
  });
  return out.join('\n');
}

// ---------- groups and cards ----------

/** A soft panel around related cards, with its name in a chip at the top left (or bottom left). */
export function group(t, type, { x, y, w, h, label, iconName, tone, labelAt = 'top' }) {
  const colours = t.tones[tone];
  const chipW = textWidth(label, type.group) + 40;
  const chipY = labelAt === 'top' ? y + 12 : y + h - 36;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" ${paint('fill', t.group.fill)} `
      + `stroke="${colours.edge}" stroke-opacity=".45"/>`,
    `<rect x="${x + 12}" y="${chipY}" width="${n(chipW)}" height="24" rx="12" fill="${colours.badge}"/>`,
    icon(iconName, x + 20, chipY + 5, 14, colours.fg),
    text(x + 40, chipY + 16.5, label, { size: type.group, weight: 600, fill: colours.fg, spacing: '.02em' }),
  ].join('\n');
}

/**
 * A card: an icon, a title and lines of text.
 * Layouts: `header` (icon and title in one row, lines below, left aligned),
 * `top` (icon, with an optional tag beside it, above the title, left aligned),
 * `stack` (everything centred), `row` (icon on the left, text beside it).
 * `accent` tints the card with its tone; lines may be `{ t, mono, muted }` or segment lists.
 */
export function card(t, type, spec) {
  const { x, y, w, h, tone = 'slate', accent = false } = spec;
  const colours = t.tones[tone];
  const fill = accent ? `url(#tint-${tone})` : 'url(#card)';
  const edge = accent ? `stroke="${colours.edge}" stroke-opacity=".55"` : paint('stroke', t.cardEdge);
  const box = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" ${edge} `
    + 'filter="url(#shadow)"/>';
  const content = LAYOUTS[spec.layout || 'header'](t, type, spec);
  checkFit(type, spec);
  return `<g>${box}\n${content}</g>`;
}

/** The parts of a card's text, in order, with their sizes. */
function cardLines(t, type, spec) {
  const titles = Array.isArray(spec.title) && Array.isArray(spec.title[0]) ? spec.title : [spec.title];
  const title = titles.map((line) => ({
    line: spec.titleMono ? segments(line).map((seg) => ({ ...seg, mono: true })) : line,
    size: spec.titleMono ? type.code + 0.5 : type.card,
    weight: 650,
    fill: t.heading,
    height: type.card + 5,
  }));
  const body = (spec.lines || []).map((item) => {
    const line = typeof item === 'object' && !Array.isArray(item) ? item : { t: item };
    const mono = Boolean(line.mono);
    return {
      line: line.segs || (mono ? [{ t: line.t, mono: true }] : line.t),
      size: mono ? type.code : type.body,
      weight: 400,
      fill: line.muted ? t.muted : mono ? t.code : t.text,
      height: type.body + 6,
    };
  });
  return { title, body };
}

/** Writes lines from a top edge; `anchor` and `x` place them horizontally. */
function writeLines(lines, x, top, anchor) {
  let y = top;
  return lines.map((item) => {
    const out = text(x, y + item.height * 0.74, item.line, {
      size: item.size, weight: item.weight, fill: item.fill, anchor,
      mono: segments(item.line).every((seg) => seg.mono),
    });
    y += item.height;
    return out;
  }).join('\n');
}

const sumHeights = (lines) => lines.reduce((sum, item) => sum + item.height, 0);

const LAYOUTS = {
  header(t, type, spec) {
    const { title, body } = cardLines(t, type, spec);
    const iconSize = 28;
    const gap = body.length ? 8 : 0;
    const total = iconSize + gap + sumHeights(body);
    const top = spec.y + (spec.h - total) / 2;
    const titleTop = top + (iconSize - sumHeights(title)) / 2;
    return [
      badge(t, spec.icon, spec.tone || 'slate', spec.x + 14, top, iconSize),
      writeLines(title, spec.x + 14 + iconSize + 10, titleTop, 'start'),
      writeLines(body, spec.x + 16, top + iconSize + gap, 'start'),
    ].join('\n');
  },
  top(t, type, spec) {
    const { title, body } = cardLines(t, type, spec);
    const iconSize = 24;
    const total = iconSize + 8 + sumHeights(title) + (body.length ? 2 : 0) + sumHeights(body);
    const top = spec.y + (spec.h - total) / 2;
    const colours = t.tones[spec.tone || 'slate'];
    const tag = spec.tag
      ? text(spec.x + 14 + iconSize + 8, top + 16.5, spec.tag, {
        size: 11, weight: 600, fill: colours.fg, spacing: '.04em',
      })
      : '';
    return [
      badge(t, spec.icon, spec.tone || 'slate', spec.x + 14, top, iconSize),
      tag,
      writeLines(title, spec.x + 14, top + iconSize + 8, 'start'),
      writeLines(body, spec.x + 14, top + iconSize + 10 + sumHeights(title), 'start'),
    ].join('\n');
  },
  stack(t, type, spec) {
    const { title, body } = cardLines(t, type, spec);
    const iconSize = spec.iconSize || 32;
    const total = iconSize + 10 + sumHeights(title) + (body.length ? 2 : 0) + sumHeights(body);
    const top = spec.y + (spec.h - total) / 2;
    const cx = spec.x + spec.w / 2;
    return [
      badge(t, spec.icon, spec.tone || 'slate', cx - iconSize / 2, top, iconSize),
      writeLines(title, cx, top + iconSize + 10, 'middle'),
      writeLines(body, cx, top + iconSize + 12 + sumHeights(title), 'middle'),
    ].join('\n');
  },
  row(t, type, spec) {
    const { title, body } = cardLines(t, type, spec);
    const iconSize = 32;
    const lines = [...title, ...body];
    const top = spec.y + (spec.h - sumHeights(lines)) / 2;
    return [
      badge(t, spec.icon, spec.tone || 'slate', spec.x + 14, spec.y + (spec.h - iconSize) / 2, iconSize),
      writeLines(lines, spec.x + 14 + iconSize + 12, top, 'start'),
    ].join('\n');
  },
};

/** Warns when a card's text is likely wider than the card (estimated widths). */
function checkFit(type, spec) {
  const fake = { heading: '', text: '', muted: '', code: '' };
  const { title, body } = cardLines(fake, type, spec);
  const layout = spec.layout || 'header';
  const room = (indent) => spec.w - indent - 14;
  const titleRoom = { header: room(14 + 38), top: room(14), stack: room(14), row: room(14 + 44) }[layout];
  const bodyRoom = { header: room(16), top: room(14), stack: room(14), row: room(14 + 44) }[layout];
  const check = (items, space) => items.forEach((item) => {
    const width = textWidth(item.line, item.size);
    if (width <= space) return;
    console.warn(`  may overflow (${Math.round(width)} > ${Math.round(space)}): ${JSON.stringify(item.line)}`);
  });
  check(title, titleRoom);
  check(body, bodyRoom);
}

// ---------- arrows and labels ----------

/** A path through the points, with rounded corners of radius `r`. */
export function elbow(points, r = 12) {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const radius = Math.min(r, inLen / 2, outLen / 2);
    const ax = x - ((x - px) / inLen) * radius;
    const ay = y - ((y - py) / inLen) * radius;
    const bx = x + ((nx - x) / outLen) * radius;
    const by = y + ((ny - y) / outLen) * radius;
    d += ` L${n(ax)} ${n(ay)} Q${x} ${y} ${n(bx)} ${n(by)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${lx} ${ly}`;
}

/** An arrow through the points, its head at the last point. */
export function arrow(t, points, { head = true } = {}) {
  const marker = head ? ' marker-end="url(#head)"' : '';
  return `<path d="${elbow(points)}" fill="none" stroke="${t.line}" stroke-width="1.6" `
    + `stroke-linecap="round"${marker}/>`;
}

/** A label on an arrow: a pill centred on (cx, cy), one or more lines, optionally with an icon. */
export function label(t, type, cx, cy, lines, { iconName, tone } = {}) {
  const list = Array.isArray(lines) ? lines : [lines];
  const size = type.label;
  const lineH = size + 4;
  const iconW = iconName ? 16 : 0;
  const w = Math.max(...list.map((line) => textWidth(line, size))) + 18 + iconW;
  const h = list.length * lineH + 8;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const colour = tone ? t.tones[tone].fg : t.label.text;
  const out = [`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(Math.min(h / 2, 11))}" `
    + `fill="${t.label.fill}" ${paint('stroke', t.label.edge)}/>`];
  if (iconName) out.push(icon(iconName, x + 8, cy - 6.5, 13, colour));
  list.forEach((line, i) => {
    out.push(text(cx + iconW / 2, y + 4 + i * lineH + lineH * 0.76, line, {
      size, weight: 500, fill: colour, anchor: 'middle',
    }));
  });
  return out.join('\n');
}

/** The whole file: size, accessible title and description, and the drawing. */
export function svg({ width, height, title, desc }, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" `
      + 'role="img" aria-labelledby="title desc">',
    `<title id="title">${escape(title)}</title>`,
    `<desc id="desc">${escape(desc)}</desc>`,
    body,
    '</svg>',
    '',
  ].join('\n');
}
