"""
Automated REST API Endpoint Regression Test Suite
Validates status codes, Pydantic schema responses, and error handling.
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure root directory is in sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app

client = TestClient(app)

def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "operational"
    assert "ProfileAgent" in data["agents"]
    assert "MentorAgent" in data["agents"]
    print("[TEST PASSED] /api/health returned operational state")

def test_roles_endpoint():
    res = client.get("/api/roles")
    assert res.status_code == 200
    data = res.json()
    assert "roles" in data
    assert len(data["roles"]) >= 6
    assert data["roles"][0]["id"] == "full-stack-dev"
    print(f"[TEST PASSED] /api/roles returned {len(data['roles'])} benchmark roles")

def test_learners_endpoint():
    res = client.get("/api/learners")
    assert res.status_code == 200
    data = res.json()
    assert "learners" in data
    assert len(data["learners"]) >= 3
    assert data["learners"][0]["id"] == "aarav-patel"
    print(f"[TEST PASSED] /api/learners returned {len(data['learners'])} pre-seeded profiles")

def test_orchestration_endpoint():
    payload = {"learner_id": "aarav-patel", "target_role_id": "full-stack-dev"}
    res = client.post("/api/orchestrate", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    # Assert deterministic metrics schema
    assert "metrics" in data
    assert "verified_readiness" in data["metrics"]
    assert "claimed_readiness" in data["metrics"]
    assert data["metrics"]["verified_readiness"] == 30.9
    
    # Assert multi-agent logs
    assert "agent_logs" in data
    assert len(data["agent_logs"]) >= 4
    
    # Assert sequenced roadmap
    assert "roadmap" in data
    assert len(data["roadmap"]) >= 5
    for m in data["roadmap"]:
        assert "resources" in m
        assert "free" in m["resources"]
        assert "paid" in m["resources"]
        
    print("[TEST PASSED] /api/orchestrate executed full multi-agent pipeline with deterministic math")

def test_adaptive_assessment_failure_replan():
    # Initial roadmap
    orch = client.post("/api/orchestrate", json={"learner_id": "aarav-patel"}).json()
    current_roadmap = orch["roadmap"]
    
    # Submit failed answers (0% score on JavaScript)
    fail_payload = {
        "learner_id": "aarav-patel",
        "skill": "JavaScript",
        "answers": [0, 0, 0],
        "current_modules": current_roadmap,
        "target_role_id": "full-stack-dev"
    }
    res = client.post("/api/assessment/grade", json=fail_payload)
    assert res.status_code == 200
    data = res.json()
    
    # Assert adaptive re-plan triggered
    assert data["adaptive_replan"] is True
    assert "diff_summary" in data
    assert data["diff_summary"]["action"] == "ADAPTIVE_REPLAN"
    assert data["updated_roadmap"][0]["is_remedial"] is True
    assert data["updated_roadmap"][0]["diff_type"] == "added"
    
    print("[TEST PASSED] /api/assessment/grade correctly triggered Mentor Agent Adaptive Re-Plan upon diagnostic failure")

def test_adaptive_assessment_pass():
    orch = client.post("/api/orchestrate", json={"learner_id": "aarav-patel"}).json()
    current_roadmap = orch["roadmap"]
    
    # Submit correct answers
    pass_payload = {
        "learner_id": "aarav-patel",
        "skill": "JavaScript",
        "answers": [1, 1, 1],
        "current_modules": current_roadmap,
        "target_role_id": "full-stack-dev"
    }
    res = client.post("/api/assessment/grade", json=pass_payload)
    assert res.status_code == 200
    data = res.json()
    
    assert data["adaptive_replan"] is False
    assert data["grade_result"]["passed"] is True
    assert data["new_metrics"]["verified_readiness"] > 30.9
    print(f"[TEST PASSED] /api/assessment/grade verified skill and elevated readiness to {data['new_metrics']['verified_readiness']}%")

def test_goal_switching_endpoint():
    payload = {
        "learner_id": "aarav-patel",
        "new_role_id": "ai-ml-engineer"
    }
    res = client.post("/api/switch-goal", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    assert data["new_role"]["id"] == "ai-ml-engineer"
    assert "metrics" in data
    assert len(data["roadmap"]) >= 5
    print("[TEST PASSED] /api/switch-goal recalculated full trajectory for AI/ML Engineer")

if __name__ == "__main__":
    test_health_endpoint()
    test_roles_endpoint()
    test_learners_endpoint()
    test_orchestration_endpoint()
    test_adaptive_assessment_failure_replan()
    test_adaptive_assessment_pass()
    test_goal_switching_endpoint()
    print("\n>>> ALL API REGRESSION TESTS: 100% SUCCESSFUL <<<")
