/**
 * Main entry point — wires dropdowns, keyboard shortcuts,
 * loads data, renders segment cards, handles save/undo.
 */

import { api } from "./api.js";
import { state, buildManifestIndex, loadSegments, undoAll, adjustStart, adjustEnd, shiftAll } from "./state.js";
import { renderSegmentCard } from "./segment-card.js";

// DOM refs
const instanceSelect = document.getElementById("instance-select");
const sessionSelect = document.getElementById("session-select");
const statusLabel = document.getElementById("status-label");
const saveBtn = document.getElementById("save-btn");
const undoBtn = document.getElementById("undo-btn");
const combineBtn = document.getElementById("combine-btn");
const container = document.getElementById("segments-container");

let cards = []; // array of { element, audioPlayer, refresh }

// ── Instance dropdown ────────────────────────────────────

async function loadInstances() {
  try {
    const instances = await api.getInstances();
    instanceSelect.innerHTML = '<option value="">— select —</option>';
    for (const name of instances) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      instanceSelect.appendChild(opt);
    }
    instanceSelect.disabled = false;
  } catch (err) {
    instanceSelect.innerHTML = '<option value="">Error loading</option>';
    console.error(err);
  }
}

instanceSelect.addEventListener("change", async () => {
  const id = instanceSelect.value;
  sessionSelect.innerHTML = '<option value="">Loading...</option>';
  sessionSelect.disabled = true;
  clearSegments();

  if (!id) {
    sessionSelect.innerHTML = '<option value="">Select instance first</option>';
    combineBtn.disabled = true;
    return;
  }

  state.currentInstance = id;

  try {
    // Load manifest and session list in parallel
    const [manifest, sessions] = await Promise.all([
      api.getManifest(id),
      api.getSessions(id),
    ]);

    state.manifest = manifest;
    buildManifestIndex();

    sessionSelect.innerHTML = '<option value="">— select —</option>';
    for (const name of sessions) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sessionSelect.appendChild(opt);
    }
    sessionSelect.disabled = false;
    combineBtn.disabled = false;
    state.sessionNames = sessions;
  } catch (err) {
    sessionSelect.innerHTML = '<option value="">Error loading</option>';
    console.error(err);
  }
});

// ── Session dropdown ─────────────────────────────────────

sessionSelect.addEventListener("change", async () => {
  const name = sessionSelect.value;
  clearSegments();

  if (!name || !state.currentInstance) return;

  state.currentSession = name;
  statusLabel.textContent = "Loading...";

  try {
    const data = await api.getSession(state.currentInstance, name);
    loadSegments(data.segments);

    if (data.is_corrected) {
      statusLabel.textContent = "Loaded corrected version";
    } else {
      statusLabel.textContent = `${state.segments.length} segments`;
    }

    renderAllCards();
    updateButtons();
  } catch (err) {
    statusLabel.textContent = "Error loading session";
    console.error(err);
  }
});

// ── Render segment cards ─────────────────────────────────

function clearSegments() {
  for (const c of cards) c.audioPlayer.destroy();
  cards = [];
  container.innerHTML = "";
  state.segments = [];
  state.activeSegmentIdx = -1;
  updateButtons();
  statusLabel.textContent = "";
}

function renderAllCards() {
  container.innerHTML = "";
  cards = [];

  for (let i = 0; i < state.segments.length; i++) {
    const card = renderSegmentCard(i, {
      onActivate: activateCard,
      onAdjust: handleAdjust,
    });
    container.appendChild(card.element);
    cards.push(card);
  }

  if (cards.length > 0) {
    activateCard(0);
  }
}

