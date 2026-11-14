/**
 * SkillNexus — client engine.
 *
 * Three rules this file follows:
 *   1. Every number on screen is computed, never generated.
 *   2. The AI layer only writes language; it never invents a score.
 *   3. Nothing can leave the page in a broken state: every fetch has a fallback.
 */

const HOURS_PER_WEEK = 8;

const state = {
  activeLearnerId: "aarav-patel",
  activeRoleId: "full-stack-dev",
  roles: [],
  learners: [],
  pipelineData: null,
  simulatedSkills: new Set(),
  activeQuizSkill: "JavaScript",
  activeQuizData: null,
  lastGrade: null,
  tourPlaying: false,
  ai: { enabled: false, model: "gemini-3.5-flash-lite", calls: 0 },
};

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[\u0026<>\u0022\u0027]/g, (c) =>
    ({ "\u0026": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", "\u0022": "\u0026quot;", "\u0027": "\u0026#39;" }[c]));

const fmt = (n, d = 1) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(d);
};

// ── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  initSkillGraph();
  initProjection();
  bindModalDismissal();

  await loadAIStatus();
  await loadMetadata();
  await runOrchestration(state.activeLearnerId, state.activeRoleId);

  setInterval(loadAIStatus, 45000);

  // If a judge does nothing for 3.5s, the signature moment plays itself.
  setTimeout(() => {
    if (!state.tourPlaying && state.simulatedSkills.size === 0) play10SecondTour();
  }, 3500);
});

async function loadAIStatus() {
  try {
    const res = await fetch("/api/ai/status");
    const data = await res.json();
    state.ai = data;
    const dot = $("aiDot");
    const text = $("aiStatusText");
    if (data.enabled) {
      dot.className = "dot dot-live";
      text.textContent = "gemini online";
    } else {
      dot.className = "dot dot-fallback";
      text.textContent = "deterministic mode";
    }
    $("footModel").textContent = data.model || "gemini";
    updateCallCount();
  } catch {
    $("aiDot").className = "dot dot-fallback";
    $("aiStatusText").textContent = "offline";
  }
}

function updateCallCount() {
  const n = Math.max(0, Number(state.ai.calls) || 0);
  $("footCalls").textContent = n === 0 ? "no AI calls yet" : `${n} AI call${n === 1 ? "" : "s"}`;
}

async function loadMetadata() {
  try {
    const [rolesRes, learnersRes] = await Promise.all([fetch("/api/roles"), fetch("/api/learners")]);
    const rolesData = await rolesRes.json();
    const learnersData = await learnersRes.json();
    state.roles = rolesData.roles || [];
    state.learners = learnersData.learners || [];

    $("roleSelect").innerHTML = state.roles
      .map((r) => `<option value="${esc(r.id)}" ${r.id === state.activeRoleId ? "selected" : ""}>${esc(r.title)}</option>`)
      .join("");
  } catch (err) {
    console.error("metadata failed", err);
  }
}

// ── Orchestration ───────────────────────────────────────────────────────────
async function runOrchestration(learnerId, roleId) {
  setAgent("ProfileAgent");
  ticker("Profile agent auditing credentials, separating claims from evidence.");

  try {
    const res = await fetch("/api/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learner_id: learnerId, target_role_id: roleId }),
    });
    if (!res.ok) throw new Error(`orchestrate ${res.status}`);
    const data = await res.json();

    state.pipelineData = data;
    state.simulatedSkills.clear();
    $("diffBanner").style.display = "none";

    await streamHandoffs(data.agent_logs || []);

    renderProfile(data.learner, data.profile_audit);
    renderMatrix();
    renderHUD();
    renderGaps();
    renderRoadmap(data.roadmap);
    rebuildSkillGraph();
    drawProjection();
  } catch (err) {
    console.error("orchestration failed", err);
    ticker("Engine unreachable. Reload the page to retry.");
  }
}

async function streamHandoffs(logs) {
  for (const log of logs) {
    const id = String(log.agent_name || "").replace(/\s+/g, "");
    setAgent(id);
    ticker(`${log.agent_name} to ${log.target_agent} · ${log.summary}`);
    await wait(190);
  }
  setAgent("MentorAgent");
}

function setAgent(agentId) {
  document.querySelectorAll(".agent-chip").forEach((el) => el.classList.remove("active"));
  const chip = $(`chip-${agentId}`);
  if (chip) chip.classList.add("active");
}

