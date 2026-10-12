/* Sintel AI · Función de voz para el asistente web
   Ubicación en el proyecto: netlify/functions/voz.mjs  →  /.netlify/functions/voz

   Variables de entorno (Netlify > Site configuration > Environment variables):
     ELEVENLABS_API_KEY     clave de ElevenLabs (obligatoria)
     ELEVENLABS_VOICE_ID    ID de la voz elegida en ElevenLabs (obligatoria)
     ELEVENLABS_TTS_MODEL   opcional, modelo para catalán; por defecto eleven_v3 (es el modelo que incluye catalán)
     ELEVENLABS_TTS_MODEL_ES opcional, modelo para castellano; por defecto eleven_flash_v2_5 (el más rápido)
     ELEVENLABS_STT_MODEL   opcional, por defecto scribe_v2

   Rutas:
     GET  ?a=ping   comprueba que la voz está configurada y, si no, lista las variables que faltan (el widget solo muestra los botones si ok es true)
     GET  ?a=tts&l=ca|es&t=texto  ->  audio/mpeg en streaming (lo usa el botón Escuchar; respuesta cacheada en la CDN)
     POST ?a=tts    cuerpo JSON {"text": "...", "lang": "ca|es"}  ->  audio/mpeg (compatibilidad)
     POST ?a=stt    cuerpo = audio grabado       ->  JSON {"text": "...", "lang": "ca"}

   La clave nunca llega al navegador. */

const API = "https://api.elevenlabs.io/v1";
const ORIGINS = /^https?:\/\/((www\.)?sintelai\.es|[a-z0-9-]+\.netlify\.app|localhost(:\d+)?)$/i;
const MAX_TEXT = 1000;               // caracteres por respuesta leída
const MAX_AUDIO = 2 * 1024 * 1024;   // 2 MB de audio dictado (unos 30 s)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQ = 40;                  // peticiones por IP y ventana (límite básico por instancia)
const hits = new Map();

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

// El <audio> del navegador no envía Origin en un GET: se acepta si la petición viene de la propia web
function sameSite(req) {
  if (ORIGINS.test(req.headers.get("origin") || "")) return true;
  if ((req.headers.get("sec-fetch-site") || "") === "same-origin") return true;
  try { return ORIGINS.test(new URL(req.headers.get("referer") || "").origin); } catch { return false; }
}

// Pide el audio en streaming para que empiece a sonar antes. Si el modelo no admite streaming, se pide entero.
async function tts(key, voice, text, lang) {
  const model = lang === "es"
    ? (process.env.ELEVENLABS_TTS_MODEL_ES || "eleven_flash_v2_5")
    : (process.env.ELEVENLABS_TTS_MODEL || "eleven_v3");
  const call = (path) => fetch(`${API}/text-to-speech/${encodeURIComponent(voice)}${path}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: model })
  });
  let r = await call("/stream");
  if (!r.ok && r.status !== 401 && r.status !== 429) {
    console.error("TTS stream", model, r.status, (await r.text()).slice(0, 300));
    r = await call("");
  }
  return r;
}

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_REQ;
}

export default async (req, context) => {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  const action = new URL(req.url).searchParams.get("a");

  // El ping no gasta crédito: solo indica si la voz está lista
  if (req.method === "GET" && action === "ping") {
    const missing = [];
    if (!key) missing.push("ELEVENLABS_API_KEY");
    if (!voice) missing.push("ELEVENLABS_VOICE_ID");
    return json(200, { ok: missing.length === 0, missing });   // solo nombres, nunca valores
  }

  const isGetTts = req.method === "GET" && action === "tts";
  if (req.method !== "POST" && !isGetTts) return json(405, { error: "method" });
  if (!sameSite(req)) return json(403, { error: "origin" });
  if (!key || !voice) return json(503, { error: "not_configured" });

  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "anon";
  if (limited(ip)) return json(429, { error: "rate" });

  try {
    if (action === "tts") {
      const params = new URL(req.url).searchParams;
      const body = isGetTts ? null : await req.json().catch(() => null);
      const raw = isGetTts ? params.get("t") : body && body.text;
      const lang = (isGetTts ? params.get("l") : body && body.lang) === "es" ? "es" : "ca";
      const text = String(raw || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
      if (!text) return json(400, { error: "text" });

      const r = await tts(key, voice, text, lang);
      if (!r.ok) {
        console.error("TTS", r.status, (await r.text()).slice(0, 300));
        return json(502, { error: "tts" });
      }
      // Mismo texto = mismo audio: la CDN de Netlify lo guarda y la siguiente vez sale al instante y sin gastar crédito.
      // Cada despliegue vacía esta caché (por ejemplo, al cambiar de voz).
      const cache = isGetTts
        ? { "Cache-Control": "public, max-age=86400", "Netlify-CDN-Cache-Control": "public, durable, max-age=2592000" }
        : { "Cache-Control": "no-store" };
      return new Response(r.body, { status: 200, headers: { "Content-Type": "audio/mpeg", ...cache } });
    }

    if (action === "stt") {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json(400, { error: "audio" });
      if (buf.byteLength > MAX_AUDIO) return json(413, { error: "too_big" });

      const type = (req.headers.get("content-type") || "audio/webm").split(";")[0].trim();
      const ext = /mp4|m4a/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : /wav/.test(type) ? "wav" : "webm";
      const form = new FormData();
      form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
      form.append("tag_audio_events", "false");   // sin etiquetas tipo (risas); el idioma se detecta solo (ca/es)
      form.append("file", new Blob([buf], { type }), `audio.${ext}`);

      const r = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key }, body: form });
      if (!r.ok) {
        console.error("STT", r.status, (await r.text()).slice(0, 300));
        return json(502, { error: "stt" });
      }
      const data = await r.json();
      return json(200, { text: String(data.text || "").trim(), lang: data.language_code || null });
    }

    return json(400, { error: "action" });
  } catch (err) {
    console.error("voz", err && err.message);
    return json(500, { error: "server" });
  }
};
