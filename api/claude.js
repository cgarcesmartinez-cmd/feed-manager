export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  try {
    // Groq vision model — compatible con formato Anthropic del frontend
    // Convertir formato Anthropic → formato OpenAI/Groq
    const anthropicBody = req.body;
    
    // Convertir messages de formato Anthropic a formato OpenAI
    const messages = (anthropicBody.messages || []).map(msg => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      // Array de bloques (imagen + texto)
      const parts = msg.content.map(block => {
        if (block.type === 'image') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`
            }
          };
        }
        if (block.type === 'text') {
          return { type: 'text', text: block.text };
        }
        return null;
      }).filter(Boolean);
      return { role: msg.role, content: parts };
    });

    const groqBody = {
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: anthropicBody.max_tokens || 400,
      messages: messages,
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify(groqBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq error:', JSON.stringify(data));
      return res.status(response.status).json({ error: data.error?.message || 'Groq error' });
    }

    // Convertir respuesta Groq → formato Anthropic (lo que espera el frontend)
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({
      content: [{ type: 'text', text: text }]
    });

  } catch (error) {
    console.error('Proxy error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