function activateCard(segIdx) {
  // Deactivate previous
  if (state.activeSegmentIdx >= 0 && cards[state.activeSegmentIdx]) {
    cards[state.activeSegmentIdx].element.classList.remove("active");
  }

  state.activeSegmentIdx = segIdx;

  if (cards[segIdx]) {
    cards[segIdx].element.classList.add("active");
    cards[segIdx].element.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function handleAdjust(segIdx) {
  // Refresh the adjusted card and its neighbors
  const toRefresh = new Set([segIdx, segIdx - 1, segIdx + 1]);
  for (const idx of toRefresh) {
    if (idx >= 0 && idx < cards.length) {
      cards[idx].refresh();
    }
  }
  updateButtons();
}

function updateButtons() {
  saveBtn.disabled = !state.isDirty;
  undoBtn.disabled = !state.isDirty;

  if (state.isDirty) {
    statusLabel.textContent = "Unsaved changes";
    statusLabel.className = "status-label dirty";
  } else if (state.segments.length > 0) {
    statusLabel.className = "status-label";
  }
}

// ── Save / Undo ──────────────────────────────────────────

saveBtn.addEventListener("click", doSave);
undoBtn.addEventListener("click", doUndo);

async function doSave() {
  if (!state.currentInstance || !state.currentSession) return;

  saveBtn.disabled = true;
  statusLabel.textContent = "Saving...";

  try {
    await api.saveSession(state.currentInstance, state.currentSession, state.segments);
    // Reset original to current (so dirty tracking resets)
    state.originalSegments = JSON.parse(JSON.stringify(state.segments));
    state.isDirty = false;
    statusLabel.textContent = "Saved!";
    statusLabel.className = "status-label";

    // Refresh all dirty indicators
    for (const c of cards) c.refresh();
    updateButtons();
  } catch (err) {
    statusLabel.textContent = "Save failed!";
    console.error(err);
    saveBtn.disabled = false;
  }
}

function doUndo() {
  undoAll();
  // Re-render all cards with restored data
  renderAllCards();
  updateButtons();
  statusLabel.textContent = "Changes undone";
  statusLabel.className = "status-label";
}

// ── Combine sessions ─────────────────────────────────────

combineBtn.addEventListener("click", doCombine);

async function doCombine() {
  if (!state.currentInstance) return;

  combineBtn.disabled = true;
  statusLabel.textContent = "Combining sessions...";
  statusLabel.className = "status-label";

  try {
    const result = await api.combineSessions(state.currentInstance);
    statusLabel.textContent =
      `Combined: ${result.total_segments} segments (${result.sessions_corrected} corrected, ${result.sessions_original} original)`;
    statusLabel.className = "status-label";
  } catch (err) {
    statusLabel.textContent = "Combine failed!";
    console.error(err);
  } finally {
    combineBtn.disabled = false;
  }
}

// ── Keyboard shortcuts ───────────────────────────────────

document.addEventListener("keydown", (e) => {
  // Don't capture when typing in inputs
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
    return;
  }

  const idx = state.activeSegmentIdx;

  switch (e.key) {
    case "j":
      if (idx < state.segments.length - 1) activateCard(idx + 1);
      e.preventDefault();
      break;
    case "k":
      if (idx > 0) activateCard(idx - 1);
      e.preventDefault();
      break;
    case "[":
      if (idx >= 0 && adjustStart(idx, -1)) handleAdjust(idx);
      e.preventDefault();
      break;
    case "]":
      if (idx >= 0 && adjustStart(idx, 1)) handleAdjust(idx);
      e.preventDefault();
      break;
    case "{":
      if (idx >= 0 && adjustEnd(idx, -1)) handleAdjust(idx);
      e.preventDefault();
      break;
    case "}":
      if (idx >= 0 && adjustEnd(idx, 1)) handleAdjust(idx);
      e.preventDefault();
      break;
    case "<":
      if (idx >= 0 && shiftAll(idx, -1)) handleAdjust(idx);
      e.preventDefault();
      break;
    case ">":
      if (idx >= 0 && shiftAll(idx, 1)) handleAdjust(idx);
      e.preventDefault();
      break;
    case " ":
      if (idx >= 0 && cards[idx]) {
        cards[idx].audioPlayer.toggle();
        e.preventDefault();
      }
      break;
    case "s":
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        doSave();
      }
      break;
  }
});

// ── Unsaved changes warning ──────────────────────────────

window.addEventListener("beforeunload", (e) => {
  if (state.isDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ── Init ─────────────────────────────────────────────────

loadInstances();
