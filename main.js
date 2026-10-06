// Sintel AI · web corporativa (català per defecte, castellà a /es/)
(function () {
  // Webhook del escenario de Make "mail recibido Sintel AI" (el mismo que usa la web actual)
  var MAKE_WEBHOOK_URL = "https://hook.eu2.make.com/ksh91tz8yt92lm9kq5bx9ygsfeh95bhk";
  // Solo se envían datos reales desde el dominio o desde Netlify; en vistas previas el formulario se simula
  var LIVE = /(^|\.)sintelai\.es$|\.netlify\.app$/.test(location.hostname);

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Menú mòbil ---------- */
  var toggle = document.getElementById("menu-toggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    var closedLabel = toggle.textContent;
    var openLabel = toggle.getAttribute("data-open") || "×";
    var setOpen = function (open) {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? openLabel : closedLabel;
    };
    toggle.addEventListener("click", function () { setOpen(!nav.classList.contains("open")); });
    nav.addEventListener("click", function (e) { if (e.target.tagName === "A") setOpen(false); });
  }

  /* ---------- Demo interactiva del recordatori ---------- */
  var DEMO = {
    ca: {
      start: "Hola, Marta. Et recordem la teva cita de demà a les 10:30. Ens confirmes que vens?",
      opts: { confirm: "Confirmo", change: "Canviar la cita", cancel: "No podré venir", s1: "Dijous 9:00", s2: "Dijous 17:30", yes: "Sí, proposa'm data", no: "No, gràcies", again: "Tornar a començar" },
      confirm: "Perfecte, Marta. T'esperem demà a les 10:30. T'enviarem un altre avís 2 hores abans.",
      change: "Cap problema. Tinc forat dijous a les 9:00 o a les 17:30. Quina et va millor?",
      moved: function (s) { return "Fet! La teva cita passa a " + s.toLowerCase() + ". Et recordarem el dia abans."; },
      cancel: "Entesos. Vols que et proposem una altra data?",
      cancelled: "D'acord, anul·lem la cita. Gràcies per avisar-nos!",
      waTitle: "Avís automàtic",
      waConfirm: "Marta ha confirmat la cita de dimecres a les 10:30.",
      waMoved: function (s) { return "Marta ha canviat la cita de dimecres 10:30 a " + s.toLowerCase() + ". El forat de dimecres queda lliure."; },
      waCancel: "Marta ha anul·lat la cita de dimecres a les 10:30. Forat lliure per a un altre pacient.",
      empty: "Quan la pacient respon, el teu equip ho veu aquí sense haver de trucar.",
      st: { pend: "Pendent", ok: "Confirmada", moved: "Reprogramada", free: "Lliure" },
      days: { wed: "Dc", thu: "Dj" }
    },
    es: {
      start: "Hola, Marta. Te recordamos tu cita de mañana a las 10:30. ¿Nos confirmas que vienes?",
      opts: { confirm: "Confirmo", change: "Cambiar la cita", cancel: "No podré ir", s1: "Jueves 9:00", s2: "Jueves 17:30", yes: "Sí, proponme fecha", no: "No, gracias", again: "Volver a empezar" },
      confirm: "Perfecto, Marta. Te esperamos mañana a las 10:30. Te enviaremos otro aviso 2 horas antes.",
      change: "Sin problema. Tengo hueco el jueves a las 9:00 o a las 17:30. ¿Cuál te va mejor?",
      moved: function (s) { return "¡Hecho! Tu cita pasa al " + s.toLowerCase() + ". Te la recordaremos el día antes."; },
      cancel: "Entendido. ¿Quieres que te propongamos otra fecha?",
      cancelled: "De acuerdo, anulamos la cita. ¡Gracias por avisarnos!",
      waTitle: "Aviso automático",
      waConfirm: "Marta ha confirmado su cita del miércoles a las 10:30.",
      waMoved: function (s) { return "Marta ha cambiado su cita del miércoles 10:30 al " + s.toLowerCase() + ". El hueco del miércoles queda libre."; },
      waCancel: "Marta ha anulado su cita del miércoles a las 10:30. Hueco libre para otro paciente.",
      empty: "Cuando la paciente responde, tu equipo lo ve aquí sin tener que llamar.",
      st: { pend: "Pendiente", ok: "Confirmada", moved: "Reprogramada", free: "Libre" },
      days: { wed: "Mi", thu: "Ju" }
    }
  };

  var demo = document.getElementById("demo");
  if (demo) {
    var L = DEMO[demo.getAttribute("data-lang")] || DEMO.ca;
    var log = document.getElementById("demo-log");
    var wa = document.getElementById("demo-wa");
    var agendaEl = document.getElementById("demo-agenda");
    var slots;

    var initialSlots = function () {
      return [
        { id: "w1030", day: "wed", time: "10:30", who: "Marta", st: "pend" },
        { id: "w1100", day: "wed", time: "11:00", who: "Jordi", st: "ok" },
        { id: "t0900", day: "thu", time: "9:00", who: "", st: "free" },
        { id: "t1730", day: "thu", time: "17:30", who: "", st: "free" }
      ];
    };

    var el = function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    var renderAgenda = function (flashId) {
      agendaEl.innerHTML = "";
      slots.forEach(function (s) {
        var li = el("li", s.id === flashId ? "flash" : "");
        li.appendChild(el("time", "", L.days[s.day] + " " + s.time));
        li.appendChild(el("span", "", s.who || "—"));
        li.appendChild(el("b", "st " + s.st, L.st[s.st]));
        agendaEl.appendChild(li);
      });
    };

    var setSlot = function (id, who, st) {
      slots.forEach(function (s) { if (s.id === id) { s.who = who; s.st = st; } });
    };

    var notify = function (text) {
      var empty = wa.querySelector(".panel-empty");
      if (empty) empty.remove();
      var n = el("p", "wa-note");
      n.appendChild(el("b", "", L.waTitle + " · " + new Date().toLocaleTimeString(demo.getAttribute("data-lang") === "es" ? "es-ES" : "ca-ES", { hour: "2-digit", minute: "2-digit" })));
      n.appendChild(document.createTextNode(text));
      wa.insertBefore(n, wa.firstChild);
    };

    var say = function (text, who) { log.appendChild(el("p", "msg " + who, text)); log.scrollTop = log.scrollHeight; };

    var offer = function (keys) {
      var q = el("div", "quick");
      keys.forEach(function (k) {
        var b = el("button", "", L.opts[k]);
        b.type = "button";
        b.setAttribute("data-k", k);
        q.appendChild(b);
      });
      log.appendChild(q);
      log.scrollTop = log.scrollHeight;
    };

    var bot = function (text, keys) {
      setTimeout(function () { say(text, "bot"); if (keys) offer(keys); }, 450);
    };

    var reset = function () {
      slots = initialSlots();
      log.innerHTML = "";
      wa.innerHTML = "";
      wa.appendChild(el("p", "panel-empty", L.empty));
      say(L.start, "bot");
      offer(["confirm", "change", "cancel"]);
      renderAgenda();
    };

    var step = function (k) {
      if (k === "again") return reset();
      say(L.opts[k], "user");
      if (k === "confirm") {
        setSlot("w1030", "Marta", "ok"); renderAgenda("w1030");
        notify(L.waConfirm);
        bot(L.confirm, ["again"]);
      } else if (k === "change" || k === "yes") {
        bot(L.change, ["s1", "s2"]);
      } else if (k === "s1" || k === "s2") {
        var target = k === "s1" ? "t0900" : "t1730";
        setSlot("w1030", "", "free"); setSlot(target, "Marta", "moved"); renderAgenda(target);
        notify(L.waMoved(L.opts[k]));
        bot(L.moved(L.opts[k]), ["again"]);
      } else if (k === "cancel") {
        bot(L.cancel, ["yes", "no"]);
      } else if (k === "no") {
        setSlot("w1030", "", "free"); renderAgenda("w1030");
        notify(L.waCancel);
        bot(L.cancelled, ["again"]);
      }
    };

    slots = initialSlots();
    log.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-k]");
      if (!b) return;
      b.parentNode.classList.add("used");
      step(b.getAttribute("data-k"));
    });
    var resetBtn = document.getElementById("demo-reset");
    if (resetBtn) resetBtn.addEventListener("click", reset);
  }

  /* ---------- Formulari de contacte ---------- */
  var form = document.getElementById("lead-form");
  if (!form) return;
  var lang = form.getAttribute("data-lang") === "es" ? "es" : "ca";
  var TXT = {
    ca: {
      thanks: "Gràcies! Et contactem en menys de 24 hores laborables.",
      doneTitle: "Missatge enviat correctament",
      doneText: function (n, e) { return "Gràcies, " + n + ". T'hem enviat un correu de confirmació a " + e + " i et contactem en menys de 24 hores laborables."; },
      again: "Enviar un altre missatge",
      name: "Indica el teu nom.", email: "Revisa l'email: sembla que no és vàlid.",
      company: "Indica la teva empresa o sector per preparar l'auditoria.", message: "Explica'ns breument el teu cas.",
      consent: "Per enviar, accepta la política de privacitat.", undecided: "Encara no ho tinc clar",
      preview: "Vista prèvia: el formulari funciona, però aquí no s'envia. A sintelai.es arribarà al teu escenari de Make.",
      sending: "Enviant…", error: "No s'ha pogut enviar. Torna-ho a provar o escriu-nos a comercial@sintelai.es."
    },
    es: {
      thanks: "¡Gracias! Te contactamos en menos de 24 horas laborables.",
      doneTitle: "Mensaje enviado correctamente",
      doneText: function (n, e) { return "Gracias, " + n + ". Te hemos enviado un correo de confirmación a " + e + " y te contactamos en menos de 24 horas laborables."; },
      again: "Enviar otro mensaje",
      name: "Indica tu nombre.", email: "Revisa el email: parece que no es válido.",
      company: "Indica tu empresa o sector para preparar la auditoría.", message: "Cuéntanos brevemente tu caso.",
      consent: "Para enviar, acepta la política de privacidad.", undecided: "No lo tengo claro",
      preview: "Vista previa: el formulario funciona, pero aquí no se envía. En sintelai.es llegará a tu escenario de Make.",
      sending: "Enviando…", error: "No se ha podido enviar. Inténtalo de nuevo o escríbenos a comercial@sintelai.es."
    }
  }[lang];
  var msg = document.getElementById("form-msg");
  var btn = document.getElementById("f-submit");
  var btnLabel = btn.textContent;

  function say(text, kind) {
    msg.textContent = text;
    msg.className = "form-msg " + (kind || "");
  }

  // Confirmació visible després d'enviar: substitueix el formulari fins que es vulgui enviar un altre missatge
  function showDone(name, email) {
    var done = document.createElement("div");
    done.className = "form-done";
    done.setAttribute("role", "status");
    done.tabIndex = -1;
    var icon = document.createElement("div"); icon.className = "form-done-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = "✓";
    var h = document.createElement("h3"); h.textContent = TXT.doneTitle;
    var p = document.createElement("p"); p.textContent = TXT.doneText(name, email);
    var b = document.createElement("button"); b.type = "button"; b.className = "btn btn-ghost"; b.textContent = TXT.again;
    b.addEventListener("click", function () { done.remove(); form.hidden = false; form.querySelector("input").focus(); });
    done.append(icon, h, p, b);
    form.hidden = true;
    form.parentNode.insertBefore(done, form.nextSibling);
    done.scrollIntoView({ behavior: "smooth", block: "center" });
    done.focus({ preventScroll: true });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = new FormData(form);
    var get = function (k) { return String(d.get(k) || "").trim(); };

    if (get("website")) { say(TXT.thanks, "ok"); return; }
    if (!get("name")) return say(TXT.name, "err");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get("email"))) return say(TXT.email, "err");
    if (!get("company")) return say(TXT.company, "err");
    if (!get("message")) return say(TXT.message, "err");
    if (!d.get("consent")) return say(TXT.consent, "err");

    var payload = {
      name: get("name"),
      email: get("email"),
      phone: get("phone"),
      company: get("company"),
      service: get("service") || TXT.undecided,
      message: get("message"),
      lang: lang
    };

    if (!LIVE) { say(TXT.preview, "ok"); return; }

    btn.disabled = true;
    btn.textContent = TXT.sending;
    fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      form.reset();
      say("", "");
      showDone(payload.name, payload.email);
    }).catch(function () {
      say(TXT.error, "err");
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = btnLabel;
    });
  });
})();

/* Botones para subir y bajar + flotantes compactos al llegar al pie */
(function () {
  var ca = (document.documentElement.lang || "ca").indexOf("es") !== 0;
  var nav = document.createElement("div");
  nav.className = "scroll-nav";
  nav.innerHTML =
    '<button type="button" data-dir="up" aria-label="' + (ca ? "Pujar a l'inici" : "Subir al inicio") + '" hidden>↑</button>' +
    '<button type="button" data-dir="down" aria-label="' + (ca ? "Baixar al final" : "Bajar al final") + '">↓</button>';
  document.body.appendChild(nav);
  var up = nav.querySelector('[data-dir="up"]'), down = nav.querySelector('[data-dir="down"]');
  var smooth = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  up.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: smooth }); });
  down.addEventListener("click", function () { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth }); });
  function update() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    up.hidden = y < 300;
    down.hidden = y > max - 300;
    document.body.classList.toggle("at-end", y > max - 260);
  }
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
})();
