const PROD_ORIGIN = "https://core-agent-chatroom-api.hacolby.workers.dev";
const DEFAULT_ROOM = "tasks";

const resolveBaseUrl = () => {
  if (typeof window === "undefined") return PROD_ORIGIN;
  const { origin } = window.location;
  if (origin.includes("localhost") || origin.startsWith("http://127.")) {
    return origin;
  }
  return PROD_ORIGIN;
};

const API_BASE = resolveBaseUrl();

const state = {
  counts: { pending: 0, in_progress: 0, blocked: 0, done: 0, total: 0 },
  agentActivity: [],
  blocked: [],
  latestSession: null,
  agentName: "",
  mcpTools: "",
};

const fetchJSON = async (path, init) => {
  const response = await fetch(new URL(path, API_BASE), {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Request failed (${response.status}) ${text}`);
  }
  return response.json();
};

class TaskHub {
  constructor(roomId = DEFAULT_ROOM) {
    this.roomId = roomId;
    this.handlers = new Map();
    this.retry = 0;
    this.agentName = "";
    this.connect();
  }

  on(type, handler) {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler]);
  }

  emit(type, payload) {
    const handlers = this.handlers.get(type) ?? [];
    handlers.forEach((handler) => handler(payload));
    const wildcard = this.handlers.get("*") ?? [];
    wildcard.forEach((handler) => handler(type, payload));
  }

  connect() {
    const socket = new WebSocket(this.wsUrl());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.retry = 0;
      if (this.agentName) {
        this.send("agents.register", { agentName: this.agentName });
      }
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        this.emit(message.type, message);
      } catch (error) {
        console.warn("Failed to parse WS payload", error);
      }
    });

    socket.addEventListener("close", () => {
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  scheduleReconnect() {
    const delay = Math.min(10_000, 500 * 2 ** this.retry);
    this.retry += 1;
    setTimeout(() => this.connect(), delay);
  }

  wsUrl() {
    return API_BASE.replace(/^http/, "ws") + `/ws?room=${encodeURIComponent(this.roomId)}`;
  }

  send(type, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn("Socket not ready for send");
      return;
    }
    const frame = {
      type,
      payload,
      requestId: crypto.randomUUID(),
    };
    this.socket.send(JSON.stringify(frame));
  }

  registerAgent(agentName) {
    this.agentName = agentName;
    this.send("agents.register", { agentName });
  }
}

const hub = new TaskHub();

const getEl = (selector) => document.querySelector(selector);

const updateHeroMetrics = (counts) => {
  const status = getEl("#metric-status");
  const uptime = getEl("#metric-uptime");
  const pass = getEl("#metric-pass");
  if (status) status.textContent = state.blocked.length > 0 ? "DEGRADED" : "HEALTHY";
  if (uptime) uptime.textContent = (state.latestSession ? Date.now() - Date.parse(state.latestSession.startedAt) : 0) > 0
    ? ((Date.now() - Date.parse(state.latestSession.startedAt)) / 3_600_000).toFixed(1)
    : (state.counts.total > 0 ? "~" : "0");
  if (pass) {
    const last = state.latestSession;
    pass.textContent = last ? `${Math.round((last.passed / last.total) * 100)}%` : "—";
  }
};

const updateCountCards = () => {
  const mappings = [
    ["#count-pending", state.counts.pending],
    ["#count-in-progress", state.counts.in_progress],
    ["#count-blocked", state.counts.blocked],
    ["#count-done", state.counts.done],
    ["#count-total", state.counts.total],
    ["#health-count-pending", state.counts.pending],
    ["#health-count-in-progress", state.counts.in_progress],
    ["#health-count-blocked", state.counts.blocked],
    ["#health-count-done", state.counts.done],
    ["#health-count-total", state.counts.total],
  ];
  for (const [selector, value] of mappings) {
    const el = getEl(selector);
    if (el) el.textContent = String(value ?? 0);
  }
};

const renderAgentActivity = () => {
  const render = (selector) => {
    const container = getEl(selector);
    if (!container) return;
    container.innerHTML = "";
    if (state.agentActivity.length === 0) {
      container.innerHTML = '<li class="text-slate-400">No check-ins yet.</li>';
      return;
    }
    state.agentActivity.forEach((activity) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="flex justify-between items-center gap-2">
          <strong class="text-slate-100">${activity.agentName}</strong>
          <span class="badge">${activity.status}</span>
        </div>
        <div class="text-xs text-slate-300/70">Task: ${activity.taskId ?? "—"}</div>
        <div class="text-xs text-slate-400/80">Last check-in: ${formatRelativeTime(activity.lastCheckIn)}</div>
        ${activity.note ? `<div class="text-xs text-emerald-200/80">${activity.note}</div>` : ""}
      `;
      container.appendChild(li);
    });
  };
  render("#agent-activity-list");
  render("#health-agent-activity");
};

