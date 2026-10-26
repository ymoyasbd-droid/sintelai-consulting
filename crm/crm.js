/* CRM interno · Sintel AI · versión visual
   Sin librerías: fetch a Supabase Auth + REST. Todo el contenido de los contactos se pinta con textContent. */
(() => {
'use strict';

const SB = 'https://hrzkluxbtnyhpprcrnob.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemtsdXhidG55aHBwcmNybm9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1OTk5NjcsImV4cCI6MjEwNjE3NTk2N30.mzDum9Yl70KUFqju1z7BzMoz_rFuxduvLC-CfwNTJYU';
const LIVE = /(^|\.)sintelai\.es$|\.netlify\.app$/.test(location.hostname);
const SKEY = 'sintel_crm_sess';
const STAGES = [
  { k: 'Nuevo', c: '#06b6d4' },
  { k: 'Contactado', c: '#7c3aed' },
  { k: 'Negociación', c: '#d97706' },
  { k: 'Cerrado', c: '#059669' }
];
const SUGG = ['Llamar esta semana', 'Revisar web y llamar', 'Llamar para agendar auditoría gratuita', 'Enviar propuesta'];
const TIER = { hi: { n: 'Alta', c: '#059669' }, mid: { n: 'Media', c: '#d97706' }, lo: { n: 'Baja', c: '#94a3b8' } };
const PALETTE = ['#06b6d4', '#7c3aed', '#f59e0b', '#10b981', '#94a3b8'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TKEY = 'sintel_crm_theme';
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = document.getElementById('btn-theme');
  if (b) { b.textContent = t === 'dark' ? 'Modo claro' : 'Modo oscuro'; b.setAttribute('aria-pressed', t === 'dark'); }
}
(function initTheme() {
  let t = null;
  try { t = localStorage.getItem(TKEY); } catch (e) { /* sin almacenamiento */ }
  if (t !== 'dark' && t !== 'light') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(t);
})();

const state = { leads: [], view: 'board', q: '', service: '', source: '', tier: '', onlyNew: false, demo: false, sess: null, openId: null, opener: null };

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') String(v).split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) el.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); });
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function sv(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}
const norm = (s) => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Datos derivados ---------- */
function stageOf(l) {
  const f = STAGES.find((s) => norm(s.k) === norm(l.status || 'Nuevo'));
  return f ? f.k : 'Otros';
}
function tierOf(l) {
  const s = Number(l.score);
  if (!Number.isFinite(s)) return 'lo';
  return s >= 55 ? 'hi' : s >= 40 ? 'mid' : 'lo';
}
const isBot = (l) => /xatbot|chatbot|asistente|assistent/i.test((l.service || '') + ' ' + (l.source || ''));
function srcLabel(l) {
  const s = l.source || '';
  if (isBot(l)) return 'Asistente web';
  if (s === 'web') return 'Formulario web';
  if (/^prospecci/i.test(s)) return 'Prospección';
  return s || 'Sin origen';
}
const segOf = (l) => l.segment || l.service || '';
const titleOf = (l) => l.company || l.name || '(sin nombre)';

function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function ago(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const days = Math.round((d - Date.now()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (Math.abs(days) < 1) {
    const hrs = Math.round((d - Date.now()) / 3600000);
    return rtf.format(hrs, 'hour');
  }
  return rtf.format(days, 'day');
}

/* ---------- Interfaz base ---------- */
let toastT;
function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 3200);
}
function show(which) {
  $('crm-login').hidden = which !== 'login';
  $('crm-denied').hidden = which !== 'denied';
  $('crm-app').hidden = which !== 'app';
}

/* ---------- Sesión y API ---------- */
function saveSession(s) { state.sess = s; try { sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* sin almacenamiento */ } }
function loadSession() { try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } }
function clearSession() { state.sess = null; try { sessionStorage.removeItem(SKEY); } catch (e) { /* nada */ } }

async function authReq(grant, body) {
  const r = await fetch(SB + '/auth/v1/token?grant_type=' + grant, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || 'No se pudo iniciar sesión');
  return { access_token: j.access_token, refresh_token: j.refresh_token, user_id: (j.user && j.user.id) || null, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600) };
}
async function ensureFresh() {
  const s = state.sess;
  if (!s) throw new Error('Sin sesión');
  if (s.expires_at - 60 > Date.now() / 1000) return;
  saveSession(await authReq('refresh_token', { refresh_token: s.refresh_token }));
}
async function api(method, path, body, extra) {
  await ensureFresh();
  const r = await fetch(SB + '/rest/v1/' + path, {
    method,
    headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + state.sess.access_token, 'Content-Type': 'application/json' }, extra || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || 'Error ' + r.status);
  }
  return r.status === 204 ? null : r.json();
}

