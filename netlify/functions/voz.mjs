/* Sintel AI · Función de voz para el asistente web
   Ubicación en el proyecto: netlify/functions/voz.mjs  →  /.netlify/functions/voz

   Variables de entorno (Netlify > Site configuration > Environment variables):
     ELEVENLABS_API_KEY     clave de ElevenLabs (obligatoria)
     ELEVENLABS_VOICE_ID    ID de la voz elegida en ElevenLabs (obligatoria)
     ELEVENLABS_TTS_MODEL   opcional, por defecto eleven_v3 (es el modelo que incluye catalán)
     ELEVENLABS_STT_MODEL   opcional, por defecto scribe_v2

   Rutas:
     GET  ?a=ping   comprueba que la voz está configurada y, si no, lista las variables que faltan (el widget solo muestra los botones si ok es true)
     POST ?a=tts    cuerpo JSON {"text": "..."}  ->  audio/mpeg
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

  if (req.method !== "POST") return json(405, { error: "method" });
  if (!ORIGINS.test(req.headers.get("origin") || "")) return json(403, { error: "origin" });
  if (!key || !voice) return json(503, { error: "not_configured" });

  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "anon";
  if (limited(ip)) return json(429, { error: "rate" });

  try {
    if (action === "tts") {
      const body = await req.json().catch(() => null);
      const text = String((body && body.text) || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
      if (!text) return json(400, { error: "text" });

      const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_v3" })
      });
      if (!r.ok) {
        console.error("TTS", r.status, (await r.text()).slice(0, 300));
        return json(502, { error: "tts" });
      }
      return new Response(r.body, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
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