const renderBlockedList = () => {
  const render = (selector, allowAck = false) => {
    const container = getEl(selector);
    if (!container) return;
    container.innerHTML = "";
    if (state.blocked.length === 0) {
      container.innerHTML = '<div class="text-slate-400">No agents blocked 🎉</div>';
      return;
    }
    state.blocked.forEach((blocker) => {
      const card = document.createElement("div");
      card.className = "blocked-card";
      card.innerHTML = `
        <strong>${blocker.blockedAgent} waiting on ${blocker.blockingOwner ?? "unknown owner"}</strong>
        <div class="text-sm">Task: <code class="code-inline">${blocker.taskId}</code></div>
        <div class="text-sm">Reason: ${blocker.reason ?? "n/a"}</div>
        <div class="text-xs text-slate-200/70">Last notified: ${formatRelativeTime(blocker.lastNotified ?? blocker.updatedAt)}</div>
      `;
      if (allowAck && state.agentName && state.agentName === blocker.blockedAgent) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-primary mt-3";
        btn.textContent = "Acknowledge & Resume";
        btn.addEventListener("click", () => {
          hub.send("agents.ackUnblock", { taskId: blocker.taskId, agentName: state.agentName });
        });
        card.appendChild(btn);
      }
      container.appendChild(card);
    });
  };
  render("#blocked-agents-list", true);
  render("#health-blocked-list", false);
};

const appendLog = (message) => {
  const container = getEl("#ws-log");
  if (!container) return;
  const entry = document.createElement("article");
  entry.className = "log-entry";
  const timestamp = new Date().toISOString();
  entry.innerHTML = `
    <header>
      <span class="badge">${message.type}</span>
      <span class="text-xs text-slate-400">${timestamp}</span>
    </header>
    ${message.meta ? `<div class="text-xs text-slate-400 mb-2">${JSON.stringify(message.meta)}</div>` : ""}
    <pre>${formatJson(message.payload)}</pre>
  `;
  container.prepend(entry);
  const maxEntries = 200;
  while (container.children.length > maxEntries) {
    container.removeChild(container.lastChild);
  }
};

const formatJson = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value ?? "");
  }
};

const formatRelativeTime = (iso) => {
  if (!iso) return "—";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const updateAllStats = () => {
  updateCountCards();
  renderAgentActivity();
  renderBlockedList();
  updateHeroMetrics(state.counts);
};

const refreshTaskStats = async () => {
  try {
    const { data } = await fetchJSON("/api/tasks/stats");
    state.counts = data.counts;
    state.agentActivity = data.agentActivity;
    state.blocked = data.blocked;
    updateAllStats();
  } catch (error) {
    console.warn("Failed to refresh task stats", error);
  }
};

const refreshMcpTools = async () => {
  try {
    const { tools } = await fetchJSON("/mcp/tools");
    const snippet = JSON.stringify(
      {
        name: "vibe-agent-control",
        baseUrl: API_BASE,
        tools,
      },
      null,
      2,
    );
    state.mcpTools = snippet;
    const textarea = getEl("#mcp-tools-snippet");
    if (textarea) textarea.value = snippet;
  } catch (error) {
    console.warn("Failed to refresh MCP tools", error);
  }
};

const copyMcpTools = async () => {
  if (!state.mcpTools) return;
  try {
    await navigator.clipboard.writeText(state.mcpTools);
  } catch (error) {
    console.warn("Clipboard copy failed", error);
  }
};

const handleWsMessage = (type, message) => {
  appendLog(message);
  switch (type) {
    case "system.state":
      break;
    case "tasks.stats":
      state.counts = message.payload.counts;
      state.agentActivity = message.payload.agentActivity;
      state.blocked = message.payload.blocked;
      updateAllStats();
      break;
    case "tasks.blockedSummary":
      state.blocked = message.payload.blocked;
      renderBlockedList();
      break;
    case "agents.activity":
      if (Array.isArray(message.payload.activity)) {
        state.agentActivity = message.payload.activity;
      } else if (message.payload.activity) {
        const existingIndex = state.agentActivity.findIndex(
          (item) => item.agentName === message.payload.activity.agentName,
        );
        if (existingIndex >= 0) {
          state.agentActivity[existingIndex] = message.payload.activity;
        } else {
          state.agentActivity.unshift(message.payload.activity);
        }
      }
      renderAgentActivity();
      break;
    case "tasks.blocked":
      if (message.payload?.blocker) {
        const idx = state.blocked.findIndex((b) => b.id === message.payload.blocker.id);
        if (idx >= 0) {
          state.blocked[idx] = message.payload.blocker;
        } else {
          state.blocked.unshift(message.payload.blocker);
        }
        renderBlockedList();
      }
      break;
    case "tasks.unblocked":
      if (message.payload?.blocker) {
        const idx = state.blocked.findIndex((b) => b.id === message.payload.blocker.id);
        if (idx >= 0) {
          state.blocked[idx] = message.payload.blocker;
        } else {
          state.blocked.unshift(message.payload.blocker);
        }
        renderBlockedList();
      }
      break;
    case "agents.unblockAck":
      if (message.payload?.blocker) {
        state.blocked = state.blocked.filter((b) => b.id !== message.payload.blocker.id);
        renderBlockedList();
      }
      break;
    case "agents.promptUpdate":
    case "agents.unblockedReminder":
      // informational, log already appended
      break;
    case "agents.registered":
      if (message.payload?.agentName) {
        state.agentName = message.payload.agentName;
        const input = getEl("#agent-name-input");
        if (input) input.value = state.agentName;
      }
      break;
    default:
      break;
  }
};

const loadNav = async () => {
  const target = document.getElementById("nav");
  if (!target) return;
  const response = await fetch("/nav.html");
  target.innerHTML = await response.text();

  const toggle = target.querySelector(".nav-toggle");
  const links = target.querySelector(".links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  if (links) {
    const anchors = links.querySelectorAll("a[href^='#']");
    anchors.forEach((anchor) => {
      anchor.addEventListener("click", () => {
        links.classList.remove("open");
        toggle?.setAttribute("aria-expanded", "false");
      });
    });
  }
};

const initIntersectionObserver = () => {
  const elements = document.querySelectorAll(".fade-up");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 },
  );

  elements.forEach((el) => observer.observe(el));
};

