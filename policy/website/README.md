# website/

The Next.js front-end. It is a pure client of the Python backend API
(`etl/api.py`) — it talks to it over HTTP and holds no business logic itself.

## Screens

- **Dashboard** (`/`) — corpus stats + "what's moving", grouped by lifecycle
  stage (consultation → proposed → in force).
- **Briefing** (`/brief`) — company profile intake → retrieval → grounded,
  citation-backed briefing. Without an `ANTHROPIC_API_KEY` on the API it shows
  the retrieved sources; with one, the full generated analysis with citations.
- **Document** (`/documents/[id]`) — metadata, lifecycle, and extracted excerpt.

## Run it

From the repo root, start the API (serves the corpus + briefing engine):

```bash
uv run regina serve            # http://127.0.0.1:8000
```

Then, in this folder:

```bash
cp .env.local.example .env.local     # points at the API (default localhost:8000)
npm install
npm run dev                          # http://localhost:3000
```

The API has CORS enabled for `localhost:3000`. Set `ANTHROPIC_API_KEY` in the
repo `.env` before starting the API to enable full briefing generation.
