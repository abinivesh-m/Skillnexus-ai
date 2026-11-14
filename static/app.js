/**
 * SkillNexus-AI: Client-side Orchestrator & 3D Interactive Controller
 */

let state = {
  activeLearnerId: "aarav-patel",
  activeRoleId: "full-stack-dev",
  roles: [],
  learners: [],
  currentPipelineData: null,
  activeQuizSkill: "JavaScript",
  activeQuizData: null,
  pitchStepIndex: 0
};

const PITCH_CUES = [
  "1. 'Students don't know what they're missing, and legacy platforms dump the exact same course on everyone.' (10s)",
  "2. 'We select Aarav Patel aiming for Full Stack. 4 agents execute in real time. Readiness is 33.6%, despite him claiming 52%.' (20s)",
  "3. 'Point to React and Node.js: Weight 5, verified level 0. These are critical void gaps blocking interview success.' (10s)",
  "4. 'Now we take a live diagnostic on JavaScript. Click Simulate Weakness: Learner fails event loop mechanics.' (25s)",
  "5. 'Watch the Mentor Agent immediately inject a 12h Remedial Scope Sprint and delay React. That is true adaptivity.' (15s)",
  "6. 'Readiness is calculated using deterministic Euclidean math, never LLM hallucinations. Ready for any role.' (10s)"
];

// -----------------------------------------------------------------------------
// Bootstrapping
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  setup3DTilt();
  await loadMetadata();
  await runOrchestration(state.activeLearnerId, state.activeRoleId);
});

async function loadMetadata() {
  try {
    const [rolesRes, learnersRes] = await Promise.all([
      fetch("/api/roles"),
      fetch("/api/learners")
    ]);
    const rolesData = await rolesRes.json();
    const learnersData = await learnersRes.json();

    state.roles = rolesData.roles;
    state.learners = learnersData.learners;

    populateRoleDropdown();
  } catch (err) {
    console.error("Failed to load metadata:", err);
  }
}

function populateRoleDropdown() {
  const select = document.getElementById("roleSelect");
  select.innerHTML = state.roles.map(r => 
    `<option value="${r.id}" ${r.id === state.activeRoleId ? "selected" : ""}>${r.title}</option>`
  ).join("");
}

// -----------------------------------------------------------------------------
// Multi-Agent Pipeline Execution
// -----------------------------------------------------------------------------
async function runOrchestration(learnerId, roleId) {
  setAgentChipActive("ProfileAgent");
  updateTicker("Profile Agent parsing candidate profile and auditing verified credentials...");

  try {
    const res = await fetch("/api/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learner_id: learnerId, target_role_id: roleId })
    });
    const data = await res.json();
    state.currentPipelineData = data;

    // Simulate visible agent handoffs
    await streamAgentHandoffs(data.agent_logs);

    // Render workspace
    renderLearnerProfile(data.learner, data.profile_audit);
    renderSkillMatrix(data.learner.skills);
    renderDiagnostics(data.metrics, data.gaps);
    renderRoadmap(data.roadmap);

  } catch (err) {
    console.error("Orchestration error:", err);
    updateTicker("Error in pipeline orchestration. Running with cached memory.");
  }
}

async function streamAgentHandoffs(logs) {
  for (const log of logs) {
    setAgentChipActive(log.agent_name.replace(" ", ""));
    updateTicker(`${log.agent_name} → ${log.target_agent} · ${log.summary}`);
    await new Promise(r => setTimeout(r, 260));
  }
  setAgentChipActive("MentorAgent");
}

function setAgentChipActive(agentId) {
  document.querySelectorAll(".agent-chip").forEach(el => el.classList.remove("active"));
  const chip = document.getElementById(`chip-${agentId}`);
  if (chip) chip.classList.add("active");
}

function updateTicker(msg) {
  const tickerEl = document.getElementById("tickerMessage");
  if (tickerEl) tickerEl.textContent = msg;
}

// -----------------------------------------------------------------------------
// Rendering UI Components
// -----------------------------------------------------------------------------
function renderLearnerProfile(learner, audit) {
  document.getElementById("learnerName").textContent = learner.name;
  document.getElementById("learnerHeadline").textContent = learner.headline;
  document.getElementById("learnerAvatar").src = learner.avatar;
  
  if (audit) {
    document.getElementById("auditSummaryBadge").textContent = 
      `${audit.verified_count}/${audit.total_skills} Verified`;
  }
}