const renderTestCards = (tests) => {
  const container = document.getElementById("tests-grid");
  const template = document.getElementById("test-card-template");
  if (!container || !template) return;
  container.innerHTML = "";

  // Only show active test definitions (API already filters this, but double-check)
  const activeTests = tests.filter(test => test.isActive);

  activeTests.forEach((test) => {
    const node = template.content.firstElementChild.cloneNode(true);

    // Make card smaller by adjusting classes
    node.classList.add("p-3"); // Reduce padding

    const header = node.querySelector("header");
    const title = node.querySelector("h3");
    const description = node.querySelector("p");
    const badgesContainer = node.querySelector(".badges-container");

    // Update title
    title.textContent = test.name;

    // Update description
    description.textContent = test.description;

    if (test.category) {
      const categoryBadge = document.createElement("span");
      categoryBadge.className = "px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 text-slate-200";
      categoryBadge.textContent = test.category;
      badgesContainer.appendChild(categoryBadge);
    }

    if (test.severity) {
      let severityClass = "bg-slate-600";
      if (test.severity === "critical") severityClass = "bg-red-600";
      else if (test.severity === "high") severityClass = "bg-orange-600";
      else if (test.severity === "medium") severityClass = "bg-yellow-600";
      else if (test.severity === "low") severityClass = "bg-green-600";

      const severityBadge = document.createElement("span");
      severityBadge.className = `px-2 py-0.5 text-xs font-medium rounded-full text-white ${severityClass}`;
      severityBadge.textContent = test.severity;
      badgesContainer.appendChild(severityBadge);
    }

    // Add badges to header
    header.appendChild(badgesContainer);

    // Hide the old category/severity details section since we moved them to badges
    // Hide the old category/severity details section since we moved them to badges
    // The `details` variable is not defined in this scope.
    // if (details) {
    //   details.style.display = "none";
    // }

    container.appendChild(node);
  });

  // Update grid to be more compact
  container.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3";
};

