"""
SkillNexus-AI: Autonomous Multi-Agent Career & Skill Orchestration Platform
FastAPI Application Backend
"""

import os
from typing import List, Dict, Any, Optional, Tuple
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from pathlib import Path

from domain import (
    load_roles,
    get_role_by_id,
    load_learners,
    get_learner_by_id,
    RoleRequirement,
    ReadinessMetrics,
    SkillGap
)
from agents import (
    ProfileAgent,
    GapAgent,
    CurriculumAgent,
    ResourceAgent,
    AssessorAgent,
    MentorAgent,
    AgentHandoffLog
)
import ai

HOURS_PER_WEEK = 8

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="SkillNexus-AI",
    description="Autonomous Multi-Agent Career & Skill Orchestration Platform with Deterministic Gap Analytics",
    version="1.0.0"
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Enterprise security headers middleware:
    Guarantees X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
    Strict-Transport-Security, and Referrer-Policy on all responses.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------
class OrchestrateRequest(BaseModel):
    learner_id: str = Field(min_length=1, max_length=80)
    target_role_id: Optional[str] = Field(default=None, min_length=1, max_length=80)

class GradeAssessmentRequest(BaseModel):
    learner_id: str = Field(min_length=1, max_length=80)
    skill: str = Field(min_length=1, max_length=120)
    answers: List[int] = Field(min_length=1, max_length=20)
    current_modules: List[Dict[str, Any]] = Field(max_length=100)
    target_role_id: str = Field(min_length=1, max_length=80)
    level: int = Field(default=3, ge=0, le=5)
    concept_question: Optional[str] = Field(default=None, max_length=1000)
    concept_answer: Optional[str] = Field(default=None, max_length=5000)

class GoalSwitchRequest(BaseModel):
    learner_id: str = Field(min_length=1, max_length=80)
    new_role_id: str = Field(min_length=1, max_length=80)
    current_skills: Optional[List[Dict[str, Any]]] = Field(default=None, max_length=100)

class ConceptRequest(BaseModel):
    skill: str = Field(min_length=1, max_length=120)
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=5000)
    claimed: int = Field(default=3, ge=0, le=5)
    required: int = Field(default=4, ge=0, le=5)

class MentorRequest(BaseModel):
    skill: str = Field(min_length=1, max_length=120)
    score: int = Field(ge=0, le=100)
    module: str = Field(min_length=1, max_length=500)
    hours: int = Field(ge=0, le=10000)
    before: float = Field(default=0, ge=0)
    after: float = Field(default=0, ge=0)
    weeks_before: int = Field(default=0, ge=0, le=1000)
    weeks_after: int = Field(default=0, ge=0, le=1000)

# ---------------------------------------------------------------------------
# Question resolution: curated bank -> Gemini-generated -> honest general probe
# ---------------------------------------------------------------------------
def resolve_questions(skill: str, level: int = 3):
    assessor = AssessorAgent()
    curated = assessor.ASSESSMENT_BANKS.get(skill)
    if curated:
        return curated, "curated"

    generated, source = ai.generate_questions(skill, level)
    if generated:
        return generated, source

    return assessor.general_probe(skill), "general-probe"

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health", response_model=Dict[str, Any])
def health_check() -> Dict[str, Any]:
    """
    Returns system health status, multi-agent swarm operational state,
    and Gemini context adapter availability.
    """
    return {
        "status": "operational",
        "system": "SkillNexus-AI Multi-Agent Swarm",
        "agents": [
            "ProfileAgent",
            "GapAgent",
            "CurriculumAgent",
            "ResourceAgent",
            "AssessorAgent",
            "MentorAgent"
        ],
        "engine": "Deterministic weighted-competency metric + adaptive re-plan",
        "ai": ai.status(),
    }

@app.get("/api/roles", response_model=Dict[str, Any])
def get_roles() -> Dict[str, Any]:
    """Retrieves all benchmark role requirement ontologies."""
    return {"roles": [r.model_dump() for r in load_roles()]}

@app.get("/api/learners", response_model=Dict[str, Any])
def get_learners() -> Dict[str, Any]:
    """Retrieves pre-seeded candidate learner profiles."""
    return {"learners": load_learners()}

