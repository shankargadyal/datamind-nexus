"""
DataMind Nexus — portfolio backend.

Serves the static portfolio and exposes a single chat endpoint that proxies
NOVA's questions to the GROQ API. The API key lives here, in the server
environment — it is never sent to the browser.

    Browser  ->  POST /api/chat  ->  Flask  ->  GROQ API

Run locally:
    pip install -r requirements.txt
    export GROQ_API_KEY="your-key"t
    python app.py
"""

from __future__ import annotations

import logging
import os
from random import choices
import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List
from dotenv import load_dotenv
load_dotenv()

import requests
from flask import Flask, jsonify, request, send_from_directory

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #


GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_URL = (
    "https://api.groq.com/openai/v1/chat/completions"
)


MAX_MESSAGE_CHARS = 800          # reject anything longer than a real question
MAX_HISTORY_TURNS = 8            # cap context sent upstream
REQUEST_TIMEOUT_SECONDS = 25
RATE_LIMIT_REQUESTS = 20         # per client IP
RATE_LIMIT_WINDOW_SECONDS = 60

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("datamind-nexus")

app = Flask(__name__, static_folder=".", static_url_path="")

# --------------------------------------------------------------------------- #
# NOVA system prompt — the only facts NOVA is allowed to work from
# --------------------------------------------------------------------------- #

NOVA_SYSTEM_PROMPT = """You are NOVA, a concise AI guide embedded in Shankar Gadyal's portfolio site.
Answer questions about Shankar using ONLY the facts below. Keep answers short (2-4 sentences),
friendly, specific, and free of hype. You may use light markdown (bold, short lists).
If asked something these facts do not cover, say you only know about his work here.
Never invent metrics, employers, dates or credentials.

FACTS
- Shankar Gadyal: AI Engineer based in Bengaluru, Karnataka, India.
  Contact: gadyalshankar@gmail.com, +91 7760463023,
  github.com/shankargadyal, linkedin.com/in/shankargadyal.
- Education: MSc Data Science, Dayananda Sagar University, Bengaluru (2025-2027, in progress).
  BSc Data Science, Presidency University (2021-2024, completed).
- Certifications: Infosys Springboard - Machine Learning for Python; Infosys Springboard - NLP.
- Availability: open to AI/ML internships and full-time roles, available immediately,
  Bengaluru or remote.

- DataMind AI: autonomous multi-agent analytics platform. Five agents in sequence:
  Detective -> Analyst -> ML Engineer -> Guardrails -> Reporter. It ingests a raw dataset
  and produces a full ML analysis and report with no manual steps. Shankar audited it against
  a 6-category agentic AI framework (RAG, Multi-Agent, Guardrails/Eval, LLMOps,
  Human-in-the-Loop, MCP/A2A), found gaps in four categories, and implemented all six.
  Notable engineering: TF-IDF retrieval chosen over heavy embeddings so RAG fits free-tier
  memory; a guardrails agent that cross-checks the LLM's own confidence claims against real
  quality metrics; a human review gate; per-call latency and token logging.
  Stack: Python, Flask, Groq LLaMA 3.3 70B, Scikit-Learn, SHAP, React.
  GitHub: github.com/shankargadyal/DataMind-AI
  Live: datamind-ai-887682911552.asia-south1.run.app

- FinSight AI: stock forecasting and financial intelligence platform, MSc capstone.
  Combines Linear Regression, ARIMA, LSTM and VADER sentiment, with a risk analyzer and a
  prediction-confidence meter. A senior-level security and code audit found a live production
  database committed to the public repo and debug mode left on; Shankar fixed both, corrected
  the documentation, then shipped a v3 rebuild adding a RAG financial assistant and a
  redesigned frontend. Deployed on Google Cloud Run (asia-south1).

- CustomerIQ: churn prediction, RFM segmentation and customer lifetime value estimation.
  The first model returned 100% accuracy, which Shankar treated as a red flag rather than a
  result; he traced it to data leakage, rebuilt the pipeline with proper train/test splits and
  cross-validation, and benchmarked six models. Final Random Forest: 82.26% verified test
  accuracy. Delivered as a Flask + Chart.js dashboard.

- CreditIQ: credit risk and loan pre-eligibility system. Pipeline: eligibility rules ->
  ML risk scoring -> risk banding -> plain-English explanation. Trained on 265,000+ Lending Club
  loan records (2007-2018); best model XGBoost at 0.743 ROC-AUC and 81.2% test accuracy.
  Includes an analytics dashboard (default rate by grade, purpose and risk band) and a
  GROQ-powered assistant that explains declines to applicants.

- Recurring theme: he does not just build models, he finds what is wrong with them
  (data leakage, exposed credentials, gaps against real agentic-AI standards) and fixes it
  before shipping. All four projects are deployed and publicly reachable.
"""

