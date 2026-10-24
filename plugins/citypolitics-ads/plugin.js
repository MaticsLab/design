/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
 * distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) City Politics INC. Part of City Politics' fork of Penpot (MaticsLab/design).
 *
 * City Politics Ads: the plugin's main code (runs in Penpot's plugin sandbox; the panel is ui.html).
 *
 *   - Ad board presets: our sizes (728x90, 468x60, 320x50, 300x250, native card 600x314).
 *   - The City Politics template library: candidate card, event promo, ballot measure, at any of those sizes.
 *   - Dynamic slots: mark a layer as headline, body, image, button text or color; the board's link is the URL slot.
 *   - Ordered IF/ELSE rules and keyframe animations, kept in the board's shared plugin data ("citypolitics").
 *   - Political ads: a locked "Paid for by" layer the plugin puts back if it is removed, unlocked or edited.
 *   - Send to City Politics: each board exported (SVG without its slot layers, PNG images, Penpot after-delay
 *     prototype frames) and handed to the panel, which posts it to https://citypolitics.org/api/market/designs.
 */

const NS = 'citypolitics';
const SIZES = {
  '728x90': { w: 728, h: 90, label: 'Leaderboard 728×90' },
  '468x60': { w: 468, h: 60, label: 'Banner 468×60' },
  '320x50': { w: 320, h: 50, label: 'Mobile banner 320×50' },
  '300x250': { w: 300, h: 250, label: 'Medium rectangle 300×250' },
  native: { w: 600, h: 314, label: 'Native card 600×314' },
};
const SLOT_KINDS = ['headline', 'body', 'image', 'button', 'color'];
const BRAND = { red: '#e4002b', ink: '#111111', paper: '#ffffff', stone: '#f5f0e6', blue: '#0a6ea8' };

