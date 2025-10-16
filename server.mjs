import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// If you’re on Node <18, uncomment the next two lines:
// import fetch from "node-fetch";
// globalThis.fetch = fetch;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// SSE clients for console (optional external display)
let consoleClients = [];

/** Helpers */
function sseBroadcast(payload) {
  const str = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of consoleClients) c.write(str);
}

/** Proxy endpoint to OpenAI with re-read & reconcile logic */
app.post("/ask", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const body = {
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 450, // extra room for the re-read step
      messages: [
        {
          role: "system",
          content: `You solve MULTIPLE-CHOICE math questions from an IMAGE.

STRICT protocol:
1) OCR carefully: extract the question and ALL options (A–D etc) exactly as seen.
2) Identify what's being asked.
3) Compute the answer step-by-step with precise arithmetic (money to 2 decimals).
4) MATCHING:
   - Try exact match to one option (normalize spaces/currency symbols).
   - If no match: RE-READ the numbers from the image ONCE and RE-CALCULATE.
     * Prioritize numbers adjacent to $ or % and numbers inside the options list.
     * Consider typical OCR slips: 6↔5, 8↔3, 0↔6, 1.00↔1.0, 0.50↔.50.
   - If still no match, convert your result to the options' format (fraction/decimal/mixed).
5) If after re-read + conversions there is truly no match, set matched_option=null.

Return STRICT JSON ONLY:
{
 "question": "...",
 "options": ["A. ...","B. ...","C. ...","D. ..."],
 "calculated_answer": "...",
 "answer": "...",
 "matched_option": "A"|"B"|"C"|"D"|null,
 "work": "concise steps incl. any number corrections/conversions"
}`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Solve and match to one option. Show concise steps." },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    sseBroadcast({ type: "answer", internet: r.ok ? "🟢" : "🔴", payload: text });
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    sseBroadcast({ type: "answer", internet: "🔴", payload: JSON.stringify({ error: e.message }) });
    res.status(500).json({ error: e.message || "Server error" });
  }
});

/** SSE console endpoint */
app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  consoleClients.push(res);
  req.on("close", () => {
    consoleClients = consoleClients.filter(c => c !== res);
  });
});

/** Static UI */
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`✅ Server live on port ${PORT}`);
});
