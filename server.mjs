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
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content: `You are a math problem solver. Read the question carefully and solve it step-by-step.

Instructions:
1) Extract ONLY the question text (ignore answer choices)
2) Identify what the question is asking for (read carefully - "how much MORE" means find the DIFFERENCE)
3) Solve the problem step-by-step
4) Return ONLY the final answer to the specific question asked

Return STRICT JSON:
{
 "question": "extracted question text",
 "answer": "final numeric answer only",
 "work": "step-by-step calculation"
}

CRITICAL: 
- Ignore all multiple choice options completely
- Pay attention to keywords: "more", "less", "difference", "increase", "decrease"
- If asking "how much more", subtract to find the difference
- Return ONLY the final number that answers the specific question
- Show ALL steps in your work`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Read the question and solve it. Ignore the multiple choice options. Return only the calculated answer." },
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