const get = (shape, key, fallback = null) => {
  try { const v = shape.getSharedPluginData(NS, key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const put = (shape, key, value) => shape.setSharedPluginData(NS, key, value == null ? '' : JSON.stringify(value));

/** The ad board a shape belongs to (itself, or its nearest ancestor board marked with a City Politics size). */
function adBoardOf(shape) {
  let s = shape;
  for (let i = 0; s && i < 50; i++) {
    if (s.type === 'board' && get(s, 'size')) return s;
    s = s.parent;
  }
  return null;
}

function allShapes(root) {
  const out = [];
  const walk = (s) => { out.push(s); for (const c of s.children || []) walk(c); };
  walk(root);
  return out;
}
const adBoards = () => (penpot.currentPage?.findShapes?.({ type: 'board' }) || []).filter((b) => get(b, 'size'));

function center() {
  const c = penpot.viewport?.center || { x: 0, y: 0 };
  return { x: Math.round(c.x), y: Math.round(c.y) };
}

function newBoard(size, name) {
  const s = SIZES[size];
  const b = penpot.createBoard();
  b.name = name || `City Politics · ${s.label}`;
  b.resize(s.w, s.h);
  const c = center();
  b.x = c.x - s.w / 2;
  b.y = c.y - s.h / 2;
  b.fills = [{ fillColor: BRAND.paper, fillOpacity: 1 }];
  b.clipContent = true;
  put(b, 'size', size);
  put(b, 'rules', []);
  put(b, 'animations', []);
  return b;
}

function addText(board, text, { x, y, w, h, size = 16, weight = '400', color = BRAND.ink, align = 'left', slot = null, name = null }) {
  const t = penpot.createText(text);
  if (!t) return null;
  board.appendChild(t);
  t.fontFamily = 'Inter';
  t.fontId = 'gfont-inter';
  t.fontSize = String(size);
  t.fontWeight = String(weight);
  t.fills = [{ fillColor: color, fillOpacity: 1 }];
  t.align = align;
  t.verticalAlign = 'center';
  t.growType = 'fixed';
  t.x = board.x + x; t.y = board.y + y;
  t.resize(w, h);
  if (name) t.name = name;
  if (slot) put(t, 'slot', slot);
  return t;
}
function addRect(board, { x, y, w, h, color, radius = 0, slot = null, name = null }) {
  const r = penpot.createRectangle();
  board.appendChild(r);
  r.x = board.x + x; r.y = board.y + y;
  r.resize(w, h);
  r.fills = [{ fillColor: color, fillOpacity: 1 }];
  r.borderRadius = radius;
  if (name) r.name = name;
  if (slot) put(r, 'slot', slot);
  return r;
}

// ---------- the template library ----------

/** Layout boxes per size, as fractions of the board: [x, y, w, h]. */
const LAYOUTS = {
  '728x90': { photo: [0.83, 0, 0.17, 1], kicker: [0.025, 0.1, 0.5, 0.22], headline: [0.025, 0.3, 0.56, 0.42], body: [0.025, 0.7, 0.56, 0.22], button: [0.61, 0.28, 0.19, 0.44] },
  '468x60': { photo: [0.8, 0, 0.2, 1], kicker: [0.03, 0.06, 0.5, 0.26], headline: [0.03, 0.3, 0.52, 0.45], body: [0.03, 0.72, 0.52, 0.22], button: [0.57, 0.25, 0.21, 0.5] },
  '320x50': { photo: [0.82, 0, 0.18, 1], kicker: [0.03, 0.04, 0.5, 0.3], headline: [0.03, 0.3, 0.5, 0.5], body: null, button: [0.55, 0.22, 0.25, 0.56] },
  '300x250': { photo: [0, 0, 1, 0.44], kicker: [0.06, 0.47, 0.88, 0.08], headline: [0.06, 0.55, 0.88, 0.17], body: [0.06, 0.71, 0.88, 0.12], button: [0.06, 0.84, 0.5, 0.11] },
  native: { photo: [0, 0, 0.42, 1], kicker: [0.46, 0.08, 0.5, 0.08], headline: [0.46, 0.18, 0.5, 0.34], body: [0.46, 0.52, 0.5, 0.22], button: [0.46, 0.78, 0.3, 0.13] },
};
const TEMPLATES = {
  candidate: { name: 'Candidate card', kicker: 'FOR ALDERPERSON · 27TH WARD', headline: 'Ana Rivera', body: 'Safer streets, open budgets.', button: 'Meet Ana', bg: BRAND.paper, accent: BRAND.red, political: true },
  event: { name: 'Event promo', kicker: 'TOWN HALL · THU 6 PM', headline: 'Ask about the budget', body: 'Ward office, 1 N. State St.', button: 'RSVP', bg: BRAND.stone, accent: BRAND.blue, political: false },
  ballot: { name: 'Ballot measure', kicker: 'ON THE BALLOT · NOV 3', headline: 'Vote YES on Measure 1', body: 'Fund our libraries.', button: 'Learn more', bg: '#fff7e0', accent: '#1b7f3b', political: true },
};

function insertTemplate(id, size) {
  const t = TEMPLATES[id], L = LAYOUTS[size], S = SIZES[size];
  if (!t || !L) throw new Error('Unknown template or size.');
  const b = newBoard(size, `${t.name} · ${S.label}`);
  b.fills = [{ fillColor: t.bg, fillOpacity: 1 }];
  const box = (k) => { const [x, y, w, h] = L[k]; return { x: Math.round(x * S.w), y: Math.round(y * S.h), w: Math.round(w * S.w), h: Math.round(h * S.h) }; };
  const scale = Math.min(S.w / 728, S.h / 90, 1) * (size === '300x250' || size === 'native' ? 2.2 : 1);
  const photo = addRect(b, { ...box('photo'), color: '#d9d4c7', slot: { kind: 'image', key: 'photo' }, name: 'Photo (slot: image)' });
  void photo;
  addText(b, t.kicker, { ...box('kicker'), size: Math.max(8, Math.round(10 * scale)), weight: '700', color: t.accent, name: 'Kicker' });
  addText(b, t.headline, { ...box('headline'), size: Math.max(12, Math.round(22 * scale)), weight: '800', slot: { kind: 'headline', key: 'headline' }, name: 'Headline (slot)' });
  if (L.body) addText(b, t.body, { ...box('body'), size: Math.max(9, Math.round(11 * scale)), color: '#444444', slot: { kind: 'body', key: 'body' }, name: 'Body (slot)' });
  const bb = box('button');
  addRect(b, { ...bb, color: t.accent, radius: Math.round(bb.h / 4), slot: { kind: 'color', key: 'buttonColor' }, name: 'Button color (slot)' });
  addText(b, t.button, { ...bb, size: Math.max(10, Math.round(13 * scale)), weight: '700', color: BRAND.paper, align: 'center', slot: { kind: 'button', key: 'cta' }, name: 'Button text (slot)' });
  put(b, 'link', 'https://example.org/');
  if (t.political) setPolitical(b, 'Friends of Ana Rivera');
  penpot.selection = [b];
  return b;
}

// ---------- political: the locked "Paid for by" layer ----------

const disclaimerOf = (board) => allShapes(board).find((s) => s !== board && get(s, 'slot')?.kind === 'disclaimer') || null;

function disclaimerBox(board) {
  const s = SIZES[get(board, 'size')] || { w: board.width, h: board.height };
  const h = Math.max(10, Math.min(16, Math.round(s.h * 0.16)));
  return { x: 0, y: s.h - h, w: Math.min(s.w, Math.max(160, Math.round(s.w * 0.5))), h };
}

function ensureDisclaimer(board) {
  const pol = get(board, 'political');
  let d = disclaimerOf(board);
  if (!pol?.paidForBy) { if (d) { d.blocked = false; d.remove(); } return null; }
  const text = `Paid for by ${pol.paidForBy}`;
  if (!d) {
    const bx = disclaimerBox(board);
    d = addText(board, text, { ...bx, size: Math.max(8, bx.h - 4), weight: '500', color: BRAND.ink, slot: { kind: 'disclaimer' }, name: 'Paid for by (locked)' });
    if (!d) return null;
  }
  if (d.characters !== text) d.characters = text;
  if (Number(d.fontSize) < 8) d.fontSize = '8';
  if (d.hidden) d.hidden = false;
  if (!d.blocked) d.blocked = true;
  // Keep it on top.
  try { if (d.parent === board && board.children[board.children.length - 1] !== d) board.appendChild(d); } catch { /* ordering is best effort */ }
  return d;
}

function setPolitical(board, paidForBy) {
  put(board, 'political', paidForBy ? { paidForBy: String(paidForBy).slice(0, 120) } : null);
  ensureDisclaimer(board);
}

let guardTimer = null;
function guardDisclaimers() {
  for (const b of adBoards()) if (get(b, 'political')) ensureDisclaimer(b);
}
function scheduleGuard() {
  if (guardTimer) return;
  guardTimer = setTimeout(() => { guardTimer = null; try { guardDisclaimers(); } catch { /* the page may be changing */ } scheduleGuard(); }, 1500);
}

// ---------- state for the panel ----------

const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
const fillOf = (s) => (Array.isArray(s.fills) && s.fills[0] ? hex(s.fills[0].fillColor) : null);

function slotsOf(board) {
  return allShapes(board).filter((s) => s !== board).map((s) => ({ shape: s, slot: get(s, 'slot') })).filter((x) => x.slot && x.slot.kind !== 'disclaimer');
}
function assetsOf(board) {
  return allShapes(board).filter((s) => s !== board && get(s, 'asset')).map((s) => ({ shape: s, key: get(s, 'asset') }));
}

function boardState(b) {
  if (!b) return null;
  const slots = slotsOf(b).map(({ shape, slot }) => ({ id: shape.id, name: shape.name, kind: slot.kind, key: slot.key, value: slot.kind === 'color' ? fillOf(shape) : slot.kind === 'image' ? slot.key : shape.characters || '' }));
  return {
    id: b.id, name: b.name, size: get(b, 'size'), width: Math.round(b.width), height: Math.round(b.height), link: get(b, 'link') || '',
    rules: get(b, 'rules', []), animations: get(b, 'animations', []), political: get(b, 'political'),
    slots, assets: [...slots.filter((s) => s.kind === 'image').map((s) => s.key), ...assetsOf(b).map((a) => a.key)],
    frames: framesOf(b).map((f) => ({ name: f.board.name, hold: f.hold, duration: f.duration, transition: f.transition })),
  };
}

function sendState() {
  const sel = penpot.selection || [];
  const board = sel.length ? adBoardOf(sel[0]) : null;
  const layer = sel.length === 1 && sel[0] !== board ? sel[0] : null;
  penpot.ui.sendMessage({
    type: 'state', sizes: SIZES, templates: Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, t.name])),
    board: boardState(board), boards: adBoards().map((b) => ({ id: b.id, name: b.name, size: get(b, 'size') })),
    layer: layer ? { id: layer.id, name: layer.name, type: layer.type, slot: get(layer, 'slot'), asset: get(layer, 'asset') } : null,
  });
}