function ticker(msg) {
  const el = $("tickerMessage");
  if (el) el.textContent = msg;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Renderers ───────────────────────────────────────────────────────────────
function renderProfile(learner, audit) {
  $("learnerName").textContent = learner.name;
  $("learnerHeadline").textContent = learner.headline || "";
  $("learnerAvatar").src = learner.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=learner";
  if (audit) $("auditSummaryBadge").textContent = `${audit.verified_count}/${audit.total_skills} verified`;
  if (state.pipelineData?.target_role) $("readoutTarget").textContent = state.pipelineData.target_role.title;
}

function learnerSkill(name) {
  const skills = state.pipelineData?.learner?.skills || [];
  return skills.find((s) => s.skill.toLowerCase() === String(name).toLowerCase()) || null;
}

function renderMatrix() {
  const skills = state.pipelineData?.learner?.skills || [];
  $("skillMatrixList").innerHTML = skills
    .map((s) => {
      const simulated = state.simulatedSkills.has(s.skill);
      const verified = simulated ? Math.max(s.verified_level, 4) : s.verified_level;
      const verifiedTag =
        verified > 0
          ? `<span class="badge-pill badge-verified">${verified}/5 verified</span>`
          : `<span class="badge-pill badge-unverified">0 verified</span>`;
      return `
        <div class="skill-row">
          <div><span>${esc(s.skill)}</span></div>
          <div style="display:flex;gap:4px;align-items:center">
            <span class="badge-pill badge-claimed">${s.claimed_level}/5 claimed</span>
            ${verifiedTag}
          </div>
        </div>`;
    })
    .join("");
}

function currentReadiness() {
  if (!state.pipelineData) return { verified: 0, claimed: 0, delta: 0 };
  const role = state.pipelineData.target_role;
  let total = 0;
  let earnedVerified = 0;
  let earnedClaimed = 0;

  for (const bench of role.benchmark_skills) {
    const skill = learnerSkill(bench.skill);
    let verified = skill ? skill.verified_level : 0;
    const claimed = skill ? skill.claimed_level : 0;
    if (state.simulatedSkills.has(bench.skill)) verified = Math.max(verified, bench.required_level);

    total += bench.required_level * bench.weight;
    earnedVerified += Math.min(verified, bench.required_level) * bench.weight;
    earnedClaimed += Math.min(claimed, bench.required_level) * bench.weight;
  }

  const verified = total ? Math.round((earnedVerified / total) * 1000) / 10 : 0;
  const claimed = total ? Math.round((earnedClaimed / total) * 1000) / 10 : 0;
  return { verified, claimed, delta: Math.round((claimed - verified) * 10) / 10 };
}

function uncertaintyBand() {
  const skills = state.pipelineData?.learner?.skills || [];
  const verified = skills.filter((s) => s.verified_level > 0).length;
  const totalRole = state.pipelineData?.target_role?.benchmark_skills?.length || 1;
  const unverified = Math.max(0, totalRole - verified);
  return Math.max(2, Math.min(15, Math.round(3 + (12 * unverified) / totalRole)));
}

function planHours() {
  return (state.pipelineData?.roadmap || []).reduce((sum, m) => sum + (Number(m.hours) || 0), 0);
}

function prunedHours() {
  return (state.pipelineData?.roadmap || [])
    .filter((m) => state.simulatedSkills.has(m.skill))
    .reduce((sum, m) => sum + (Number(m.hours) || 0), 0);
}

function weeksFor(hours) {
  return Math.max(1, Math.ceil(hours / HOURS_PER_WEEK));
}

function renderHUD() {
  const { verified, claimed, delta } = currentReadiness();
  const totalHours = planHours();
  const weeks = weeksFor(totalHours - prunedHours());

  animateNumber("hudVerifiedScore", verified, 1);
  $("hudVerifiedFill").style.width = `${Math.max(2, verified)}%`;
  $("hudClaimedScore").textContent = `${fmt(claimed)}%`;
  $("hudDeltaScore").textContent = `${delta > 0 ? "+" : ""}${fmt(delta)}%`;
  $("hudTimeEst").textContent = `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  $("planWeeksNote").textContent = `at ${HOURS_PER_WEEK} hrs/week`;
  $("uncertaintyVal").textContent = `±${uncertaintyBand()}`;

  const saved = weeksFor(totalHours) - weeks;
  const tag = $("hudSavingsTag");
  if (saved > 0) {
    tag.style.display = "inline-block";
    tag.textContent = `${saved} ${saved === 1 ? "week" : "weeks"} saved`;
  } else {
    tag.style.display = "none";
  }

  const btn = document.querySelector("[data-whatif]");
  if (btn) {
    const on = state.simulatedSkills.has("React");
    btn.textContent = on ? "React mastery simulated" : "What if I learn React?";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function renderGaps() {
  const gaps = state.pipelineData?.gaps || [];
  $("gapCountBadge").textContent = `${gaps.length} open`;

  $("gapSimulationStack").innerHTML = gaps
    .map((g) => {
      const on = state.simulatedSkills.has(g.skill);
      return `
        <div class="gap-card-sim ${on ? "simulated-mastered" : ""}">
          <div class="gap-card-top">
            <span class="gap-name">${esc(g.skill)}</span>
            <button class="toggle-whatif ${on ? "active" : ""}" onclick="toggleSimulateSkill('${esc(g.skill).replace(/'/g, "\\'")}')">
              ${on ? "mastered" : "what if?"}
            </button>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <span class="badge-pill badge-claimed">weight ${g.weight}</span>
            <span class="badge-pill badge-unverified">severity ${g.severity_score}</span>
            <span class="badge-pill badge-unverified">${esc(g.gap_type)}</span>
          </div>
          <p class="gap-explanation">${esc(g.explanation)}</p>
        </div>`;
    })
    .join("");
}

function renderRoadmap(modules) {
  const list = modules || [];
  $("roadmapTimeline").innerHTML = list
    .map((m) => {
      const remedial = m.is_remedial || m.diff_type === "added";
      const vanished = state.simulatedSkills.has(m.skill);
      const badge = remedial
        ? `<span class="badge-pill badge-claimed" style="margin-left:6px">injected</span>`
        : vanished
        ? `<span class="badge-pill badge-verified" style="margin-left:6px">pruned</span>`
        : "";

      return `
        <div class="roadmap-card ${remedial ? "remedial" : ""} ${vanished ? "vanished" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span style="font-family:var(--mono);font-size:9.5px;letter-spacing:0.08em;text-transform:uppercase;color:var(--faint)">
              ${esc(m.stage || "sprint")} ${m.order}${badge}
            </span>
            <span style="font-family:var(--mono);font-size:10px;color:var(--muted)">${m.hours}h</span>
          </div>
          <h4>${esc(m.title)}</h4>
          <div style="font-size:11px;color:var(--faint)">after <em style="color:var(--muted);font-style:normal">${esc(m.prerequisite || "—")}</em></div>
          <div class="resource-pair">
            <a class="resource-link" href="${esc(m.resources?.free?.url || "#")}" target="_blank" rel="noopener noreferrer">
              <span style="color:var(--signal)">free · ${esc(m.resources?.free?.provider || "")}</span>
              <strong>${esc(m.resources?.free?.title || "Documentation")}</strong>
            </a>
            <a class="resource-link" href="${esc(m.resources?.paid?.url || "#")}" target="_blank" rel="noopener noreferrer">
              <span style="color:var(--teal)">deep · ${esc(m.resources?.paid?.provider || "")}</span>
              <strong>${esc(m.resources?.paid?.title || "Course")}</strong>
            </a>
          </div>
        </div>`;
    })
    .join("");
}

function showDiff(diff, fromAI) {
  const banner = $("diffBanner");
  banner.style.display = "block";
  $("diffTitle").textContent = diff.trigger || "Adaptive re-plan applied";
  $("diffNarrative").textContent = diff.mentor_narrative || diff.reason || "";
  $("diffSource").textContent = diff.narrative_source === "gemini" ? "written by gemini" : "deterministic";
}

// ── What-if simulation ──────────────────────────────────────────────────────
function toggleSimulateSkill(skill) {
  if (state.simulatedSkills.has(skill)) {
    state.simulatedSkills.delete(skill);
    ticker(`Simulation cleared for ${skill}. Baseline restored.`);
  } else {
    state.simulatedSkills.add(skill);
    ticker(`Hypothetical mastery applied: ${skill}. Readiness and schedule recalculated.`);
    pulseNode(skill);
  }
  renderHUD();
  renderGaps();
  renderRoadmap(state.pipelineData?.roadmap || []);
  renderMatrix();
  rebuildSkillGraph();
  drawProjection();
}

function resetSimulations() {
  state.simulatedSkills.clear();
  renderHUD();
  renderGaps();
  renderRoadmap(state.pipelineData?.roadmap || []);
  renderMatrix();
  rebuildSkillGraph();
  drawProjection();
  ticker("All simulations cleared. Baseline restored.");
}

// ── Explain this number ─────────────────────────────────────────────────────
function openExplainModal() {
  if (!state.pipelineData) return;
  const role = state.pipelineData.target_role;
  const rows = [];
  let earnedSum = 0;
  let totalSum = 0;

  for (const bench of role.benchmark_skills) {
    const skill = learnerSkill(bench.skill);
    let verified = skill ? skill.verified_level : 0;
    if (state.simulatedSkills.has(bench.skill)) verified = Math.max(verified, bench.required_level);
    const capped = Math.min(verified, bench.required_level);
    const points = capped * bench.weight;
    const possible = bench.required_level * bench.weight;
    earnedSum += points;
    totalSum += possible;
    rows.push(`
      <tr>
        <td>${esc(bench.skill)}</td>
        <td class="num">${verified}</td>
        <td class="num">${bench.required_level}</td>
        <td class="num">${bench.weight}</td>
        <td class="num">${capped} × ${bench.weight} = ${points}</td>
        <td class="num">${possible}</td>
      </tr>`);
  }

  const readiness = totalSum ? ((earnedSum / totalSum) * 100).toFixed(1) : "0.0";
  const simulated = state.simulatedSkills.size
    ? ` Includes ${[...state.simulatedSkills].join(", ")} at full requirement.`
    : "";

  $("explainBody").innerHTML = `
    <table class="calc-table">
      <thead>
        <tr>
          <th>Skill</th><th style="text-align:right">Verified</th><th style="text-align:right">Required</th>
          <th style="text-align:right">Weight</th><th style="text-align:right">Points earned</th>
          <th style="text-align:right">Max</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <div class="calc-sum">
      readiness = ${earnedSum} ÷ ${totalSum} × 100 = <b>${readiness}%</b><br>
      band = ±${uncertaintyBand()}% (narrows as more skills are verified)<br>
      schedule = ${planHours() - prunedHours()} planned hours ÷ ${HOURS_PER_WEEK} hrs/week = ${weeksFor(
    planHours() - prunedHours()
  )} weeks${simulated}
    </div>
    <p style="font-size:11.5px;color:var(--faint);margin-top:12px;line-height:1.6">
      Verified level comes from a diagnostic check-in, never from the learner's own rating.
      A model is used to write questions and prose, but it never touches this arithmetic.
    </p>`;
  $("explainModal").classList.add("open");
  document.body.style.overflow = "hidden";

  const container = $("explainModal").querySelector(".modal-body") || $("explainModal").firstElementChild;
  if (container) {
    container.style.opacity = "0";
    container.style.transform = "translateY(8px)";
    requestAnimationFrame(() => {
      container.style.transition = "opacity 0.18s ease, transform 0.18s ease";
      container.style.opacity = "1";
      container.style.transform = "translateY(0)";
    });
  }
}

function closeExplainModal() {
  $("explainModal").classList.remove("open");
  document.body.style.overflow = "";
}

// ── Modal plumbing ──────────────────────────────────────────────────────────
function bindModalDismissal() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("mousedown", (e) => {
      if (e.target === modal) closeAnyModal(modal);
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal.open").forEach(closeAnyModal);
  });
}

function closeAnyModal(modal) {
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

// ── Assessment ──────────────────────────────────────────────────────────────
async function openAssessmentModal(skill) {
  state.activeQuizSkill = skill;
  $("modalSkillName").textContent = skill;
  $("quizSourceNote").textContent = "Three questions. Passing raises your verified level.";
  $("quizQuestionsContainer").innerHTML = `<p style="color:var(--faint);font-size:12px">Assessor agent preparing questions…</p>`;
  $("rubricResult").innerHTML = "";
  $("conceptInput").value = "";
  $("conceptQuestion").textContent = `Explain how you would use ${skill} in a real project, and one failure mode you would guard against.`;

  const modal = $("assessmentModal");
  modal.classList.add("open");
  document.body.style.overflow = "hidden";

  // Small entrance stagger for modal content
  const container = modal.querySelector(".modal-body");
  if (container) {
    container.style.opacity = "0";
    container.style.transform = "translateY(8px)";
    requestAnimationFrame(() => {
      container.style.transition = "opacity 0.18s ease, transform 0.18s ease";
      container.style.opacity = "1";
      container.style.transform = "translateY(0)";
    });
  }

  const gap = (state.pipelineData?.gaps || []).find((g) => g.skill === skill);
  const level = gap ? gap.required_level : 3;

  try {
    const res = await fetch(`/api/assessment/${encodeURIComponent(skill)}?level=${level}`);
    const data = await res.json();
    state.activeQuizData = data;

    if (data.source?.startsWith("gemini")) {
      $("quizSourceNote").textContent = `Questions generated for this skill by Gemini · ${data.total_questions} probes.`;
    } else if (data.source === "curated") {
      $("quizSourceNote").textContent = "Curated expert bank · three concept probes.";
    } else {
      $("quizSourceNote").textContent = "AI offline · general engineering probe. Passing still verifies the skill.";
    }

    $("quizQuestionsContainer").innerHTML = (data.questions || [])
      .map(
        (q, qi) => `
        <div class="q-block" data-q="${qi}">
          <p class="q-text"><span class="q-num">${String(qi + 1).padStart(2, "0")}</span>${esc(q.question)}</p>
          ${q.options
            .map(
              (opt, oi) => `
            <label class="opt" data-opt="${oi}">
              <input type="radio" name="q${qi}" value="${oi}">
              <span>${esc(opt)}</span>
              <span class="mark"></span>
            </label>`
            )
            .join("")}
        </div>`
      )
      .join("");
  } catch (err) {
    $("quizQuestionsContainer").innerHTML = `<p style="color:var(--rose);font-size:12px">Could not load questions. Close and retry.</p>`;
  }
}

function closeAssessmentModal() {
  $("assessmentModal").classList.remove("open");
  document.body.style.overflow = "";
}

function resetModalChrome() {
  const foot = $("assessmentModal").querySelector(".modal-foot");
  foot.innerHTML = `
    <button class="btn btn-danger-quiet" onclick="simulateFailedAssessment()">Simulate weakness</button>
    <div class="modal-foot-right">
      <button class="btn btn-quiet" onclick="closeAssessmentModal()">Cancel</button>
      <button class="btn btn-solid" onclick="submitAssessmentAnswers()">Submit and grade</button>
    </div>`;
  $("assessmentModal").querySelector(".concept-block").style.display = "";
}

async function submitAssessmentAnswers() {
  if (!state.activeQuizData) return;
  const answers = (state.activeQuizData.questions || []).map((_, i) => {
    const chosen = document.querySelector(`input[name="q${i}"]:checked`);
    return chosen ? parseInt(chosen.value, 10) : -1;
  });
  await grade(answers);
}

async function simulateFailedAssessment() {
  const wrong = (state.activeQuizData?.questions || []).map((q) => (q.correct_index === 0 ? 1 : 0));
  await grade(wrong.length ? wrong : [0, 0, 0]);
}

async function grade(answers) {
  if (!state.pipelineData) return;
  ticker("Assessor agent grading. Mentor agent standing by.");

  const concept = $("conceptInput")?.value?.trim() || "";
  const gap = (state.pipelineData.gaps || []).find((g) => g.skill === state.activeQuizSkill);

  try {
    const res = await fetch("/api/assessment/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        learner_id: state.activeLearnerId,
        skill: state.activeQuizSkill,
        answers,
        current_modules: state.pipelineData.roadmap,
        target_role_id: state.activeRoleId,
        level: gap ? gap.required_level : 3,
        concept_question: concept ? $("conceptQuestion").textContent : null,
        concept_answer: concept || null,
      }),
    });
    if (!res.ok) throw new Error(`grade ${res.status}`);
    const data = await res.json();
    state.lastGrade = data;

    renderGradeResults(data, answers);
    await streamHandoffs(data.agent_logs || []);

    // Apply the new plan behind the modal so "View re-plan" lands on fresh state.
    if (data.updated_roadmap) state.pipelineData.roadmap = data.updated_roadmap;
    if (data.new_metrics) state.pipelineData.metrics = data.new_metrics;
    if (data.adaptive_replan && data.diff_summary?.weeks_after) {
      // Roadmap grew: keep the deterministic recomputation honest by re-deriving weeks.
    }

    showDiff(data.diff_summary || {}, true);
    renderRoadmap(state.pipelineData.roadmap);
    renderHUD();
    renderMatrix();
    drawProjection();
    rebuildSkillGraph();
    loadAIStatus();
  } catch (err) {
    console.error("grading failed", err);
    ticker("Grading failed. Nothing was changed.");
  }
}

function renderGradeResults(data, answers) {
  const g = data.grade_result || {};
  const questions = state.activeQuizData?.questions || [];

  const rows = questions
    .map((q, i) => {
      const picked = answers[i];
      const correct = q.correct_index;
      return `
        <div class="q-block">
          <p class="q-text"><span class="q-num">${String(i + 1).padStart(2, "0")}</span>${esc(q.question)}</p>
          ${q.options
            .map((opt, oi) => {
              const isCorrect = oi === correct;
              const isPicked = oi === picked;
              const cls = isCorrect ? "correct" : isPicked ? "wrong" : "";
              const mark = isCorrect ? "correct answer" : isPicked ? "your answer" : "";
              return `<div class="opt ${cls}"><span>${esc(opt)}</span>${
                mark ? `<span class="mark">${mark}</span>` : ""
              }</div>`;
            })
            .join("")}
          ${q.explanation ? `<div class="explain">${esc(q.explanation)}</div>` : ""}
        </div>`;
    })
    .join("");

  const rubric = data.concept_grade;
  const rubricHtml =
    rubric && rubric.graded
      ? `<div class="result-head" style="margin-top:16px">
           <div class="result-score">${rubric.score}<span style="font-size:14px;color:var(--faint)">/100</span></div>
           <div>
             <div class="result-meta">Written answer · rubric-graded by Gemini</div>
             <div class="result-verdict">${esc(rubric.verdict || "")}</div>
           </div>
         </div>
         ${(rubric.criteria || [])
           .map(
             (c) => `<div class="rubric-row">
               <span class="rubric-name">${esc(c.name)}</span>
               <span class="${c.met ? "rubric-met" : "rubric-miss"}">${c.met ? "met" : "missed"}</span>
               <span class="rubric-note">${esc(c.note)}</span>
             </div>`
           )
           .join("")}`
      : "";

  $("quizQuestionsContainer").innerHTML = `
    <div class="result-head">
      <div class="result-score ${g.passed ? "pass" : "fail"}">${g.percentage}<span style="font-size:14px;color:var(--faint)">%</span></div>
      <div>
        <div class="result-meta">${g.score}/${g.total} correct · ${esc(state.activeQuizSkill)}</div>
        <div class="result-verdict ${g.passed ? "pass" : "fail"}">
          ${g.passed ? "Passed — verified level raised" : "Below 66% — the roadmap was rewritten"}
        </div>
      </div>
    </div>
    ${rows}
    ${rubricHtml}`;

  $("assessmentModal").querySelector(".concept-block").style.display = "none";

  const rebanned = data.adaptive_replan;
  $("assessmentModal").querySelector(".modal-foot").innerHTML = `
    <button class="btn btn-quiet" onclick="closeAssessmentModal()">Close</button>
    <div class="modal-foot-right">
      <button class="btn btn-solid" onclick="closeAssessmentModal(); document.getElementById('panelRoadmap').scrollIntoView({behavior:'smooth', block:'center'})">
        ${rebanned ? "View the new roadmap" : "Back to dashboard"}
      </button>
    </div>`;

  ticker(
    rebanned
      ? `Mentor agent re-planned: ${data.diff_summary?.added_modules?.[0] || "remedial sprint"} inserted.`
      : `Skill verified at ${g.percentage}%. Readiness recalculated.`
  );
}

// ── Goal switching ──────────────────────────────────────────────────────────
async function onRoleChange(roleId) {
  state.activeRoleId = roleId;
  ticker(`Target role changed to ${roleId}. Re-evaluating every benchmark skill.`);
  try {
    const res = await fetch("/api/switch-goal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learner_id: state.activeLearnerId, new_role_id: roleId }),
    });
    if (!res.ok) throw new Error(`switch ${res.status}`);
    const data = await res.json();

    state.pipelineData.target_role = data.new_role;
    state.pipelineData.metrics = data.metrics;
    state.pipelineData.gaps = data.gaps;
    state.pipelineData.roadmap = data.roadmap;
    state.simulatedSkills.clear();

    await streamHandoffs(data.agent_logs || []);
    renderHUD();
    renderGaps();
    renderRoadmap(data.roadmap);
    rebuildSkillGraph();
    drawProjection();
    $("readoutTarget").textContent = data.new_role.title;
    if (data.diff_summary) showDiff(data.diff_summary, false);
  } catch (err) {
    console.error("goal switch failed", err);
  }
}

function quickSwitchGoal(roleId) {
  $("roleSelect").value = roleId;
  onRoleChange(roleId);
}

function loadLearnerPreset(learnerId) {
  state.activeLearnerId = learnerId;
  $("learnerSelect").value = learnerId;
  const learner = state.learners.find((l) => l.id === learnerId);
  if (learner) {
    state.activeRoleId = learner.target_role_id;
    $("roleSelect").value = learner.target_role_id;
  }
  runOrchestration(learnerId, state.activeRoleId);
}

function onLearnerChange(id) {
  loadLearnerPreset(id);
}

// ── Number animation ────────────────────────────────────────────────────────
function animateNumber(id, target, decimals = 0) {
  const el = $(id);
  if (!el) return;
  const from = parseFloat(el.textContent) || 0;
  const to = Number(target) || 0;
  const started = performance.now();
  const dur = 650;

  function step(now) {
    const p = Math.min((now - started) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const value = from + (to - from) * eased;
    el.textContent = decimals ? value.toFixed(decimals) : Math.round(value);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = decimals ? to.toFixed(decimals) : String(Math.round(to));
  }
  requestAnimationFrame(step);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3D SKILL GRAPH — the learner's real competency map, rendered in space
// ═══════════════════════════════════════════════════════════════════════════
const graph = {
  canvas: null,
  ctx: null,
  nodes: [],
  edges: [],
  angleY: 0,
  angleX: -0.25,
  velocityY: 0.0016,
  dragging: false,
  lastX: 0,
  lastY: 0,
  parallaxX: 0,
  parallaxY: 0,
  shards: [],
  hovered: null,
  ambients: [],
  bursts: [],
  entranceProgress: 0,
  entranceDone: false,
};

function initSkillGraph() {
  graph.canvas = $("bg3DCanvas");
  graph.ctx = graph.canvas.getContext("2d");
  resizeGraph();

  window.addEventListener("resize", resizeGraph);

  graph.canvas.style.pointerEvents = "auto";

  graph.canvas.addEventListener("pointerdown", (e) => {
    graph.dragging = true;
    hideGraphTooltip();
    graph.lastX = e.clientX;
    graph.lastY = e.clientY;
  });
  window.addEventListener("pointerup", () => (graph.dragging = false));
  window.addEventListener("pointermove", (e) => {
    if (graph.dragging) {
      graph.angleY += (e.clientX - graph.lastX) * 0.004;
      graph.angleX += (e.clientY - graph.lastY) * 0.003;
      graph.angleX = Math.max(-0.9, Math.min(0.9, graph.angleX));
      graph.lastX = e.clientX;
      graph.lastY = e.clientY;
      return;
    }
    graph.parallaxX = (e.clientX / window.innerWidth - 0.5) * 0.5;
    graph.parallaxY = (e.clientY / window.innerHeight - 0.5) * 0.35;
    graph.hovered = hitTest(e.clientX, e.clientY);
    graph.canvas.style.cursor = graph.hovered ? "pointer" : "default";
    updateGraphTooltip(e.clientX, e.clientY);
  });
  graph.canvas.addEventListener("pointerleave", () => {
    graph.hovered = null;
    hideGraphTooltip();
  });
  graph.canvas.addEventListener("click", (e) => {
    const node = hitTest(e.clientX, e.clientY);
    if (node) openAssessmentModal(node.skill);
  });

  // Spawn ambient particles once
  for (let i = 0; i < 40; i++) spawnAmbient();

  requestAnimationFrame(drawGraph);
}

function updateGraphTooltip(x, y) {
  const tip = $("graphTooltip");
  const node = graph.hovered;
  if (!tip || !node) {
    hideGraphTooltip();
    return;
  }
  const status = node.status === "verified" ? "verified" : node.status === "partial" ? "partial evidence" : node.status === "claimed" ? "claimed only" : "missing evidence";
  tip.innerHTML = `
    <div class="graph-tooltip-title">${esc(node.skill)}</div>
    <div class="graph-tooltip-meta"><span class="graph-tooltip-status">${status}</span><span>weight ${node.weight}</span><span>need ${node.required}/5</span></div>
    <div class="graph-tooltip-cta">click to open diagnostic</div>`;
  const left = Math.min(window.innerWidth - 224, Math.max(12, x + 16));
  const top = Math.min(window.innerHeight - 92, Math.max(72, y + 16));
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.classList.add("open");
}

function hideGraphTooltip() {
  const tip = $("graphTooltip");
  if (tip) tip.classList.remove("open");
}

function resizeGraph() {
  if (!graph.canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  graph.canvas.width = Math.floor(window.innerWidth * dpr);
  graph.canvas.height = Math.floor(window.innerHeight * dpr);
  graph.canvas.style.width = `${window.innerWidth}px`;
  graph.canvas.style.height = `${window.innerHeight}px`;
  graph.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fibonacciSphere(count) {
  const points = [];
  const offset = 2 / count;
  const increment = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = i * offset - 1 + offset / 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * increment;
    points.push({ x: Math.cos(phi) * r, y, z: Math.sin(phi) * r });
  }
  return points;
}

function rebuildSkillGraph() {
  if (!state.pipelineData?.target_role) return;
  const role = state.pipelineData.target_role;
  const skills = role.benchmark_skills || [];
  const points = fibonacciSphere(skills.length);

  graph.nodes = skills.map((bench, i) => {
    const learner = learnerSkill(bench.skill);
    const verified = learner ? learner.verified_level : 0;
    const claimed = learner ? learner.claimed_level : 0;
    const simulated = state.simulatedSkills.has(bench.skill);

    let status = "missing";
    if (simulated || verified >= bench.required_level) status = "verified";
    else if (verified > 0) status = "partial";
    else if (claimed > 0) status = "claimed";

    return {
      skill: bench.skill,
      x: points[i].x,
      y: points[i].y,
      z: points[i].z,
      weight: bench.weight,
      required: bench.required_level,
      verified,
      claimed,
      status,
      radius: 2.6 + bench.weight * 0.9,
      phase: i * 0.7,
    };
  });

  // Deterministic edges: pair each skill with its two nearest neighbours.
  const edges = new Set();
  graph.nodes.forEach((a, i) => {
    const near = graph.nodes
      .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);
    near.forEach(({ j }) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  graph.edges = [...edges].map((e) => e.split("-").map(Number));
}

function projectNode(node, cx, cy, scale, ay, ax) {
  const cosY = Math.cos(ay);
  const sinY = Math.sin(ay);
  const x1 = node.x * cosY - node.z * sinY;
  const z1 = node.x * sinY + node.z * cosY;

  const cosX = Math.cos(ax);
  const sinX = Math.sin(ax);
  const y2 = node.y * cosX - z1 * sinX;
  const z2 = node.y * sinX + z1 * cosX;

  const fov = 2.4 / (2.4 + z2);
  return { px: cx + x1 * scale * fov, py: cy + y2 * scale * fov, depth: z2, fov };
}

function spawnAmbient() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 0.4 + Math.random() * 0.5;
  graph.ambients.push({
    angle,
    radius,
    speed: 0.0004 + Math.random() * 0.0006,
    size: 1 + Math.random() * 1.5,
    alpha: 0.15 + Math.random() * 0.25,
    hue: Math.random() < 0.5 ? 88 : 168, // signal or teal
    vertical: (Math.random() - 0.5) * 0.8,
  });
}

function burstAt(px, py, color) {
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 3;
    graph.bursts.push({
      x: px,
      y: py,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 1,
      decay: 0.015 + Math.random() * 0.015,
      size: 2 + Math.random() * 2,
      color,
    });
  }
}

function updateAmbients(dt) {
  for (const a of graph.ambients) a.angle += a.speed * dt;
  for (let i = graph.bursts.length - 1; i >= 0; i--) {
    const b = graph.bursts[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life -= b.decay;
    if (b.life <= 0) graph.bursts.splice(i, 1);
  }
  // Maintain ambient count
  while (graph.ambients.length < 40) spawnAmbient();
}

function drawGraph(ts) {
  const ctx = graph.ctx;
  if (!ctx) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  if (!graph.dragging) graph.angleY += graph.velocityY;

  const ay = graph.angleY + graph.parallaxX;
  const ax = graph.angleX + graph.parallaxY;

  const cx = w * 0.5;
  const cy = h * 0.46;
  const scale = Math.min(w, h) * 0.36;

  // Entrance animation
  if (!graph.entranceDone) {
    graph.entranceProgress = Math.min(1, graph.entranceProgress + 0.012);
    if (graph.entranceProgress >= 1) graph.entranceDone = true;
  }
  const entrance = graph.entranceProgress;

  const projected = graph.nodes.map((n) => ({ node: n, ...projectNode(n, cx, cy, scale, ay, ax) }));
  projected.sort((a, b) => a.depth - b.depth);

  // Ambient particles (behind everything)
  updateAmbients(16);
  for (const a of graph.ambients) {
    const x = cx + Math.cos(a.angle) * scale * a.radius * entrance;
    const y = cy + a.vertical * scale * a.radius * entrance + Math.sin(a.angle) * scale * a.radius * 0.18 * entrance;
    ctx.globalAlpha = a.alpha * entrance;
    ctx.fillStyle = `hsl(${a.hue}, 90%, 60%)`;
    ctx.beginPath();
    ctx.arc(x, y, a.size * entrance, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Quiet orbital rings
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ax * 0.35);
  ctx.strokeStyle = `rgba(199,255,74,${0.07 * entrance})`;
  ctx.lineWidth = 1;
  for (const ratio of [0.72, 1]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, scale * ratio * entrance, scale * ratio * (0.25 + Math.abs(Math.sin(ax)) * 0.18) * entrance, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Edges
  ctx.lineWidth = 1;
  for (const [i, j] of graph.edges) {
    const a = projected.find((p) => p.node.skill === graph.nodes[i]?.skill);
    const b = projected.find((p) => p.node.skill === graph.nodes[j]?.skill);
    if (!a || !b) continue;
    const active = a.node.status === "verified" || b.node.status === "verified";
    ctx.strokeStyle = active ? `rgba(199,255,74,${0.16 * entrance})` : `rgba(255,255,255,${0.055 * entrance})`;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
  }

  // Nodes
  for (const p of projected) {
    const n = p.node;
    let color = "rgba(255,255,255,0.22)";
    if (n.status === "verified") color = "#c7ff4a";
    else if (n.status === "partial") color = "#5fd4c4";
    else if (n.status === "claimed") color = "#f2a93b";
    else color = "rgba(255,107,94,0.55)";

    const r = Math.max(1.6, n.radius * p.fov) * entrance;
    const fade = Math.max(0.18, Math.min(1, (2.2 - p.depth) / 2.2)) * entrance;

    // Glow for verified/claimed/hovered
    if ((n.status === "verified" || n.status === "claimed" || n === graph.hovered) && entrance > 0.5) {
      const base = n.status === "verified" ? "rgba(199,255,74,0.16)" : n.status === "claimed" ? "rgba(242,169,59,0.12)" : "rgba(199,255,74,0.18)";
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(p.px, p.py, r * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pulsing ring for hovered
    if (n === graph.hovered) {
      const pulse = 1 + Math.sin(ts / 200) * 0.15;
      ctx.strokeStyle = "#c7ff4a";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 * entrance;
      ctx.beginPath();
      ctx.arc(p.px, p.py, r * 1.8 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = fade;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
    ctx.fill();

    // Required-level ring for gaps
    if (n.status === "missing" || n.status === "partial") {
      ctx.globalAlpha = fade * 0.5;
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.px, p.py, r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Labels for significant nodes
    const significant = n.weight >= 4 || n.status === "verified" || n === graph.hovered;
    if (significant && w > 720 && entrance > 0.7) {
      ctx.globalAlpha = fade * (n === graph.hovered ? 1 : 0.55);
      ctx.fillStyle = n === graph.hovered ? "#ecedef" : "rgba(236,237,239,0.75)";
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(n.skill, p.px + r + 5, p.py + 3);
    }
    ctx.globalAlpha = 1;
  }

  // Shockwave shards from simulation pulses
  for (let i = graph.shards.length - 1; i >= 0; i--) {
    const s = graph.shards[i];
    s.r += 2.6;
    s.a -= 0.018;
    if (s.a <= 0) {
      graph.shards.splice(i, 1);
      continue;
    }
    ctx.strokeStyle = `rgba(199,255,74,${s.a})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Burst particles (click feedback)
  for (let i = graph.bursts.length - 1; i >= 0; i--) {
    const b = graph.bursts[i];
    ctx.globalAlpha = b.life;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.size * b.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  requestAnimationFrame(drawGraph);
}

function hitTest(clientX, clientY) {
  if (!graph.nodes.length) return null;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = w * 0.5;
  const cy = h * 0.46;
  const scale = Math.min(w, h) * 0.36;
  const ay = graph.angleY + graph.parallaxX;
  const ax = graph.angleX + graph.parallaxY;

  let best = null;
  let bestDist = 22;
  for (const node of graph.nodes) {
    const p = projectNode(node, cx, cy, scale, ay, ax);
    const d = Math.hypot(p.px - clientX, p.py - clientY);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function pulseNode(skill) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const node = graph.nodes.find((n) => n.skill === skill);
  if (!node) return;
  const p = projectNode(node, w * 0.5, h * 0.46, Math.min(w, h) * 0.36, graph.angleY, graph.angleX);
  graph.shards.push({ x: p.px, y: p.py, r: 6, a: 0.75 });
  // Add click burst
  burstAt(p.px, p.py, node.status === "verified" ? "#c7ff4a" : node.status === "claimed" ? "#f2a93b" : "#ff6b5e");
  rebuildSkillGraph();
}

// ═══════════════════════════════════════════════════════════════════════════
// READINESS PROJECTION — what the plan actually buys
// ═══════════════════════════════════════════════════════════════════════════
function initProjection() {
  const canvas = $("skillGyroCanvas");
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300;
  const h = 170;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawProjection();
}

function drawProjection() {
  const canvas = $("skillGyroCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300;
  const h = 170;

  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  ctx.clearRect(0, 0, w, h);

  const { verified } = currentReadiness();
  const totalWeeks = weeksFor(planHours() - prunedHours());
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 20;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // grid
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  const points = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const week = t * totalWeeks;
    const eased = 1 - Math.pow(1 - t, 1.6);
    const value = verified + (100 - verified) * eased * 0.94;
    const x = padL + t * plotW;
    const y = padT + plotH - (value / 100) * plotH;
    points.push({ x, y, value, week });
  }

  // area
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, "rgba(199,255,74,0.18)");
  grad.addColorStop(1, "rgba(199,255,74,0)");
  ctx.beginPath();
  ctx.moveTo(points[0].x, padT + plotH);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.strokeStyle = "#c7ff4a";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // today marker
  ctx.fillStyle = "#c7ff4a";
  ctx.beginPath();
  ctx.arc(points[0].x, points[0].y, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // end marker
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(199,255,74,0.55)";
  ctx.fill();

  // labels
  ctx.font = "500 9px 'JetBrains Mono', monospace";
  ctx.fillStyle = "rgba(236,237,239,0.7)";
  ctx.textAlign = "left";
  ctx.fillText(`${fmt(verified)}% now`, padL, h - 6);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(199,255,74,0.85)";
  ctx.fillText(`${totalWeeks}w to ${Math.round(last.value)}%`, w - padR, h - 6);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillText("projected readiness if the plan is followed", padL, 8);
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE TOUR
// ═══════════════════════════════════════════════════════════════════════════
async function play10SecondTour() {
  if (state.tourPlaying || !state.pipelineData) return;
  state.tourPlaying = true;

  const btn = $("btnAutoTour");
  if (btn) btn.textContent = "Running demo…";

  resetSimulations();
  await wait(700);

  setAgent("GapAgent");
  ticker("Gap agent: React carries the highest weighted severity against the Full Stack benchmark.");
  await wait(1100);

  // Visual cue on the graph before toggle
  pulseNode("React");
  await wait(400);

  toggleSimulateSkill("React");
  await wait(1800);

  setAgent("CurriculumAgent");
  ticker("Curriculum agent: prerequisite sprints pruned, schedule recomputed.");
  await wait(1400);

  setAgent("MentorAgent");
  ticker("Mentor agent: readiness updated. This is the counterfactual model, live.");

  state.tourPlaying = false;
  if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Run 10s demo`;
}

// Re-draw projection when the layout settles
window.addEventListener("load", () => {
  initProjection();
  drawProjection();

  // Page entrance stagger
  document.body.style.opacity = "0";
  requestAnimationFrame(() => {
    document.body.style.transition = "opacity 0.35s ease";
    document.body.style.opacity = "1";
  });
});
window.addEventListener("resize", () => {
  setTimeout(() => {
    initProjection();
    drawProjection();
  }, 120);
});