/* ---------- Carga y cambios ---------- */
const DEMO_STAGE = ['Nuevo', 'Nuevo', 'Nuevo', 'Contactado', 'Contactado', 'Negociación', 'Negociación', 'Cerrado', 'Nuevo', 'Contactado', 'Nuevo', 'Cerrado'];
function demoLeads() {
  const scores = [62, 58, 35, 56, 48, 65, 42, 70, 30, 52, 38, 60];
  return DEMO_STAGE.map((st, i) => ({
    id: 'demo-' + (i + 1),
    created_at: new Date(Date.now() - (i * 1.7 + 0.3) * 86400000).toISOString(),
    name: i % 3 === 0 ? 'Contacto de ejemplo ' + (i + 1) : null,
    company: 'Empresa de ejemplo ' + (i + 1),
    email: i % 2 === 0 ? 'ejemplo' + (i + 1) + '@example.com' : null,
    phone: i % 2 === 1 ? '+34 600 000 0' + String(10 + i) : null,
    service: i % 3 === 0 ? 'Assistent web (xatbot)' : null,
    segment: i % 4 === 3 ? 'Despacho / Asesoría' : 'Clínica / Centro médico',
    source: i % 3 === 0 ? 'web' : 'Prospección Maps 26/10/2026',
    status: st,
    score: scores[i],
    next_action: i % 2 === 0 ? 'Llamar esta semana' : null,
    notes: 'Contacto ficticio para la vista previa.',
    message: i % 3 === 0 ? 'Mensaje de ejemplo enviado desde el asistente.' : null,
    enrichment: null,
    enrichment_sources: null
  }));
}
async function load() {
  if (state.demo) { state.leads = demoLeads(); return; }
  state.leads = await api('GET', 'leads?select=*&order=created_at.desc&limit=1000');
}
async function patch(id, fields) {
  const cur = state.leads.find((l) => l.id === id);
  if (!cur) return;
  if (!state.demo) {
    if (!UUID.test(id)) throw new Error('Identificador no válido');
    const res = await api('PATCH', 'leads?id=eq.' + id, fields, { Prefer: 'return=representation' });
    if (!res || !res.length) throw new Error('No se guardó: sin permiso o el contacto ya no existe');
    Object.assign(cur, res[0]);
  } else {
    Object.assign(cur, fields);
  }
}
async function remove(id) {
  if (!state.demo) {
    if (!UUID.test(id)) throw new Error('Identificador no válido');
    const res = await api('DELETE', 'leads?id=eq.' + id, null, { Prefer: 'return=representation' });
    if (!res || !res.length) throw new Error('No se eliminó: sin permiso o el contacto ya no existe');
  }
  state.leads = state.leads.filter((l) => l.id !== id);
}

/* ---------- Filtros ---------- */
function filtered() {
  const q = norm(state.q).trim();
  return state.leads.filter((l) => {
    if (q) {
      const hay = norm([l.name, l.email, l.phone, l.company, l.service, l.segment, l.notes].join(' '));
      if (!hay.includes(q)) return false;
    }
    if (state.service && l.service !== state.service && l.segment !== state.service) return false;
    if (state.source && srcLabel(l) !== state.source) return false;
    if (state.tier && tierOf(l) !== state.tier) return false;
    if (state.onlyNew && stageOf(l) !== 'Nuevo') return false;
    return true;
  });
}
function fillSelect(sel, values, current, allLabel) {
  const uniq = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  sel.replaceChildren(h('option', { value: '', text: allLabel }), ...uniq.map((v) => h('option', { value: v, text: v })));
  sel.value = uniq.includes(current) ? current : '';
}

