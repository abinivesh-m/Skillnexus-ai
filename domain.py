"""
SkillNexus-AI Core Domain Logic
Implements deterministic skill gap analysis, readiness calculation, and data models.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

class SkillItem(BaseModel):
    skill: str
    claimed_level: int = Field(ge=0, le=5)
    verified_level: int = Field(ge=0, le=5)
    status: str = "unverified"  # verified, unverified, missing

class BenchmarkSkill(BaseModel):
    skill: str
    required_level: int = Field(ge=1, le=5)
    weight: int = Field(ge=1, le=5)
    category: str

class RoleRequirement(BaseModel):
    id: str
    title: str
    description: str
    benchmark_skills: List[BenchmarkSkill]

class SkillGap(BaseModel):
    skill: str
    category: str
    claimed_level: int
    verified_level: int
    required_level: int
    weight: int
    severity_score: int
    gap_type: str  # "Unverified Knowledge", "Critical Void", "Competence Deficit"
    explanation: str

class ReadinessMetrics(BaseModel):
    verified_readiness: float
    claimed_readiness: float
    credibility_delta: float
    total_benchmark_points: int
    earned_verified_points: int
    total_gaps_count: int
    critical_gaps_count: int

def load_roles() -> List[RoleRequirement]:
    file_path = DATA_DIR / "role_requirements.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [RoleRequirement(**r) for r in data["roles"]]

def get_role_by_id(role_id: str) -> Optional[RoleRequirement]:
    roles = load_roles()
    for role in roles:
        if role.id == role_id:
            return role
    return None

def load_learners() -> List[Dict[str, Any]]:
    file_path = DATA_DIR / "learners.json"
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["learners"]

def get_learner_by_id(learner_id: str) -> Optional[Dict[str, Any]]:
    learners = load_learners()
    for l in learners:
        if l["id"] == learner_id:
            return l
    return None

def compute_readiness_and_gaps(learner_skills: List[Dict[str, Any]], role: RoleRequirement) -> tuple[ReadinessMetrics, List[SkillGap]]:
    """
    DETERMINISTIC READINESS FORMULA:
    Readiness = ( Sum(min(verified_level, required_level) * weight) / Sum(required_level * weight) ) * 100
    
    Zero LLM hallucination: Pure verifiable arithmetic.
    """
    skill_map = {s["skill"].lower().strip(): s for s in learner_skills}

    total_req_points = 0
    earned_verified_points = 0
    earned_claimed_points = 0
    gaps: List[SkillGap] = []

    for bench in role.benchmark_skills:
        skill_name_lower = bench.skill.lower().strip()
        learner_skill = skill_map.get(skill_name_lower)

        claimed = learner_skill["claimed_level"] if learner_skill else 0
        verified = learner_skill["verified_level"] if learner_skill else 0

        req = bench.required_level
        weight = bench.weight

        total_req_points += req * weight
        earned_verified_points += min(verified, req) * weight
        earned_claimed_points += min(claimed, req) * weight

        # Evaluate Gap
        if verified < req:
            gap_diff = req - verified
            severity = gap_diff * weight
            
            if claimed > verified and verified == 0:
                gap_type = "Unverified Knowledge"
                desc = f"Learner self-claims Level {claimed}/5, but assessment shows 0 verified mastery. High risk of interview failure."
            elif verified == 0:
                gap_type = "Critical Void"
                desc = f"No prior foundation detected. Requires structured foundational ramp-up from ground zero."
            else:
                gap_type = "Competence Deficit"
                desc = f"Currently verified at Level {verified}/5. Lacks {req - verified} level(s) for enterprise production readiness."

            gaps.append(SkillGap(
                skill=bench.skill,
                category=bench.category,
                claimed_level=claimed,
                verified_level=verified,
                required_level=req,
                weight=weight,
                severity_score=severity,
                gap_type=gap_type,
                explanation=desc
            ))

    # Sort gaps descending by severity score
    gaps.sort(key=lambda g: g.severity_score, reverse=True)

    verified_readiness = round((earned_verified_points / total_req_points) * 100, 1) if total_req_points > 0 else 0.0
    claimed_readiness = round((earned_claimed_points / total_req_points) * 100, 1) if total_req_points > 0 else 0.0
    credibility_delta = round(claimed_readiness - verified_readiness, 1)

    critical_gaps = sum(1 for g in gaps if g.severity_score >= 12 or g.verified_level == 0)

    metrics = ReadinessMetrics(
        verified_readiness=verified_readiness,
        claimed_readiness=claimed_readiness,
        credibility_delta=credibility_delta,
        total_benchmark_points=total_req_points,
        earned_verified_points=earned_verified_points,
        total_gaps_count=len(gaps),
        critical_gaps_count=critical_gaps
    )

    return metrics, gaps
