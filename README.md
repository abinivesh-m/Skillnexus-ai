# SkillNexus-AI
### Verified skill gaps. Computed career paths. Adaptive learning plans.

Live application: **https://skillnexus-ai.vercel.app**

SkillNexus-AI is a multi-agent career-planning platform for identifying the difference between what a learner claims and what they can demonstrate. It audits a learner profile, benchmarks it against a target role, tests uncertain skills, and rewrites the learning path when evidence changes.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python)](https://python.org)
[![Multi-Agent Swarm](https://img.shields.io/badge/Architecture-6%20Specialized%20Agents-f59e0b?style=flat)]()
[![Deterministic Math](https://img.shields.io/badge/Readiness%20Engine-Weighted%20Verified%20Math-10b981?style=flat)]()
[![Repository Footprint](https://img.shields.io/badge/Repo%20Size-%3C%201%20MB-blue)]()
[![Production Status](https://img.shields.io/badge/Production-Live%20Deploy-06b6d4?logo=vercel)](https://skillnexus-ai.vercel.app)

---

## System Interface Preview

![SkillNexus Interactive Interface](docs/assets/dashboard_preview.svg)

---

## 1. Executive Summary & Problem Analysis

Organizations and higher-education institutions face a critical structural inefficiency: **traditional learning management systems (LMS) treat all learners homogenously**, presenting static course catalogs without accounting for baseline competencies, cognitive pacing, or specific industry role requirements.

Furthermore, **self-reported skill ratings on resumes and professional profiles are fundamentally unreliable**. Candidates routinely self-designate as "Advanced" or "Expert" in core competencies while failing to demonstrate working knowledge of fundamental principles during technical evaluation.

### The Solution: Claimed vs. Verified Knowledge Matrix
**SkillNexus-AI** decouples skill tracking into two distinct, rigorous vectors:
* **Claimed Level ($L_{\text{claimed}} \in [1, 5]$):** Self-reported capability from credentials, resumes, or profile declarations.
* **Verified Level ($L_{\text{verified}} \in [1, 5]$):** Empirically demonstrated capability, validated through diagnostic concept probes.

The arithmetic difference between these metrics constitutes the **Credibility Delta**. SkillNexus bridges this delta by deploying an autonomous collaborative swarm of **6 specialized AI agents** that dynamically structure, sequence, and adapt learning trajectories based on verified competence.

---

## 2. System Architecture & Data Pipeline

The system is architected across three decoupled tiers: an Ingestion & Ontology Layer, a Multi-Agent Swarm Engine, and a Reactive Presentation Layer.

![SkillNexus System Architecture](docs/assets/architecture.svg)

### Multi-Agent Lifecycle & Dynamic Feedback Loop

The platform employs a reactive event bus where specialized agents collaborate sequentially during baseline profiling, and cyclically during adaptive re-planning:

![Multi-Agent Lifecycle](docs/assets/agent_lifecycle.svg)

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as 👤 Candidate / Learner
    participant UI as 🖥️ Reactive Interface
    participant Profile as 🕵️ Profile Agent
    participant Gap as 🎯 Gap Agent
    participant Curr as 🗺️ Curriculum Agent
    participant Res as 📚 Resource Agent
    participant Assessor as 📝 Assessor Agent
    participant Mentor as 🧠 Mentor Agent (Adaptive Core)

    Candidate->>UI: Selects Profile (Aarav Patel · Target: Full Stack)
    UI->>Profile: Audit credentials & normalize skill schemas
    Profile-->>Gap: 8 skills audited (3 verified, 5 unverified/missing)
    Gap->>Gap: Compute weighted readiness metrics (30.9% fit)
    Gap-->>Curr: 5 prioritized gaps ranked by severity
    Curr->>Curr: Sequence DAG modules (Prerequisite constraints enforced)
    Curr-->>Res: 6 sequential sprints structured (118h total investment)
    Res->>Res: Attach 1 Free + 1 Paid authenticated resource per sprint
    Res-->>UI: Deliver initial personalized curriculum

    Note over Candidate,Mentor: ⚡ Dynamic Adaptive Feedback Loop
    Candidate->>UI: Completes Diagnostic Assessment
    UI->>Assessor: Grade concept responses
    Assessor-->>Mentor: Conceptual misconception detected (Score < 66%)
    Mentor->>Mentor: Compute AMBER DIFF: Injects Remedial Module & Defers Downstream Sprints
    Mentor-->>UI: Real-Time Active Graph Mutation (Visual Amber Diff)
```

---

## 3. Mathematical Foundations & Deterministic Scoring

To prevent hallucinations common in purely generative systems, all readiness scores and gap prioritizations are governed by **deterministic weighted mathematics**:

### Verified Readiness Formula
$$\text{Readiness}_{\text{verified}} = \left( \frac{\sum_{i=1}^{N} \min(L_{\text{verified}, i}, R_i) \times W_i}{\sum_{i=1}^{N} R_i \times W_i} \right) \times 100$$

### Claimed Readiness Formula
$$\text{Readiness}_{\text{claimed}} = \left( \frac{\sum_{i=1}^{N} \min(L_{\text{claimed}, i}, R_i) \times W_i}{\sum_{i=1}^{N} R_i \times W_i} \right) \times 100$$

### Credibility Delta
$$\Delta_{\text{credibility}} = \text{Readiness}_{\text{claimed}} - \text{Readiness}_{\text{verified}}$$

### Gap Severity Prioritization
Each identified competency gap is ranked descending by its weighted impact on enterprise employability:
$$\text{Severity Score}_i = (R_i - L_{\text{verified}, i}) \times W_i$$

*Where:*
* $L_{\text{verified}, i}$ = Verified proficiency level for skill $i$ ($0$ to $5$)
* $L_{\text{claimed}, i}$ = Self-reported proficiency level for skill $i$ ($0$ to $5$)
* $R_i$ = Enterprise benchmark requirement for skill $i$ ($1$ to $5$)
* $W_i$ = Industry critical weighting for skill $i$ ($1$ to $5$)

---

## 4. The 6 Collaborating Specialized Agents

The system leverages specialized agents, each constrained to a single domain of responsibility:

| Agent Name | Architectural Role | Responsibilities & Outputs |
| :--- | :--- | :--- |
| **🕵️ Profile Agent** | Schema Ingestion & Credential Audit | Normalizes non-standard skill taxonomies; extracts declared skills; separates verified credentials from self-claims. |
| **🎯 Gap Agent** | Mathematical Gap Analysis | Evaluates candidate proficiencies against benchmark role matrices; calculates deterministic readiness; sorts gaps by Severity Score. |
| **🗺️ Curriculum Agent** | Prerequisite DAG Sequencing | Traverses knowledge dependency graphs; constructs ordered modular sprints; allocates realistic cognitive hours. |
| **📚 Resource Agent** | Resource Catalog Binding | Attaches strictly validated learning materials (1 authoritative free documentation + 1 deep production course) with zero link hallucination. |
| **📝 Assessor Agent** | Conceptual Probing | Administers targeted diagnostic evaluations focused on architectural principles and common fallacies rather than rote syntax. |
| **🧠 Mentor Agent** | Dynamic Adaptive Engine | The reactive re-planning orchestrator; intervenes upon diagnostic failure or target role shift by calculating an **Amber Diff** and rewriting the active curriculum graph. |

---

## 5. Counterfactual "What-If" Simulation Engine

Unlike traditional static dashboards, SkillNexus implements a **counterfactual simulation model**:
* Next to each prioritized skill gap, users can activate a **"What If I Master This?"** toggle.
* The system recalculates the entire mathematical graph in real time:
  * Readiness score updates dynamically (e.g., **30.9% $\rightarrow$ 55.4%** upon simulating React mastery).
  * Time-to-hire estimates decrease accordingly (e.g., **18 Weeks $\rightarrow$ 12 Weeks**).
  * Prerequisite curriculum sprints are dynamically pruned from the active view.

---

## 6. Directory Structure & Engineering Standards

The codebase maintains strict modular separation between domain logic, multi-agent definitions, API endpoints, and static presentation assets:

```
Skillnexus-ai/
├── .gitignore                      # Strict VCS exclusion rules
├── README.md                       # Architectural specification & technical documentation
├── main.py                         # FastAPI orchestration backend & REST routing
├── domain.py                       # deterministic weighted mathematics & data models
├── agents.py                       # 6 specialized collaborating agents & event handoff bus
├── requirements.txt                # Lean runtime dependencies
├── vercel.json                     # Serverless production deployment configuration
├── data/
│   ├── learners.json               # Pre-seeded candidate profiles & credential histories
│   └── role_requirements.json      # Enterprise benchmark role ontologies (6 tracks)
├── docs/
│   └── assets/
│       ├── dashboard_preview.svg   # High-resolution interactive dashboard visual
│       ├── architecture.svg        # Decoupled 3-tier system architecture diagram
│       └── agent_lifecycle.svg     # Multi-agent collaboration & feedback loop diagram
├── static/
│   ├── index.html                  # Semantic, accessible reactive workspace structure
│   ├── style.css                   # Cybernetic dark-mode design system & amber diff styling
│   └── app.js                      # Persistent 3D interactive competency graph, simulation model & state
└── tests/
    └── test_domain_and_agents.py   # Unit & integration regression test suite
```

---

## 7. Automated Test Suite & Local Quickstart

### Prerequisites
* Python 3.10+
* Git

### Execution Steps
```bash
# 1. Clone the public repository
git clone https://github.com/abinivesh-m/Skillnexus-ai.git
cd Skillnexus-ai

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the automated test suite
python tests/test_domain_and_agents.py

# 4. Launch the local application server
python -m uvicorn main:app --port 8000
```
Access the application workspace at **[http://localhost:8000](http://localhost:8000)**.

---

## 8. Compliance & Technical Verification Matrix

| Requirement / Standard | Implementation Verification |
| :--- | :--- |
| **Public Repository** | Hosted publicly at `https://github.com/abinivesh-m/Skillnexus-ai` |
| **Branch Governance** | Single trunk-based development branch (`main`) only |
| **Lightweight Footprint** | Complete repository size is **0.20 MB** (Well below the 10 MB boundary) |
| **Agentic AI Collaboration** | 6 specialized agents communicating over an observable telemetry stream |
| **Dynamic Curriculum Adaptivity** | Real-time graph mutation with highlighted amber diffs upon assessment struggle |
| **Deterministic Reliability** | Zero LLM hallucination of readiness metrics or unauthenticated resource links |

---
*SkillNexus-AI — Autonomous Career & Skill Orchestration Engine.*


