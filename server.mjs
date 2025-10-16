import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// ↑ allow very large payloads for full-res PNG base64
app.use(express.json({ limit: "100mb" }));

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let consoleClients = [];
const sse = (payload) => {
  const str = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of consoleClients) c.write(str);
};

app.post("/ask", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "Missing imageBase64" });

    const body = {
      model: "gpt-4o",          // keep 4o; very strong on vision
      temperature: 0,
      max_tokens: 900,          // plenty of room for careful work
      messages: [
        {
          role: "system",
          content: `You solve MULTIPLE-CHOICE math questions from an IMAGE.

Protocol:
1) OCR the question and ALL options (A–D…) carefully.
2) Identify what is asked.
3) Compute step-by-step exactly (money to 2 decimals).
4) MATCH:
   - Try exact match (normalize currency/spacing).
   - If no match: RE-READ the numbers once and recompute.
     Consider OCR slips: 6↔5, 8↔3, 0↔6, .50↔0.50, 1.00↔1.0
   - If still no match, convert your result to options’ format (fraction/decimal/mixed).
5) If truly none match, matched_option = null.

Return STRICT JSON ONLY:
{
 "question": "...",
 "options": ["A. ...","B. ...","C. ...","D. ..."],
 "calculated_answer": "...",
 "answer": "...",
 "matched_option": "A"|"B"|"C"|"D"|null,
 "work": "concise steps and any number corrections"
}`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Solve and match to one option. Show concise steps." },
            // IMPORTANT: detail:"high" asks for best vision pass
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    sse({ type: "answer", internet: r.ok ? "🟢" : "🔴", payload: text });
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    sse({ type: "answer", internet: "🔴", payload: JSON.stringify({ error: e.message }) });
    res.status(500).json({ error: e.message || "Server error" });
  }
});

app.get("/events", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
  consoleClients.push(res);
  req.on("close", () => { consoleClients = consoleClients.filter(c => c !== res); });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log(`✅ Server live on ${PORT}`));
