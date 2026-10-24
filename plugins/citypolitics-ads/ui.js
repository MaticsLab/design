/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
 * distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (c) City Politics INC. The City Politics Ads plugin's panel (plugin.js is its main code).
 * It talks to the plugin with postMessage and to citypolitics.org with the advertiser's session (same site as
 * design.citypolitics.org; the Worker allows this origin with credentials). The Worker re-checks everything here.
 */

const API = 'https://citypolitics.org/api/market/designs';
const SIGN_IN = 'https://citypolitics.org/app';
const MIN_ZIPS = 3;
const MOTION = { maxTotalMs: 15000, maxLoops: 3, maxFlashes: 3, minDurationMs: 200 };
const CONDS = {
  zip: { label: 'ZIP code is one of', hint: '60601, 60602, 60603' },
  city: { label: 'City is one of', hint: 'Chicago, Evanston' },
  region: { label: 'State is one of', hint: 'IL, IN' },
  page: { label: 'Page type is', hint: 'ward, article, matter, meeting, election' },
  district: { label: 'Ward/district is', hint: '27, 42' },
  time: { label: 'Between (dates)', hint: '2027-02-01 to 2027-02-23' },
  hours: { label: 'Hours (Chicago time)', hint: '18-23' },
  device: { label: 'Device is', hint: 'mobile or desktop' },
  language: { label: 'Language is', hint: 'en, es, pl' },
  ab: { label: 'A/B half is', hint: 'a or b' },
};

