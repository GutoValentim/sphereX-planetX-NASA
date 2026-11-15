const elements = {
  form: document.querySelector("#searchForm"),
  ra: document.querySelector("#raInput"),
  dec: document.querySelector("#decInput"),
  bandInputs: Array.from(document.querySelectorAll('input[name="bandpass"]')),
  selectAllBands: document.querySelector("#selectAllBands"),
  clearBands: document.querySelector("#clearBands"),
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
  layers: document.querySelector("#frameLayers"),
  layerLegend: document.querySelector("#layerLegend"),
  overlay: document.querySelector("#loadingOverlay"),
  loadingTitle: document.querySelector("#loadingTitle"),
  slider: document.querySelector("#frameSlider"),
  frameCounter: document.querySelector("#frameCounter"),
  observationId: document.querySelector("#observationId"),
  observedAt: document.querySelector("#observedAt"),
  frameGap: document.querySelector("#frameGap"),
  availableCount: document.querySelector("#availableCount"),
  spectralInfo: document.querySelector("#spectralInfo"),
  colorSwatch: document.querySelector("#colorSwatch"),
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
  fixedConfig: document.querySelector("#fixedConfig"),
  profileButtons: document.querySelector("#profileButtons"),
  colorModeButtons: document.querySelector("#colorModeButtons"),
  profileHint: document.querySelector("#profileHint"),
  settingsTabButton: document.querySelector("#settingsTabButton"),
  settingsTab: document.querySelector("#settingsTab"),
  fovOptions: document.querySelector("#fovOptions"),
  samplingOptions: document.querySelector("#samplingOptions"),
  applySettings: document.querySelector("#applySettingsButton"),
};

const HISTORY_KEY = "spherex-temporal-history-v2";
const LEGACY_HISTORY_KEY = "spherex-temporal-history-v1";
const HISTORY_LIMIT = 30;
const SETTINGS_KEY = "spherex-temporal-settings-v1";
const DEFAULT_SETTINGS = { fov_arcmin: 30, sampling: "native", render_profile: "limpa", color_mode: "color" };
// Usado só se /api/health falhar; o servidor é a fonte da verdade.
const FALLBACK_CATALOG = {
  fov_options: [10, 15, 20, 30, 40].map((fov) => ({
    fov_arcmin: fov,
    cutout_fov_arcmin: fov * 1.5,
    pixels: { native: oddCeil((fov * 60) / 6.15), "2x": oddCeil((fov * 60) / 3.075) },
  })),
  sampling_options: [
    { name: "native", pixel_scale_arcsec: 6.15 },
    { name: "2x", pixel_scale_arcsec: 3.075 },
  ],
  render_profiles: [
    { name: "original", label: "Original", description: "Como antes." },
    { name: "limpa", label: "Limpa", description: "Fundo removido e curva mais suave." },
  ],
};
const SAMPLING_TEXT = {
  native: ["Nativa", "6,15″/px · resolução do instrumento"],
  "2x": ["2× interpolada", "3,08″/px · mais suave, sem detalhe novo"],
};
const COLOR_MODE_TEXT = { color: "falsa cor", mono: "monocromático" };

