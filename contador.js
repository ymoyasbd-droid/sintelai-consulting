/* Sintel AI · Contador anónimo de la web: sin cookies ni datos personales.
   Envía una carga de página (ruta, idioma y utm_source) a /.netlify/functions/contador. La demo tiene su propio contador. */
(function () {
  if (!/(^|\.)sintelai\.es$|\.netlify\.app$/.test(location.hostname)) return;
  var lang = (document.documentElement.lang || "ca").indexOf("es") === 0 ? "es" : "ca";
  var src = (new URLSearchParams(location.search).get("utm_source") || "directo").slice(0, 40);
  var path = location.pathname.replace(/\/index\.html$/, "/").slice(0, 80);
  try {
    fetch("/.netlify/functions/contador", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ e: "web", l: lang, s: src, p: path }) });
  } catch (x) {}
})();
