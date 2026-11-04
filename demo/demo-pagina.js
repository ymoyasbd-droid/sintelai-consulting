// Página de la demo (ca y es): abre el asistente y cuenta eventos anónimos.
// Antes iba en línea en demo/index.html y es/demo/index.html; se separa para que la CSP no necesite 'unsafe-inline'.
  // Obre l'assistent amb el botó principal i, en pantalles grans, en carregar la demo
  window.addEventListener("load", function () {
    function openBot() { var b = document.querySelector(".sb-launch"); if (b && b.getAttribute("aria-expanded") !== "true") b.click(); }
    document.getElementById("open-bot").addEventListener("click", openBot);
    if (window.matchMedia("(min-width: 700px)").matches) setTimeout(openBot, 600);
  });

  // Contador anónimo de la demo: sin cookies ni datos personales. Un evento de cada tipo por visita.
  (function () {
    var lang = document.documentElement.lang === "es" ? "es" : "ca";
    var src = (new URLSearchParams(location.search).get("utm_source") || "directo").slice(0, 40);
    var sent = {};
    function track(e) {
      if (sent[e]) return; sent[e] = true;
      try { fetch("/.netlify/functions/contador", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ e: e, l: lang, s: src }) }); } catch (x) {}
    }
    track("visita");
    document.addEventListener("submit", function (ev) {
      var f = ev.target;
      if (f.classList.contains("sb-in")) track("mensaje");
      else if (f.classList.contains("sb-form")) track("datos");
    }, true);
    document.addEventListener("click", function (ev) {
      var t = ev.target.closest && ev.target.closest(".sb-quick button, .sb-listen");
      if (!t) return;
      track(t.classList.contains("sb-listen") ? "escuchar" : "mensaje");
    }, true);
  })();
