import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY env var. Set it in Render → Environment → Environment Variables.');
  process.exit(1);
}

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Friendly root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Vision proxy
app.post('/ask', async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' });

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: 'You are analyzing an image of a test question. Use spatial layout and numerical reasoning. Do not guess. Only answer if confident.' },
          { role: 'user', content: [
              { type: 'text', text: 'Read the question, analyze spatial layout, and return strict JSON with keys: {question, letter, answer, rationale, confidence}.' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      })
    });

    const txt = await r.text();
    res.status(r.status).type('application/json').send(txt);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});