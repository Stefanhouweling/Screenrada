import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "20mb" }));
const PORT = process.env.PORT || 10000;

app.post("/ask", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "No image" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing API key" });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Read the question in this image and give only the correct answer with a short rationale in JSON: {\"answer\": \"\", \"rationale\": \"\"}. Do not guess if unclear."
              },
              {
                type: "input_image",
                image_url: `data:image/png;base64,${imageBase64}`
              }
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

app.get("/", (_, res) => res.send("Server running."));
app.listen(PORT, () => console.log(`✅ Server listening on port ${PORT}`));
