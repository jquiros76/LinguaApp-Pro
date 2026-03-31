// netlify/functions/translate.js
// Maneja: traducción con análisis lingüístico + modo chat IA
// Variables de entorno requeridas: ANTHROPIC_API_KEY

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // ── MODO CHAT ───────────────────────────────────────────────────────────
  if (body.chatMode) {
    const { chatHistory = [], chatLang = 'en', langName = 'inglés' } = body;

    const systemPrompt = `Eres un profesor de idiomas experto y amigable especializado en ${langName}.
Tu objetivo es ayudar a estudiantes hispanohablantes a aprender ${langName}.
Responde SIEMPRE en español (castellano), de forma clara, pedagógica y con ejemplos prácticos.
Cuando des ejemplos en ${langName}, escríbelos en negrita usando **texto**.
Sé conciso pero completo. Usa emojis moderadamente para hacer la explicación más amena.
Si te preguntan sobre pronunciación, usa notación fonética simple que un hispanohablante pueda entender.`;

     messages = chatHistory.slice(-12); // últimos 12 turnos para contexto

    try {
       res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: systemPrompt,
          messages,
        }),
      });

      if (!res.ok) {
         errText = await res.text();
        console.error('Anthropic chat error:', errText);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error del asistente IA' }) };
      }

       data  = await res.json();
       reply = data.content?.[0]?.text || 'No pude generar respuesta.';
      return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

    } catch(e) {
      console.error('Chat fetch error:', e);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error de conexión con IA' }) };
    }
  }

  // ── MODO TRADUCCIÓN ─────────────────────────────────────────────────────
  const { text, lang = 'en' } = body;

  if (!process.env.ANTHROPIC_API_KEY) {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      traduccion: text,
      nivel: "N/A",
      pronunciacion: "",
      pronunciacion_consejo: "",
      gramatica: null,
      uso: "Modo básico activo (sin IA)",
      ejemplo_contexto: "",
      alternativas: []
    }),
  };
}

  if (!text || text.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Texto requerido' }) };
  }
  if (text.length > 500) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Texto muy largo (máx 500 caracteres)' }) };
  }

  const langNames = { en: 'inglés', pt: 'portugués (brasileño)', de: 'alemán' };
  const langName  = langNames[lang] || 'inglés';

  const systemPrompt = `Eres un experto lingüista y traductor especializado en ${langName} para hispanohablantes.
Cuando recibas texto, debes analizarlo completamente y devolver un JSON con el siguiente formato exacto (sin markdown, sin texto extra):

{
  "traduccion": "traducción al español claro y natural",
  "nivel": "A1/A2/B1/B2/C1/C2",
  "pronunciacion": "pronunciación fonética simplificada para hispanohablantes (ej: gúd mórning)",
  "pronunciacion_consejo": "tip corto de pronunciación (máx 80 caracteres)",
  "gramatica": "nota gramatical breve si aplica, o null si no es relevante",
  "uso": "explicación breve de cuándo y cómo se usa esta expresión",
  "ejemplo_contexto": "una oración de ejemplo natural en ${langName} (diferente al texto original)",
  "alternativas": ["alternativa1", "alternativa2", "alternativa3"]
}

Reglas:
- Si el texto ya está en español, tradúcelo al ${langName} en el campo "traduccion" e invierte el análisis.
- "pronunciacion" debe ser intuible para un hispanohablante, sin IPA técnico.
- "alternativas" son formas similares o sinónimos en ${langName} (máx 3, puede ser array vacío []).
- Responde SOLO con el JSON, sin explicaciones adicionales, sin bloques de código.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic translate error:', errText);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error al procesar la traducción' }) };
    }

    const data    = await res.json();
    const rawText = data.content?.[0]?.text || '';

    // Parse JSON — strip any markdown fences just in case
    const clean = rawText
  .replace(/```json?/gi,'')
  .replace(/```/g,'')
  .trim();
    let result;
    try {
      result = JSON.parse(clean);
    } catch(e) {
      console.error('JSON parse error. Raw:', rawText);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error al parsear respuesta de IA' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch(e) {
    console.error('Translate fetch error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error de conexión con IA' }) };
  }
};
