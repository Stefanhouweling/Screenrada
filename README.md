# Screen Reader AI (Render Deployment)

This repo contains:
- `server.mjs` — Node server that serves the UI and proxies /ask to OpenAI
- `public/index.html` — Camera UI (PNG capture, GPT-4o, concise output)
- `package.json` — start script for Render
- `render.yaml` — one-click Render config (Web Service, free plan)

## Deploy to Render (free)

1. Create a **new GitHub repo** and upload these files.
2. Go to **render.com** → **New** → **Web Service** → connect your repo.
3. On the service setup screen:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Root Directory:** (leave blank)
   - **Region:** your choice
   - **Environment Variables:** add `OPENAI_API_KEY` with your real key
   - (Plan: Free)
4. Click **Create Web Service**. After build, open the URL.
5. In the page: **Start Camera** → **Ask Now** (or leave **Auto-send** on).

## Notes
- The app uses **PNG** frames and `gpt-4o` with the instruction: 
  “Use spatial layout and numerical reasoning, do not guess.”
- The server and UI are on the same domain, so **no CORS issues**.
