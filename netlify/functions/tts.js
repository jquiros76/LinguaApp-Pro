// netlify/functions/tts.js
// Genera audio real con OpenAI TTS — devuelve base64 MP3
// Variables de entorno requeridas: OPENAI_API_KEY

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

  const { text, voice = 'nova', speed = 0.9 } = body;

  if (!text || text.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Texto requerido' }) };
  }
  if (text.length > 500) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Texto muy largo' }) };
  }

  // Voces válidas de OpenAI TTS
  const validVoices = ['alloy','echo','fable','onyx','nova','shimmer'];
  const safeVoice   = validVoices.includes(voice) ? voice : 'nova';
  const safeSpeed   = Math.min(Math.max(parseFloat(speed) || 0.9, 0.25), 4.0);

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',          // tts-1-hd para mayor calidad (más lento)
        input: text,
        voice: safeVoice,
        speed: safeSpeed,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('OpenAI TTS error:', errText);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error generando audio' }) };
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64      = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        audio: `data:audio/mp3;base64,${base64}`,
      }),
    };

  } catch(e) {
    console.error('TTS fetch error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error de conexión con OpenAI' }) };
  }
};
