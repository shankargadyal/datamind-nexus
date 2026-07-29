# DataMind Nexus — Shankar Gadyal

Premium dark portfolio for an AI Engineer. Pure HTML + CSS + vanilla JavaScript on the
frontend, Flask on the backend. No React, no Bootstrap, no Tailwind, no external JS libraries.

## Structure

```
.
├── index.html            # the entire site (markup + styles + runtime)
├── app.py                # Flask server + POST /api/chat  →  Groq
├── requirements.txt
├── Dockerfile            # Cloud Run ready
├── .env.example
├── resume.pdf            # served by the Resume buttons
└── images/
    ├── profile.jpg               # hero portrait          (replace)
    ├── favicon.svg
    ├── og-cover.png              # 1200×630 social card   (replace)
    ├── datamind-1..3.png         # project screenshots    (replace)
    ├── finsight-1..3.png
    ├── customeriq-1..3.png
    ├── creditiq-1..3.png
    ├── cert-infosys-ml.png       # certificates           (replace)
    ├── cert-infosys-nlp.png
    └── cert-placeholder.png
```

Everything in `images/` is a generated placeholder in the site's palette. Drop real files
over them using the same names and nothing else needs to change.

## Run locally

```bash
pip install -r requirements.txt
export GROQ_API_KEY="your-key"        # from https://aistudio.google.com/apikey
python app.py                           # http://localhost:8080
```

## NOVA architecture

```
Browser  ──fetch()──►  Flask /api/chat  ──HTTPS──►  GROQ API
                       (holds the key)
```

The browser never sees an API key. `app.py` owns the system prompt, caps message length,
trims history to 8 turns, rate-limits to 20 requests per IP per minute, and returns a safe
message on every failure path.

Endpoints:

| Method | Path           | Purpose                                        |
|--------|----------------|------------------------------------------------|
| POST   | `/api/chat`    | `{"message": str, "history": [...]}` → `{"reply": str}` |
| GET    | `/api/health`  | Liveness + whether the key is configured       |

## Deploy to Cloud Run

```bash
gcloud run deploy datamind-nexus \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars GROQ_API_KEY=your-key
```

## Before going live

1. Replace every placeholder in `images/`.
2. Update the canonical URL and `og:url` in `index.html` to the real domain.
3. Add the portfolio URL to the resume PDF.
4. Set `GROQ_API_KEY` as a secret, never in the repo.

## Content notes

- Editing a project's screenshots, write-up, metrics, architecture diagram or links happens in
  one place: the `PROJECTS` object in `index.html`. Galleries and detail modals both read from it.
- Certificates come from the `CERTIFICATES` array in the same block.
- NOVA's facts live in `NOVA_SYSTEM_PROMPT` in `app.py`. Keep it in sync with the site copy.