function renderSkillMatrix(skills) {
  const listEl = document.getElementById("skillMatrixList");
  listEl.innerHTML = skills.map(s => {
    const isVerified = s.verified_level > 0;
    const isUnverified = s.claimed_level > 0 && s.verified_level === 0;
    const isMissing = s.claimed_level === 0 && s.verified_level === 0;

    const verifiedBadge = isVerified 
      ? `<span class="badge-level badge-verified">Lvl ${s.verified_level} Verified</span>`
      : isUnverified
      ? `<span class="badge-level badge-unverified">Lvl 0 (Unverified)</span>`
      : `<span class="badge-level badge-claimed">Missing</span>`;

    return `
      <div class="skill-row">
        <div>
          <span class="skill-name">${s.skill}</span>
        </div>
        <div class="level-badges">
          <span class="badge-level badge-claimed" title="Self-Reported Claim">Claimed: ${s.claimed_level}/5</span>
          ${verifiedBadge}
        </div>
      </div>
    `;
  }).join("");
}

function renderDiagnostics(metrics, gaps) {
  // SVG Ring
  const circle = document.getElementById("readinessRing");
  const circumference = 339.29; // 2 * PI * 54
  const offset = circumference - (metrics.verified_readiness / 100) * circumference;
  circle.style.strokeDashoffset = offset;

  document.getElementById("readinessScore").textContent = `${metrics.verified_readiness}%`;
  document.getElementById("claimedScore").textContent = `${metrics.claimed_readiness}%`;
  document.getElementById("credibilityDelta").textContent = `-${metrics.credibility_delta}%`;

  // Gap stack
  const gapStack = document.getElementById("gapStack");
  document.getElementById("gapCount").textContent = `${gaps.length} prioritize-ranked`;

  gapStack.innerHTML = gaps.map(g => {
    const isCritical = g.severity_score >= 12 || g.verified_level === 0;
    return `
      <div class="gap-card ${isCritical ? 'critical' : ''}">
        <div class="gap-card-top">
          <span class="gap-card-title">${g.skill}</span>
          <span class="gap-severity-chip ${isCritical ? 'critical' : ''}">Weight ${g.weight} · Severity ${g.severity_score}</span>
        </div>
        <p class="gap-desc">${g.explanation}</p>
      </div>
    `;
  }).join("");
}

function renderRoadmap(modules) {
  const container = document.getElementById("roadmapTimeline");
  container.innerHTML = modules.map((m, idx) => {
    const isRemedial = m.is_remedial || m.diff_type === "added";
    const isDelayed = m.diff_type === "delayed";
    const isMastered = m.status === "completed" || m.diff_type === "mastered";

    const bannerTag = isRemedial 
      ? `<span style="font-family: var(--font-mono); font-size: 0.68rem; background: var(--accent-amber-light); color: var(--accent-amber); padding: 0.15rem 0.4rem; border-radius: 3px; font-weight: 700; margin-left: 0.5rem;">⚡ Injected by Mentor Agent</span>`
      : isDelayed
      ? `<span style="font-family: var(--font-mono); font-size: 0.68rem; background: var(--bg-muted); color: var(--text-muted); padding: 0.15rem 0.4rem; border-radius: 3px; margin-left: 0.5rem;">⏳ Deferred</span>`
      : "";

    return `
      <div class="roadmap-card ${isRemedial ? 'remedial' : ''} ${isMastered ? 'completed' : ''}">
        <div class="roadmap-header">
          <div style="display: flex; align-items: center;">
            <span class="module-step">Sprint ${m.order} · ${m.stage}</span>
            ${bannerTag}
          </div>
          <span class="module-hours">${m.hours} Hours</span>
        </div>

        <h4 class="module-title">${m.title}</h4>
        <div class="module-prereq">Prerequisite: <em>${m.prerequisite}</em></div>

        <div style="margin-bottom: 0.5rem;">
          <ul style="padding-left: 1.1rem; font-size: 0.78rem; color: var(--text-secondary);">
            ${m.outcomes.map(o => `<li>${o}</li>`).join("")}
          </ul>
        </div>

        <div class="resource-pair">
          <a href="${m.resources.free.url}" target="_blank" rel="noopener noreferrer" class="resource-link">
            <span class="resource-type">Free Resource (${m.resources.free.provider})</span>
            <strong>${m.resources.free.title}</strong>
          </a>
          <a href="${m.resources.paid.url}" target="_blank" rel="noopener noreferrer" class="resource-link">
            <span class="resource-type">Deep Dive (${m.resources.paid.provider})</span>
            <strong>${m.resources.paid.title}</strong>
          </a>
        </div>
      </div>
    `;
  }).join("");
}

// -----------------------------------------------------------------------------
// Interactive Events & Adaptive Actions
// -----------------------------------------------------------------------------
function loadLearnerPreset(learnerId) {
  state.activeLearnerId = learnerId;
  document.getElementById("learnerSelect").value = learnerId;
  const l = state.learners.find(x => x.id === learnerId);
  if (l) {
    state.activeRoleId = l.target_role_id;
    document.getElementById("roleSelect").value = l.target_role_id;
  }
  document.getElementById("diffBanner").style.display = "none";
  runOrchestration(learnerId, state.activeRoleId);
}

