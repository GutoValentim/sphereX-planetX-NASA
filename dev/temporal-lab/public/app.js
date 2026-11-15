const elements = {
  form: document.querySelector("#searchForm"),
  ra: document.querySelector("#raInput"),
  dec: document.querySelector("#decInput"),
  mode: document.querySelector("#modeInput"),
  searchButton: document.querySelector("#searchButton"),
  serviceStatus: document.querySelector("#serviceStatus"),
  totalTimer: document.querySelector("#totalTimer"),
  discoveryTimer: document.querySelector("#discoveryTimer"),
  frameTimer: document.querySelector("#frameTimer"),
  cacheStatus: document.querySelector("#cacheStatus"),
  prefetchProgress: document.querySelector("#prefetchProgress"),
  message: document.querySelector("#message"),
  viewer: document.querySelector("#viewerPanel"),
  image: document.querySelector("#frameImage"),
  overlay: document.querySelector("#loadingOverlay"),
  loadingTitle: document.querySelector("#loadingTitle"),
  slider: document.querySelector("#frameSlider"),
  frameCounter: document.querySelector("#frameCounter"),
  observationId: document.querySelector("#observationId"),
  observedAt: document.querySelector("#observedAt"),
  frameGap: document.querySelector("#frameGap"),
  availableCount: document.querySelector("#availableCount"),
  previous: document.querySelector("#previousButton"),
  next: document.querySelector("#nextButton"),
  clearDataset: document.querySelector("#clearDatasetButton"),
  clearAll: document.querySelector("#clearAllButton"),
  exploreTabButton: document.querySelector("#exploreTabButton"),
  historyTabButton: document.querySelector("#historyTabButton"),
  exploreTab: document.querySelector("#exploreTab"),
  historyTab: document.querySelector("#historyTab"),
  historyList: document.querySelector("#historyList"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyCount: document.querySelector("#historyCountBadge"),
  clearHistory: document.querySelector("#clearHistoryButton"),
};

const HISTORY_KEY = "spherex-temporal-history-v1";
const HISTORY_LIMIT = 30;
const LAB_API_ORIGIN = "http://127.0.0.1:8765";
const configuredApiOrigin = new URLSearchParams(window.location.search).get("api");
const isLabOrigin = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  && window.location.port === "8765";
const apiOrigin = configuredApiOrigin || (isLabOrigin ? "" : LAB_API_ORIGIN);

const state = {
  dataset: null,
  frames: [],
  currentPosition: 0,
  loaded: new Map(),
  jobId: null,
  displayedObservationIndex: null,
  requestToken: 0,
  displayToken: 0,
  timerInterval: null,
  timerStarted: 0,
};

function seconds(milliseconds) {
  return `${(milliseconds / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} s`;
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timerStarted = performance.now();
  elements.totalTimer.textContent = "0,0 s";
  state.timerInterval = setInterval(() => {
    elements.totalTimer.textContent = seconds(performance.now() - state.timerStarted);
  }, 100);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  elements.totalTimer.textContent = seconds(performance.now() - state.timerStarted);
}

function apiUrl(path) {
  return `${apiOrigin}${path}`;
}

function resourceUrl(path) {
  if (!path || /^(https?:|data:|blob:)/.test(path)) return path;
  return `${apiOrigin}${path}`;
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (error) {
    throw new Error(
      `Não foi possível acessar o serviço em ${LAB_API_ORIGIN}. Inicie o server.py e tente novamente.`,
      { cause: error },
    );
  }

  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch (error) {
    const receivedHtml = body.trimStart().startsWith("<");
    const detail = receivedHtml
      ? `A rota ${path} devolveu HTML em vez de JSON. Abra ${LAB_API_ORIGIN} ou mantenha o server.py em execução.`
      : `A rota ${path} devolveu uma resposta inválida.`;
    throw new Error(detail, { cause: error });
  }

  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function writeHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch (_) {
    // O histórico é auxiliar e nunca deve interromper uma consulta científica.
  }
  renderHistory();
}

function historyId(entry) {
  return `${Number(entry.ra_deg).toFixed(9)}:${Number(entry.dec_deg).toFixed(9)}:${entry.mode}`;
}

function modeLabel(mode) {
  return { fast: "Rápida", balanced: "Balanceada", full: "Completa" }[mode] || mode;
}

function saveToHistory(dataset) {
  const entry = {
    ra_deg: dataset.ra_deg,
    dec_deg: dataset.dec_deg,
    mode: dataset.mode,
    available_frame_count: dataset.available_frame_count,
    selected_frame_count: dataset.selected_frame_count,
    last_used_at: new Date().toISOString(),
  };
  const id = historyId(entry);
  const entries = readHistory().filter((item) => historyId(item) !== id);
  writeHistory([entry, ...entries]);
}

function switchTab(name) {
  const showHistory = name === "history";
  elements.exploreTab.hidden = showHistory;
  elements.historyTab.hidden = !showHistory;
  elements.exploreTabButton.classList.toggle("active", !showHistory);
  elements.historyTabButton.classList.toggle("active", showHistory);
  elements.exploreTabButton.setAttribute("aria-selected", String(!showHistory));
  elements.historyTabButton.setAttribute("aria-selected", String(showHistory));
  if (showHistory) renderHistory();
}

function renderHistory() {
  const entries = readHistory();
  elements.historyCount.textContent = String(entries.length);
  elements.historyList.replaceChildren();
  elements.historyEmpty.hidden = entries.length > 0;
  elements.clearHistory.disabled = entries.length === 0;

  entries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";

    const content = document.createElement("div");
    const coordinates = document.createElement("h3");
    coordinates.className = "history-coordinates";
    coordinates.textContent = `RA ${Number(entry.ra_deg).toFixed(9)}° · Dec ${Number(entry.dec_deg).toFixed(9)}°`;
    const metadata = document.createElement("div");
    metadata.className = "history-meta";
    [
      `${modeLabel(entry.mode)} · ${entry.selected_frame_count} frames`,
      `${entry.available_frame_count} épocas disponíveis`,
      `Último acesso: ${new Date(entry.last_used_at).toLocaleString("pt-BR")}`,
    ].forEach((text) => {
      const item = document.createElement("span");
      item.textContent = text;
      metadata.append(item);
    });
    content.append(coordinates, metadata);

    const actions = document.createElement("div");
    actions.className = "history-actions";
    const openButton = document.createElement("button");
    openButton.className = "primary-button";
    openButton.type = "button";
    openButton.textContent = "Abrir";
    openButton.addEventListener("click", () => {
      elements.ra.value = entry.ra_deg;
      elements.dec.value = entry.dec_deg;
      elements.mode.value = entry.mode;
      switchTab("explore");
      elements.form.requestSubmit();
    });
    const removeButton = document.createElement("button");
    removeButton.className = "ghost-button danger";
    removeButton.type = "button";
    removeButton.textContent = "Remover";
    removeButton.addEventListener("click", () => {
      const id = historyId(entry);
      writeHistory(readHistory().filter((item) => historyId(item) !== id));
    });
    actions.append(openButton, removeButton);
    card.append(content, actions);
    elements.historyList.append(card);
  });
}

