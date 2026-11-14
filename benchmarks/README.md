# SkillNexus benchmark evidence

The benchmark below measures the deterministic API path locally with FastAPI's
`TestClient`. It is a reproducible smoke benchmark, not a production capacity
claim. Gemini calls are intentionally excluded because their latency depends on
network conditions and model service availability.

## Measured run

Environment: Windows, Python 3.14, local process, single client, warm process.
Command:

```bash
python -m pytest -q tests
```

Result: **9 passed** in approximately **5 seconds**, including endpoint and
adaptive-replan contract tests.

Covered paths:

| Path | What is measured |
| --- | --- |
| `/api/health` | Service and agent health response |
| `/api/roles` | Benchmark-role catalog load |
| `/api/learners` | Learner profile load |
| `/api/orchestrate` | Profile, gap, curriculum, and resource-agent pipeline |
| `/api/assessment/{skill}` | Curated diagnostic question resolution |
| `/api/assessment/grade` | Deterministic grading and adaptive re-plan |
| `/api/switch-goal` | Career-goal change and roadmap rebuild |

The test suite uses a monkeypatched mentor narrative for the failure-path
contract test, so it remains deterministic and does not consume Gemini quota.
