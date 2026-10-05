/* Sintel AI · Assistent de captació
   Widget autònom: s'insereix amb una sola etiqueta <script> i no depèn de cap llibreria.
   Atributs del <script>:
     data-lang      "ca" (per defecte) o "es"
     data-endpoint  funció d'IA (per defecte /.netlify/functions/chat). Si no respon, el widget
                    continua en mode guiat amb les respostes oficials de Sintel AI.
     data-webhook   webhook de Make on arriben els contactes
     data-privacy   enllaç a la política de privacitat
     data-voice     funció de veu (per defecte /.netlify/functions/voz). "off" desactiva la veu
*/
(function () {
  if (window.__sintelBot) return;
  window.__sintelBot = true;

  var script = document.currentScript || document.querySelector("script[src*='chatbot.js']");
  var ds = (script && script.dataset) || {};
  var LANG = ds.lang === "es" ? "es" : "ca";
  var ENDPOINT = ds.endpoint || "/.netlify/functions/chat";
  var WEBHOOK = ds.webhook || "";
  var PRIVACY = ds.privacy || "legal.html";
  // Només s'envien dades reals des del domini o des de Netlify
  var LIVE = /(^|\.)sintelai\.es$|\.netlify\.app$/.test(location.hostname);
  // Veu opcional: dictar la pregunta (micròfon) i escoltar les respostes. Només apareix si la funció respon.
  var VOICE = ds.voice === "off" ? "" : (ds.voice || "/.netlify/functions/voz");
  var CAN_REC = !!(VOICE && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  var CAN_PLAY = !!(VOICE && window.Audio);

  /* ---------- Textos (respostes oficials de la base de coneixement) ---------- */
  var ALL = {
    ca: {
      launcher: "Parla amb l'assistent", title: "Assistent Sintel AI", status: "Respon a l'instant",
      close: "Tancar", placeholder: "Escriu la teva pregunta…", send: "Enviar",
      hello: "Hola! Sóc l'assistent de Sintel AI. T'ajudo a veure com la IA pot atendre i captar clients per al teu negoci. Per on vols començar?",
      quick: [
        ["leads", "Vull captar més clients"], ["citas", "Recordatoris de cita"],
        ["auto", "Automatitzar tasques"], ["precio", "Quant costa?"], ["datos", "Deixar les meves dades"]
      ],
      answers: {
        leads: "Amb un assistent al teu web atens les visites a qualsevol hora: respon dubtes, recull nom, telèfon i motiu de la consulta i t'avisa a l'instant. Així no perds cap client fora d'horari. A què es dedica el teu negoci?",
        citas: "Per a negocis amb cita prèvia enviem confirmació per WhatsApp, un recordatori 24 h abans amb botons per confirmar o canviar, i un avís 2 h abans. Així ningú no oblida la seva cita. Vols que ho revisem per al teu cas a l'auditoria gratuïta?",
        auto: "Connectem el teu CRM, el programa de gestió i el correu per generar pressupostos en minuts, agilitzar la facturació i eliminar tasques manuals. Quina tasca us treu més temps?",
        precio: "A Sintel AI no treballem amb paquets tancats perquè cada negoci és únic. Comencem sempre amb una auditoria gratuïta de 30 minuts i, després de veure les eines que ja fas servir, et preparem un pressupost a mida i sense compromís.",
        plazo: "Depèn de la solució: l'assistent web es lliura en 5 dies hàbils, l'Assistent Pro en 10 i la Suite Premium amb landing i cites en 15.",
        datos_seg: "Treballem exclusivament amb models d'IA empresarials que compleixen el RGPD. La informació de la teva empresa mai no s'utilitza per entrenar models públics.",
        tecnica: "El teu equip no necessita saber de tecnologia. Ens encarreguem de tota la part tècnica i treballareu amb eines que ja coneixeu, com WhatsApp o el correu.",
        error_bot: "Els assistents tenen límits estrictes: si una pregunta surt del previst, prenen les dades del client i passen la conversa al teu equip.",
        grandes: "Les pimes són les que més es beneficien: la IA funciona com un empleat digital que et permet competir amb els grans sense disparar els costos de contractació.",
        contacto: "Pots escriure'ns a comercial@sintelai.es o al WhatsApp +34 614 056 307. Si vols, deixa'm les teves dades i et contactem nosaltres.",
        inmo: "A les immobiliàries el més habitual és perdre interessats que escriuen fora d'horari. L'assistent els atén a l'instant, els qualifica i guarda les dades al CRM perquè el teu equip els truqui. Vols que ho revisem per al teu cas a l'auditoria gratuïta de 30 minuts?",
        agencia: "A les agències B2B solem veure moltes hores perdudes fent pressupostos. Muntem fluxos que generen la proposta en uns 5 minuts. Quina part del procés us treu més temps?",
        fallback: "Aquesta pregunta la resoldrà millor una persona de l'equip. Si em deixes les teves dades, et contactem en menys de 24 hores laborables."
      },
      offerForm: "Vols que et contactem per a l'auditoria gratuïta de 30 minuts?",
      yesForm: "Sí, deixo les meves dades", moreQ: "Tinc una altra pregunta",
      formTitle: "Reserva la teva auditoria gratuïta",
      f: { name: "Nom *", email: "Email *", phone: "Telèfon", company: "Empresa o sector *", consent: "Accepto la <a href=\"{p}\" target=\"_blank\" rel=\"noopener\">política de privacitat</a>.", submit: "Enviar", cancel: "Ara no" },
      err: { name: "Indica el teu nom.", email: "Revisa l'email.", company: "Indica la teva empresa o sector.", consent: "Cal acceptar la política de privacitat." },
      thanks: function (n) { return "Gràcies, " + n + "! Hem rebut les teves dades i et contactem en menys de 24 hores laborables."; },
      preview: "Vista prèvia: les dades no s'envien des d'aquí. A sintelai.es arribaran al teu escenari de Make.",
      sendError: "No s'ha pogut enviar. Escriu-nos a comercial@sintelai.es o al WhatsApp +34 614 056 307.",
      typing: "Escrivint…", privacyNote: "Respostes generades amb IA a partir de la informació oficial de Sintel AI.",
      mic: "Dictar amb la veu", micStop: "Aturar i enviar", listen: "Escoltar", stopListen: "Aturar", loadingVoice: "Carregant…",
      transcribing: "Transcrivint…", micGo: "Continuar", micCancel: "Ara no",
      micNote: "Per escriure amb la veu, l'àudio s'envia a un proveïdor de veu només per convertir-lo en text. Més informació a la <a href=\"{p}\" target=\"_blank\" rel=\"noopener\">política de privacitat</a>.",
      micDenied: "No tinc permís per al micròfon. Revisa els permisos del navegador o escriu la teva pregunta.",
      micEmpty: "No t'he sentit bé. Torna-ho a provar o escriu la teva pregunta.",
      voiceError: "Ara mateix no puc fer servir la veu. Pots escriure la teva pregunta.",
      dataIntake: "Gràcies! Perquè pugui guardar les teves dades i et contactem, revisa'ls i confirma'ls aquí. És imprescindible acceptar la política de privacitat."
    },
    es: {
      launcher: "Habla con el asistente", title: "Asistente Sintel AI", status: "Responde al instante",
      close: "Cerrar", placeholder: "Escribe tu pregunta…", send: "Enviar",
      hello: "¡Hola! Soy el asistente de Sintel AI. Te ayudo a ver cómo la IA puede atender y captar clientes para tu negocio. ¿Por dónde quieres empezar?",
      quick: [
        ["leads", "Quiero captar más clientes"], ["citas", "Recordatorios de cita"],
        ["auto", "Automatizar tareas"], ["precio", "¿Cuánto cuesta?"], ["datos", "Dejar mis datos"]
      ],
      answers: {
        leads: "Con un asistente en tu web atiendes las visitas a cualquier hora: responde dudas, recoge nombre, teléfono y motivo de la consulta y te avisa al momento. Así no pierdes ningún cliente fuera de horario. ¿A qué se dedica tu negocio?",
        citas: "Para negocios con cita previa enviamos confirmación por WhatsApp, un recordatorio 24 h antes con botones para confirmar o cambiar, y un aviso 2 h antes. Así nadie olvida su cita. ¿Quieres que lo revisemos para tu caso en la auditoría gratuita?",
        auto: "Conectamos tu CRM, tu programa de gestión y tu correo para generar presupuestos en minutos, agilizar la facturación y eliminar tareas manuales. ¿Qué tarea os quita más tiempo?",
        precio: "En Sintel AI no trabajamos con paquetes cerrados porque cada negocio es único. Empezamos siempre con una auditoría gratuita de 30 minutos y, tras ver las herramientas que ya usas, te preparamos un presupuesto a medida y sin compromiso.",
        plazo: "Depende de la solución: el asistente web se entrega en 5 días hábiles, el Asistente Pro en 10 y la Suite Premium con landing y citas en 15.",
        datos_seg: "Trabajamos exclusivamente con modelos de IA empresariales que cumplen el RGPD. La información de tu empresa nunca se usa para entrenar modelos públicos.",
        tecnica: "Tu equipo no necesita saber de tecnología. Nos encargamos de toda la parte técnica y trabajaréis con herramientas que ya conocéis, como WhatsApp o el correo.",
        error_bot: "Los asistentes tienen límites estrictos: si una pregunta se sale de lo previsto, toman los datos del cliente y pasan la conversación a tu equipo.",
        grandes: "Las pymes son las que más se benefician: la IA funciona como un empleado digital que te permite competir con los grandes sin disparar los costes de contratación.",
        contacto: "Puedes escribirnos a comercial@sintelai.es o al WhatsApp +34 614 056 307. Si quieres, déjame tus datos y te contactamos nosotros.",
        inmo: "En las inmobiliarias lo más habitual es perder interesados que escriben fuera de horario. El asistente los atiende al momento, los cualifica y guarda sus datos en el CRM para que tu equipo los llame. ¿Quieres que lo revisemos para tu caso en la auditoría gratuita de 30 minutos?",
        agencia: "En las agencias B2B solemos ver muchas horas perdidas haciendo presupuestos. Montamos flujos que generan la propuesta en unos 5 minutos. ¿Qué parte del proceso os quita más tiempo?",
        fallback: "Esta pregunta la resolverá mejor una persona del equipo. Si me dejas tus datos, te contactamos en menos de 24 horas laborables."
      },
      offerForm: "¿Quieres que te contactemos para la auditoría gratuita de 30 minutos?",
      yesForm: "Sí, dejo mis datos", moreQ: "Tengo otra pregunta",
      formTitle: "Reserva tu auditoría gratuita",
      f: { name: "Nombre *", email: "Email *", phone: "Teléfono", company: "Empresa o sector *", consent: "Acepto la <a href=\"{p}\" target=\"_blank\" rel=\"noopener\">política de privacidad</a>.", submit: "Enviar", cancel: "Ahora no" },
      err: { name: "Indica tu nombre.", email: "Revisa el email.", company: "Indica tu empresa o sector.", consent: "Debes aceptar la política de privacidad." },
      thanks: function (n) { return "¡Gracias, " + n + "! Hemos recibido tus datos y te contactamos en menos de 24 horas laborables."; },
      preview: "Vista previa: los datos no se envían desde aquí. En sintelai.es llegarán a tu escenario de Make.",
      sendError: "No se ha podido enviar. Escríbenos a comercial@sintelai.es o al WhatsApp +34 614 056 307.",
      typing: "Escribiendo…", privacyNote: "Respuestas generadas con IA a partir de la información oficial de Sintel AI.",
      mic: "Dictar por voz", micStop: "Parar y enviar", listen: "Escuchar", stopListen: "Parar", loadingVoice: "Cargando…",
      transcribing: "Transcribiendo…", micGo: "Continuar", micCancel: "Ahora no",
      micNote: "Para escribir con la voz, el audio se envía a un proveedor de voz solo para convertirlo en texto. Más información en la <a href=\"{p}\" target=\"_blank\" rel=\"noopener\">política de privacidad</a>.",
      micDenied: "No tengo permiso para el micrófono. Revisa los permisos del navegador o escribe tu pregunta.",
      micEmpty: "No te he oído bien. Inténtalo de nuevo o escribe tu pregunta.",
      voiceError: "Ahora mismo no puedo usar la voz. Puedes escribir tu pregunta.",
      dataIntake: "¡Gracias! Para guardar tus datos y que te contactemos, revísalos y confírmalos aquí. Es imprescindible aceptar la política de privacidad."
    }
  };
  var T = ALL[LANG];

  // Iconos (SVG estático, sin datos de usuario)
  var SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICON_MIC = SVG + '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  var ICON_STOP = SVG + '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';
  var ICON_SPK = SVG + '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';

  // Paraules clau per al mode guiat (castellà i català)
  var KEYS = [
    ["inmo", /inmobil|immobil|inmueble|vivienda|habitatge|alquiler|lloguer/i],
    ["agencia", /agenci|ag[eè]ncia|marketing|b2b/i],
    ["precio", /preu|precio|cost|cuesta|tarifa|pressupost|presupuesto|€|euro|barat|barato|car[oa]?\b/i],
    ["plazo", /quan(t)? (es )?triga|cu[aá]nto tarda|cu[aá]nto tiempo|quant temps|cu[aá]ndo|quan\b|termini|plazo|dies|d[ií]as|setman|semana|rapid|r[aá]pid|funcionando|funcionant|listo|llest/i],
    ["datos_seg", /rgpd|gdpr|segur|privacitat|privacidad|protecci/i],
    ["citas", /cita|recordator|agenda|no.?show|pacient|reserva|cl[ií]nica/i],
    ["auto", /automati|factur|presupuestos en|crm|erp|tasque|tarea|excel|correu|correo/i],
    ["tecnica", /tecnolog|program|t[eè]cnic|saber|dif[ií]cil/i],
    ["error_bot", /equivoc|error|no sap|no sabe|humà|humano|persona/i],
    ["grandes", /gran(s|des)? empres|multinacional|petit|pequeñ|pime|pyme/i],
    ["contacto", /tel[eè]fon|whatsapp|email|correu|correo|contact|truca|llam/i],
    ["leads", /client|lead|captar|captaci|vend|web|xat|chat|bot|asistente|assistent/i]
  ];
  var INTENT = /auditor|contact|truca|llam|reuni|interes|m'interessa|me interesa|vull|quiero|contratar|pressupost|presupuesto/i;

  /* ---------- Dades de contacte escrites o dictades al xat ---------- */
  // Si algú dóna el telèfon, el correu o el nom, no es respon amb una frase genèrica:
  // s'obre el formulari amb les dades ja omplertes i amb el consentiment RGPD pendent.
  // Números dictats: només es fan servir xifres soltes; amb números compostos (setanta-dos, vint-i-tres) el telèfon queda buit
  var TENS = /^(deu|onze|dotze|tretze|catorze|quinze|setze|disset|divuit|dinou|vint|trenta|quaranta|cinquanta|seixanta|setanta|vuitanta|noranta|cent|diez|once|doce|trece|catorce|quince|veinte|veinti\w*|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)(-.*)?$/;
  var DIGIT_MAP = { zero: 0, cero: 0, dos: 2, tres: 3, quatre: 4, cuatro: 4, cinc: 5, cinco: 5, sis: 6, seis: 6, set: 7, siete: 7, vuit: 8, ocho: 8, nou: 9, nueve: 9 };
  var CONTACT_WORDS = /(el meu|la meva|mi|mis)\s+(n[uú]mero|tel[eè]fon[o]?|m[oò]bil|correu|correo|e-?mail|mail)/i;
  var EMAIL_RE = /[^\s@,;:<>()]+@[^\s@,;:<>()]+\.[^\s@,;:<>().]+/;
  var PHONE_RE = /\+?\d[\d\s.\-]{7,}\d/;
  var NAME_INTRO = /(em dic|em diuen|el meu nom [ée]s|s[oó]c|me llamo|mi nombre es|soy)\s+/i;

  function spoken(text) {
    var digits = [], ambiguous = false;
    text.toLowerCase().split(/[\s,;.:!?]+/).forEach(function (t) {
      if (DIGIT_MAP.hasOwnProperty(t)) digits.push(DIGIT_MAP[t]);
      else if (TENS.test(t)) ambiguous = true;
    });
    return { digits: digits, ambiguous: ambiguous };
  }

  function sharesContact(text) {
    if (EMAIL_RE.test(text) || CONTACT_WORDS.test(text)) return true;
    if (PHONE_RE.test(text) && (text.match(/\d/g) || []).length >= 9) return true;
    return spoken(text).digits.length >= 5;   // número dictat en paraules
  }

  function extractContact(text) {
    var out = { name: "", email: "", phone: "" };
    var em = text.match(EMAIL_RE);
    if (em) out.email = em[0];
    var ph = text.match(PHONE_RE);
    if (ph) {
      var d = ph[0].replace(/[^\d+]/g, "");
      if (d.replace(/\D/g, "").length >= 9) out.phone = d;
    }
    var sp = spoken(text);
    if (!out.phone && !sp.ambiguous && sp.digits.length >= 9) out.phone = sp.digits.join("");
    var m = NAME_INTRO.exec(text);
    if (m) {
      var rest = text.slice(m.index + m[0].length).split(/[\s,.;:!?]+/), name = [];
      for (var i = 0; i < rest.length && name.length < 3; i++) {
        var w = rest[i];
        if (w && w.charAt(0) !== w.charAt(0).toLowerCase()) name.push(w); else break;
      }
      out.name = name.join(" ");
    }
    return out;
  }

  /* ---------- Estils (colors de la marca) ---------- */
  var css = "" +
    ".sb-root{--sb-bg:#050505;--sb-surface:#0d1513;--sb-surface2:#17211f;--sb-line:#232e2c;--sb-fg:#fff;--sb-soft:#b9c4c2;--sb-muted:#8a9593;--sb-teal:#1ae0c5;--sb-on:#050505;--sb-warn:#f59e8b;" +
    "position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:70;font-family:Inter,system-ui,-apple-system,sans-serif;color:var(--sb-fg);font-size:14px;line-height:1.45}" +
    ".sb-root *{box-sizing:border-box}" +
    ".sb-launch{display:flex;align-items:center;gap:10px;background:var(--sb-teal);color:var(--sb-on);border:0;border-radius:999px;padding:12px 18px 12px 12px;font:600 14px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 14px 34px -10px rgba(26,224,197,.55)}" +
    ".sb-launch .sb-dot{width:30px;height:30px;border-radius:50%;background:var(--sb-on);color:var(--sb-teal);display:grid;place-items:center;font:800 15px Outfit,system-ui,sans-serif}" +
    ".sb-launch:focus-visible,.sb-root button:focus-visible,.sb-root input:focus-visible{outline:2px solid var(--sb-teal);outline-offset:2px}" +
    ".sb-win{position:absolute;right:0;bottom:64px;width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 110px));background:var(--sb-surface);border:1px solid var(--sb-line);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 50px -14px rgba(0,0,0,.7),0 0 0 1px rgba(26,224,197,.08)}" +
    ".sb-win[hidden]{display:none}" +
    ".sb-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--sb-line);background:var(--sb-bg)}" +
    ".sb-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#1ae0c5,#2aa5f8);color:var(--sb-on);display:grid;place-items:center;font:800 15px Outfit,system-ui,sans-serif;flex:none}" +
    ".sb-head strong{display:block;font-size:14px}.sb-head span{font:12px 'JetBrains Mono',ui-monospace,monospace;color:var(--sb-teal)}" +
    ".sb-x{margin-left:auto;background:none;border:1px solid var(--sb-line);color:var(--sb-soft);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:18px;line-height:1}" +
    ".sb-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}" +
    ".sb-msg{max-width:88%;padding:9px 13px;border-radius:14px;white-space:pre-line;word-wrap:break-word}" +
    ".sb-bot{background:var(--sb-surface2);border:1px solid var(--sb-line);border-bottom-left-radius:4px}" +
    ".sb-user{align-self:flex-end;background:var(--sb-teal);color:var(--sb-on);border-bottom-right-radius:4px}" +
    ".sb-note{font-size:12px;color:var(--sb-muted);text-align:center}" +
    ".sb-typing{color:var(--sb-muted);font-style:italic}" +
    ".sb-quick{display:flex;flex-wrap:wrap;gap:6px}" +
    ".sb-quick button{background:none;border:1px solid var(--sb-teal);color:var(--sb-teal);border-radius:999px;padding:6px 12px;font:500 13px Inter,system-ui,sans-serif;cursor:pointer}" +
    ".sb-quick button:hover{background:var(--sb-teal);color:var(--sb-on)}" +
    ".sb-form{background:var(--sb-bg);border:1px solid var(--sb-line);border-radius:12px;padding:12px;display:grid;gap:8px}" +
    ".sb-form b{font:600 14px Outfit,system-ui,sans-serif}" +
    ".sb-form input[type=text],.sb-form input[type=email],.sb-form input[type=tel]{width:100%;background:var(--sb-surface);border:1px solid var(--sb-line);border-radius:8px;color:var(--sb-fg);padding:9px 10px;font:14px Inter,system-ui,sans-serif}" +
    ".sb-form label.sb-c{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--sb-muted)}.sb-form label.sb-c a{color:var(--sb-teal)}" +
    ".sb-form .sb-row{display:flex;gap:8px}.sb-form .sb-row button{flex:1;border-radius:999px;padding:9px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}" +
    ".sb-ok{background:var(--sb-teal);color:var(--sb-on);border:0}.sb-no{background:none;color:var(--sb-soft);border:1px solid var(--sb-line)}" +
    ".sb-ferr{color:var(--sb-warn);font-size:12px;min-height:1em}" +
    ".sb-in{display:flex;gap:8px;padding:10px;border-top:1px solid var(--sb-line);background:var(--sb-bg)}" +
    ".sb-in input{flex:1;min-width:0;background:var(--sb-surface);border:1px solid var(--sb-line);border-radius:999px;color:var(--sb-fg);padding:10px 14px;font:14px Inter,system-ui,sans-serif}" +
    ".sb-in button{background:var(--sb-teal);color:var(--sb-on);border:0;border-radius:999px;padding:0 16px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}" +
    ".sb-foot{padding:0 12px 8px;background:var(--sb-bg);font:11px 'JetBrains Mono',ui-monospace,monospace;color:var(--sb-muted);text-align:center}" +
    ".sb-note a{color:var(--sb-teal)}" +
    ".sb-in .sb-mic{display:none;flex:none;width:40px;height:40px;padding:0;place-items:center;background:none;color:var(--sb-teal);border:1px solid var(--sb-teal)}" +
    ".sb-voice .sb-in .sb-mic{display:grid}" +
    ".sb-in .sb-mic:hover{background:var(--sb-teal);color:var(--sb-on)}" +
    ".sb-in .sb-mic[aria-pressed=true]{background:#e5484d;border-color:#e5484d;color:#fff}" +
    ".sb-in .sb-mic:disabled{opacity:.5;cursor:default}" +
    ".sb-listen{display:none;align-items:center;gap:6px;margin-top:8px;background:none;border:1px solid var(--sb-line);color:var(--sb-soft);border-radius:999px;padding:4px 10px;font:500 12px Inter,system-ui,sans-serif;cursor:pointer}" +
    ".sb-voice .sb-listen{display:flex;width:fit-content}" +
    ".sb-listen svg{width:14px;height:14px}" +
    ".sb-listen:hover{border-color:var(--sb-teal);color:var(--sb-teal)}" +
    ".sb-listen:disabled{opacity:.6;cursor:default}" +
    "@media (prefers-reduced-motion:no-preference){.sb-in .sb-mic[aria-pressed=true]{animation:sbRec 1.2s ease-in-out infinite}@keyframes sbRec{50%{box-shadow:0 0 0 6px rgba(229,72,77,.25)}}}" +
    "@media (max-width:560px){.sb-root{right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px))}.sb-launch .sb-txt{display:none}.sb-launch{padding:10px}}" +
    "@media (prefers-reduced-motion:no-preference){.sb-msg,.sb-quick,.sb-form{animation:sbIn .25s ease both}@keyframes sbIn{from{opacity:.001;transform:translateY(6px)}to{opacity:1;transform:none}}}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- Estructura ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var root = el("div", "sb-root");
  var win = el("section", "sb-win");
  win.hidden = true;
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", T.title);

  var head = el("div", "sb-head");
  head.appendChild(el("div", "sb-av", "S"));
  var hd = el("div");
  hd.appendChild(el("strong", "", T.title));
  hd.appendChild(el("span", "", "● " + T.status));
  head.appendChild(hd);
  var xBtn = el("button", "sb-x", "×");
  xBtn.type = "button";
  xBtn.setAttribute("aria-label", T.close);
  head.appendChild(xBtn);

  var log = el("div", "sb-log");
  log.setAttribute("aria-live", "polite");

  var inForm = el("form", "sb-in");
  var input = el("input");
  input.type = "text";
  input.placeholder = T.placeholder;
  input.maxLength = 600;
  input.setAttribute("aria-label", T.placeholder);
  var sendBtn = el("button", "", T.send);
  sendBtn.type = "submit";
  var micBtn = null;
  if (CAN_REC) {
    micBtn = el("button", "sb-mic");
    micBtn.type = "button";
    micBtn.setAttribute("aria-label", T.mic);
    micBtn.setAttribute("aria-pressed", "false");
    micBtn.title = T.mic;
    micBtn.innerHTML = ICON_MIC;
  }
  inForm.appendChild(input);
  if (micBtn) inForm.appendChild(micBtn);
  inForm.appendChild(sendBtn);

  win.appendChild(head);
  win.appendChild(log);
  win.appendChild(inForm);
  win.appendChild(el("div", "sb-foot", T.privacyNote));

  var launch = el("button", "sb-launch");
  launch.type = "button";
  launch.setAttribute("aria-expanded", "false");
  launch.appendChild(el("span", "sb-dot", "S"));
  launch.appendChild(el("span", "sb-txt", T.launcher));

  root.appendChild(win);
  root.appendChild(launch);
  document.body.appendChild(root);

  /* ---------- Estat ---------- */
  var history = [];          // conversa per a la IA: {role:"user"|"assistant", content}
  var aiAvailable = true;    // es desactiva si la funció falla 3 cops seguits
  var aiFails = 0;
  var started = false;
  var busy = false;
  var userTurns = 0;
  var formShown = false;

  function scroll() { log.scrollTop = log.scrollHeight; }
  function say(text, who) { var m = el("div", "sb-msg " + (who === "user" ? "sb-user" : "sb-bot"), text); log.appendChild(m); scroll(); return m; }
  function quick(items) {
    var q = el("div", "sb-quick");
    items.forEach(function (it) {
      var b = el("button", "", it[1]);
      b.type = "button";
      b.addEventListener("click", function () { q.remove(); onQuick(it[0], it[1]); });
      q.appendChild(b);
    });
    log.appendChild(q);
    scroll();
  }

  function open() {
    win.hidden = false;
    launch.setAttribute("aria-expanded", "true");
    if (!started) {
      started = true;
      addListen(say(T.hello, "bot"), T.hello);
      checkVoice();
      history.push({ role: "assistant", content: T.hello });
      quick(T.quick);
    }
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() { stopVoice(); win.hidden = true; launch.setAttribute("aria-expanded", "false"); launch.focus(); }
  launch.addEventListener("click", function () { win.hidden ? open() : close(); });
  xBtn.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !win.hidden) close(); });

  function offerForm() {
    if (formShown) return;
    say(T.offerForm, "bot");
    quick([["form", T.yesForm], ["more", T.moreQ]]);
  }

  function onQuick(key, label) {
    if (key === "datos" || key === "form") { say(label, "user"); return showForm(); }
    if (key === "more") { say(label, "user"); input.focus(); return; }
    say(label, "user");
    history.push({ role: "user", content: label });
    var a = T.answers[key];
    reply(a);
    if (key === "precio" || key === "citas") setTimeout(offerForm, 500);
  }

  function reply(text) {
    var m = say(text, "bot");
    addListen(m, text);
    history.push({ role: "assistant", content: text });
  }

  // Idioma de l'usuari (castellà o català) per respondre en la seva llengua en mode guiat
  function userLang(text) {
    var es = (text.match(/ñ|¿|¡|\b(cu[aá]nto|tiempo|tengo|quiero|puedo|c[oó]mo|qu[eé]|necesito|mis?|hola|gracias|negocio|est[aá]|estoy|hacer|para|tiene|soy|una?)\b/gi) || []).length;
    var ca = (text.match(/ç|l·l|\b(quant|temps|tinc|vull|puc|com|qu[eè]|necessito|meu|meva|gr[aà]cies|negoci|estic|fer|amb|per(qu[eè])?|t[eé]|s[oó]c|un|una)\b/gi) || []).length;
    return es > ca ? "es" : ca > es ? "ca" : LANG;
  }

  function guided(text) {
    var A = ALL[userLang(text)].answers;
    for (var i = 0; i < KEYS.length; i++) if (KEYS[i][1].test(text)) return A[KEYS[i][0]];
    return A.fallback;
  }

  // Si la IA esmenta imports, es substitueix per la resposta oficial de preus
  function guard(text) {
    if (/\d[\d.,]*\s?(€|eur|euros?)\b|€\s?\d/i.test(text)) return T.answers.precio;
    return text;
  }

  function ask(text) {
    if (busy) return;
    busy = true;
    userTurns++;
    say(text, "user");
    history.push({ role: "user", content: text });
    if (!formShown && sharesContact(text)) {   // dades de contacte: formulari amb les dades omplertes
      busy = false;
      reply(ALL[userLang(text)].dataIntake);
      return showForm(extractContact(text));
    }
    var typing = say(T.typing, "bot");
    typing.classList.add("sb-typing");

    var done = function (answer) {
      typing.remove();
      reply(answer);
      busy = false;
      if (INTENT.test(text) || userTurns === 3) setTimeout(offerForm, 400);
    };

    if (!aiAvailable) return setTimeout(function () { done(guided(text)); }, 350);

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: LANG, messages: history.slice(-12) }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      clearTimeout(timer);
      if (!data || !data.reply) throw new Error("empty");
      aiFails = 0;
      done(guard(String(data.reply)));
    }).catch(function (err) {
      clearTimeout(timer);
      if (window.console) console.warn("Assistent IA no disponible:", err && err.message);
      if (++aiFails >= 3) aiAvailable = false;   // després de 3 errors seguits, només mode guiat
      done(guided(text));
    });
  }

  inForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = input.value.trim();
    if (!v) return;
    input.value = "";
    ask(v);
  });

  /* ---------- Veu: escoltar respostes i dictar preguntes (opcional) ---------- */
  var player = null, playerBtn = null;   // reproducció en curs
  var rec = null;                        // gravació en curs
  var micOk = false;                     // l'usuari ha acceptat l'avís del micròfon

  function note(text) { var n = el("div", "sb-note", text); log.appendChild(n); scroll(); return n; }

  // Els botons de veu només es mostren si la funció de veu respon i està configurada
  function checkVoice() {
    if (!VOICE) return;
    fetch(VOICE + "?a=ping").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) root.classList.add("sb-voice"); })
      .catch(function () {});
  }

  function setListen(btn, state) {   // "idle" | "loading" | "playing"
    btn.innerHTML = state === "playing" ? ICON_STOP : ICON_SPK;
    btn.appendChild(el("span", "", state === "playing" ? T.stopListen : state === "loading" ? T.loadingVoice : T.listen));
    btn.disabled = state === "loading";
  }

  function stopPlayback() {
    if (player) { player.pause(); player = null; }
    if (playerBtn) { setListen(playerBtn, "idle"); playerBtn = null; }
  }

  function addListen(msg, text) {
    if (!CAN_PLAY || !msg) return;
    var b = el("button", "sb-listen");
    b.type = "button";
    setListen(b, "idle");
    var url = null;   // l'àudio es genera un sol cop per missatge
    b.addEventListener("click", function () {
      if (playerBtn === b) { stopPlayback(); return; }
      stopPlayback();
      var play = function () {
        stopPlayback();
        var a = new Audio(url);
        player = a; playerBtn = b;
        setListen(b, "playing");
        a.onended = function () { if (playerBtn === b) { player = null; playerBtn = null; } setListen(b, "idle"); };
        a.onerror = function () { stopPlayback(); setListen(b, "idle"); note(T.voiceError); };
        a.play().catch(function () { stopPlayback(); });
      };
      if (url) return play();
      setListen(b, "loading");
      fetch(VOICE + "?a=tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: String(text).slice(0, 1000) })
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.blob();
      }).then(function (blob) {
        url = URL.createObjectURL(blob);
        play();
      }).catch(function (err) {
        if (window.console) console.warn("Veu no disponible:", err && err.message);
        setListen(b, "idle");
        note(T.voiceError);
      });
    });
    msg.appendChild(b);
  }

  function micState(on) {
    if (!micBtn) return;
    micBtn.setAttribute("aria-pressed", on ? "true" : "false");
    micBtn.innerHTML = on ? ICON_STOP : ICON_MIC;
    var l = on ? T.micStop : T.mic;
    micBtn.setAttribute("aria-label", l);
    micBtn.title = l;
  }

  function pickMime() {
    var c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i];
    return "";
  }

  function startRec() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var mime = pickMime();
      var mr;
      try { mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); throw e; }
      var chunks = [];
      var r = { mr: mr, cancelled: false, timer: null };
      rec = r;
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        clearTimeout(r.timer);
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (rec === r) rec = null;
        micState(false);
        if (r.cancelled) return;
        transcribe(new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" }));
      };
      stopPlayback();
      mr.start();
      micState(true);
      r.timer = setTimeout(function () { if (mr.state === "recording") mr.stop(); }, 30000);   // màxim 30 s
    }).catch(function (err) {
      if (window.console) console.warn("Micròfon no disponible:", err && err.message);
      note(err && (err.name === "NotAllowedError" || err.name === "SecurityError") ? T.micDenied : T.voiceError);
    });
  }

  function transcribe(blob) {
    if (blob.size < 1500) { note(T.micEmpty); return; }
    micBtn.disabled = true;
    var t = say(T.transcribing, "bot");
    t.classList.add("sb-typing");
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    fetch(VOICE + "?a=stt", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      clearTimeout(timer);
      t.remove();
      micBtn.disabled = false;
      var text = String((d && d.text) || "").replace(/\s+/g, " ").trim().slice(0, 600);
      if (!text) return note(T.micEmpty);
      if (busy) { input.value = text; input.focus(); return; }
      ask(text);
    }).catch(function (err) {
      clearTimeout(timer);
      t.remove();
      micBtn.disabled = false;
      if (window.console) console.warn("Transcripció no disponible:", err && err.message);
      note(T.voiceError);
    });
  }

  function askMicConsent() {
    if (log.querySelector(".sb-micq")) return;
    var n = el("div", "sb-note sb-micq");
    n.innerHTML = T.micNote.replace("{p}", PRIVACY);
    var q = el("div", "sb-quick sb-micq");
    [[T.micGo, true], [T.micCancel, false]].forEach(function (it) {
      var b = el("button", "", it[0]);
      b.type = "button";
      b.addEventListener("click", function () { n.remove(); q.remove(); if (it[1]) { micOk = true; startRec(); } });
      q.appendChild(b);
    });
    log.appendChild(n);
    log.appendChild(q);
    scroll();
  }

  function stopVoice() {   // en tancar el xat: atura l'àudio i descarta la gravació
    stopPlayback();
    if (rec) { rec.cancelled = true; if (rec.mr.state === "recording") rec.mr.stop(); }
  }

  if (micBtn) micBtn.addEventListener("click", function () {
    if (rec) { if (rec.mr.state === "recording") rec.mr.stop(); return; }
    if (busy) return;
    if (!micOk) return askMicConsent();
    startRec();
  });

  /* ---------- Formulari de contacte dins del xat ---------- */
  function field(type, id, label, auto) {
    var i = el("input");
    i.type = type; i.id = id; i.placeholder = label; i.autocomplete = auto || "off";
    i.setAttribute("aria-label", label); i.maxLength = 150;
    return i;
  }

  function showForm(pre) {
    pre = pre || {};
    formShown = true;
    var f = el("form", "sb-form");
    f.noValidate = true;
    f.appendChild(el("b", "", T.formTitle));
    var name = field("text", "sb-name", T.f.name, "name");
    var email = field("email", "sb-email", T.f.email, "email");
    var phone = field("tel", "sb-phone", T.f.phone, "tel");
    var company = field("text", "sb-company", T.f.company, "organization");
    var hp = field("text", "sb-website", "website");
    hp.tabIndex = -1; hp.style.position = "absolute"; hp.style.left = "-9999px"; hp.setAttribute("aria-hidden", "true");
    var c = el("label", "sb-c");
    var cb = el("input"); cb.type = "checkbox"; cb.id = "sb-consent";
    var ct = el("span"); ct.innerHTML = T.f.consent.replace("{p}", PRIVACY);
    c.appendChild(cb); c.appendChild(ct);
    var err = el("div", "sb-ferr");
    var row = el("div", "sb-row");
    var no = el("button", "sb-no", T.f.cancel); no.type = "button";
    var ok = el("button", "sb-ok", T.f.submit); ok.type = "submit";
    row.appendChild(no); row.appendChild(ok);
    name.value = pre.name || ""; email.value = pre.email || ""; phone.value = pre.phone || "";
    [name, email, phone, company, hp, c, err, row].forEach(function (n) { f.appendChild(n); });
    log.appendChild(f);
    scroll();
    name.focus();

    no.addEventListener("click", function () { f.remove(); formShown = false; input.focus(); });

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var nv = name.value.trim(), ev = email.value.trim(), cv = company.value.trim();
      if (hp.value) { f.remove(); reply(T.thanks(nv || "")); return; }
      if (!nv) return (err.textContent = T.err.name);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ev)) return (err.textContent = T.err.email);
      if (!cv) return (err.textContent = T.err.company);
      if (!cb.checked) return (err.textContent = T.err.consent);
      err.textContent = "";

      // El missatge resumeix el que ha escrit la persona al xat (el necessita la qualificació IA de Make)
      var said = history.filter(function (m) { return m.role === "user"; }).map(function (m) { return m.content; }).join(" | ");
      var payload = {
        name: nv, email: ev, phone: phone.value.trim(), company: cv,
        service: LANG === "es" ? "Asistente web (chatbot)" : "Assistent web (xatbot)",
        message: said.slice(0, 4000)
      };

      if (!LIVE || !WEBHOOK) { f.remove(); reply(T.preview); return; }

      ok.disabled = true;
      fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); f.remove(); reply(T.thanks(nv)); })
        .catch(function () { ok.disabled = false; err.textContent = T.sendError; });
    });
  }
})();
