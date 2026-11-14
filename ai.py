"""
SkillNexus-AI · Gemini layer.

Design rule: the deterministic engine is the source of truth for every number.
Gemini is used for three things only, each with a hard fallback:

  1. Writing diagnostic questions for any of the 33 benchmark skills on demand.
  2. Grading a free-text answer against an explicit rubric (partial credit).
  3. Turning a computed re-plan diff into a mentor's explanation.

If the key is missing, rate-limited, or the model misbehaves, every call returns
a deterministic fallback and the product keeps working. Nothing here can break
the demo.
"""

from __future__ import annotations

import os
import json
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from google import genai

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
PRIMARY = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
CANDIDATES = list(
    dict.fromkeys(
        [PRIMARY, "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3-flash-preview"]
    )
)

_client: Optional[genai.Client] = None
_client_lock = threading.Lock()

# Bounded in-memory audit trail. Proof that the AI is real and observable.
_AUDIT: List[Dict[str, Any]] = []
_AUDIT_LOCK = threading.Lock()
_AUDIT_MAX = 60

# Question cache: skill -> validated question list. Keeps us inside the free tier.
_BANK_CACHE: Dict[str, List[Dict[str, Any]]] = {}
_BANK_LOCK = threading.Lock()


# ── Client / status ─────────────────────────────────────────────────────────
def get_client() -> Optional[genai.Client]:
    global _client
    if not API_KEY:
        return None
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = genai.Client(api_key=API_KEY)
    return _client


def enabled() -> bool:
    return get_client() is not None


def _record(agent: str, model: str, latency_ms: int, ok: bool, detail: str = "") -> None:
    entry = {
        "agent": agent,
        "model": model,
        "latency_ms": latency_ms,
        "ok": ok,
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if detail:
        entry["detail"] = detail[:160]
    with _AUDIT_LOCK:
        _AUDIT.append(entry)
        del _AUDIT[:-_AUDIT_MAX]


def audit_log() -> List[Dict[str, Any]]:
    with _AUDIT_LOCK:
        return list(reversed(_AUDIT))


def status() -> Dict[str, Any]:
    calls = audit_log()
    return {
        "enabled": enabled(),
        "model": PRIMARY,
        "calls": len(calls),
        "last_call": calls[0] if calls else None,
        "mode": "gemini" if enabled() else "deterministic-fallback",
    }


# ── Low-level call ──────────────────────────────────────────────────────────
def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1] if "```" in text[3:] else text[3:]
        text = text.lstrip("json").strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            return None
    return None


def _generate(agent: str, prompt: str, max_tokens: int = 700, temperature: float = 0.4, json_mode: bool = False) -> Optional[str]:
    """One text completion with model fallback + one retry per model."""
    client = get_client()
    if client is None:
        return None

    config = {"temperature": temperature, "max_output_tokens": max_tokens}
    if json_mode:
        config["response_mime_type"] = "application/json"

    for model in CANDIDATES:
        for attempt in range(2):
            started = time.perf_counter()
            try:
                resp = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config,
                )
                text = getattr(resp, "text", None)
                latency = int((time.perf_counter() - started) * 1000)
                if text and text.strip():
                    _record(agent, model, latency, True)
                    return text
                _record(agent, model, latency, False, "empty response")
            except Exception as exc:  # noqa: BLE001
                latency = int((time.perf_counter() - started) * 1000)
                msg = str(exc)
                _record(agent, model, latency, False, msg)
                if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                    break  # model quota exhausted, move to the next model
                if "503" in msg or "UNAVAILABLE" in msg:
                    time.sleep(1.5)
                    continue
                if "404" in msg or "NOT_FOUND" in msg or "400" in msg:
                    break
    return None


# ── 1. Diagnostic question generation ───────────────────────────────────────
_BANK_PROMPT = """You are an expert technical interviewer writing a diagnostic
assessment for the skill "{skill}" at required proficiency level {level}/5.

Write exactly 3 multiple-choice questions that separate a candidate who has
real working knowledge from one who has only watched tutorials.

Hard rules:
- Exactly one option is unambiguously correct. The other three must be plausible
  wrong answers, not obviously silly.
- Test understanding and failure modes, never trivia, dates or syntax minutiae.
- Every explanation must state why the correct answer is right in one sentence.
- Do not reference "this assessment" or the candidate.
- Difficulty: question 1 = working knowledge, 2 = applied reasoning, 3 = failure mode.

Return ONLY this JSON, no prose:
{{"questions": [
  {{"question": "...", "options": ["...", "...", "...", "..."],
    "correct_index": 0, "explanation": "..."}}
]}}"""