/* ---------- Pintado ---------- */
function ring(l) {
  const sc = Number.isFinite(Number(l.score)) ? Math.max(0, Math.min(100, Number(l.score))) : 0;
  const C = 2 * Math.PI * 17;
  const svg = sv('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true' });
  svg.append(sv('circle', { class: 'bg', cx: 20, cy: 20, r: 17 }), sv('circle', { class: 'fg', cx: 20, cy: 20, r: 17, 'stroke-dasharray': (C * sc / 100).toFixed(1) + ' ' + C.toFixed(1) }));
  return h('div', { class: 'ring', style: '--tc:' + TIER[tierOf(l)].c, title: 'Puntuación ' + (l.score ?? 'sin dato') }, svg, h('b', { text: l.score ?? '–' }));
}
function card(l) {
  const sub = [l.company && l.name ? l.name : '', segOf(l)].filter(Boolean).join(' · ');
  const el = h('div', {
    class: 'lead', role: 'button', tabindex: '0', draggable: 'true', 'data-id': l.id,
    style: '--tc:' + TIER[tierOf(l)].c,
    'aria-label': 'Abrir ficha de ' + titleOf(l),
    onclick: (e) => openDrawer(l.id, e.currentTarget),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(l.id, e.currentTarget); } },
    ondragstart: (e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); },
    ondragend: () => el.classList.remove('dragging')
  },
  h('div', { class: 'lead-top' }, h('div', { class: 'lead-t' }, h('strong', { text: titleOf(l) }), h('span', { text: sub || 'Sin segmento' })), ring(l)),
  h('div', { class: 'lead-act' + (l.next_action ? '' : ' none'), text: l.next_action || 'Sin próxima acción' }),
  h('div', { class: 'lead-foot' }, h('span', { class: 'pill ' + (isBot(l) ? 'src-web' : 'src-pro'), text: srcLabel(l) }), h('span', { class: 'when', text: ago(l.created_at) })));
  return el;
}
function board(list) {
  const el = $('board');
  const cols = STAGES.map((s) => ({ k: s.k, c: s.c }));
  if (list.some((l) => stageOf(l) === 'Otros')) cols.push({ k: 'Otros', c: '#94a3b8' });
  el.replaceChildren(...cols.map((c) => {
    const items = list.filter((l) => stageOf(l) === c.k);
    const col = h('div', {
      class: 'col', 'data-stage': c.k, style: '--sc:' + c.c,
      ondragover: (e) => { if (c.k === 'Otros') return; e.preventDefault(); col.classList.add('is-over'); },
      ondragleave: (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('is-over'); },
      ondrop: async (e) => {
        e.preventDefault(); col.classList.remove('is-over');
        const id = e.dataTransfer.getData('text/plain');
        if (c.k !== 'Otros') await moveTo(id, c.k);
      }
    },
    h('div', { class: 'col-h' }, h('span', { class: 'dot' }), h('span', { text: c.k }), h('span', { class: 'n', text: items.length })),
    h('div', { class: 'col-b' }, items.length ? items.map(card) : h('div', { class: 'col-empty', text: 'Sin contactos' })));
    return col;
  }));
}
function listView(list) {
  const rows = list.map((l) => h('tr', {
    class: 'row', tabindex: '0', style: '--tc:' + TIER[tierOf(l)].c,
    onclick: (e) => openDrawer(l.id, e.currentTarget),
    onkeydown: (e) => { if (e.key === 'Enter') openDrawer(l.id, e.currentTarget); }
  },
  h('td', {}, h('strong', { text: titleOf(l) }), h('small', { text: [l.company && l.name ? l.name : '', l.email, l.phone].filter(Boolean).join(' · ') })),
  h('td', { text: segOf(l) || '–' }),
  h('td', {}, h('span', { class: 'pill ' + (isBot(l) ? 'src-web' : 'src-pro'), text: srcLabel(l) })),
  h('td', { text: l.status || '–' }),
  h('td', {}, h('span', { class: 'sc', text: l.score ?? '–' })),
  h('td', { text: l.next_action || '–' }),
  h('td', { text: fmtDate(l.created_at) })));
  $('list').replaceChildren(h('table', {},
    h('thead', {}, h('tr', {}, ['Contacto', 'Segmento', 'Origen', 'Etapa', 'Puntuación', 'Próxima acción', 'Alta'].map((t) => h('th', { text: t })))),
    h('tbody', {}, rows)));
}
function charts(all) {
  const max = Math.max(1, ...STAGES.map((s) => all.filter((l) => stageOf(l) === s.k).length));
  const stages = STAGES.map((s) => ({ k: s.k, n: all.filter((l) => stageOf(l) === s.k).length }));
  const otros = all.filter((l) => stageOf(l) === 'Otros').length;
  if (otros) stages.push({ k: 'Otros', n: otros });
  $('ch-funnel').replaceChildren(...stages.map((s) => h('div', { class: 'bar-row' }, h('span', { text: s.k }), h('div', { class: 'tr' }, h('div', { class: 'fl', style: 'width:' + (s.n / max * 100).toFixed(1) + '%' })), h('b', { text: s.n }))));

  const counts = {};
  all.forEach((l) => { const k = srcLabel(l); counts[k] = (counts[k] || 0) + 1; });
  const ent = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = all.length || 1;
  const R = 40, C = 2 * Math.PI * R;
  const svg = sv('svg', { viewBox: '0 0 112 112', role: 'img', 'aria-label': 'Contactos por origen' });
  svg.append(sv('circle', { class: 'trk', cx: 56, cy: 56, r: R }));
  let off = 0;
  ent.forEach(([, n], i) => {
    const len = C * n / total;
    svg.append(sv('circle', { cx: 56, cy: 56, r: R, fill: 'none', stroke: PALETTE[i % PALETTE.length], 'stroke-width': 16, 'stroke-dasharray': len.toFixed(2) + ' ' + (C - len).toFixed(2), 'stroke-dashoffset': (-off).toFixed(2), transform: 'rotate(-90 56 56)' }));
    off += len;
  });
  const t = sv('text', { class: 'donut-n', x: 56, y: 61, 'text-anchor': 'middle' });
  t.textContent = String(all.length);
  svg.append(t);
  $('ch-origin').replaceChildren(svg, h('div', { class: 'legend' }, ent.length ? ent.map(([k, n], i) => h('span', {}, h('i', { style: 'background:' + PALETTE[i % PALETTE.length] }), k, h('b', { text: n }))) : h('span', { text: 'Sin datos' })));

  const tc = { hi: 0, mid: 0, lo: 0 };
  all.forEach((l) => { tc[tierOf(l)]++; });
  $('ch-tier').replaceChildren(
    h('div', { class: 'tiers', role: 'img', 'aria-label': 'Reparto por prioridad' }, ['hi', 'mid', 'lo'].map((k) => h('i', { style: 'width:' + (tc[k] / total * 100).toFixed(1) + '%;background:' + TIER[k].c }))),
    h('div', { class: 'tier-leg' }, [['hi', '55 o más'], ['mid', '40 a 54'], ['lo', 'menos de 40']].map(([k, r]) => h('span', {}, h('i', { style: 'background:' + TIER[k].c }), TIER[k].n + ' (' + r + ')', h('b', { text: tc[k] })))));
}
function kpis(all) {
  const won = all.filter((l) => stageOf(l) === 'Cerrado').length;
  $('k-total').textContent = all.length;
  $('k-new').textContent = all.filter((l) => stageOf(l) === 'Nuevo').length;
  $('k-bot').textContent = all.filter(isBot).length;
  $('k-hot').textContent = all.filter((l) => tierOf(l) === 'hi').length;
  $('k-won').textContent = won;
  $('k-rate').textContent = all.length ? Math.round(won / all.length * 100) + ' % de cierre' : '';
}
function render() {
  const all = state.leads;
  kpis(all);
  charts(all);
  fillSelect($('f-service'), all.flatMap((l) => [l.service, l.segment]), state.service, 'Todos los servicios y segmentos');
  fillSelect($('f-source'), all.map(srcLabel), state.source, 'Todos los orígenes');
  state.service = $('f-service').value;
  state.source = $('f-source').value;
  const list = filtered();
  $('f-count').textContent = list.length === all.length ? all.length + ' contactos' : list.length + ' de ' + all.length + ' contactos';
  $('board').hidden = state.view !== 'board';
  $('list').hidden = state.view !== 'list';
  if (state.view === 'board') board(list); else listView(list);
  $('empty').hidden = list.length > 0;
  $('demo-flag').hidden = !state.demo;
  document.querySelectorAll('.seg-b').forEach((b) => { const on = b.dataset.view === state.view; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
  document.querySelectorAll('#f-tier .chip').forEach((b) => b.classList.toggle('is-on', b.dataset.tier === state.tier));
}

/* ---------- Acciones ---------- */
async function moveTo(id, stage) {
  const l = state.leads.find((x) => x.id === id);
  if (!l || stageOf(l) === stage) return;
  const prev = l.status;
  try {
    await patch(id, { status: stage });
    toast('Movido a ' + stage);
  } catch (e) { l.status = prev; toast(e.message, true); }
  render();
  if (state.openId === id) renderDrawer();
}

/* ---------- Ficha lateral ---------- */
function field(label, node, full) { return h('div', { class: full ? 'full' : '' }, h('div', { class: 'lbl', text: label }), node); }
function research(l) {
  const e = l.enrichment && typeof l.enrichment === 'object' ? l.enrichment : null;
  const box = h('div', { class: 'research' }, h('div', { class: 'lbl', text: 'Investigación IA' }));
  if (!e) { box.append(h('p', { class: 'dr-val', text: 'Aún no hay investigación para este contacto.' })); return box; }
  const src = Array.isArray(l.enrichment_sources) ? l.enrichment_sources : [];
  const dolores = Array.isArray(e.posibles_dolores) ? e.posibles_dolores : [];
  box.append(
    e.confianza ? h('span', { class: 'pill', text: 'Confianza: ' + e.confianza }) : null,
    e.empresa ? h('p', {}, h('strong', { text: e.empresa })) : null,
    e.actividad ? h('p', { text: e.actividad }) : null,
    e.ubicacion || e.tamano_estimado ? h('p', { text: [e.ubicacion, e.tamano_estimado].filter(Boolean).join(' · ') }) : null,
    dolores.length ? h('div', {}, h('p', { text: 'Posibles dolores:' }), h('ul', {}, dolores.map((d) => h('li', { text: String(d) })))) : null,
    e.gancho_llamada ? h('p', {}, h('strong', { text: 'Gancho para la llamada: ' }), String(e.gancho_llamada)) : null,
    src.length ? h('div', {}, h('p', { text: 'Fuentes:' }), h('ul', {}, src.map((s) => {
      const u = s && /^https?:\/\//.test(s.url || '') ? s.url : '';
      return h('li', {}, u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: s.title || u }) : String((s && s.title) || ''));
    }))) : null);
  return box;
}
function renderDrawer() {
  const l = state.leads.find((x) => x.id === state.openId);
  const d = $('drawer');
  if (!l) { d.replaceChildren(); return; }
  const phone = (l.phone || '').replace(/[^\d+]/g, '');
  const mail = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(l.email || '') ? l.email : '';
  const stages = STAGES.map((s) => s.k);
  const cur = stageOf(l) === 'Otros' ? (l.status || '') : stageOf(l);
  if (cur && !stages.includes(cur)) stages.push(cur);
  const sel = h('select', { id: 'd-status', 'aria-label': 'Etapa' }, stages.map((s) => h('option', { value: s, text: s })));
  sel.value = cur || 'Nuevo';
  const act = h('input', { id: 'd-act', type: 'text', maxlength: '200', value: l.next_action || '', placeholder: 'Ej.: Llamar esta semana' });
  const notes = h('textarea', { id: 'd-notes', maxlength: '4000' });
  notes.value = l.notes || '';

  const delBtn = h('button', { class: 'btn btn-danger', type: 'button', id: 'd-del' }, 'Eliminar');
  delBtn.addEventListener('click', async () => {
    if (!delBtn.classList.contains('is-armed')) {
      delBtn.classList.add('is-armed'); delBtn.textContent = 'Confirmar eliminación';
      setTimeout(() => { delBtn.classList.remove('is-armed'); delBtn.textContent = 'Eliminar'; }, 4000);
      return;
    }
    try { await remove(l.id); closeDrawer(); toast('Contacto eliminado'); render(); } catch (e) { toast(e.message, true); }
  });
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Guardar cambios');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      await patch(l.id, { status: sel.value, next_action: act.value.trim() || null, notes: notes.value.trim() || null });
      toast('Cambios guardados'); render(); renderDrawer();
    } catch (e) { toast(e.message, true); saveBtn.disabled = false; }
  });

  d.replaceChildren(
    h('div', { class: 'dr-h' }, h('div', {}, h('h2', { text: titleOf(l) }), h('p', { text: [l.company && l.name ? l.name : '', segOf(l)].filter(Boolean).join(' · ') || 'Sin segmento' })), ring(l), h('button', { class: 'dr-x', type: 'button', 'aria-label': 'Cerrar ficha', onclick: closeDrawer }, '×')),
    h('div', { class: 'dr-b' },
      h('div', { class: 'dr-quick' }, phone ? h('a', { href: 'tel:' + phone, text: 'Llamar' }) : null, mail ? h('a', { class: 'alt', href: 'mailto:' + mail, text: 'Enviar correo' }) : null, !phone && !mail ? h('span', { class: 'dr-val', text: 'Sin teléfono ni correo' }) : null),
      h('div', { class: 'dr-grid' },
        field('Teléfono', h('div', { class: 'dr-val', text: l.phone || '–' })),
        field('Correo', h('div', { class: 'dr-val', text: l.email || '–' })),
        field('Origen', h('div', { class: 'dr-val', text: srcLabel(l) })),
        field('Alta', h('div', { class: 'dr-val', text: fmtDate(l.created_at) })),
        l.service ? field('Servicio', h('div', { class: 'dr-val', text: l.service }), true) : null,
        l.message ? field('Mensaje recibido', h('div', { class: 'dr-box', text: l.message }), true) : null),
      h('div', { class: 'dr-grid' },
        field('Etapa', sel),
        field('Próxima acción', h('div', {}, act, h('div', { class: 'sugg' }, SUGG.map((s) => h('button', { type: 'button', text: s, onclick: () => { act.value = s; act.focus(); } })))), true),
        field('Notas', notes, true)),
      research(l),
      h('div', { class: 'dr-save' }, saveBtn, delBtn)));
}
function openDrawer(id, opener) {
  state.openId = id; state.opener = opener || null;
  renderDrawer();
  $('scrim').hidden = false;
  const d = $('drawer');
  d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false');
  d.focus();
}
function closeDrawer() {
  state.openId = null;
  $('scrim').hidden = true;
  const d = $('drawer');
  d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true');
  if (state.opener && document.contains(state.opener)) state.opener.focus();
}

