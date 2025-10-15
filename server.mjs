import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json({ limit: "20mb" }));
const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// === /ask endpoint ===
app.post("/ask", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: `You are an OCR + reasoning AI that interprets test screenshots. 
Use spatial layout and numerical reasoning ONLY. 
Never guess.

Workflow:
1. Extract the question text.
2. Extract visible multiple-choice options [{letter,text}].
3. Compute the correct numeric/logical answer ("result_number").
4. Find the option whose numeric value/text EXACTLY equals result_number.
5. If no match, set consistency="no_match" and selection=null.
Return JSON only, no commentary.

Format:
{
 "question": "...",
 "options": [{"letter":"A","text":"..."}, ...],
 "result_number": number|string,
 "selection": {"letter":"A","text":"..."}|null,
 "consistency": "match"|"no_match",
 "rationale": "≤2 concise lines of reasoning",
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

    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error" });
  }
});

app.use(express.static("public"));
app.listen(PORT, () => console.log(`✅ Server live on port ${PORT}`));
