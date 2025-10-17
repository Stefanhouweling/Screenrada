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

app.post("/ask", async (req, res) => {
  try {
    const { imageBase64, questions } = req.body || {};
    
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }
    
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "Missing questions array" });
    }

    // Build the questions prompt
    const questionsPrompt = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');

    const body = {
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You answer questions about images directly and concisely.

Protocol:
1) Carefully examine the image using OCR and visual analysis
2) Answer each numbered question directly and accurately
3) Be specific and precise in your answers
4) If you cannot determine an answer from the image, state that clearly

Return STRICT JSON ONLY in this format:
{
  "answers": [
    {
      "question": "the question text",
      "answer": "your direct answer"
    }
  ]
}

Each answer should be clear, direct, and based solely on what you can see in the image.`
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: `Please answer the following questions about this image:\n\n${questionsPrompt}\n\nProvide direct answers for each question.`
            },
            { 
              type: "image_url", 
              image_url: { 
                url: `data:image/png;base64,${imageBase64}`, 
                detail: "high" 
              } 
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        Authorization: `Bearer ${OPENAI_API_KEY}` 
      },
      body: JSON.stringify(body),
    });

    const responseData = await r.json();
    
    // Log to SSE console
    sse({ 
      type: "answer", 
      internet: r.ok ? "🟢" : "🔴", 
      payload: responseData,
      questionCount: questions.length
    });

    if (!r.ok) {
      return res.status(r.status).json(responseData);
    }

    // Extract the JSON from OpenAI's response
    const aiResponse = JSON.parse(responseData.choices[0].message.content);
    
    // Ensure we have the answers array
    if (!aiResponse.answers || !Array.isArray(aiResponse.answers)) {
      return res.status(500).json({ 
        error: "Invalid response format from AI",
        raw: aiResponse 
      });
    }

    res.status(200).json(aiResponse);

  } catch (e) {
    console.error("Server error:", e);
    sse({ 
      type: "error", 
      internet: "🔴", 
      payload: { error: e.message } 
    });
    res.status(500).json({ error: e.message || "Server error" });
  }
});

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

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log(`✅ Server live on ${PORT}`));