const formatDuration = (ms) => {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const renderSession = (session) => {
  const body = document.getElementById("latest-session-body");
  const statusPill = document.getElementById("latest-session-status");
  const meta = document.getElementById("latest-session-meta");
  const aiCounter = document.getElementById("metric-ai");
  if (!body || !statusPill || !meta) return;

  state.latestSession = session;

  body.innerHTML = "";
  const template = document.getElementById("session-row-template");
  let aiNotes = 0;
  session.results.forEach((item) => {
    if (item.aiDescription || item.aiFixPrompt) aiNotes += 1;
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector("td").textContent = item.definition.name;
    const pill = row.querySelector(".status-pill");
    pill.textContent = item.status;
    pill.classList.toggle("pass", item.status === "pass");
    pill.classList.toggle("fail", item.status !== "pass");
    row.querySelectorAll("td")[2].textContent = formatDuration(item.durationMs);
    row.querySelectorAll("td")[3].textContent = item.aiDescription ?? item.aiFixPrompt ?? "—";
    body.appendChild(row);
  });

  if (aiCounter) aiCounter.textContent = String(aiNotes);
  statusPill.textContent = `${session.passed}/${session.total} pass`;
  statusPill.className = `status-pill ${session.failed === 0 ? "pass" : "fail"}`;
  meta.textContent = `Started ${formatRelativeTime(session.startedAt)} • Duration ${formatDuration(session.durationMs)}`;
  updateHeroMetrics(state.counts);
};

const fetchLatestSession = async () => {
  try {
    const response = await fetchJSON("/api/tests/latest");
    return response.data.session;
  } catch (error) {
    return null;
  }
};

const pollSession = (sessionUuid, onUpdate) => {
  const controller = new AbortController();
  const poll = async () => {
    if (controller.signal.aborted) return;
    try {
      const { data } = await fetchJSON(`/api/tests/session/${sessionUuid}`);
      onUpdate(data.session);
      if (data.session.failed + data.session.passed === data.session.total) {
        controller.abort();
        return;
      }
    } catch (error) {
      console.warn("Polling failed", error);
    }
    setTimeout(poll, 2500);
  };
  poll();
  return () => controller.abort();
};

const initLandingPage = () => {
  const metricsStrip = document.getElementById("metrics-strip");
  if (!metricsStrip) return;

  refreshTaskStats();
  setInterval(refreshTaskStats, 60_000);

  const scrollButton = document.getElementById("scroll-metrics");
  if (scrollButton) {
    scrollButton.addEventListener("click", () => {
      document.getElementById("metrics")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  // Agent Command Center Modal
  const openModalBtn = document.getElementById("open-agent-modal-btn");
  const closeModalBtn = document.getElementById("close-agent-modal");
  const modal = document.getElementById("agent-modal");

  if (openModalBtn && modal) {
    openModalBtn.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
  }

  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }

  // Close modal when clicking outside
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });
  }

  const registerBtn = document.getElementById("register-agent-btn");
  if (registerBtn) {
    registerBtn.addEventListener("click", () => {
      const value = (document.getElementById("agent-name-input")?.value ?? "").trim();
      if (!value) {
        alert("Provide an agent name to register.");
        return;
      }
      state.agentName = value;
      hub.registerAgent(value);
    });
  }

  const checkInBtn = document.getElementById("btn-check-in");
  if (checkInBtn) {
    checkInBtn.addEventListener("click", async () => {
      if (!state.agentName) {
        alert("Register an agent name first.");
        return;
      }
      const status = document.getElementById("agent-status-select")?.value ?? "available";
      const note = document.getElementById("agent-note-input")?.value ?? "";
      try {
        const { data } = await fetchJSON("/api/agents/check-in", {
          method: "POST",
          body: JSON.stringify({
            agentName: state.agentName,
            status,
            note: note || undefined,
          }),
        });
        const activity = data.activity;
        const existingIndex = state.agentActivity.findIndex((item) => item.agentName === activity.agentName);
        if (existingIndex >= 0) {
          state.agentActivity[existingIndex] = activity;
        } else {
          state.agentActivity.unshift(activity);
        }
        renderAgentActivity();
      } catch (error) {
        console.error("Agent check-in failed", error);
      }
    });
  }

  const fetchOpenBtn = document.getElementById("btn-fetch-open");
  if (fetchOpenBtn) {
    fetchOpenBtn.addEventListener("click", () => {
      hub.send("tasks.fetchOpen", {});
    });
  }

  const fetchAgentBtn = document.getElementById("btn-fetch-agent");
  if (fetchAgentBtn) {
    fetchAgentBtn.addEventListener("click", () => {
      if (!state.agentName) {
        alert("Register an agent name first.");
        return;
      }
      hub.send("tasks.fetchByAgent", { agent: state.agentName });
    });
  }

  const statsBtn = document.getElementById("btn-request-stats");
  if (statsBtn) {
    statsBtn.addEventListener("click", () => hub.send("agents.requestStats", {}));
  }

  const runTestsBtn = document.getElementById("btn-run-tests");
  if (runTestsBtn) {
    runTestsBtn.addEventListener("click", async () => {
      try {
        const { data } = await fetchJSON("/api/tests/run", {
          method: "POST",
          body: JSON.stringify({ reason: "command-center" }),
        });
        pollSession(data.sessionUuid, (session) => {
          renderSession(session);
        });
      } catch (error) {
        console.error("Failed to trigger tests", error);
      }
    });
  }

  const refreshRestBtn = document.getElementById("btn-refresh-rest");
  if (refreshRestBtn) {
    refreshRestBtn.addEventListener("click", () => {
      refreshTaskStats();
    });
  }

  const broadcastSummaryBtn = document.getElementById("btn-broadcast-summary");
  if (broadcastSummaryBtn) {
    broadcastSummaryBtn.addEventListener("click", () => hub.send("agents.requestStats", {}));
  }

  const clearLogBtn = document.getElementById("btn-clear-log");
  if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
      const container = getEl("#ws-log");
      if (container) container.innerHTML = "";
    });
  }

const refreshMcpBtn = document.getElementById("btn-refresh-mcp");
if (refreshMcpBtn) refreshMcpBtn.addEventListener("click", refreshMcpTools);
const copyMcpBtn = document.getElementById("btn-copy-mcp");
if (copyMcpBtn) copyMcpBtn.addEventListener("click", copyMcpTools);

// --- Projects Pages ---
const initProjectsPage = () => {
  loadProjects();
  initCreateProjectModal();
};

const initProjectPage = () => {
  const projectId = getProjectIdFromUrl();
  if (projectId) {
    loadProject(projectId);
    initProjectModals();
    initWebSocketForProject(projectId);
  }
};

// Get project ID from URL
const getProjectIdFromUrl = () => {
  const path = window.location.pathname;
  const match = path.match(/^\/projects\/([^\/]+)$/);
  return match ? match[1] : null;
};

// Projects list functionality
const loadProjects = async () => {
  const loadingState = document.getElementById("loading-state");
  const emptyState = document.getElementById("empty-state");
  const projectsGrid = document.getElementById("projects-grid");

  if (loadingState) loadingState.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");
  if (projectsGrid) projectsGrid.innerHTML = "";

  try {
    const { data } = await fetchJSON("/api/projects");
    renderProjects(data.projects || []);
  } catch (error) {
    console.error("Failed to load projects", error);
    if (loadingState) loadingState.innerHTML = "Error loading projects";
  } finally {
    if (loadingState) loadingState.classList.add("hidden");
  }
};