let state = null;
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === 'text') e.textContent = v; else if (v != null) e.setAttribute(k, v); }
  for (const k of kids) e.append(k);
  return e;
};
const send = (msg) => parent.postMessage(msg, '*');
const list = (s) => String(s || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

// Penpot passes the theme in the URL (#/?theme=dark).
try { const t = new URLSearchParams(location.hash.replace(/^#\/?\??/, '')).get('theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* default */ }

// ---------- tabs ----------
for (const b of document.querySelectorAll('[role=tab]')) b.addEventListener('click', () => {
  for (const x of document.querySelectorAll('[role=tab]')) x.setAttribute('aria-selected', String(x === b));
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== b.dataset.tab;
});

// ---------- rules: the panel's form <-> the stored shape (site/js/addesign.js checkRules in the Worker) ----------
function condToForm(c) {
  switch (c.type) {
    case 'zip': return { type: 'zip', value: c.zips.join(', '), not: c.not };
    case 'city': return { type: 'city', value: c.cities.join(', '), not: c.not };
    case 'region': return { type: 'region', value: c.regions.join(', '), not: c.not };
    case 'page': return c.districts?.length ? { type: 'district', value: c.districts.join(', '), not: c.not } : { type: 'page', value: (c.pageTypes || []).join(', '), not: c.not };
    case 'time': return c.hours ? { type: 'hours', value: `${c.hours[0]}-${c.hours[1]}`, not: c.not } : { type: 'time', value: `${(c.from || '').slice(0, 10)} to ${(c.until || '').slice(0, 10)}`, not: c.not };
    case 'device': return { type: 'device', value: c.devices.join(', '), not: c.not };
    case 'language': return { type: 'language', value: c.languages.join(', '), not: c.not };
    case 'ab': return { type: 'ab', value: c.variants.join(', '), not: c.not };
    default: return { type: 'city', value: '' };
  }
}
function formToCond(f) {
  const v = list(f.value), not = !!f.not;
  switch (f.type) {
    case 'zip': return { type: 'zip', zips: v, not };
    case 'city': return { type: 'city', cities: String(f.value).split(',').map((x) => x.trim()).filter(Boolean), not };
    case 'region': return { type: 'region', regions: v.map((x) => x.toUpperCase()), not };
    case 'page': return { type: 'page', pageTypes: v, not };
    case 'district': return { type: 'page', districts: v.map(Number), not };
    case 'time': { const [a, b] = String(f.value).split(/\s+to\s+/); return { type: 'time', from: a ? `${a}T00:00:00-06:00` : null, until: b ? `${b}T23:59:59-06:00` : null, tz: 'America/Chicago', not }; }
    case 'hours': { const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(String(f.value).trim()); return { type: 'time', hours: m ? [Number(m[1]), Number(m[2])] : null, tz: 'America/Chicago', not }; }
    case 'device': return { type: 'device', devices: v, not };
    case 'language': return { type: 'language', languages: v.map((x) => x.toLowerCase()), not };
    case 'ab': return { type: 'ab', variants: v.map((x) => x.toLowerCase()), not };
    default: return { type: f.type };
  }
}
/** The panel's own checks (the Worker's are the rule; these just catch the common ones early). */
function ruleProblems(rules) {
  const out = [];
  rules.forEach((r, i) => {
    if (!r.when.length) out.push(`Rule ${i + 1}: add a condition.`);
    for (const c of r.when) {
      if (c.type === 'zip' && !c.not && c.zips.length < MIN_ZIPS) out.push(`Rule ${i + 1}: a ZIP rule needs at least ${MIN_ZIPS} ZIP codes so no one is singled out (or use the city or state).`);
      if (c.type === 'zip' && c.zips.some((z) => !/^\d{5}$/.test(z))) out.push(`Rule ${i + 1}: ZIP codes are 5 digits.`);
      if (c.type === 'time' && c.hours === null) out.push(`Rule ${i + 1}: hours look like 18-23.`);
    }
    if (!Object.keys(r.set).length) out.push(`Rule ${i + 1}: set at least one slot.`);
  });
  return out;
}

let rulesForm = [];
function renderRules() {
  const box = $('#rules');
  box.textContent = '';
  if (!state?.board) { box.append(el('p', { class: 'muted', text: 'Select a City Politics ad board.' })); return; }
  const slots = [...state.board.slots, ...(state.board.link ? [{ key: 'link', kind: 'url', value: state.board.link }] : [])];
  rulesForm.forEach((r, i) => {
    const card = el('div', { class: 'card' });
    const name = el('input', { value: r.name || `Rule ${i + 1}`, 'aria-label': 'Rule name', on: { input: (e) => { r.name = e.target.value; } } });
    card.append(el('header', {}, el('b', { text: i === 0 ? 'IF' : 'ELSE IF' }), name,
      el('button', { class: 'small', title: 'Move up', on: { click: () => { if (i) { [rulesForm[i - 1], rulesForm[i]] = [rulesForm[i], rulesForm[i - 1]]; renderRules(); } } } }, '↑'),
      el('button', { class: 'small', title: 'Move down', on: { click: () => { if (i < rulesForm.length - 1) { [rulesForm[i + 1], rulesForm[i]] = [rulesForm[i], rulesForm[i + 1]]; renderRules(); } } } }, '↓'),
      el('button', { class: 'small', title: 'Delete rule', on: { click: () => { rulesForm.splice(i, 1); renderRules(); } } }, '✕')));
    r.conds.forEach((c, j) => {
      const type = el('select', { 'aria-label': 'Condition', on: { change: (e) => { c.type = e.target.value; renderRules(); } } }, ...Object.entries(CONDS).map(([k, d]) => { const o = el('option', { value: k, text: d.label }); if (k === c.type) o.selected = true; return o; }));
      const val = el('input', { value: c.value || '', placeholder: CONDS[c.type]?.hint || '', 'aria-label': 'Values', on: { input: (e) => { c.value = e.target.value; } } });
      card.append(el('div', { class: 'cond' }, type, val, el('button', { class: 'small', title: 'Remove condition', on: { click: () => { r.conds.splice(j, 1); renderRules(); } } }, '✕')));
      const neg = el('input', { type: 'checkbox', on: { change: (e) => { c.not = e.target.checked; } } }); neg.checked = !!c.not;
      card.append(el('label', { class: 'muted' }, neg, ' not'));
    });
    card.append(el('button', { class: 'small', on: { click: () => { r.conds.push({ type: 'city', value: '' }); renderRules(); } } }, '+ AND condition'));
    card.append(el('h3', { text: 'THEN show' }));
    for (const s of slots) {
      const assets = state.board.assets || [];
      const input = s.kind === 'image'
        ? el('select', { on: { change: (e) => { if (e.target.value) r.set[s.key] = e.target.value; else delete r.set[s.key]; } } }, el('option', { value: '', text: '(unchanged)' }), ...assets.map((a) => { const o = el('option', { value: a, text: a }); if (r.set[s.key] === a) o.selected = true; return o; }))
        : el('input', { value: r.set[s.key] || '', placeholder: `(unchanged) ${s.value || ''}`.slice(0, 60), type: s.kind === 'color' ? 'text' : s.kind === 'url' ? 'url' : 'text',
          on: { input: (e) => { if (e.target.value) r.set[s.key] = e.target.value; else delete r.set[s.key]; } } });
      card.append(el('label', {}, `${s.key} (${s.kind})`, input));
    }
    box.append(card);
  });
  box.append(el('p', { class: 'muted', text: 'ELSE: the board as designed. Text slots can count down: {countdown:2027-02-23T19:00:00-06:00}.' }));
}
const rulesFromState = (b) => (b?.rules || []).map((r) => ({ id: r.id, name: r.name, conds: r.when.map(condToForm), set: { ...r.set } }));
const rulesToStore = () => rulesForm.map((r, i) => ({ id: r.id || `r${i + 1}-${Math.random().toString(36).slice(2, 6)}`, name: r.name || `Rule ${i + 1}`, when: r.conds.map(formToCond), set: r.set }));

// ---------- motion ----------
let motionForm = [];
function motionProblems(list) {
  const out = [];
  list.forEach((a, i) => {
    const total = (Number(a.delay) || 0) + (Number(a.duration) || 0) * (Number(a.loops) || 1);
    if (!(a.duration >= MOTION.minDurationMs)) out.push(`Animation ${i + 1}: at least ${MOTION.minDurationMs} ms.`);
    if (total > MOTION.maxTotalMs) out.push(`Animation ${i + 1}: ends after ${(total / 1000).toFixed(1)} s (limit 15 s).`);
    if (!(a.loops >= 1 && a.loops <= MOTION.maxLoops)) out.push(`Animation ${i + 1}: plays 1 to 3 times.`);
    if ((a.kind === 'fade' || a.kind === 'color') && a.loops > 1 && 1000 / (a.alternate ? 2 * a.duration : a.duration) > MOTION.maxFlashes) out.push(`Animation ${i + 1}: would flash more than 3 times a second.`);
  });
  return out;
}
function renderMotion() {
  const box = $('#motion');
  box.textContent = '';
  if (!state?.board) { box.append(el('p', { class: 'muted', text: 'Select a City Politics ad board.' })); return; }
  const targets = ['board', ...state.board.slots.map((s) => s.key)];
  motionForm.forEach((a, i) => {
    const sel = (opts, key) => el('select', { on: { change: (e) => { a[key] = e.target.value; renderMotion(); } } }, ...opts.map((o) => { const x = el('option', { value: o, text: o }); if (a[key] === o) x.selected = true; return x; }));
    const num = (key, label) => el('label', {}, label, el('input', { type: 'number', value: a[key], min: 0, on: { input: (e) => { a[key] = Number(e.target.value); } } }));
    const alt = el('input', { type: 'checkbox', on: { change: (e) => { a.alternate = e.target.checked; } } }); alt.checked = !!a.alternate;
    const card = el('div', { class: 'card' },
      el('header', {}, el('b', { text: `Animation ${i + 1}` }), el('button', { class: 'small', on: { click: () => { motionForm.splice(i, 1); renderMotion(); } } }, '✕')),
      el('div', { class: 'row' }, sel(targets, 'target'), sel(['fade', 'slide', 'scale', 'color'], 'kind')),
      el('div', { class: 'row' }, num('duration', 'ms'), num('delay', 'delay ms'), num('loops', 'times')),
      el('label', {}, alt, ' back and forth'));
    if (a.kind === 'slide') card.append(sel(['left', 'right', 'up', 'down'], 'direction'));
    if (a.kind === 'color') card.append(el('div', { class: 'row' }, el('input', { value: a.from || '#e4002b', 'aria-label': 'From color', on: { input: (e) => { a.from = e.target.value; } } }), el('input', { value: a.to || '#b30022', 'aria-label': 'To color', on: { input: (e) => { a.to = e.target.value; } } })));
    if (a.kind === 'scale') card.append(el('label', {}, 'from scale', el('input', { type: 'number', step: '0.1', value: a.from ?? 0.8, on: { input: (e) => { a.from = Number(e.target.value); } } })));
    box.append(card);
  });
  const fr = state.board.frames || [];
  $('#frames').textContent = fr.length ? `Prototype frames: ${fr.map((f) => `${f.name} after ${f.hold} ms (${f.transition})`).join(', ')}` : 'No prototype frames (add an After delay → Navigate to interaction to another board of the same size).';
}

// ---------- state from the plugin ----------
function render() {
  const sizes = $('#sizes'); sizes.textContent = '';
  for (const [k, s] of Object.entries(state.sizes)) sizes.append(el('button', { on: { click: () => send({ type: 'create-board', size: k }) } }, s.label));
  const ts = $('#tpl-size');
  if (!ts.options.length) for (const [k, s] of Object.entries(state.sizes)) ts.append(el('option', { value: k, text: s.label }));
  const tl = $('#templates'); tl.textContent = '';
  for (const [k, name] of Object.entries(state.templates)) tl.append(el('button', { on: { click: () => send({ type: 'insert-template', template: k, size: ts.value }) } }, name));
  const bl = $('#board-list'); bl.textContent = '';
  for (const b of state.boards) bl.append(el('li', { text: `${b.name} · ${b.size}` }));
  if (!state.boards.length) bl.append(el('li', { class: 'muted', text: 'No ad boards yet.' }));
  // Slots.
  const b = state.board;
  $('#slot-board').textContent = b ? `Board: ${b.name} (${b.size})` : 'Select a layer inside a City Politics ad board.';
  $('#slot-editor').hidden = !(b && state.layer);
  if (state.layer) {
    $('#slot-layer').textContent = `${state.layer.name} (${state.layer.type})`;
    $('#slot-kind').value = state.layer.asset ? 'asset' : state.layer.slot?.kind || '';
    $('#slot-key').value = state.layer.asset || state.layer.slot?.key || '';
  }
  $('#board-link').value = b?.link || '';
  const sl = $('#slot-list'); sl.textContent = '';
  for (const s of b?.slots || []) sl.append(el('li', { text: `${s.key} · ${s.kind} · ${String(s.value || '').slice(0, 40)}` }));
  if (b?.link) sl.append(el('li', { text: `link · url · ${b.link}` }));
  // Rules and motion (only reset when another board is selected).
  if (b?.id !== render.boardId) { rulesForm = rulesFromState(b); motionForm = (b?.animations || []).map((a) => ({ ...a })); render.boardId = b?.id; }
  renderRules(); renderMotion();
  // Political.
  $('#pol-on').checked = !!b?.political; $('#pol-text').value = b?.political?.paidForBy || '';
  // Send.
  const sendList = $('#send-list'); sendList.textContent = '';
  for (const x of state.boards) { const c = el('input', { type: 'checkbox', value: x.id }); c.checked = true; sendList.append(el('li', {}, el('label', {}, c, ` ${x.name} · ${x.size}`))); }
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'state') { state = m; render(); }
  if (m.type === 'error') toast(m.message, true);
  if (m.type === 'exported') void upload(m.payload);
});
function toast(text, bad = false) { const o = $('#send-out'); o.textContent = text; o.className = bad ? 'error' : 'ok'; }

// ---------- actions ----------
$('#slot-save').addEventListener('click', () => {
  const kind = $('#slot-kind').value || null, key = $('#slot-key').value.trim();
  send({ type: 'mark-slot', id: state.layer.id, kind, key });
});
$('#link-save').addEventListener('click', () => { if (state?.board) send({ type: 'save-board', id: state.board.id, link: $('#board-link').value.trim() }); });
$('#rule-add').addEventListener('click', () => { rulesForm.push({ name: `Rule ${rulesForm.length + 1}`, conds: [{ type: 'city', value: 'Chicago' }], set: {} }); renderRules(); });
$('#rules-save').addEventListener('click', () => {
  const rules = rulesToStore();
  const problems = ruleProblems(rules);
  $('#rules-problems').textContent = problems.join('\n');
  if (!problems.length && state?.board) send({ type: 'save-board', id: state.board.id, rules });
});
$('#motion-add').addEventListener('click', () => { motionForm.push({ target: 'board', kind: 'fade', duration: 600, delay: 0, loops: 1, alternate: false, easing: 'ease' }); renderMotion(); });
$('#motion-save').addEventListener('click', () => {
  const problems = motionProblems(motionForm);
  $('#motion-problems').textContent = problems.join('\n');
  if (!problems.length && state?.board) send({ type: 'save-board', id: state.board.id, animations: motionForm });
});
$('#pol-save').addEventListener('click', () => { if (state?.board) send({ type: 'set-political', id: state.board.id, paidForBy: $('#pol-on').checked ? $('#pol-text').value.trim() : null }); });
$('#send').addEventListener('click', () => {
  const ids = [...document.querySelectorAll('#send-list input:checked')].map((x) => x.value);
  toast('Exporting…');
  $('#send').disabled = true;
  send({ type: 'export', ids });
});

// ---------- upload ----------
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const text = (bytes) => (typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes));
async function upload(payload) {
  try {
    const body = {
      name: payload.name, file: payload.file,
      boards: payload.boards.map((b) => ({ ...b, svg: text(b.svg), frames: b.frames.map((f) => ({ ...f, svg: text(f.svg) })),
        assets: Object.fromEntries(Object.entries(b.assets).map(([k, v]) => [k, { type: 'image/png', data: b64(v) }])) })),
    };
    toast('Sending to City Politics…');
    const res = await fetch(API, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (res.status === 401) {
      toast('Sign in to citypolitics.org first (same account), then send again.', true);
      $('#send-out').append(el('p', {}, el('a', { href: SIGN_IN, target: '_blank', rel: 'noopener', text: 'Sign in at citypolitics.org' })));
      return;
    }
    if (!res.ok) { toast([out.error && out.error !== 'invalid' ? out.error : 'City Politics couldn’t accept these boards:', ...(out.errors || [])].join('\n'), true); return; }
    toast(`Sent ${out.designs.length} design${out.designs.length === 1 ? '' : 's'}. Staff will review ${out.designs.reduce((n, d) => n + d.variants.length, 0)} variant(s).${out.warnings?.length ? `\nNote: ${out.warnings.join('\n')}` : ''}`);
    $('#send-out').append(el('p', {}, el('a', { href: out.next || 'https://citypolitics.org/app/designs', target: '_blank', rel: 'noopener', text: 'See them at citypolitics.org' })));
  } catch (e) {
    toast(`Couldn’t send: ${e?.message || e}`, true);
  } finally {
    $('#send').disabled = false;
  }
}

// Who's signed in at citypolitics.org (the same account as this designer).
fetch('https://citypolitics.org/api/market/me', { credentials: 'include' }).then((r) => r.json()).then((b) => { $('#who').textContent = b?.user?.email || 'not signed in at citypolitics.org'; }).catch(() => {});
send({ type: 'ready' });
