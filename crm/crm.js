/* CRM interno de Sintel AI
   Replica el CRM de la app (src/pages/Crm.tsx): Supabase SINTEL AI CORPORATIVA (hrzkluxbtnyhpprcrnob), tabla `leads`
   y mismo control de acceso (has_role admin + RLS). Sin librerías: REST directo.
   Los contactos entran solo por las edge functions (webhook-leads / submit-lead);
   este panel lee, actualiza y borra, nunca inserta. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://hrzkluxbtnyhpprcrnob.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemtsdXhidG55aHBwcmNybm9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1OTk5NjcsImV4cCI6MjEwNjE3NTk2N30.mzDum9Yl70KUFqju1z7BzMoz_rFuxduvLC-CfwNTJYU';
  var LIVE = /(^|\.)sintelai\.es$|\.netlify\.app$/.test(location.hostname) && SUPABASE_URL.indexOf('https://') === 0;
  var STATUSES = ['Nuevo', 'Contactado', 'Negociación', 'Cerrado'];
  var SKEY = 'sintel-crm-session';

  var $ = function (id) { return document.getElementById(id); };
  var state = { session: null, leads: [], q: '', service: '', openId: null, confirmDel: false };

  /* ---------- utilidades ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return iso; }
  }
  function isBot(l) { return /xatbot|chatbot|asistente|assistent/i.test((l.service || '') + ' ' + (l.source || '')); }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function show(view) {
    ['crm-login', 'crm-denied', 'crm-app'].forEach(function (id) { $(id).hidden = id !== view; });
  }
  function saveSession(s) {
    state.session = s;
    try { s ? sessionStorage.setItem(SKEY, JSON.stringify(s)) : sessionStorage.removeItem(SKEY); } catch (e) {}
  }
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch (e) { return null; }
  }

  /* ---------- Supabase REST ---------- */
  function authReq(grant, body) {
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || 'auth');
        return { access_token: j.access_token, refresh_token: j.refresh_token, user_id: j.user && j.user.id, expires_at: Date.now() + (j.expires_in || 3600) * 1000 };
      });
    });
  }
  function ensureFresh() {
    var s = state.session;
    if (!s) return Promise.reject(new Error('nosession'));
    if (Date.now() < s.expires_at - 60000) return Promise.resolve(s);
    return authReq('refresh_token', { refresh_token: s.refresh_token }).then(function (n) { saveSession(n); return n; });
  }
  function api(path, opts) {
    opts = opts || {};
    return ensureFresh().then(function (s) {
      var h = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
      if (opts.prefer) h.Prefer = opts.prefer;
      return fetch(SUPABASE_URL + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    }).then(function (r) {
      if (r.status === 401) { saveSession(null); show('crm-login'); throw new Error('401'); }
      if (!r.ok) throw new Error('http ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }

  /* ---------- modo vista previa (fuera de sintelai.es / Netlify) ---------- */
  function demoLeads() {
    var now = Date.now(), h = 3600000;
    return [
      { id: 'ej1', name: 'Contacto de ejemplo 1', email: 'ejemplo1@example.com', phone: '600 000 001', company: 'Empresa ejemplo A', service: 'Asistente web (chatbot)', source: 'web', status: 'Nuevo', score: 82, segment: 'Ejemplo', message: 'Texto de ejemplo: conversación del asistente.', created_at: new Date(now - 2 * h).toISOString(), next_action: '', notes: '', enrichment: null, enrichment_sources: null },
      { id: 'ej2', name: 'Contacto de ejemplo 2', email: 'ejemplo2@example.com', phone: '600 000 002', company: 'Empresa ejemplo B', service: 'Assistent web (xatbot)', source: 'web', status: 'Contactado', score: 55, segment: 'Ejemplo', message: 'Texto de ejemplo.', created_at: new Date(now - 26 * h).toISOString(), next_action: 'Ejemplo de próxima acción', notes: '', enrichment: { empresa: 'Empresa ejemplo B', actividad: 'Dato de ejemplo', ubicacion: 'Dato de ejemplo', confianza: 'ejemplo', posibles_dolores: ['Dato de ejemplo'], gancho_llamada: 'Dato de ejemplo' }, enrichment_sources: [] },
      { id: 'ej3', name: 'Contacto de ejemplo 3', email: 'ejemplo3@example.com', phone: '', company: '', service: 'Formulario de contacto', source: 'web', status: 'Negociación', score: 30, segment: 'Ejemplo', message: 'Texto de ejemplo.', created_at: new Date(now - 72 * h).toISOString(), next_action: '', notes: '', enrichment: null, enrichment_sources: null }
    ];
  }

  /* ---------- datos ---------- */
  function load() {
    if (!LIVE) { if (!state.leads.length) state.leads = demoLeads(); render(); return Promise.resolve(); }
    return api('/rest/v1/leads?select=*&order=created_at.desc').then(function (rows) {
      state.leads = rows || []; render();
    }).catch(function (e) { if (e.message !== '401') toast('No se han podido cargar los contactos'); });
  }
  function patch(id, fields) {
    var l = state.leads.find(function (x) { return x.id === id; });
    var prev = {}; Object.keys(fields).forEach(function (k) { prev[k] = l[k]; });
    Object.assign(l, fields); render();
    if (!LIVE) return Promise.resolve(true);
    return api('/rest/v1/leads?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: fields, prefer: 'return=minimal' })
      .then(function () { return true; })
      .catch(function () { Object.assign(l, prev); render(); toast('No se ha podido guardar'); return false; });
  }
  function remove(id) {
    var done = function () {
      state.leads = state.leads.filter(function (x) { return x.id !== id; });
      closeDrawer(); render(); toast('Contacto eliminado');
    };
    if (!LIVE) return done();
    api('/rest/v1/leads?id=eq.' + encodeURIComponent(id), { method: 'DELETE', prefer: 'return=minimal' })
      .then(done).catch(function () { toast('No se ha podido eliminar'); });
  }

  /* ---------- render ---------- */
  function filtered() {
    var q = state.q.toLowerCase();
    return state.leads.filter(function (l) {
      if (state.service && l.service !== state.service) return false;
      if (!q) return true;
      return [l.name, l.email, l.phone, l.company].some(function (v) { return v && String(v).toLowerCase().indexOf(q) > -1; });
    });
  }
  function render() {
    var all = state.leads;
    $('k-total').textContent = all.length;
    $('k-new').textContent = all.filter(function (l) { return (l.status || 'Nuevo') === 'Nuevo'; }).length;
    $('k-bot').textContent = all.filter(isBot).length;
    $('k-won').textContent = all.filter(function (l) { return l.status === 'Cerrado'; }).length;

    var sel = $('f-service'), services = [];
    all.forEach(function (l) { if (l.service && services.indexOf(l.service) < 0) services.push(l.service); });
    sel.innerHTML = '<option value="">Todos los servicios</option>' + services.sort().map(function (s) {
      return '<option' + (s === state.service ? ' selected' : '') + ' value="' + esc(s) + '">' + esc(s) + '</option>';
    }).join('');

    var list = filtered();
    $('board').innerHTML = STATUSES.map(function (st) {
      var items = list.filter(function (l) { return (l.status || 'Nuevo') === st; });
      return '<section class="col" data-status="' + st + '"><div class="col-head"><h2>' + st + '</h2><span>' + items.length + '</span></div>' +
        (items.length ? items.map(card).join('') : '<p class="col-empty">Sin contactos</p>') + '</section>';
    }).join('');
    if (state.openId) renderDrawer();
  }
  function card(l) {
    var sc = l.score == null ? '' : '<span class="lead-score ' + (l.score >= 70 ? 'hi' : l.score >= 40 ? 'mid' : '') + '">' + esc(l.score) + '</span>';
    return '<button type="button" class="lead" draggable="true" data-id="' + esc(l.id) + '">' +
      '<span class="lead-top"><span class="lead-name">' + esc(l.name || l.email) + '</span>' + sc + '</span>' +
      '<span class="lead-meta">' + esc(l.company || l.email) + '</span>' +
      '<span class="lead-meta">' + esc(fmtDate(l.created_at)) + '</span>' +
      '<span class="lead-tags">' + (isBot(l) ? '<span class="tag bot">Asistente</span>' : '') +
      (l.service && !isBot(l) ? '<span class="tag">' + esc(l.service) + '</span>' : '') +
      (!LIVE ? '<span class="tag ex">Ejemplo</span>' : '') + '</span></button>';
  }
  function row(k, v, html) { return v ? '<dt>' + k + '</dt><dd>' + (html ? v : esc(v)) + '</dd>' : ''; }
  function research(l) {
    var e = l.enrichment;
    if (!e) return '<div class="research"><h3>Investigación IA</h3><p>Aún no hay investigación para este contacto.</p></div>';
    var src = Array.isArray(l.enrichment_sources) ? l.enrichment_sources : [];
    return '<div class="research"><h3>Investigación IA' + (e.confianza ? ' <span class="tag">Confianza: ' + esc(e.confianza) + '</span>' : '') + '</h3>' +
      (e.empresa ? '<p><strong>' + esc(e.empresa) + '</strong></p>' : '') +
      (e.actividad ? '<p>' + esc(e.actividad) + '</p>' : '') +
      (e.ubicacion || e.tamano_estimado ? '<p>' + esc([e.ubicacion, e.tamano_estimado].filter(Boolean).join(' · ')) + '</p>' : '') +
      (Array.isArray(e.posibles_dolores) && e.posibles_dolores.length ? '<p>Posibles dolores:</p><ul>' + e.posibles_dolores.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' : '') +
      (e.gancho_llamada ? '<p><strong>Gancho para la llamada:</strong> ' + esc(e.gancho_llamada) + '</p>' : '') +
      (src.length ? '<p>Fuentes:</p><ul>' + src.map(function (s) {
        var u = s && s.url && /^https?:\/\//.test(s.url) ? s.url : '';
        return '<li>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title || u) + '</a>' : esc(s && s.title)) + '</li>';
      }).join('') + '</ul>' : '') + '</div>';
  }
  function renderDrawer() {
    var l = state.leads.find(function (x) { return x.id === state.openId; });
    if (!l) return closeDrawer();
    var keep = document.activeElement && $('drawer').contains(document.activeElement) ? document.activeElement.id : null;
    if (keep === 'd-notes' || keep === 'd-next') return; // no pisar lo que se está escribiendo
    $('drawer-in').innerHTML =
      '<div class="d-head"><div><h2>' + esc(l.name || l.email) + '</h2>' + (!LIVE ? '<span class="tag ex">Ejemplo</span>' : '') + '</div>' +
      '<button class="d-close" type="button" id="d-close" aria-label="Cerrar">×</button></div>' +
      '<dl class="d-list">' +
      row('Email', l.email ? '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '', true) +
      row('Teléfono', l.phone ? '<a href="tel:' + esc(String(l.phone).replace(/\s/g, '')) + '">' + esc(l.phone) + '</a>' : '', true) +
      row('Empresa', l.company) + row('Servicio', l.service) + row('Origen', l.source) +
      row('Puntuación', l.score == null ? '' : String(l.score)) + row('Segmento', l.segment) + row('Recibido', fmtDate(l.created_at)) +
      '</dl>' +
      (l.message ? '<div><p class="eyebrow">Mensaje</p><p class="d-msg">' + esc(l.message) + '</p></div>' : '') +
      research(l) +
      '<div class="d-actions">' +
      '<div class="field"><label for="d-next">Próxima acción</label><input id="d-next" value="' + esc(l.next_action || '') + '" placeholder="Ej.: llamar el martes"></div>' +
      '<div class="field"><label for="d-status">Estado</label><select id="d-status">' + STATUSES.map(function (s) {
        return '<option' + ((l.status || 'Nuevo') === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="d-notes">Notas internas</label><textarea id="d-notes" rows="5">' + esc(l.notes || '') + '</textarea></div>' +
      '<button class="btn btn-primary" type="button" id="d-save">Guardar notas</button>' +
      (state.confirmDel
        ? '<div class="confirm"><p>¿Eliminar este contacto? No se puede deshacer.</p><div class="row"><button class="btn btn-ghost" type="button" id="d-cancel">Cancelar</button><button class="btn btn-warn" type="button" id="d-del-yes">Eliminar</button></div></div>'
        : '<button class="d-danger" type="button" id="d-del">Eliminar contacto</button>') +
      '</div>';
  }
  function openDrawer(id) { state.openId = id; state.confirmDel = false; $('drawer').hidden = false; renderDrawer(); $('d-close').focus(); }
  function closeDrawer() { state.openId = null; state.confirmDel = false; $('drawer').hidden = true; }

  /* ---------- eventos ---------- */
  function bind() {
    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('l-email').value.trim(), pass = $('l-pass').value, msg = $('login-msg');
      if (!email || !pass) { msg.textContent = 'Introduce email y contraseña.'; return; }
      $('l-submit').disabled = true; msg.textContent = '';
      authReq('password', { email: email, password: pass }).then(function (s) {
        saveSession(s); $('l-pass').value = ''; return gate();
      }).catch(function () { msg.textContent = 'Email o contraseña incorrectos.'; })
        .then(function () { $('l-submit').disabled = false; });
    });
    document.querySelectorAll('[data-logout]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = state.session;
        if (LIVE && s) fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token } }).catch(function () {});
        saveSession(null); state.leads = []; closeDrawer();
        LIVE ? show('crm-login') : start();
      });
    });
    $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
    $('f-service').addEventListener('change', function (e) { state.service = e.target.value; render(); });
    $('reload').addEventListener('click', function () { load().then(function () { toast('Actualizado'); }); });

    var board = $('board'), dragId = null;
    board.addEventListener('click', function (e) { var c = e.target.closest('.lead'); if (c) openDrawer(c.dataset.id); });
    board.addEventListener('dragstart', function (e) {
      var c = e.target.closest('.lead'); if (!c) return;
      dragId = c.dataset.id; c.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (x) {}
    });
    board.addEventListener('dragend', function () { dragId = null; board.querySelectorAll('.over,.dragging').forEach(function (n) { n.classList.remove('over', 'dragging'); }); });
    board.addEventListener('dragover', function (e) {
      var col = e.target.closest('.col'); if (!col || !dragId) return;
      e.preventDefault(); board.querySelectorAll('.col.over').forEach(function (n) { if (n !== col) n.classList.remove('over'); }); col.classList.add('over');
    });
    board.addEventListener('drop', function (e) {
      var col = e.target.closest('.col'); if (!col || !dragId) return;
      e.preventDefault();
      var l = state.leads.find(function (x) { return x.id === dragId; });
      if (l && (l.status || 'Nuevo') !== col.dataset.status) patch(dragId, { status: col.dataset.status }).then(function (ok) { if (ok) toast('Movido a ' + col.dataset.status); });
    });

    var dr = $('drawer');
    dr.addEventListener('click', function (e) {
      var id = state.openId, t = e.target;
      if (t.id === 'd-close') closeDrawer();
      else if (t.id === 'd-save') patch(id, { notes: $('d-notes').value }).then(function (ok) { if (ok) toast('Notas guardadas'); });
      else if (t.id === 'd-del') { state.confirmDel = true; renderDrawer(); $('d-del-yes').focus(); }
      else if (t.id === 'd-cancel') { state.confirmDel = false; renderDrawer(); }
      else if (t.id === 'd-del-yes') remove(id);
    });
    dr.addEventListener('change', function (e) {
      if (e.target.id === 'd-status') patch(state.openId, { status: e.target.value }).then(function (ok) { if (ok) toast('Estado actualizado'); });
    });
    dr.addEventListener('focusout', function (e) {
      if (e.target.id !== 'd-next') return;
      var l = state.leads.find(function (x) { return x.id === state.openId; }), v = e.target.value.trim();
      if (l && v !== (l.next_action || '')) patch(l.id, { next_action: v }).then(function (ok) { if (ok) toast('Próxima acción guardada'); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.openId) closeDrawer(); });
  }

  /* ---------- acceso ---------- */
  function gate() {
    return api('/rest/v1/rpc/has_role', { method: 'POST', body: { _user_id: state.session.user_id, _role: 'admin' } })
      .then(function (isAdmin) {
        if (isAdmin === true) { show('crm-app'); return load(); }
        show('crm-denied');
      }).catch(function (e) { if (e.message !== '401') { saveSession(null); show('crm-login'); $('login-msg').textContent = 'No se ha podido comprobar el acceso.'; } });
  }
  function start() {
    if (!LIVE) { $('demo-flag').hidden = false; show('crm-app'); load(); return; }
    var s = loadSession();
    if (s && s.refresh_token) { state.session = s; gate(); } else show('crm-login');
  }

  bind();
  start();
})();