function setMessage(message, error = false) {
  elements.message.textContent = message;
  elements.message.classList.toggle("error", error);
}

function setSearching(searching, label = "Consultando IRSA…") {
  elements.searchButton.disabled = searching;
  elements.searchButton.textContent = searching ? label : "Buscar sequência";
}

function updateFrameMetadata(position) {
  const item = state.frames[position];
  if (!item) return;
  state.currentPosition = position;
  elements.slider.value = String(position);
  elements.frameCounter.textContent = `${position + 1} / ${state.frames.length}`;
  elements.observationId.textContent = item.observation_id;
  elements.observedAt.textContent = new Date(`${item.observed_at}Z`).toLocaleString("pt-BR", { timeZone: "UTC" });
  elements.frameGap.textContent = item.gap_from_previous_seconds == null
    ? "primeiro frame"
    : formatGap(item.gap_from_previous_seconds);
  elements.previous.disabled = position === 0;
  elements.next.disabled = position === state.frames.length - 1;
}

function formatGap(value) {
  if (value < 60) return `${value.toFixed(1)} s`;
  if (value < 3600) return `${(value / 60).toFixed(1)} min`;
  if (value < 86400) return `${(value / 3600).toFixed(2)} h`;
  return `${(value / 86400).toFixed(2)} dias`;
}

