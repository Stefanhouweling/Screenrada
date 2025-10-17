// server.mjs
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json({ limit: "100mb" }));

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let consoleClients = [];
const sse = (payload) => {
  const str = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of consoleClients) c.write(str);
};

// Log events from client (status + override)
app.post("/log", (req, res) => {
  const { event, meta } = req.body || {};
  if (!event) return res.status(400).json({ error: "missing event" });
  sse({ type: "log", event, meta: meta || {}, ts: Date.now() });
  return res.json({ ok: true });
});

app.post("/ask", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    let { questions } = req.body || {};
    if (!imageBase64) {
      // Never 4xx to the browser; return a safe 200 payload
      const answer = "(error) Missing imageBase64";
      sse({ type: "answer", internet: "🔴", payload: { error: { message: answer } } });
      return res.status(200).json({ answers: [{ question: "n/a", answer }] });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      questions = [
        "Give the direct answer from the image. Output only the answer text or number. No labels, no explanation."
      ];
    }

    const questionsPrompt = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

    const body = {
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You answer questions about images directly and concisely.

Return STRICT JSON ONLY in this format:
{
  "answers": [
    {"question":"the question text","answer":"your direct answer"}
  ]
}
No code fences or extra text.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Please answer these questions:\n\n${questionsPrompt}\n\nFollow the exact JSON schema above.` },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } }
          ]
        }
      ]
    };

    let r, responseData;
    try {
      r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify(body)
      });
      responseData = await r.json();
    } catch (netErr) {
      const answer = `(error) OpenAI network: ${netErr.message || netErr}`;
      sse({ type: "answer", internet: "🔴", payload: { error: { message: answer } } });
      return res.status(200).json({ answers: [{ question: questions[0], answer }] });
    }

    // Broadcast raw to console
    sse({ type: "answer", internet: r?.ok ? "🟢" : "🔴", payload: responseData, questionCount: questions.length });

    if (!r?.ok) {
      const msg = responseData?.error?.message || (r?.statusText || "Upstream error");
      const answer = `(error) OpenAI ${r.status}: ${msg}`;
      return res.status(200).json({ answers: [{ question: questions[0], answer }] });
    }

    const content = responseData?.choices?.[0]?.message?.content;

    // Robust parsing → prefer JSON with {answers:[...]}
    let parsed = null;
    if (typeof content === "string") {
      try { parsed = JSON.parse(content); } catch {}
      if (!parsed) {
        const fence = content.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
        if (fence) { try { parsed = JSON.parse(fence[1]); } catch {} }
      }
      if (!parsed) {
        const braces = content.match(/\{[\s\S]*\}/);
        if (braces) { try { parsed = JSON.parse(braces[0]); } catch {} }
      }
    }

    let normalized;
    if (parsed?.answers && Array.isArray(parsed.answers)) {
      normalized = { answers: parsed.answers };
    } else if (parsed?.answer) {
      normalized = { answers: [{ question: questions[0], answer: parsed.answer }] };
    } else if (typeof content === "string") {
      // fallback: treat raw string as the answer
      normalized = { answers: [{ question: questions[0], answer: content.trim() }] };
    } else {
      const answer = "(error) ParseError: could not extract JSON content from model";
      return res.status(200).json({ answers: [{ question: questions[0], answer }] });
    }

    if (!normalized.answers.length || typeof normalized.answers[0].answer !== "string") {
      const answer = "(error) Invalid response format from AI";
      return res.status(200).json({ answers: [{ question: questions[0], answer }] });
    }

    return res.status(200).json(normalized);
  } catch (e) {
    const answer = `(error) Server exception: ${e.message || e}`;
    sse({ type: "error", internet: "🔴", payload: { error: e?.message || String(e) } });
    return res.status(200).json({ answers: [{ question: "n/a", answer }] });
  }
});

app.get("/events", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
  consoleClients.push(res);
  req.on("close", () => { consoleClients = consoleClients.filter((c) => c !== res); });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log(`✅ Server live on ${PORT}`));