const renderProjects = (projects) => {
  const projectsGrid = document.getElementById("projects-grid");
  const emptyState = document.getElementById("empty-state");
  const template = document.getElementById("project-card-template");

  if (!projectsGrid || !template) return;

  if (projects.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  projects.forEach(project => {
    const card = template.content.cloneNode(true);
    const cardElement = card.querySelector(".project-card");

    cardElement.querySelector(".project-title").textContent = project.title;
    cardElement.querySelector(".project-status").textContent = project.status;
    cardElement.querySelector(".project-priority").textContent = project.priority;
    cardElement.querySelector(".project-description").textContent = project.description || "No description";
    cardElement.querySelector(".project-agent").textContent = `Agent: ${project.assignedAgent || "Unassigned"}`;
    cardElement.querySelector(".project-target").textContent = `Target: ${project.targetCompletion ? new Date(project.targetCompletion).toLocaleDateString() : "Not set"}`;
    cardElement.querySelector(".task-count").textContent = `${project.taskCount || 0} tasks`;
    cardElement.querySelector(".epic-count").textContent = `${project.epicCount || 0} epics`;
    cardElement.querySelector(".project-link").href = `/projects/${project.id}`;

    // Status and priority styling
    const statusElement = cardElement.querySelector(".project-status");
    const priorityElement = cardElement.querySelector(".project-priority");

    statusElement.className = `status-badge status-${project.status}`;
    priorityElement.className = `priority-badge priority-${project.priority}`;

    projectsGrid.appendChild(card);
  });
};

const initCreateProjectModal = () => {
  const modal = document.getElementById("create-project-modal");
  const openBtn = document.getElementById("create-project-btn");
  const closeBtn = document.getElementById("close-create-modal");
  const cancelBtn = document.getElementById("cancel-create");
  const form = document.getElementById("create-project-form");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (modal) modal.classList.remove("hidden");
      loadAgentsForSelect("project-agent");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (modal) modal.classList.add("hidden");
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (modal) modal.classList.add("hidden");
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await createProject(new FormData(form));
    });
  }
};

const createProject = async (formData) => {
  try {
    const projectData = {
      title: formData.get("title"),
      description: formData.get("description"),
      priority: formData.get("priority"),
      targetCompletion: formData.get("targetCompletion"),
      assignedAgent: formData.get("assignedAgent") || null,
    };

    await fetchJSON("/api/projects", {
      method: "POST",
      body: JSON.stringify(projectData),
    });

    const modal = document.getElementById("create-project-modal");
    if (modal) modal.classList.add("hidden");

    // Reset form
    const form = document.getElementById("create-project-form");
    if (form) form.reset();

    // Reload projects
    loadProjects();
  } catch (error) {
    console.error("Failed to create project", error);
    alert("Failed to create project. Please try again.");
  }
};

// Individual project page functionality
const loadProject = async (projectId) => {
  try {
    const { data } = await fetchJSON(`/api/projects/${projectId}`);
    renderProject(data.project);
    renderEpicsAndTasks(data.epics || [], data.tasks || []);
    renderAgentActivity(data.agentActivity || []);
  } catch (error) {
    console.error("Failed to load project", error);
    document.getElementById("project-title").textContent = "Error loading project";
  }
};

const renderProject = (project) => {
  document.getElementById("project-title").textContent = project.title;
  document.getElementById("project-description").textContent = project.description || "No description";
  document.getElementById("project-status").textContent = project.status;
  document.getElementById("project-priority").textContent = project.priority;
  document.getElementById("project-agent").textContent = `Agent: ${project.assignedAgent || "Unassigned"}`;

  // Status and priority styling
  const statusElement = document.getElementById("project-status");
  const priorityElement = document.getElementById("project-priority");

  statusElement.className = `status-badge status-${project.status}`;
  priorityElement.className = `priority-badge priority-${project.priority}`;
};