// ---------- Penpot prototype frames (after-delay navigations between boards of the same size) ----------

function framesOf(board) {
  const out = [];
  const seen = new Set([board.id]);
  let cur = board;
  for (let i = 0; i < 5; i++) {
    const it = (cur.interactions || []).find((x) => x.trigger === 'after-delay' && x.action?.type === 'navigate-to' && x.action.destination);
    if (!it) break;
    const dest = it.action.destination;
    if (seen.has(dest.id) || Math.round(dest.width) !== Math.round(board.width) || Math.round(dest.height) !== Math.round(board.height)) break;
    seen.add(dest.id);
    const a = it.action.animation;
    const transition = !a ? 'none' : a.type === 'dissolve' ? 'dissolve' : `slide-${a.direction === 'right' ? 'right' : a.direction === 'up' ? 'up' : a.direction === 'down' ? 'down' : 'left'}`;
    out.push({ board: dest, hold: Math.round(Number(it.delay) || 0), duration: Math.round(Number(a?.duration) || 0), transition });
    cur = dest;
  }
  return out;
}

// ---------- export ----------

const rel = (s, b) => ({ x: Math.round((s.x - b.x) * 100) / 100, y: Math.round((s.y - b.y) * 100) / 100, w: Math.round(s.width * 100) / 100, h: Math.round(s.height * 100) / 100 });

