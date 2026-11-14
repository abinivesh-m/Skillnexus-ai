"""
SkillNexus-AI: Autonomous Multi-Agent Career & Skill Orchestration Platform
FastAPI Application Backend
"""

import os
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
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

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="SkillNexus-AI",
    description="Autonomous Multi-Agent Career & Skill Orchestration Platform with Deterministic Gap Analytics",
    version="1.0.0"
)

# ---------------------------------------------------------------------------
# Request & Response Schemas
# ---------------------------------------------------------------------------
class OrchestrateRequest(BaseModel):
    learner_id: str
    target_role_id: Optional[str] = None

class GradeAssessmentRequest(BaseModel):
    learner_id: str
    skill: str
    answers: List[int]
    current_modules: List[Dict[str, Any]]
    target_role_id: str

class GoalSwitchRequest(BaseModel):
    learner_id: str
    new_role_id: str
    current_skills: Optional[List[Dict[str, Any]]] = None

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health_check():
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
        "engine": "Deterministic Euclidean Metric + Adaptive Re-Plan"
    }

@app.get("/api/roles")
def get_roles():
    return {"roles": [r.dict() for r in load_roles()]}

@app.get("/api/learners")
def get_learners():
    return {"learners": load_learners()}

@app.post("/api/orchestrate")
def orchestrate_pipeline(req: OrchestrateRequest):
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

    return {
        "learner": learner,
        "target_role": role.dict(),
        "profile_audit": profile_data["audit_summary"],
        "metrics": metrics.dict(),
        "gaps": [g.dict() for g in gaps],
        "roadmap": modules_with_res,
        "agent_logs": logs
    }

@app.get("/api/assessment/{skill}")
def get_assessment(skill: str):
    assessor = AssessorAgent()
    return assessor.get_assessment(skill)

@app.post("/api/assessment/grade")
def grade_assessment(req: GradeAssessmentRequest):
    """
    Grades assessment, updates verified skill status, and triggers
    Adaptive Re-plan via MentorAgent if the learner struggles!
    """
    assessor = AssessorAgent()
    grade_result = assessor.grade_assessment(req.skill, req.answers)

    role = get_role_by_id(req.target_role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Target role not found")

    learner = get_learner_by_id(req.learner_id) or {"skills": []}
    learner_skills = learner.get("skills", [])

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

        return {
            "grade_result": grade_result,
            "adaptive_replan": True,
            "diff_summary": diff_summary,
            "updated_roadmap": new_modules,
            "agent_logs": logs
        }
    else:
        # Learner passed! Upgrade verified level
        for s in learner_skills:
            if s["skill"].lower() == req.skill.lower():
                s["verified_level"] = max(s.get("verified_level", 0), 3)
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

        diff_summary = {
            "action": "SKILL_VERIFIED",
            "trigger": f"Passed {req.skill} assessment with {grade_result['percentage']}%",
            "added_modules": [],
            "shifted_modules": [],
            "additional_hours": 0,
            "reason": f"Mastery validated. Verified level increased, raising overall readiness.",
            "mentor_narrative": f"🎉 Skill Verified! Demonstrated strong comprehension in {req.skill}. Overall readiness updated to {new_metrics.verified_readiness}%."
        }

        mentor_log = AgentHandoffLog(
            agent_name=mentor.name,
            target_agent="Learner UI",
            summary=f"Skill verified: {req.skill} · Readiness surged to {new_metrics.verified_readiness}%"
        )
        logs.append(mentor_log.to_dict())

        return {
            "grade_result": grade_result,
            "adaptive_replan": False,
            "diff_summary": diff_summary,
            "new_metrics": new_metrics.dict(),
            "updated_roadmap": updated_modules,
            "agent_logs": logs
        }

@app.post("/api/switch-goal")
def switch_goal(req: GoalSwitchRequest):
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
        "new_role": new_role.dict(),
        "metrics": metrics.dict(),
        "gaps": [g.dict() for g in gaps],
        "roadmap": modules,
        "diff_summary": diff_summary,
        "agent_logs": [l.to_dict() for l in logs]
    }

# ---------------------------------------------------------------------------
# Static File Hosting
# ---------------------------------------------------------------------------
if not STATIC_DIR.exists():
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "SkillNexus-AI backend is running. Static assets loading..."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
