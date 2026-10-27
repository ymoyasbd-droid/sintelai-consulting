/* Sintel AI · Contador de la demo del asistente y de la web
   Ubicación: netlify/functions/contador.mjs  →  /.netlify/functions/contador

   Guarda un evento anónimo en la tabla demo_eventos de Supabase:
     demo: visita, mensaje, escuchar, datos    web: web (una carga de página, con su ruta)
   No guarda IP, ni texto, ni cookies: solo el tipo de evento, el idioma, el origen (utm_source) y la ruta.

   Variables de entorno (Netlify > Project configuration > Environment variables):
     SUPABASE_URL                https://hrzkluxbtnyhpprcrnob.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   clave service_role del proyecto (nunca llega al navegador) */

const ORIGINS = /^https?:\/\/((www\.)?sintelai\.es|[a-z0-9-]+\.netlify\.app|localhost(:\d+)?)$/i;
const EVENTS = new Set(["visita", "mensaje", "escuchar", "datos", "web"]);
const PATH = /^\/[a-z0-9\/_-]{0,79}$/i;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQ = 30;                  // eventos por IP y ventana (límite básico por instancia; la IP no se guarda)
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_REQ;
}

export default async (req, context) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  if (!ORIGINS.test(req.headers.get("origin") || "")) return new Response(null, { status: 403 });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response(null, { status: 503 });

  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "anon";
  if (limited(ip)) return new Response(null, { status: 429 });

  const body = await req.json().catch(() => null);
  const evento = body && String(body.e || "");
  if (!EVENTS.has(evento)) return new Response(null, { status: 400 });
  const idioma = body.l === "es" ? "es" : "ca";
  const origen = String(body.s || "directo").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40) || "directo";
  const row = { evento, idioma, origen };
  if (evento === "web") row.pagina = PATH.test(String(body.p || "")) ? String(body.p).toLowerCase() : "/";

  try {
    const r = await fetch(`${url}/rest/v1/demo_eventos`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row)
    });
    if (!r.ok) console.error("contador", r.status, (await r.text()).slice(0, 200));
  } catch (err) {
    console.error("contador", err && err.message);
  }
  return new Response(null, { status: 204 });
};