async function exportBoard(b) {
  const size = get(b, 'size');
  const slots = slotsOf(b);
  const alts = assetsOf(b);
  const disc = disclaimerOf(b);
  const assets = {};
  const defaults = {};
  const out = [];
  for (const { shape, slot } of slots) {
    const entry = { key: slot.key, kind: slot.kind, box: rel(shape, b) };
    if (slot.kind === 'image') {
      assets[slot.key] = await shape.export({ type: 'png', scale: 2 });
      defaults[slot.key] = slot.key;
      entry.style = { radius: Number(shape.borderRadius) || 0 };
    } else if (slot.kind === 'color') {
      defaults[slot.key] = fillOf(shape) || '#000000';
      entry.style = { radius: Number(shape.borderRadius) || 0 };
    } else {
      defaults[slot.key] = String(shape.characters || '').trim();
      const ff = shape.fontFamily, fs = shape.fontSize, fw = shape.fontWeight, lh = shape.lineHeight;
      entry.style = {
        fontFamily: ff && ff !== 'mixed' ? ff : 'Inter', fontSize: Number(fs && fs !== 'mixed' ? fs : 16), fontWeight: Number(fw && fw !== 'mixed' ? fw : 400),
        lineHeight: Number(lh && lh !== 'mixed' ? lh : 1.2), color: fillOf(shape) || '#111111', align: shape.align && shape.align !== 'mixed' ? shape.align : 'left',
        verticalAlign: shape.verticalAlign || 'center', textTransform: shape.textTransform === 'uppercase' ? 'uppercase' : null,
      };
    }
    out.push(entry);
  }
  for (const a of alts) assets[a.key] = await a.shape.export({ type: 'png', scale: 2 });
  const link = get(b, 'link');
  if (link) { out.push({ key: 'link', kind: 'url' }); defaults.link = link; }
  if (disc) out.push({ kind: 'disclaimer', box: rel(disc, b) });
  // The artwork without the slot layers (the Worker draws them), the alternate images or the disclaimer.
  const hide = [...slots.map((x) => x.shape), ...alts.map((x) => x.shape), ...(disc ? [disc] : [])];
  const was = hide.map((s) => s.hidden);
  let svg, frames = [];
  try {
    hide.forEach((s) => { s.hidden = true; });
    svg = await b.export({ type: 'svg' });
    for (const f of framesOf(b)) frames.push({ svg: await f.board.export({ type: 'svg' }), hold: f.hold, duration: f.duration, transition: f.transition });
  } finally {
    hide.forEach((s, i) => { s.hidden = was[i]; });
  }
  return {
    key: b.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64), name: b.name, size, width: Math.round(b.width), height: Math.round(b.height),
    svg, frames, slots: out, assets, defaults, rules: get(b, 'rules', []), animations: get(b, 'animations', []), political: get(b, 'political'),
  };
}