async function displayImage(url) {
  await new Promise((resolve, reject) => {
    elements.image.onload = resolve;
    elements.image.onerror = reject;
    elements.image.src = url;
  });
}

async function showFrame(position, { first = false } = {}) {
  updateFrameMetadata(position);
  const item = state.frames[position];
  const cached = state.loaded.get(item.observation_index);
  if (!cached) {
    state.displayedObservationIndex = null;
    elements.overlay.hidden = false;
    elements.loadingTitle.textContent = first
      ? "Carregando primeira imagem…"
      : `Preparando frame ${position + 1}…`;
    elements.frameTimer.textContent = "aguardando lote…";
    setMessage(`O frame ${position + 1} ainda está sendo preparado em segundo plano.`);
    return;
  }

  const token = ++state.displayToken;
  elements.overlay.hidden = false;
  elements.loadingTitle.textContent = `Exibindo frame ${position + 1}…`;
  try {
    await displayImage(resourceUrl(cached.image_url));
    if (token !== state.displayToken || position !== state.currentPosition) return;
    state.displayedObservationIndex = item.observation_index;
    elements.frameTimer.textContent = cached.cache_hit ? "cache" : "pré-carregado";
  } catch (error) {
    setMessage(error.message, true);
    throw error;
  } finally {
    if (token === state.displayToken) elements.overlay.hidden = true;
  }
}

function mergePrefetchedFrames(snapshot) {
  snapshot.frames.forEach((frame) => {
    state.loaded.set(frame.observation_index, frame);
  });
}

function firstLoadedPosition() {
  return state.frames.findIndex((frame) => state.loaded.has(frame.observation_index));
}