const renderEpicsAndTasks = (epics, tasks) => {
  const container = document.getElementById("epics-container");
  const template = document.getElementById("epic-card-template");
  const taskTemplate = document.getElementById("task-card-template");

  if (!container || !template || !taskTemplate) return;

  container.innerHTML = "";

  if (epics.length === 0 && tasks.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-slate-400">No epics or tasks yet. Create your first task!</div>';
    return;
  }

  // Group tasks by epic
  const tasksByEpic = {};
  const tasksWithoutEpic = [];

  tasks.forEach(task => {
    if (task.epicId) {
      if (!tasksByEpic[task.epicId]) {
        tasksByEpic[task.epicId] = [];
      }
      tasksByEpic[task.epicId].push(task);
    } else {
      tasksWithoutEpic.push(task);
    }
  });

  // Render epics with their tasks
  epics.forEach(epic => {
    const epicCard = template.content.cloneNode(true);
    const epicElement = epicCard.querySelector(".epic-card");

    epicElement.dataset.epicId = epic.id;
    epicElement.querySelector(".epic-title").textContent = epic.title;
    epicElement.querySelector(".epic-description").textContent = epic.description || "No description";
    epicElement.querySelector(".epic-status").textContent = `Status: ${epic.status}`;
    epicElement.querySelector(".epic-priority").textContent = `Priority: ${epic.priority}`;

    // Render tasks for this epic
    const tasksContainer = epicElement.querySelector(".epic-tasks");
    const epicTasks = tasksByEpic[epic.id] || [];

    epicTasks.forEach(task => {
      const taskCard = renderTaskCard(task, taskTemplate);
      tasksContainer.appendChild(taskCard);
    });

    container.appendChild(epicCard);
  });

  // Render tasks without epics
  if (tasksWithoutEpic.length > 0) {
    const noEpicSection = document.createElement("div");
    noEpicSection.innerHTML = "<h3 class='text-lg font-semibold text-white mb-4'>Tasks (No Epic)</h3>";

    tasksWithoutEpic.forEach(task => {
      const taskCard = renderTaskCard(task, taskTemplate);
      noEpicSection.appendChild(taskCard);
    });

    container.appendChild(noEpicSection);
  }
};

const renderTaskCard = (task, template) => {
  const taskCard = template.content.cloneNode(true);
  const cardElement = taskCard.querySelector(".task-card");

  cardElement.dataset.taskId = task.id;
  cardElement.classList.toggle("blocked", task.status === "blocked");

  cardElement.querySelector(".task-title").textContent = task.title;
  cardElement.querySelector(".task-description").textContent = task.description || "No description";
  cardElement.querySelector(".task-status").textContent = task.status;

  // Agent avatar
  const avatar = cardElement.querySelector(".task-agent-avatar");
  avatar.textContent = task.assignedAgent ? task.assignedAgent.charAt(0).toUpperCase() : "?";
  avatar.title = task.assignedAgent || "Unassigned";

  // Status styling
  const statusElement = cardElement.querySelector(".task-status");
  statusElement.className = `status-badge status-${task.status}`;

  // Add click handler for task
  cardElement.addEventListener("click", () => showTaskDetails(task));

  return taskCard;
};

const renderAgentActivity = (activities) => {
  const container = document.getElementById("agent-activity");
  if (!container) return;

  container.innerHTML = "";

  if (activities.length === 0) {
    container.innerHTML = '<div class="text-slate-400">No recent agent activity</div>';
    return;
  }

  activities.forEach(activity => {
    const activityItem = document.createElement("div");
    activityItem.className = "flex items-center gap-3 p-2 rounded";
    activityItem.innerHTML = `
      <div class="agent-avatar">${activity.agentName.charAt(0).toUpperCase()}</div>
      <div class="flex-1">
        <div class="text-white text-sm font-medium">${activity.agentName}</div>
        <div class="text-slate-400 text-xs">${activity.action} • ${new Date(activity.timestamp).toLocaleString()}</div>
      </div>
    `;
    container.appendChild(activityItem);
  });
};

const initProjectModals = () => {
  // Add Task Modal
  const addTaskModal = document.getElementById("add-task-modal");
  const addTaskBtn = document.getElementById("add-task-btn");
  const closeAddTaskBtn = document.getElementById("close-add-task-modal");
  const cancelAddTaskBtn = document.getElementById("cancel-add-task");
  const addTaskForm = document.getElementById("add-task-form");

  if (addTaskBtn) {
    addTaskBtn.addEventListener("click", async () => {
      if (addTaskModal) addTaskModal.classList.remove("hidden");
      await loadEpicsForSelect();
      await loadAgentsForSelect("task-agent");
    });
  }

  if (closeAddTaskBtn) {
    closeAddTaskBtn.addEventListener("click", () => {
      if (addTaskModal) addTaskModal.classList.add("hidden");
    });
  }

  if (cancelAddTaskBtn) {
    cancelAddTaskBtn.addEventListener("click", () => {
      if (addTaskModal) addTaskModal.classList.add("hidden");
    });
  }

  if (addTaskForm) {
    addTaskForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await createTask(new FormData(addTaskForm));
    });
  }

  // Close modals when clicking outside
  [addTaskModal].forEach(modal => {
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.add("hidden");
        }
      });
    }
  });

  // Reassign tasks button
  const reassignBtn = document.getElementById("reassign-btn");
  if (reassignBtn) {
    reassignBtn.addEventListener("click", () => reassignTasksToAvailableAgents());
  }

  // Bulk update button
  const bulkUpdateBtn = document.getElementById("bulk-update-btn");
  if (bulkUpdateBtn) {
    bulkUpdateBtn.addEventListener("click", () => showBulkUpdateModal());
  }
};