function decimal(value, digits) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function arcmin(value) {
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}′`;
}

function oddCeil(value) {
  const size = Math.max(3, Math.ceil(value));
  return size % 2 === 0 ? size + 1 : size;
}
const LAB_API_ORIGIN = "http://127.0.0.1:8765";
const configuredApiOrigin = new URLSearchParams(window.location.search).get("api");
// Servida pelo próprio server.py (em qualquer porta local), a API é a mesma origem.
const isLabOrigin = window.location.protocol.startsWith("http")
  && ["127.0.0.1", "localhost"].includes(window.location.hostname);
const apiOrigin = configuredApiOrigin || (isLabOrigin ? "" : LAB_API_ORIGIN);

const state = {
  dataset: null,
  frames: [],
  currentPosition: 0,
  loaded: new Map(),
  jobs: {},
  requestToken: 0,
  displayToken: 0,
  displaySignature: null,
  timerInterval: null,
  timerStarted: 0,
  settings: readSettings(),
  catalog: FALLBACK_CATALOG,
  lastQuery: null,
};

function readSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...(stored && typeof stored === "object" ? stored : {}) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (_) {
    // Preferência local; a busca continua funcionando sem persistência.
  }
  renderSettings();
}

function fovOption(fov = state.settings.fov_arcmin) {
  return state.catalog.fov_options.find((option) => option.fov_arcmin === Number(fov))
    || state.catalog.fov_options.find((option) => option.fov_arcmin === 30);
}

function profileMeta(name = state.settings.render_profile) {
  return state.catalog.render_profiles.find((profile) => profile.name === name)
    || { name, label: name, description: "" };
}

function renderSettings() {
  const option = fovOption();
  const pixels = option.pixels[state.settings.sampling];
  elements.fixedConfig.textContent =
    `recorte ${arcmin(option.cutout_fov_arcmin)} → janela ${arcmin(option.fov_arcmin)} · ${pixels} px · máximo 100 frames`;

  elements.fovOptions.replaceChildren(...state.catalog.fov_options.map((item) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="fov" value="${item.fov_arcmin}" />`
      + `<strong>${arcmin(item.fov_arcmin)}</strong>`
      + `<small>recorte ${arcmin(item.cutout_fov_arcmin)}</small>`
      + `<small>${item.pixels[state.settings.sampling]} × ${item.pixels[state.settings.sampling]} px</small>`;
    const input = label.querySelector("input");
    input.checked = item.fov_arcmin === option.fov_arcmin;
    input.addEventListener("change", () => writeSettings({ fov_arcmin: item.fov_arcmin }));
    return label;
  }));

  elements.samplingOptions.replaceChildren(...state.catalog.sampling_options.map((item) => {
    const [title, detail] = SAMPLING_TEXT[item.name] || [item.name, `${item.pixel_scale_arcsec}″/px`];
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="sampling" value="${item.name}" />`
      + `<strong>${title}</strong><small>${detail}</small>`;
    const input = label.querySelector("input");
    input.checked = item.name === state.settings.sampling;
    input.addEventListener("change", () => writeSettings({ sampling: item.name }));
    return label;
  }));

  elements.profileButtons.replaceChildren(...state.catalog.render_profiles.map((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.dataset.profile = profile.name;
    button.title = profile.description;
    button.textContent = profile.label;
    button.setAttribute("aria-checked", String(profile.name === state.settings.render_profile));
    button.addEventListener("click", () => changeRendering({ render_profile: profile.name }));
    return button;
  }));
  elements.colorModeButtons.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.colorMode === state.settings.color_mode));
  });
  elements.profileHint.textContent = profileMeta().description;
}

function setRenderingBusy(busy) {
  elements.profileButtons.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  elements.colorModeButtons.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
}

async function changeRendering(patch) {
  const changed = Object.entries(patch).some(([key, value]) => state.settings[key] !== value);
  writeSettings(patch);
  if (!changed || !state.lastQuery) return;
  // Mesmos datasets e FITS; só a renderização muda, então mantém a época atual.
  await runComposite(state.lastQuery, { keepPosition: true });
}

function selectedBandpasses() {
  return elements.bandInputs.filter((input) => input.checked).map((input) => input.value);
}

function setSelectedBandpasses(bandpasses) {
  const selected = new Set(bandpasses);
  elements.bandInputs.forEach((input) => { input.checked = selected.has(input.value); });
}

function shortBand(bandpass) {
  return bandpass.replace("SPHEREx-", "");
}

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
    const stored = localStorage.getItem(HISTORY_KEY)
      || localStorage.getItem(LEGACY_HISTORY_KEY)
      || "[]";
    const value = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    return value.map((entry) => ({
      ...entry,
      bandpasses: entry.bandpasses || [entry.bandpass || "SPHEREx-D3"],
      timeline_count: entry.timeline_count || entry.selected_frame_count || 0,
      fov_arcmin: entry.fov_arcmin || 30,
      sampling: entry.sampling || "native",
    }));
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
  const bands = [...(entry.bandpasses || ["SPHEREx-D3"])].sort().join("+");
  return `${Number(entry.ra_deg).toFixed(9)}:${Number(entry.dec_deg).toFixed(9)}:${bands}:${entry.mode}:${entry.fov_arcmin || 30}:${entry.sampling || "native"}`;
}

function modeLabel(mode) {
  return { fast: "Rápida", balanced: "Balanceada", full: "Completa" }[mode] || mode;
}

function saveToHistory(dataset) {
  const entry = {
    ra_deg: dataset.ra_deg,
    dec_deg: dataset.dec_deg,
    bandpasses: dataset.bandpasses,
    mode: dataset.mode,
    fov_arcmin: dataset.fov_arcmin,
    sampling: dataset.sampling,
    timeline_count: dataset.timeline_count,
    last_used_at: new Date().toISOString(),
  };
  const id = historyId(entry);
  const entries = readHistory().filter((item) => historyId(item) !== id);
  writeHistory([entry, ...entries]);
}

function switchTab(name) {
  const tabs = {
    explore: [elements.exploreTabButton, elements.exploreTab],
    history: [elements.historyTabButton, elements.historyTab],
    settings: [elements.settingsTabButton, elements.settingsTab],
  };
  Object.entries(tabs).forEach(([key, [button, panel]]) => {
    const active = key === name;
    panel.hidden = !active;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (name === "history") renderHistory();
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
      `${(entry.bandpasses || ["SPHEREx-D3"]).map(shortBand).join(" + ")}`,
      `${modeLabel(entry.mode)} · ${entry.timeline_count || 0} composições`,
      `Janela ${arcmin(entry.fov_arcmin)} · ${(SAMPLING_TEXT[entry.sampling] || [entry.sampling])[0]}`,
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
      setSelectedBandpasses(entry.bandpasses || ["SPHEREx-D3"]);
      writeSettings({ fov_arcmin: entry.fov_arcmin, sampling: entry.sampling });
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

function layerKey(bandpass, observationIndex) {
  return `${bandpass}:${observationIndex}`;
}

function bandMetadata(bandpass) {
  return state.dataset?.bands.find((band) => band.bandpass === bandpass);
}

function formatGap(value) {
  const absolute = Math.abs(value);
  if (absolute < 60) return `${decimal(absolute, 1)} s`;
  if (absolute < 3600) return `${decimal(absolute / 60, 1)} min`;
  if (absolute < 86400) return `${decimal(absolute / 3600, 2)} h`;
  return `${decimal(absolute / 86400, 2)} dias`;
}

function formatSignedGap(value) {
  if (value === 0) return "mesma época";
  return `${value > 0 ? "+" : "−"}${formatGap(value)}`;
}

function updateFrameMetadata(position) {
  const item = state.frames[position];
  if (!item) return;
  state.currentPosition = position;
  elements.slider.value = String(position);
  elements.frameCounter.textContent = `${position + 1} / ${state.frames.length}`;
  elements.observationId.textContent = `${shortBand(item.anchor_bandpass)} · ${item.anchor_observation_id}`;
  elements.observedAt.textContent = new Date(`${item.observed_at}Z`).toLocaleString("pt-BR", { timeZone: "UTC" });
  elements.frameGap.textContent = item.gap_from_previous_seconds == null
    ? "primeira composição"
    : formatGap(item.gap_from_previous_seconds);
  elements.previous.disabled = position === 0;
  elements.next.disabled = position === state.frames.length - 1;
  updateSpectralMetadata();
  renderLayerLegend(item);
}

function updateSpectralMetadata() {
  if (!state.dataset) return;
  const labels = state.dataset.bandpasses.map(shortBand);
  const mono = state.dataset.color_mode === "mono";
  const profile = profileMeta(state.dataset.render_profile).label;
  elements.spectralInfo.textContent = mono
    ? `${labels.join(" + ")} · monocromático · ${profile} · mistura screen`
    : `${labels.join(" + ")} · falsa cor · ${profile} · α 0,82/camada`;
  const colors = mono
    ? ["rgb(210,210,210)"]
    : state.dataset.bands.map((band) => `rgb(${band.display_rgb.join(",")})`);
  elements.colorSwatch.style.background = colors.length === 1
    ? colors[0]
    : `linear-gradient(135deg, ${colors.join(",")})`;
  elements.colorSwatch.style.color = colors[0];
}

function renderLayerLegend(item) {
  elements.layerLegend.replaceChildren();
  item.layers.forEach((layer) => {
    const cached = state.loaded.get(layerKey(layer.bandpass, layer.observation_index));
    const band = bandMetadata(layer.bandpass);
    const chip = document.createElement("span");
    chip.className = `layer-chip${cached ? "" : " pending"}`;
    const swatch = document.createElement("i");
    swatch.className = "color-swatch";
    const mono = state.dataset.color_mode === "mono";
    const rgb = mono ? [210, 210, 210] : (cached?.false_color_rgb || band.display_rgb);
    swatch.style.background = `rgb(${rgb.join(",")})`;
    swatch.style.color = `rgb(${rgb.join(",")})`;
    const text = document.createElement("span");
    let wavelength = " · preparando";
    if (cached && cached.wavelength_min_um != null && cached.wavelength_max_um != null) {
      wavelength = ` · ${decimal(cached.wavelength_min_um, 3)}–${decimal(cached.wavelength_max_um, 3)} µm`;
    } else if (cached) {
      wavelength = ` · ${decimal(band.wavelength_min_um, 3)}–${decimal(band.wavelength_max_um, 3)} µm`;
    }
    text.textContent = `${shortBand(layer.bandpass)} · ${formatSignedGap(layer.delta_seconds)}${wavelength}`;
    chip.append(swatch, text);
    elements.layerLegend.append(chip);
  });
}

function loadedLayers(item) {
  return item.layers
    .map((layer) => ({
      layer,
      cached: state.loaded.get(layerKey(layer.bandpass, layer.observation_index)),
    }))
    .filter((entry) => entry.cached);
}

async function createLayerImage(entry) {
  const image = new Image();
  image.className = "frame-layer";
  image.alt = `Camada ${shortBand(entry.layer.bandpass)} da composição SPHEREx`;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = resourceUrl(entry.cached.image_url);
  });
  return image;
}

async function showFrame(position, { first = false } = {}) {
  updateFrameMetadata(position);
  const item = state.frames[position];
  const ready = loadedLayers(item);
  const signature = `${position}:${ready.map((entry) => layerKey(entry.layer.bandpass, entry.layer.observation_index)).join("|")}`;
  if (!ready.length) {
    state.displaySignature = null;
    elements.layers.replaceChildren();
    elements.overlay.hidden = false;
    elements.loadingTitle.textContent = first
      ? "Carregando primeira composição…"
      : `Preparando composição ${position + 1}…`;
    elements.frameTimer.textContent = "aguardando camadas…";
    setMessage(`As camadas da composição ${position + 1} ainda estão sendo preparadas.`);
    return;
  }
  if (signature === state.displaySignature) return;

  const token = ++state.displayToken;
  elements.overlay.hidden = false;
  elements.loadingTitle.textContent = `Compondo ${ready.length}/${item.layers.length} bandas…`;
  try {
    const images = await Promise.all(ready.map(createLayerImage));
    if (token !== state.displayToken || position !== state.currentPosition) return;
    elements.layers.replaceChildren(...images);
    state.displaySignature = signature;
    elements.frameTimer.textContent = `${ready.length}/${item.layers.length} bandas`;
    renderLayerLegend(item);
  } catch (error) {
    setMessage(error.message, true);
    throw error;
  } finally {
    if (token === state.displayToken) elements.overlay.hidden = true;
  }
}

function mergePrefetchedFrames(snapshot) {
  snapshot.frames.forEach((frame) => {
    state.loaded.set(layerKey(snapshot.bandpass, frame.observation_index), frame);
  });
}

async function monitorPrefetch(jobs, requestToken) {
  const entries = Object.entries(jobs);
  while (requestToken === state.requestToken) {
    const snapshots = await Promise.all(
      entries.map(async ([bandpass, jobId]) => [bandpass, await api(`/api/prefetch/${jobId}`)]),
    );
    if (requestToken !== state.requestToken) return;
    snapshots.forEach(([, snapshot]) => mergePrefetchedFrames(snapshot));
    const totals = snapshots.reduce((sum, [, snapshot]) => sum + snapshot.total, 0);
    const processed = snapshots.reduce((sum, [, snapshot]) => sum + snapshot.processed, 0);
    const completed = snapshots.reduce((sum, [, snapshot]) => sum + snapshot.completed, 0);
    const failed = snapshots.reduce((sum, [, snapshot]) => sum + snapshot.failed, 0);
    const cacheHits = snapshots.reduce((sum, [, snapshot]) => sum + snapshot.cache_hits, 0);
    elements.prefetchProgress.textContent = `${processed} / ${totals}`;
    elements.cacheStatus.textContent = completed
      ? `${cacheHits}/${completed} do cache`
      : (state.dataset.datasets.every((dataset) => dataset.cache_hit) ? "datasets cacheados" : "consulta nova");

    await showFrame(state.currentPosition, { first: state.currentPosition === 0 });
    const finished = snapshots.every(([, snapshot]) => snapshot.status !== "running");
    if (finished) {
      stopTimer();
      if (failed === 0) {
        setMessage(`Composição completa: ${completed} camadas prontas em ${seconds(performance.now() - state.timerStarted)}.`);
      } else {
        setMessage(`${completed} camadas prontas e ${failed} com falha.`, true);
      }
      return;
    }

    setSearching(true, `Preparando ${processed}/${totals} camadas…`);
    setMessage(completed
      ? `Composição disponível parcialmente; preparando o restante (${processed}/${totals}).`
      : "Metadados encontrados; preparando as primeiras camadas…");
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function runComposite(query, { keepPosition = false } = {}) {
  const position = keepPosition ? state.currentPosition : 0;
  state.lastQuery = query;
  setSearching(true);
  setRenderingBusy(true);
  setMessage(keepPosition
    ? `Renderizando de novo (${profileMeta().label} · ${COLOR_MODE_TEXT[state.settings.color_mode]}) com os FITS já baixados…`
    : "Consultando metadados e pareando épocas entre as bandas…");
  elements.discoveryTimer.textContent = "consultando…";
  elements.frameTimer.textContent = "aguardando…";
  elements.cacheStatus.textContent = "—";
  elements.prefetchProgress.textContent = "0 / 0";
  if (!keepPosition) {
    elements.viewer.hidden = true;
    elements.layers.replaceChildren();
  }
  elements.layerLegend.replaceChildren();
  state.loaded.clear();
  state.displaySignature = null;
  state.displayToken += 1;
  const requestToken = ++state.requestToken;
  startTimer();
  try {
    const dataset = await api("/api/composites", {
      method: "POST",
      body: JSON.stringify({
        ...query,
        fov_arcmin: state.settings.fov_arcmin,
        sampling: state.settings.sampling,
        render_profile: state.settings.render_profile,
        color_mode: state.settings.color_mode,
      }),
    });
    if (requestToken !== state.requestToken) return;
    state.dataset = dataset;
    state.frames = dataset.frames;
    state.jobs = Object.fromEntries(
      Object.entries(dataset.prefetch).map(([bandpass, job]) => [bandpass, job.job_id]),
    );
    state.currentPosition = Math.min(position, Math.max(0, dataset.frames.length - 1));
    elements.discoveryTimer.textContent = seconds(dataset.discovery_ms);
    elements.cacheStatus.textContent = dataset.datasets.every((item) => item.cache_hit)
      ? "datasets cacheados"
      : "consulta nova";
    const available = dataset.datasets
      .map((item) => `${shortBand(item.bandpass)}:${item.available_frame_count}`)
      .join(" · ");
    elements.availableCount.textContent =
      `${dataset.timeline_count} composições · ${available} · ${dataset.grid_pixels} px`;
    elements.slider.min = "0";
    elements.slider.max = String(Math.max(0, dataset.frames.length - 1));
    elements.viewer.hidden = false;
    saveToHistory(dataset);
    updateFrameMetadata(state.currentPosition);
    elements.overlay.hidden = false;
    elements.loadingTitle.textContent = keepPosition ? "Aplicando renderização…" : "Carregando primeira composição…";
    if (!keepPosition) {
      setMessage(`${dataset.timeline_count} épocas de referência; preparando ${dataset.bandpasses.length} bandas.`);
    }
    await monitorPrefetch(state.jobs, requestToken);
  } catch (error) {
    if (requestToken === state.requestToken) {
      stopTimer();
      setMessage(error.message, true);
    }
  } finally {
    if (requestToken === state.requestToken) {
      setSearching(false);
      setRenderingBusy(false);
    }
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const bandpasses = selectedBandpasses();
  if (!bandpasses.length) {
    setMessage("Selecione pelo menos uma banda espectral.", true);
    return;
  }
  await runComposite({
    ra_deg: Number(elements.ra.value),
    dec_deg: Number(elements.dec.value),
    bandpasses,
    mode: elements.mode.value,
  });
});

elements.slider.addEventListener("input", () => updateFrameMetadata(Number(elements.slider.value)));
elements.slider.addEventListener("change", () => showFrame(Number(elements.slider.value)).catch(() => {}));
elements.previous.addEventListener("click", () => showFrame(Math.max(0, state.currentPosition - 1)).catch(() => {}));
elements.next.addEventListener("click", () => showFrame(Math.min(state.frames.length - 1, state.currentPosition + 1)).catch(() => {}));
elements.exploreTabButton.addEventListener("click", () => switchTab("explore"));
elements.historyTabButton.addEventListener("click", () => switchTab("history"));
elements.settingsTabButton.addEventListener("click", () => switchTab("settings"));
elements.applySettings.addEventListener("click", () => {
  switchTab("explore");
  elements.form.requestSubmit();
});
elements.colorModeButtons.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => changeRendering({ color_mode: button.dataset.colorMode }));
});
elements.selectAllBands.addEventListener("click", () => setSelectedBandpasses(elements.bandInputs.map((input) => input.value)));
elements.clearBands.addEventListener("click", () => setSelectedBandpasses([]));

elements.clearHistory.addEventListener("click", () => {
  if (!confirm("Remover apenas o histórico de coordenadas deste navegador? O cache científico será preservado.")) return;
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  renderHistory();
});

elements.clearDataset.addEventListener("click", async () => {
  if (!state.dataset || !confirm("Remover os caches das bandas desta composição?")) return;
  try {
    const results = await Promise.all(
      state.dataset.datasets.map((dataset) => api(`/api/cache/${dataset.request_id}`, { method: "DELETE" })),
    );
    const removed = results.reduce((sum, result) => sum + result.removed, 0);
    state.loaded.clear();
    elements.viewer.hidden = true;
    setMessage(`${removed} datasets removidos do cache.`);
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
  .then((health) => {
    if (health.settings) {
      state.catalog = health.settings;
      const valid = (list, key, value) => list.some((item) => item[key] === value);
      const fixes = {};
      if (!valid(state.catalog.fov_options, "fov_arcmin", Number(state.settings.fov_arcmin))) fixes.fov_arcmin = 30;
      if (!valid(state.catalog.sampling_options, "name", state.settings.sampling)) fixes.sampling = "native";
      if (!valid(state.catalog.render_profiles, "name", state.settings.render_profile)) {
        fixes.render_profile = health.settings.defaults.render_profile;
      }
      writeSettings(fixes);
    }
    elements.serviceStatus.textContent = "Serviço online";
    elements.serviceStatus.classList.add("online");
  })
  .catch(() => {
    elements.serviceStatus.textContent = `Serviço indisponível · ${LAB_API_ORIGIN}`;
  });

renderSettings();
renderHistory();
