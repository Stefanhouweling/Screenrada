import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// SSE clients for console
let consoleClients = [];

// --- proxy endpoint with retry logic ---
app.post("/ask", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "Missing imageBase64" });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content: `You are an OCR + reasoning AI for MCQs. Use spatial layout and numerical reasoning. Do not guess.

Workflow:
1) Extract the question text.
2) Extract options as [{"letter","text"}].
3) Compute the correct numeric/logical result ("result_number").
4) Pick the option that EXACTLY equals result_number.
5) If none match, set consistency="no_match" and selection=null.

Return STRICT JSON only:
{
 "question": "...",
 "options": [{"letter":"A","text":"..."}, ...],
 "result_number": number|string,
 "selection": {"letter":"A","text":"..."} | null,
 "consistency": "match" | "no_match",
 "rationale": "≤2 lines",
 "confidence": number
}`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Solve and return strict JSON only." },
              { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
            ]
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const text = await r.text();
    
    // Broadcast to console clients
    const statusEmoji = r.ok ? "🟢" : "🔴";
    consoleClients.forEach(client => {
      client.write(`data: ${JSON.stringify({ type: 'answer', internet: statusEmoji, payload: text })}\n\n`);
    });
    
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    consoleClients.forEach(client => {
      client.write(`data: ${JSON.stringify({ type: 'answer', internet: "🔴", payload: JSON.stringify({error: e.message}) })}\n\n`);
    });
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// SSE endpoint for console
app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  
  consoleClients.push(res);
  
  req.on("close", () => {
    consoleClients = consoleClients.filter(c => c !== res);
  });
});

// static UI
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`✅ Server live on port ${PORT}`);
});