@app.post("/api/orchestrate", response_model=Dict[str, Any])
def orchestrate_pipeline(req: OrchestrateRequest) -> Dict[str, Any]:
    """
    Executes the multi-agent pipeline in sequence:
    ProfileAgent -> GapAgent -> CurriculumAgent -> ResourceAgent
    """
    learner = get_learner_by_id(req.learner_id)
    if not learner:
        raise HTTPException(status_code=404, detail="Learner not found")

    role_id = req.target_role_id or learner["target_role_id"]
    role = get_role_by_id(role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Target role not found")

    logs: List[Dict[str, Any]] = []

    # Agent 1: Profile Agent
    profile_agent = ProfileAgent()
    profile_data, log1 = profile_agent.execute(learner)
    logs.append(log1.to_dict())

    # Agent 2: Gap Agent
    gap_agent = GapAgent()
    metrics, gaps, log2 = gap_agent.execute(profile_data, role)
    logs.append(log2.to_dict())

    # Agent 3: Curriculum Agent
    curriculum_agent = CurriculumAgent()
    modules, log3 = curriculum_agent.execute(gaps, role)
    logs.append(log3.to_dict())

    # Agent 4: Resource Agent
    resource_agent = ResourceAgent()
    modules_with_res, log4 = resource_agent.execute(modules)
    logs.append(log4.to_dict())

    total_hours = sum(int(m.get("hours", 0)) for m in modules_with_res)
    weeks = max(1, -(-total_hours // HOURS_PER_WEEK))

    return {
        "learner": learner,
        "target_role": role.model_dump(),
        "profile_audit": profile_data["audit_summary"],
        "metrics": metrics.model_dump(),
        "gaps": [g.model_dump() for g in gaps],
        "roadmap": modules_with_res,
        "agent_logs": logs,
        "plan": {
            "total_hours": total_hours,
            "hours_per_week": HOURS_PER_WEEK,
            "weeks": weeks,
        },
    }

@app.get("/api/assessment/{skill}", response_model=Dict[str, Any])
def get_assessment(skill: str, level: int = 3) -> Dict[str, Any]:
    """
    Question resolution order:
      1. Curated expert bank (JavaScript, React)
      2. Gemini-generated diagnostic for this exact skill (33 benchmark skills)
      3. Honest general engineering probe, clearly labelled
    """
    questions, source = resolve_questions(skill, level)
    return {
        "skill": skill,
        "source": source,
        "ai_generated": source.startswith("gemini"),
        "total_questions": len(questions),
        "questions": questions,
    }

@app.post("/api/assessment/grade", response_model=Dict[str, Any])
def grade_assessment(req: GradeAssessmentRequest) -> Dict[str, Any]:
    """
    Grades assessment, updates verified skill status, and triggers
    Adaptive Re-plan via MentorAgent if the learner struggles!
    """
    questions, question_source = resolve_questions(req.skill, req.level)
    assessor = AssessorAgent()
    grade_result = assessor.grade_with(questions, req.skill, req.answers)
    grade_result["question_source"] = question_source

    # Optional free-text probe, graded against an explicit rubric by Gemini.
    concept_grade = None
    if req.concept_answer and req.concept_question:
        concept_grade = ai.grade_concept(
            skill=req.skill,
            question=req.concept_question,
            answer=req.concept_answer,
            claimed=max((s.get("claimed_level", 3) for s in (get_learner_by_id(req.learner_id) or {}).get("skills", []) if s.get("skill", "").lower() == req.skill.lower()), default=3),
            required=req.level,
        )

    role = get_role_by_id(req.target_role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Target role not found")

    learner = get_learner_by_id(req.learner_id) or {"skills": []}
    learner_skills = learner.get("skills", [])

    current_hours = sum(int(m.get("hours", 0)) for m in req.current_modules)
    weeks_before = max(1, -(-current_hours // HOURS_PER_WEEK))
    ready_now = GapAgent().execute({"skills": learner_skills}, role)[0].verified_readiness

    mentor = MentorAgent()
    logs = []

    if not grade_result["passed"]:
        # THE WINNING ADAPTIVE MOMENT: Re-plan with AMBER DIFF
        new_modules, diff_summary, mentor_log = mentor.adaptive_replan_on_failure(
            current_modules=req.current_modules,
            failed_skill=req.skill,
            score_pct=grade_result["percentage"],
            role=role
        )
        logs.append(mentor_log.to_dict())

        new_hours = sum(int(m.get("hours", 0)) for m in new_modules)
        weeks_after = max(1, -(-new_hours // HOURS_PER_WEEK))

        narrative, narrative_source = ai.mentor_narrative({
            "skill": req.skill,
            "score": grade_result["percentage"],
            "module": diff_summary["added_modules"][0] if diff_summary["added_modules"] else "a remedial sprint",
            "hours": diff_summary["additional_hours"],
            "weeks_before": weeks_before,
            "weeks_after": weeks_after,
            "readiness_now": ready_now,
        })
        diff_summary["mentor_narrative"] = narrative
        diff_summary["narrative_source"] = narrative_source
        diff_summary["weeks_before"] = weeks_before
        diff_summary["weeks_after"] = weeks_after
        diff_summary["readiness_now"] = ready_now

        return {
            "grade_result": grade_result,
            "concept_grade": concept_grade,
            "adaptive_replan": True,
            "diff_summary": diff_summary,
            "updated_roadmap": new_modules,
            "plan": {"total_hours": new_hours, "hours_per_week": HOURS_PER_WEEK, "weeks": weeks_after},
            "agent_logs": logs
        }
    else:
        # Learner passed: verified level is derived from the score, not assumed.
        new_level = 4 if grade_result["percentage"] >= 85 else 3
        for s in learner_skills:
            if s["skill"].lower() == req.skill.lower():
                s["verified_level"] = max(s.get("verified_level", 0), new_level)
                s["status"] = "verified"

        # Recalculate deterministic metrics
        gap_agent = GapAgent()
        new_metrics, updated_gaps, gap_log = gap_agent.execute({"skills": learner_skills}, role)
        logs.append(gap_log.to_dict())

        # Mark completed module
        updated_modules = []
        for mod in req.current_modules:
            copied = dict(mod)
            if copied["skill"].lower() == req.skill.lower():
                copied["status"] = "completed"
                copied["diff_type"] = "mastered"
            updated_modules.append(copied)

        hours_after = sum(int(m.get("hours", 0)) for m in updated_modules if m.get("status") != "completed")
        weeks_after = max(1, -(-hours_after // HOURS_PER_WEEK))

        diff_summary = {
            "action": "SKILL_VERIFIED",
            "trigger": f"Passed {req.skill} check-in with {grade_result['percentage']}%",
            "added_modules": [],
            "shifted_modules": [],
            "additional_hours": 0,
            "reason": f"Mastery validated at level {new_level}/5. Verified readiness recalculated deterministically.",
            "mentor_narrative": f"Verified level for {req.skill} raised to {new_level}/5. Verified readiness is now {new_metrics.verified_readiness}% and {hours_after} hours of planned work remain.",
            "narrative_source": "deterministic",
            "weeks_before": weeks_before,
            "weeks_after": weeks_after,
        }

        mentor_log = AgentHandoffLog(
            agent_name=mentor.name,
            target_agent="Learner UI",
            summary=f"Skill verified: {req.skill} · Readiness recalculated to {new_metrics.verified_readiness}%"
        )
        logs.append(mentor_log.to_dict())

        return {
            "grade_result": grade_result,
            "concept_grade": concept_grade,
            "adaptive_replan": False,
            "diff_summary": diff_summary,
            "new_metrics": new_metrics.model_dump(),
            "updated_roadmap": updated_modules,
            "plan": {"total_hours": hours_after, "hours_per_week": HOURS_PER_WEEK, "weeks": weeks_after},
            "agent_logs": logs
        }

@app.post("/api/switch-goal", response_model=Dict[str, Any])
def switch_goal(req: GoalSwitchRequest) -> Dict[str, Any]:
    """
    Triggers dynamic career re-routing across all 6 agents
    """
    learner = get_learner_by_id(req.learner_id)
    if not learner:
        raise HTTPException(status_code=404, detail="Learner not found")

    new_role = get_role_by_id(req.new_role_id)
    if not new_role:
        raise HTTPException(status_code=404, detail="Role not found")

    skills = req.current_skills or learner["skills"]

    mentor = MentorAgent()
    metrics, gaps, modules, diff_summary, logs = mentor.adaptive_replan_on_goal_change(new_role, skills)

    return {
        "new_role": new_role.model_dump(),
        "metrics": metrics.model_dump(),
        "gaps": [g.model_dump() for g in gaps],
        "roadmap": modules,
        "diff_summary": diff_summary,
        "agent_logs": [l.to_dict() for l in logs]
    }

# ---------------------------------------------------------------------------
# Gemini layer: status, audit trail, rubric grading, mentor narrative
# ---------------------------------------------------------------------------
@app.get("/api/ai/status", response_model=Dict[str, Any])
def ai_status() -> Dict[str, Any]:
    return ai.status()

@app.get("/api/ai/audit", response_model=Dict[str, Any])
def ai_audit() -> Dict[str, Any]:
    return {"calls": ai.audit_log()}

@app.post("/api/ai/grade-concept", response_model=Dict[str, Any])
def ai_grade_concept(req: ConceptRequest) -> Dict[str, Any]:
    return ai.grade_concept(
        skill=req.skill,
        question=req.question,
        answer=req.answer,
        claimed=req.claimed,
        required=req.required,
    )

@app.post("/api/ai/mentor", response_model=Dict[str, Any])
def ai_mentor(req: MentorRequest) -> Dict[str, Any]:
    text, source = ai.mentor_narrative(req.model_dump())
    return {"narrative": text, "source": source}

# ---------------------------------------------------------------------------
# Static File Hosting
# ---------------------------------------------------------------------------
if not STATIC_DIR.exists():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
def serve_index() -> Any:
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "SkillNexus-AI backend is running. Static assets loading..."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