async function exportBoards(ids) {
  const wanted = ids && ids.length ? adBoards().filter((b) => ids.includes(b.id)) : adBoards();
  if (!wanted.length) throw new Error('No City Politics ad boards on this page. Start from a preset or template.');
  const boards = [];
  for (const b of wanted.slice(0, 10)) boards.push(await exportBoard(b));
  return { name: penpot.currentFile?.name || 'Untitled', file: penpot.currentFile?.id || null, boards };
}

// ---------- messages from the panel ----------

const byId = (id) => penpot.currentPage?.getShapeById?.(id) || null;

async function handle(msg) {
  switch (msg?.type) {
    case 'ready': break;
    case 'create-board': { const b = newBoard(msg.size); penpot.selection = [b]; break; }
    case 'insert-template': insertTemplate(msg.template, msg.size); break;
    case 'mark-slot': {
      const s = byId(msg.id);
      if (!s) throw new Error('Select a layer first.');
      if (!adBoardOf(s)) throw new Error('The layer must be inside a City Politics ad board.');
      if (msg.kind === null) { put(s, 'slot', null); put(s, 'asset', null); break; }
      if (msg.kind === 'asset') { put(s, 'asset', msg.key); put(s, 'slot', null); break; }
      if (!SLOT_KINDS.includes(msg.kind) || !/^[a-z][a-z0-9_-]{0,31}$/.test(msg.key || '')) throw new Error('Pick a slot kind and a short name (lowercase letters, digits, - or _).');
      if (msg.kind === 'color' && s.type === 'text') throw new Error('A color slot is a shape (a rectangle behind a button, say), not text.');
      if (['headline', 'body', 'button'].includes(msg.kind) && s.type !== 'text') throw new Error('A text slot must be a text layer.');
      put(s, 'slot', { kind: msg.kind, key: msg.key });
      put(s, 'asset', null);
      break;
    }
    case 'save-board': {
      const b = byId(msg.id);
      if (!b || !get(b, 'size')) throw new Error('Select a City Politics ad board.');
      if (msg.rules) put(b, 'rules', msg.rules);
      if (msg.animations) put(b, 'animations', msg.animations);
      if (msg.link !== undefined) put(b, 'link', msg.link || null);
      break;
    }
    case 'set-political': { const b = byId(msg.id); if (!b) throw new Error('Select a City Politics ad board.'); setPolitical(b, msg.paidForBy || null); break; }
    case 'export': {
      const out = await exportBoards(msg.ids);
      penpot.ui.sendMessage({ type: 'exported', payload: out });
      return;
    }
    default: return;
  }
  sendState();
}

penpot.ui.open('City Politics Ads', 'ui.html', { width: 380, height: 640 });
penpot.ui.onMessage((msg) => { handle(msg).catch((e) => penpot.ui.sendMessage({ type: 'error', message: String(e?.message || e) })); });
penpot.on('selectionchange', () => { try { guardDisclaimers(); } catch { /* ignore */ } sendState(); });
penpot.on('pagechange', () => sendState());
scheduleGuard();