function onLearnerChange(learnerId) {
  loadLearnerPreset(learnerId);
}

async function onRoleChange(newRoleId) {
  state.activeRoleId = newRoleId;
  updateTicker(`Switching target track to ${newRoleId}... Re-evaluating Euclidean gaps.`);
  
  try {
    const res = await fetch("/api/switch-goal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        learner_id: state.activeLearnerId,
        new_role_id: newRoleId
      })
    });
    const data = await res.json();
    
    // Show diff banner
    const banner = document.getElementById("diffBanner");
    banner.style.display = "flex";
    document.getElementById("diffTitle").textContent = "Career Goal Re-Routing Executed";
    document.getElementById("diffNarrative").textContent = data.diff_summary.mentor_narrative;

    renderDiagnostics(data.metrics, data.gaps);
    renderRoadmap(data.roadmap);
    await streamAgentHandoffs(data.agent_logs);
  } catch (err) {
    console.error("Goal switch error:", err);
  }
}

function quickSwitchGoal(roleId) {
  document.getElementById("roleSelect").value = roleId;
  onRoleChange(roleId);
}

// -----------------------------------------------------------------------------
// Assessment Modal & Failure -> Adaptive Re-plan
// -----------------------------------------------------------------------------
async function openAssessmentModal(skill) {
  state.activeQuizSkill = skill;
  document.getElementById("modalSkillName").textContent = skill;
  const modal = document.getElementById("assessmentModal");
  modal.classList.add("open");

  try {
    const res = await fetch(`/api/assessment/${skill}`);
    const data = await res.json();
    state.activeQuizData = data;

    const container = document.getElementById("quizQuestionsContainer");
    container.innerHTML = data.questions.map((q, qIdx) => `
      <div class="question-block">
        <p class="question-text">${qIdx + 1}. ${q.question}</p>
        <div class="options-stack">
          ${q.options.map((opt, optIdx) => `
            <label class="option-label">
              <input type="radio" name="question_${qIdx}" value="${optIdx}">
              <span>${opt}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error fetching assessment:", err);
  }
}

function closeAssessmentModal() {
  document.getElementById("assessmentModal").classList.remove("open");
}

async function submitAssessmentAnswers() {
  if (!state.activeQuizData) return;

  const answers = state.activeQuizData.questions.map((_, idx) => {
    const selected = document.querySelector(`input[name="question_${idx}"]:checked`);
    return selected ? parseInt(selected.value) : -1;
  });

  await executeAssessmentGrading(answers);
}

async function simulateFailedAssessment() {
  // Pre-select incorrect answers to trigger the adaptive diff
  const failedAnswers = [0, 0, 0]; // Purposely wrong for JavaScript questions
  await executeAssessmentGrading(failedAnswers);
}

async function executeAssessmentGrading(answers) {
  closeAssessmentModal();
  updateTicker("Assessor Agent grading responses... Transmitting to Mentor Agent.");

  try {
    const res = await fetch("/api/assessment/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        learner_id: state.activeLearnerId,
        skill: state.activeQuizSkill,
        answers: answers,
        current_modules: state.currentPipelineData.roadmap,
        target_role_id: state.activeRoleId
      })
    });
    const data = await res.json();

    // Trigger visual diff banner
    const banner = document.getElementById("diffBanner");
    banner.style.display = "flex";
    document.getElementById("diffTitle").textContent = data.diff_summary.trigger;
    document.getElementById("diffNarrative").textContent = data.diff_summary.mentor_narrative;

    // Re-render roadmap with amber highlighted remedial sprint!
    renderRoadmap(data.updated_roadmap);
    state.currentPipelineData.roadmap = data.updated_roadmap;

    if (data.new_metrics) {
      document.getElementById("readinessScore").textContent = `${data.new_metrics.verified_readiness}%`;
    }

    await streamAgentHandoffs(data.agent_logs);

    // Scroll smoothly to roadmap diff
    document.getElementById("colRoadmap").scrollIntoView({ behavior: "smooth", block: "start" });

  } catch (err) {
    console.error("Grading failed:", err);
  }
}

// -----------------------------------------------------------------------------
// 90-Second Pitch Teleprompter
// -----------------------------------------------------------------------------
function nextPitchStep() {
  state.pitchStepIndex = (state.pitchStepIndex + 1) % PITCH_CUES.length;
  document.getElementById("scriptStep").textContent = PITCH_CUES[state.pitchStepIndex];
}

// -----------------------------------------------------------------------------
// 3D Card Tilt Interaction
// -----------------------------------------------------------------------------
function setup3DTilt() {
  const cards = document.querySelectorAll(".card-3d");
  cards.forEach(card => {
    card.addEventListener("mousemove", e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * -4;
      const rotateY = ((x - centerX) / centerX) * 4;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)";
    });
  });
}
