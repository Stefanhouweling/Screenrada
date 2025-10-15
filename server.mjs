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
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: `You are a math problem solver. Read the question carefully and solve it step-by-step.

Instructions:
1) Extract the question text AND all multiple choice options
2) Identify what the question is asking for (keywords: "more", "less", "difference", "solve for")
3) Solve the problem step-by-step mathematically
4) CRITICAL: Check if your answer matches any of the multiple choice options
5) If no exact match, convert your answer to match the format of the options:
   - Convert fractions to different denominators (e.g., 1 6/7 = 1 42/49)
   - Convert decimals to fractions or vice versa
   - Simplify or expand as needed
6) Return the answer in the format that matches the options

Return STRICT JSON:
{
 "question": "extracted question text",
 "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
 "calculated_answer": "your calculated result",
 "answer": "final answer matching option format",
 "matched_option": "letter of matching option (A/B/C/D) or null",
 "work": "step-by-step calculation including conversion if needed"
}

CRITICAL: 
- Always extract the multiple choice options
- Solve the problem first, then check options
- If your answer doesn't match, try converting:
  * 1 6/7 with denominator 7 → multiply by 7/7 → 1 42/49
  * 0.5 → 1/2 or 2/4 depending on options
  * -2 → look for -2 in options
- Return answer in the EXACT format shown in options
- If no match after conversion, return calculated_answer with matched_option: null`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Read the question, extract ALL multiple choice options, solve it, then match your answer to the options. Show your work including any conversions needed." },
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