/* ---------- Exportar CSV (protegido contra fórmulas) ---------- */
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportCsv() {
  const cols = [['Empresa', 'company'], ['Nombre', 'name'], ['Correo', 'email'], ['Teléfono', 'phone'], ['Segmento', 'segment'], ['Servicio', 'service'], ['Origen', 'source'], ['Etapa', 'status'], ['Puntuación', 'score'], ['Próxima acción', 'next_action'], ['Notas', 'notes'], ['Alta', 'created_at']];
  const rows = [cols.map((c) => csvCell(c[0])).join(';')].concat(filtered().map((l) => cols.map((c) => csvCell(l[c[1]])).join(';')));
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const a = h('a', { href: URL.createObjectURL(blob), download: d.getFullYear() + '_' + p(d.getMonth() + 1) + '_' + p(d.getDate()) + '_crm_contactos.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- Arranque ---------- */
async function start() {
  show('app');
  try { await load(); } catch (e) { toast('No se pudieron cargar los contactos: ' + e.message, true); state.leads = []; }
  render();
}
async function gate() {
  try {
    const isAdmin = await api('POST', 'rpc/has_role', { _user_id: state.sess.user_id, _role: 'admin' });
    if (isAdmin === true) await start(); else show('denied');
  } catch (e) {
    clearSession(); show('login'); $('login-msg').textContent = 'La sesión ha caducado. Vuelve a entrar.';
  }
}
function logout() { if (state.demo) { toast('Vista previa: no hay sesión que cerrar'); return; } clearSession(); show('login'); $('l-pass').value = ''; $('login-msg').textContent = ''; closeDrawer(); }

function bind() {
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('l-email').value.trim(), pass = $('l-pass').value;
    if (!email || !pass) { $('login-msg').textContent = 'Escribe tu email y tu contraseña.'; return; }
    const b = $('l-submit'); b.disabled = true; $('login-msg').textContent = '';
    try { saveSession(await authReq('password', { email, password: pass })); $('l-pass').value = ''; await gate(); }
    catch (err) { $('login-msg').textContent = 'Email o contraseña incorrectos.'; }
    b.disabled = false;
  });
  document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
  let t;
  $('q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; render(); }, 160); });
  $('f-service').addEventListener('change', (e) => { state.service = e.target.value; render(); });
  $('f-source').addEventListener('change', (e) => { state.source = e.target.value; render(); });
  $('f-new').addEventListener('change', (e) => { state.onlyNew = e.target.checked; render(); });
  $('f-tier').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { state.tier = b.dataset.tier; render(); } });
  document.querySelectorAll('.seg-b').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
  $('btn-reload').addEventListener('click', async () => { try { await load(); render(); toast('Datos actualizados'); } catch (e) { toast(e.message, true); } });
  $('btn-csv').addEventListener('click', exportCsv);
  $('btn-theme').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem(TKEY, t); } catch (e) { /* sin almacenamiento */ }
  });
  $('scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.openId) closeDrawer(); });
}

bind();
if (!LIVE) { state.demo = true; start(); }
else { state.sess = loadSession(); if (state.sess) gate(); else show('login'); }
})();