const loadEpicsForSelect = async () => {
  const projectId = getProjectIdFromUrl();
  try {
    const { data } = await fetchJSON(`/api/projects/${projectId}/epics`);
    const select = document.getElementById("task-epic");
    if (select) {
      select.innerHTML = '<option value="">No Epic</option>';
      data.epics.forEach(epic => {
        const option = document.createElement("option");
        option.value = epic.id;
        option.textContent = epic.title;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Failed to load epics", error);
  }
};

const loadAgentsForSelect = async (selectId) => {
  try {
    const { data } = await fetchJSON("/api/agents");
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = '<option value="">Select agent...</option>';
      data.agents.forEach(agent => {
        const option = document.createElement("option");
        option.value = agent.name;
        option.textContent = agent.name;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Failed to load agents", error);
  }
};

const createTask = async (formData) => {
  const projectId = getProjectIdFromUrl();
  try {
    const taskData = {
      title: formData.get("title"),
      description: formData.get("description"),
      priority: formData.get("priority"),
      epicId: formData.get("epicId") || null,
      assignedAgent: formData.get("assignedAgent") || null,
      projectId,
    };

    await fetchJSON("/api/tasks", {
      method: "POST",
      body: JSON.stringify(taskData),
    });

    const modal = document.getElementById("add-task-modal");
    if (modal) modal.classList.add("hidden");

    // Reset form
    const form = document.getElementById("add-task-form");
    if (form) form.reset();

    // Reload project
    loadProject(projectId);
  } catch (error) {
    console.error("Failed to create task", error);
    alert("Failed to create task. Please try again.");
  }
};

const reassignTasksToAvailableAgents = async () => {
  const projectId = getProjectIdFromUrl();
  try {
    await fetchJSON(`/api/projects/${projectId}/reassign`, {
      method: "POST",
    });
    loadProject(projectId);
    alert("Tasks reassigned to available agents");
  } catch (error) {
    console.error("Failed to reassign tasks", error);
    alert("Failed to reassign tasks");
  }
};

const showBulkUpdateModal = () => {
  // TODO: Implement bulk update modal
  alert("Bulk update feature coming soon!");
};

const showTaskDetails = (task) => {
  // TODO: Implement task details modal
  console.log("Task details:", task);
};

// Chat functionality
const initProjectChat = () => {
  const newThreadModal = document.getElementById("new-thread-modal");
  const newThreadBtn = document.getElementById("new-thread-btn");
  const closeNewThreadBtn = document.getElementById("close-new-thread-modal");
  const cancelNewThreadBtn = document.getElementById("cancel-new-thread");
  const newThreadForm = document.getElementById("new-thread-form");
  const sendMessageBtn = document.getElementById("send-message-btn");
  const chatInput = document.getElementById("chat-input");

  if (newThreadBtn) {
    newThreadBtn.addEventListener("click", () => {
      if (newThreadModal) newThreadModal.classList.remove("hidden");
    });
  }

  if (closeNewThreadBtn) {
    closeNewThreadBtn.addEventListener("click", () => {
      if (newThreadModal) newThreadModal.classList.add("hidden");
    });
  }

  if (cancelNewThreadBtn) {
    cancelNewThreadBtn.addEventListener("click", () => {
      if (newThreadModal) newThreadModal.classList.add("hidden");
    });
  }

  if (newThreadForm) {
    newThreadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await createThread(new FormData(newThreadForm));
    });
  }

  if (sendMessageBtn) {
    sendMessageBtn.addEventListener("click", () => sendMessage());
  }

  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Close modals when clicking outside
  [newThreadModal].forEach(modal => {
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.add("hidden");
        }
      });
    }
  });
};

const loadThreads = async () => {
  const projectId = getProjectIdFromUrl();
  try {
    const { data } = await fetchJSON(`/api/projects/${projectId}/threads`);
    renderThreads(data.threads || []);
  } catch (error) {
    console.error("Failed to load threads", error);
  }
};

const renderThreads = (threads) => {
  const container = document.getElementById("threads-list");
  const template = document.getElementById("thread-item-template");

  if (!container || !template) return;

  container.innerHTML = "";

  if (threads.length === 0) {
    container.innerHTML = '<div class="text-slate-400 text-sm">No threads yet</div>';
    return;
  }

  threads.forEach(thread => {
    const threadItem = template.content.cloneNode(true);
    const itemElement = threadItem.querySelector(".thread-item");

    itemElement.dataset.threadId = thread.id;
    itemElement.querySelector(".thread-subject").textContent = thread.subject;
    itemElement.querySelector(".thread-author").textContent = thread.author;
    itemElement.querySelector(".thread-time").textContent = new Date(thread.createdAt).toLocaleString();
    itemElement.querySelector(".thread-messages").textContent = `${thread.messageCount} messages`;

    itemElement.addEventListener("click", () => selectThread(thread.id));

    container.appendChild(threadItem);
  });
};

const createThread = async (formData) => {
  const projectId = getProjectIdFromUrl();
  try {
    const threadData = {
      subject: formData.get("subject"),
      message: formData.get("message"),
      projectId,
    };

    const { data } = await fetchJSON(`/api/projects/${projectId}/threads`, {
      method: "POST",
      body: JSON.stringify(threadData),
    });

    const modal = document.getElementById("new-thread-modal");
    if (modal) modal.classList.add("hidden");

    // Reset form
    const form = document.getElementById("new-thread-form");
    if (form) form.reset();

    // Select the new thread
    selectThread(data.thread.id);
    loadThreads();
  } catch (error) {
    console.error("Failed to create thread", error);
    alert("Failed to create thread. Please try again.");
  }
};