async function monitorPrefetch(jobId, requestToken) {
  while (requestToken === state.requestToken) {
    const snapshot = await api(`/api/prefetch/${jobId}`);
    if (requestToken !== state.requestToken) return;
    mergePrefetchedFrames(snapshot);
    elements.prefetchProgress.textContent = `${snapshot.processed} / ${snapshot.total}`;
    elements.cacheStatus.textContent = snapshot.completed
      ? `${snapshot.cache_hits}/${snapshot.completed} do cache`
      : (state.dataset.cache_hit ? "dataset cacheado" : "consulta nova");

    const currentItem = state.frames[state.currentPosition];
    const currentFailed = snapshot.errors.some(
      (item) => item.observation_index === currentItem.observation_index,
    );
    if (currentFailed && !state.loaded.has(currentItem.observation_index)) {
      const fallback = firstLoadedPosition();
      if (fallback >= 0) updateFrameMetadata(fallback);
    }

    const visibleItem = state.frames[state.currentPosition];
    if (
      state.loaded.has(visibleItem.observation_index)
      && state.displayedObservationIndex !== visibleItem.observation_index
    ) {
      await showFrame(state.currentPosition, { first: state.currentPosition === 0 });
    }

    if (snapshot.status !== "running") {
      stopTimer();
      if (snapshot.failed === 0) {
        setMessage(
          `Sequência completa: ${snapshot.completed} frames prontos em ${seconds(snapshot.elapsed_ms)}.`,
        );
      } else {
        setMessage(
          `${snapshot.completed} frames prontos e ${snapshot.failed} com falha em ${seconds(snapshot.elapsed_ms)}.`,
          true,
        );
      }
      return;
    }

    setSearching(true, `Baixando ${snapshot.processed}/${snapshot.total}…`);
    if (snapshot.completed > 0) {
      setMessage(
        `Primeiro frame disponível; preparando o restante (${snapshot.processed}/${snapshot.total}).`,
      );
    } else {
      setMessage("Metadados encontrados; preparando a primeira imagem…");
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setSearching(true);
  setMessage("Consultando metadados e procurando épocas…");
  elements.discoveryTimer.textContent = "consultando…";
  elements.frameTimer.textContent = "aguardando…";
  elements.cacheStatus.textContent = "—";
  elements.prefetchProgress.textContent = "0 / 0";
  elements.viewer.hidden = true;
  state.loaded.clear();
  state.displayedObservationIndex = null;
  state.displayToken += 1;
  const requestToken = ++state.requestToken;
  startTimer();
  try {
    const dataset = await api("/api/datasets", {
      method: "POST",
      body: JSON.stringify({
        ra_deg: Number(elements.ra.value),
        dec_deg: Number(elements.dec.value),
        mode: elements.mode.value,
      }),
    });
    state.dataset = dataset;
    state.frames = dataset.frames;
    state.jobId = dataset.prefetch.job_id;
    state.currentPosition = 0;
    elements.discoveryTimer.textContent = seconds(dataset.discovery_ms);
    elements.cacheStatus.textContent = dataset.cache_hit ? "dataset cacheado" : "consulta nova";
    elements.availableCount.textContent = `${dataset.available_frame_count} disponíveis · ${dataset.selected_frame_count} no modo · WCS alinhada`;
    elements.slider.min = "0";
    elements.slider.max = String(Math.max(0, dataset.frames.length - 1));
    elements.slider.value = "0";
    elements.viewer.hidden = false;
    saveToHistory(dataset);
    updateFrameMetadata(0);
    elements.overlay.hidden = false;
    elements.loadingTitle.textContent = "Carregando primeira imagem…";
    setMessage(`${dataset.available_frame_count} épocas encontradas; preparando toda a sequência.`);
    await monitorPrefetch(state.jobId, requestToken);
  } catch (error) {
    if (requestToken === state.requestToken) {
      stopTimer();
      setMessage(error.message, true);
    }
  } finally {
    if (requestToken === state.requestToken) setSearching(false);
  }
});

elements.slider.addEventListener("input", () => updateFrameMetadata(Number(elements.slider.value)));
elements.slider.addEventListener("change", () => showFrame(Number(elements.slider.value)).catch(() => {}));
elements.previous.addEventListener("click", () => showFrame(Math.max(0, state.currentPosition - 1)).catch(() => {}));
elements.next.addEventListener("click", () => showFrame(Math.min(state.frames.length - 1, state.currentPosition + 1)).catch(() => {}));
elements.exploreTabButton.addEventListener("click", () => switchTab("explore"));
elements.historyTabButton.addEventListener("click", () => switchTab("history"));

elements.clearHistory.addEventListener("click", () => {
  if (!confirm("Remover apenas o histórico de coordenadas deste navegador? O cache científico será preservado.")) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

elements.clearDataset.addEventListener("click", async () => {
  if (!state.dataset || !confirm("Remover o cache deste dataset? Os arquivos poderão ser baixados novamente.")) return;
  try {
    const result = await api(`/api/cache/${state.dataset.request_id}`, { method: "DELETE" });
    state.loaded.clear();
    elements.viewer.hidden = true;
    setMessage(`${result.removed} dataset removido do cache.`);
  } catch (error) { setMessage(error.message, true); }
});

elements.clearAll.addEventListener("click", async () => {
  if (!confirm("Remover todos os datasets do laboratório?")) return;
  try {
    const result = await api("/api/cache", { method: "DELETE" });
    state.loaded.clear();
    elements.viewer.hidden = true;
    setMessage(`${result.removed} caches removidos.`);
  } catch (error) { setMessage(error.message, true); }
});

api("/api/health")
  .then(() => {
    elements.serviceStatus.textContent = "Serviço online";
    elements.serviceStatus.classList.add("online");
  })
  .catch(() => {
    elements.serviceStatus.textContent = `Serviço indisponível · ${LAB_API_ORIGIN}`;
  });

renderHistory();
