"""HTTP contract tests for the SkillNexus FastAPI application.

These tests deliberately use curated JavaScript questions and monkeypatch the
language-only mentor call. They validate the API contract without spending a
Gemini request or depending on network availability.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

import main


@pytest.fixture()
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def test_health_roles_and_learners(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "operational"
    assert len(health.json()["agents"]) == 6

    roles = client.get("/api/roles")
    learners = client.get("/api/learners")
    assert roles.status_code == 200
    assert len(roles.json()["roles"]) >= 6
    assert learners.status_code == 200
    assert any(item["id"] == "aarav-patel" for item in learners.json()["learners"])


def test_orchestration_returns_personalized_plan(client):
    response = client.post(
        "/api/orchestrate",
        json={"learner_id": "aarav-patel", "target_role_id": "full-stack-dev"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["learner"]["id"] == "aarav-patel"
    assert body["target_role"]["id"] == "full-stack-dev"
    assert body["metrics"]["verified_readiness"] >= 0
    assert body["gaps"]
    assert body["roadmap"]
    assert body["plan"]["hours_per_week"] == 8
    assert len(body["agent_logs"]) == 4


def test_assessment_and_adaptive_failure_replan(client, monkeypatch):
    assessment = client.get("/api/assessment/JavaScript?level=4")
    assert assessment.status_code == 200
    questions = assessment.json()["questions"]
    assert len(questions) == 3

    # Choose an index different from each curated answer so this is a real
    # failure-path contract test rather than an accidental pass.
    wrong_answers = [(question["correct_index"] + 1) % len(question["options"]) for question in questions]

    # Keep this contract test offline and deterministic.
    monkeypatch.setattr(main.ai, "mentor_narrative", lambda payload: ("Deterministic test narrative.", "test"))
    plan = client.post(
        "/api/orchestrate",
        json={"learner_id": "aarav-patel", "target_role_id": "full-stack-dev"},
    ).json()
    response = client.post(
        "/api/assessment/grade",
        json={
            "learner_id": "aarav-patel",
            "skill": "JavaScript",
            "answers": wrong_answers,
            "current_modules": plan["roadmap"],
            "target_role_id": "full-stack-dev",
            "level": 4,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["adaptive_replan"] is True
    assert body["diff_summary"]["action"] == "ADAPTIVE_REPLAN"
    assert body["updated_roadmap"][0]["is_remedial"] is True
    assert body["grade_result"]["passed"] is False


def test_goal_switch_rebuilds_matching_plan(client):
    response = client.post(
        "/api/switch-goal",
        json={"learner_id": "aarav-patel", "new_role_id": "ai-ml-engineer"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["new_role"]["id"] == "ai-ml-engineer"
    assert body["roadmap"]
    assert body["gaps"]
    assert body["diff_summary"]


def test_invalid_ids_are_rejected(client):
    response = client.post(
        "/api/orchestrate",
        json={"learner_id": "not-a-real-learner", "target_role_id": "full-stack-dev"},
    )
    assert response.status_code == 404
