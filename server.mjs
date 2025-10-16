import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch"; // if on Node < 18, keep; on 18+ you can remove this import

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("⚠️  OPENAI_API_KEY missing. Set it in your env.");
}

// SSE clients for console (optional console UI you had)
let consoleClients = [];

/** POST /ask — proxy to OpenAI with strict JSON + re-read fallback */
app.post("/ask", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "Missing imageBase64" });

    const body = {
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are a math problem solver for MULTIPLE-CHOICE questions shown in an IMAGE.

Protocol:
1) OCR carefully: extract the question text AND every option letter+text (A–D etc).
2) Identify what is being asked.
3) Compute the answer step-by-step with precise arithmetic (currency to two decimals).
4) MATCHING:
   - Try exact match to one option (normalize spaces, commas, currency symbols).
   - If no exact match: RE-READ the NUMBERS from the image and RE-CALCULATE once.
     Prefer numbers near currency symbols ($) and those within the options block.
     Consider common OCR slips (6↔5, 8↔3, 0↔6, 1.00↔1.0, .50↔0.50).
   - If still no match, convert your result into the options’ format (mixed numbers, fractions, decimals).
5) Only if there is truly no match after re-read and conversions, set matched_option=null.

Return STRICT JSON ONLY:
{
 "question": "...",
 "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
 "calculated_answer": "...",
 "answer": "...",
 "matched_option": "A"|"B"|"C"|"D"|null,
 "work": "concise steps, include any number corrections/conversions"
}`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Solve and match to an option. Show concise steps." },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    };

    // Basic retry on transient upstream errors
    const doFetch = async (attempt = 0) => {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < 2) {
        await new Promise(r => setTimeout(r, 400 + attempt * 600));
        return doFetch(attempt + 1);
      }
      return r;
    };

    const r = await doFetch();
    const text = await r.text();

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

/** SSE endpoint (optional console) */
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

/** Static UI */
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`✅ Server live on port ${PORT}`);
});