def _validate_questions(data: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not isinstance(data, dict):
        return out
    for i, q in enumerate(data.get("questions", [])[:3]):
        if not isinstance(q, dict):
            continue
        question = str(q.get("question", "")).strip()
        options = q.get("options")
        idx = q.get("correct_index")
        expl = str(q.get("explanation", "")).strip()
        if not question or not isinstance(options, list) or len(options) != 4:
            continue
        options = [str(o).strip() for o in options]
        if any(not o for o in options):
            continue
        try:
            idx = int(idx)
        except Exception:
            continue
        if idx < 0 or idx > 3:
            continue
        out.append(
            {
                "id": f"ai-{i}-{abs(hash(question)) % 100000}",
                "question": question,
                "options": options,
                "correct_index": idx,
                "explanation": expl or "See the official documentation for this concept.",
            }
        )
    return out


def generate_questions(skill: str, level: int = 3) -> Tuple[List[Dict[str, Any]], str]:
    """Returns (questions, source) where source is 'gemini' | 'curated' | 'none'."""
    key = skill.lower().strip()
    with _BANK_LOCK:
        if key in _BANK_CACHE:
            return _BANK_CACHE[key], "gemini-cached"

    if not enabled():
        return [], "none"

    raw = _generate(
        "Assessor Agent",
        _BANK_PROMPT.format(skill=skill, level=level),
        max_tokens=1600,
        temperature=0.6,
        json_mode=True,
    )
    if not raw:
        return [], "none"

    questions = _validate_questions(_extract_json(raw))
    if len(questions) < 2:
        print(f"[ai] question validation failed for {skill}; raw head: {raw[:300]!r}")
        return [], "none"

    with _BANK_LOCK:
        _BANK_CACHE[key] = questions
    return questions, "gemini"


# ── 2. Rubric grading of a free-text answer ─────────────────────────────────
_GRADE_PROMPT = """You are grading a candidate's written answer for the skill
"{skill}". The candidate claims level {claimed}/5; the industry requirement is
level {required}/5.

Question: {question}
Candidate's answer: \"\"\"{answer}\"\"\"

Score the answer against exactly these three criteria, and nothing else:
1. Correctness — is the technical claim actually true?
2. Depth — does it explain the mechanism, not just the label?
3. Precision — is it specific, with no vague filler?

Be strict. A vague or partially wrong answer must score below 60. An empty or
off-topic answer scores 0.

Return ONLY this JSON:
{{"score": 0, "criteria": [{{"name": "Correctness", "met": true, "note": "..."}},
                          {{"name": "Depth", "met": false, "note": "..."}},
                          {{"name": "Precision", "met": true, "note": "..."}}],
  "verdict": "one short sentence addressed to the learner",
  "misconception": "the specific wrong idea detected, or empty string"}}"""


def grade_concept(
    skill: str, question: str, answer: str, claimed: int = 3, required: int = 4
) -> Dict[str, Any]:
    fallback = {
        "score": 0,
        "criteria": [
            {"name": "Correctness", "met": False, "note": "Not evaluated: AI grader unavailable."},
            {"name": "Depth", "met": False, "note": "Not evaluated."},
            {"name": "Precision", "met": False, "note": "Not evaluated."},
        ],
        "verdict": "Rubric grading is offline. The deterministic check-in still governs your level.",
        "misconception": "",
        "source": "fallback",
        "graded": False,
    }

    answer = (answer or "").strip()
    if len(answer) < 12:
        fallback["verdict"] = "Answer too short to grade. Write two or three sentences."
        return fallback
    if not enabled():
        return fallback

    raw = _generate(
        "Mentor Agent",
        _GRADE_PROMPT.format(
            skill=skill, claimed=claimed, required=required, question=question, answer=answer[:1200]
        ),
        max_tokens=800,
        temperature=0.2,
        json_mode=True,
    )
    data = _extract_json(raw) if raw else None
    if not isinstance(data, dict):
        return fallback

    try:
        score = max(0, min(100, int(data.get("score", 0))))
    except Exception:
        score = 0

    criteria = []
    for c in (data.get("criteria") or [])[:3]:
        if isinstance(c, dict) and c.get("name"):
            criteria.append(
                {
                    "name": str(c["name"])[:24],
                    "met": bool(c.get("met")),
                    "note": str(c.get("note", ""))[:180],
                }
            )

    return {
        "score": score,
        "criteria": criteria,
        "verdict": str(data.get("verdict", ""))[:240],
        "misconception": str(data.get("misconception", ""))[:200],
        "source": "gemini",
        "graded": True,
    }


# ── 3. Grounded mentor narrative ────────────────────────────────────────────
_NARRATIVE_PROMPT = """You are the Mentor Agent in a skills platform. A learner
just failed a diagnostic and the curriculum was rewritten by a deterministic
engine. Explain the decision to the learner.

Facts (these are the only numbers you may use):
- Skill failed: {skill}
- Diagnostic score: {score}%
- Remedial module injected: {module}
- Remedial hours: {hours}
- Weeks to target now: {weeks_after} (was {weeks_before})
- Current verified readiness: {readiness_now}%

Write 2 or 3 sentences, second person, calm and specific. Say what was inserted,
why the failure blocks the next module, and what the learner should do first.
Do not claim the readiness score changed. No emoji, no exclamation marks, no
motivational filler, and never invent a number that is not listed above."""


def mentor_narrative(facts: Dict[str, Any]) -> Tuple[str, str]:
    fallback = (
        f"Scoring {facts.get('score')}% on {facts.get('skill')} means the next module "
        f"would build on a broken foundation. A {facts.get('hours')}-hour remedial sprint "
        f"has been inserted first, and the dependent sprints are deferred until it is passed."
    )
    if not enabled():
        return fallback, "deterministic"

    raw = _generate(
        "Mentor Agent",
        _NARRATIVE_PROMPT.format(
            skill=facts.get("skill", "the skill"),
            score=facts.get("score", 0),
            module=facts.get("module", "a remedial sprint"),
            hours=facts.get("hours", 0),
            weeks_before=facts.get("weeks_before", 0),
            weeks_after=facts.get("weeks_after", 0),
            readiness_now=facts.get("readiness_now", 0),
        ),
        max_tokens=300,
        temperature=0.3,
    )
    if not raw:
        return fallback, "deterministic"

    text = " ".join(raw.strip().split())
    if len(text) < 30:
        return fallback, "deterministic"
    return text[:700], "gemini"
