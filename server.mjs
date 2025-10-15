import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "20mb" }));

// --- live console connections ---
const clients = new Set();
app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  clients.add(res);
  req.on("close", () => clients.delete(res));
});
function broadcast(data) {
  for (const r of clients) r.write(`data: ${JSON.stringify(data)}\n\n`);
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 10000;

// --- AI proxy ---
app.post("/ask", async (req, res) => {
  try {
    const { imageBase64, speedInfo } = req.body || {};
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
            content:
              "Use spatial layout and numerical reasoning. Never guess. Return strict JSON only.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Solve and return strict JSON only." },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${imageBase64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    const text = await r.text();
    if (!text) throw new Error("Empty AI response");
    res.status(r.status).type("application/json").send(text);

    broadcast({
      type: "answer",
      payload: text,
      internet: speedInfo,
      timestamp: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