let currentThreadId = null;

const selectThread = async (threadId) => {
  currentThreadId = threadId;

  // Update UI
  document.querySelectorAll(".thread-item").forEach(item => {
    item.classList.toggle("active", item.dataset.threadId === threadId);
  });

  // Load messages
  await loadThreadMessages(threadId);
};

const loadThreadMessages = async (threadId) => {
  try {
    const { data } = await fetchJSON(`/api/threads/${threadId}/messages`);
    renderMessages(data.messages || []);
  } catch (error) {
    console.error("Failed to load messages", error);
  }
};

const renderMessages = (messages) => {
  const container = document.getElementById("chat-messages");
  const template = document.getElementById("message-template");

  if (!container || !template) return;

  container.innerHTML = "";

  messages.forEach(message => {
    const messageItem = template.content.cloneNode(true);
    const itemElement = messageItem.querySelector(".chat-message");

    itemElement.dataset.messageId = message.id;
    itemElement.querySelector(".message-author").textContent = message.author;
    itemElement.querySelector(".message-time").textContent = new Date(message.timestamp).toLocaleString();
    itemElement.querySelector(".message-content").textContent = message.content;

    // Agent avatar
    const avatar = itemElement.querySelector(".message-avatar");
    avatar.textContent = message.author.charAt(0).toUpperCase();
    avatar.title = message.author;

    // Handle replies
    if (message.parentId) {
      itemElement.classList.add("reply-indicator");
    }

    // Reply button
    const replyBtn = itemElement.querySelector(".message-reply");
    replyBtn.addEventListener("click", () => showReplyForm(message.id));

    // Render replies
    if (message.replies && message.replies.length > 0) {
      const repliesContainer = itemElement.querySelector(".message-replies");
      message.replies.forEach(reply => {
        const replyItem = template.content.cloneNode(true);
        const replyElement = replyItem.querySelector(".chat-message");
        replyElement.classList.add("reply-indicator");

        replyElement.querySelector(".message-author").textContent = reply.author;
        replyElement.querySelector(".message-time").textContent = new Date(reply.timestamp).toLocaleString();
        replyElement.querySelector(".message-content").textContent = reply.content;

        const replyAvatar = replyElement.querySelector(".message-avatar");
        replyAvatar.textContent = reply.author.charAt(0).toUpperCase();

        repliesContainer.appendChild(replyElement);
      });
    }

    container.appendChild(itemElement);
  });
};

const sendMessage = async () => {
  if (!currentThreadId) {
    alert("Please select a thread first");
    return;
  }

  const input = document.getElementById("chat-input");
  const content = input.value.trim();

  if (!content) return;

  try {
    await fetchJSON(`/api/threads/${currentThreadId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        author: state.agentName || "Anonymous",
      }),
    });

    input.value = "";
    await loadThreadMessages(currentThreadId);
  } catch (error) {
    console.error("Failed to send message", error);
    alert("Failed to send message");
  }
};

const showReplyForm = (parentMessageId) => {
  // TODO: Implement reply form
  console.log("Reply to message:", parentMessageId);
};

const initWebSocketForProject = (projectId) => {
  // TODO: Implement WebSocket connection for real-time updates
  console.log("WebSocket for project:", projectId);
};

// Initialize page-specific functionality
if (window.location.pathname === "/projects") {
  initProjectsPage();
} else if (window.location.pathname.startsWith("/projects/")) {
  initProjectPage();
  initProjectChat();
}
};

const initHealthPage = async () => {
  const testsResponse = await fetchJSON("/api/tests/defs").catch(() => null);
  if (testsResponse) {
    renderTestCards(testsResponse.data.tests);
  }

  const latest = await fetchLatestSession();
  if (latest) {
    renderSession(latest);
  }

  const runButton = document.getElementById("run-tests-btn");
  const spinner = document.getElementById("run-tests-spinner");
  if (runButton) {
    runButton.addEventListener("click", async () => {
      runButton.disabled = true;
      spinner?.classList.remove("hidden");
      try {
        const { data } = await fetchJSON("/api/tests/run", {
          method: "POST",
          body: JSON.stringify({ reason: "health-console" }),
        });
        pollSession(data.sessionUuid, (session) => {
          renderSession(session);
          refreshTaskStats();
        });
      } catch (error) {
        console.error("Failed to run tests", error);
      } finally {
        runButton.disabled = false;
        spinner?.classList.add("hidden");
      }
    });
  }

  const refreshButton = document.getElementById("refresh-latest");
  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      const latestSession = await fetchLatestSession();
      if (latestSession) {
        renderSession(latestSession);
      }
    });
  }
};

hub.on("*", handleWsMessage);

const bootstrap = async () => {
  await loadNav();
  initIntersectionObserver();
  refreshTaskStats();
  refreshMcpTools();

  if (document.body.contains(document.getElementById("metrics-strip"))) {
    initLandingPage();
  }
  if (document.body.contains(document.getElementById("health-tests"))) {
    initHealthPage();
  }
};

bootstrap().catch((error) => console.error("Bootstrap failed", error));