# --------------------------------------------------------------------------- #
# Simple in-memory rate limiter (per IP, sliding window)
# --------------------------------------------------------------------------- #

_hits: Dict[str, Deque[float]] = defaultdict(deque)


def rate_limited(client_ip: str) -> bool:
    """Return True when this IP has exceeded the window allowance."""
    now = time.time()
    window = _hits[client_ip]
    while window and now - window[0] > RATE_LIMIT_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= RATE_LIMIT_REQUESTS:
        return True
    window.append(now)
    return False


def client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.remote_addr or "unknown")


# --------------------------------------------------------------------------- #
# GROQ call
# --------------------------------------------------------------------------- #

def build_contents(message: str, history: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Translate the frontend's history format into GROQ's `contents` array."""
    contents: List[Dict[str, Any]] = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        role = "user" if turn.get("role") == "user" else "model"
        text = str(turn.get("content", ""))[:MAX_MESSAGE_CHARS]
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": message}]})
    return contents


def call_groq(message: str, history: List[Dict[str, str]]) -> str:
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "system",
                "content": NOVA_SYSTEM_PROMPT
            },
            {
                "role": "user",
                "content": message
            }
        ],
        "temperature": 0.4,
        "max_tokens": 512
    }
    response = requests.post(
        GROQ_URL,
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    response.raise_for_status()
    data = response.json()

    choices = data.get("choices") or []
    if not choices:
        raise ValueError("Groq returned no choices")

    text = choices[0]["message"]["content"].strip()

    if not text:
        raise ValueError("Groq returned an empty response")

    return text


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

@app.route("/api/chat", methods=["POST"])
def chat():
    """NOVA endpoint. Body: {"message": str, "history": [{"role","content"}]}"""
    if rate_limited(client_ip()):
        return jsonify({"error": "rate_limited",
                        "reply": "Too many questions at once. Give it a few seconds."}), 429

    if not GROQ_API_KEY:
        logger.error("GROQ_API_KEY is not set")
        return jsonify({"error": "not_configured",
                        "reply": "NOVA is not configured on this server yet."}), 503

    body = request.get_json(silent=True) or {}
    message = str(body.get("message", "")).strip()
    history = body.get("history") or []

    if not message:
        return jsonify({"error": "empty_message", "reply": "Ask me something about Shankar's work."}), 400
    if len(message) > MAX_MESSAGE_CHARS:
        message = message[:MAX_MESSAGE_CHARS]
    if not isinstance(history, list):
        history = []

    try:
        reply = call_groq(message, history)
        return jsonify({"reply": reply})
    except requests.Timeout:
        logger.warning("GROQ timeout")
        return jsonify({"error": "timeout",
                        "reply": "That took too long. Try asking again."}), 504
    except requests.HTTPError as exc:
      
        logger.error("GROQ HTTP error: %s", exc)
        return jsonify({
            "error": "upstream",
            "reply": "NOVA hit an upstream error. Try again in a moment."
        }), 502
    except Exception as exc:  # noqa: BLE001 - surface a safe message, log the detail
        logger.exception("Chat failure: %s", exc)
        return jsonify({"error": "server",
                        "reply": "Something broke on the server. Try again in a moment."}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": GROQ_MODEL, "configured": bool(GROQ_API_KEY)})


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/SHANKAR_resume.pdf")
def resume():
    return send_from_directory(".", "SHANKAR_resume.pdf", mimetype="application/pdf")


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    # debug stays off: this is the production entry point.
    app.run(host="0.0.0.0", port=port, debug=False)
