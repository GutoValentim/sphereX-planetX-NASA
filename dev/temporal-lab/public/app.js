const { parseRa, parseDec, formatRaHms, formatDecDms } = window.SpherexCoords;

const $ = (selector) => document.querySelector(selector);
const elements = {
  form: $("#searchForm"),
  name: $("#nameInput"),
  description: $("#descriptionInput"),
  ra: $("#raInput"),
  dec: $("#decInput"),
  raHint: $("#raHint"),
  decHint: $("#decHint"),
  bandInputs: Array.from(document.querySelectorAll('input[name="bandpass"]')),
  selectAllBands: $("#selectAllBands"),
  clearBands: $("#clearBands"),
  mode: $("#modeInput"),
  output: $("#outputInput"),
  searchButton: $("#searchButton"),
  mapCurrent: $("#mapCurrentButton"),
  serviceStatus: $("#serviceStatus"),
  diskStatus: $("#diskStatus"),
  engineSelect: $("#engineSelect"),
  engineBanner: $("#engineBanner"),
  totalTimer: $("#totalTimer"),
  discoveryTimer: $("#discoveryTimer"),
  frameTimer: $("#frameTimer"),
  cacheStatus: $("#cacheStatus"),
  prefetchProgress: $("#prefetchProgress"),
  message: $("#message"),
  viewer: $("#viewerPanel"),
  layers: $("#frameLayers"),
  layerLegend: $("#layerLegend"),
  overlay: $("#loadingOverlay"),
  loadingTitle: $("#loadingTitle"),
  slider: $("#frameSlider"),
  frameCounter: $("#frameCounter"),
  observationId: $("#observationId"),
  observedAt: $("#observedAt"),
  frameGap: $("#frameGap"),
  availableCount: $("#availableCount"),
  spectralInfo: $("#spectralInfo"),
  colorSwatch: $("#colorSwatch"),
  previous: $("#previousButton"),
  next: $("#nextButton"),
  clearDataset: $("#clearDatasetButton"),
  tabs: {
    explore: [$("#exploreTabButton"), $("#exploreTab")],
    history: [$("#historyTabButton"), $("#historyTab")],
    engines: [$("#enginesTabButton"), $("#enginesTab")],
    settings: [$("#settingsTabButton"), $("#settingsTab")],
  },
  historyList: $("#historyList"),
  historyEmpty: $("#historyEmpty"),
  historyCount: $("#historyCountBadge"),
  historySearch: $("#historySearch"),
  historyFilter: $("#historyFilter"),
  queueLine: $("#queueLine"),
  exportIndexLink: $("#exportIndexLink"),
  engineList: $("#engineList"),
  engineCreateForm: $("#engineCreateForm"),
  engineCreateText: $("#engineCreateText"),
  engineTitleInput: $("#engineTitleInput"),
  engineDescriptionInput: $("#engineDescriptionInput"),
  fixedConfig: $("#fixedConfig"),
  profileButtons: $("#profileButtons"),
  colorModeButtons: $("#colorModeButtons"),
  profileHint: $("#profileHint"),
  fovOptions: $("#fovOptions"),
  samplingOptions: $("#samplingOptions"),
  applySettings: $("#applySettingsButton"),
  spectrumPanel: $("#spectrumPanel"),
  spectrumProgress: $("#spectrumProgress"),
  spectrumCombined: $("#spectrumCombined"),
  spectrumCombinedImage: $("#spectrumCombinedImage"),
  spectrumBands: $("#spectrumBands"),
  confirmDialog: $("#confirmDialog"),
  confirmTitle: $("#confirmTitle"),
  confirmText: $("#confirmText"),
  confirmOptionRow: $("#confirmOptionRow"),
  confirmOption: $("#confirmOption"),
  confirmOptionText: $("#confirmOptionText"),
  confirmButton: $("#confirmButton"),
  mapDialog: $("#mapDialog"),
  mapLead: $("#mapLead"),
  mapFovOptions: $("#mapFovOptions"),
  mapSamplingOptions: $("#mapSamplingOptions"),
  mapBandOptions: $("#mapBandOptions"),
  mapSpectrum: $("#mapSpectrum"),
  mapNote: $("#mapNote"),
};

const BANDS = ["SPHEREx-D1", "SPHEREx-D2", "SPHEREx-D3", "SPHEREx-D4", "SPHEREx-D5", "SPHEREx-D6"];
const SETTINGS_KEY = "spherex-temporal-settings-v1";
const ENGINE_KEY = "spherex-lab-engine";
const DEFAULT_SETTINGS = { fov_arcmin: 30, sampling: "native", render_profile: "limpa", color_mode: "color" };
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
  color_modes: ["color", "mono"],
};
const SAMPLING_TEXT = {
  native: ["Nativa", "6,15″/px · resolução do instrumento"],
  "2x": ["2× interpolada", "3,08″/px · mais suave, sem detalhe novo"],
};
const COLOR_MODE_TEXT = { color: "falsa cor", mono: "monocromático" };
const STATUS_TEXT = {
  complete: "100% mapeado",
  partial: "Parcial",
  error: "Com erro",
  running: "Mapeando",
  queued: "Na fila",
  empty: "Sem dados",
};
const BAND_STATUS_TEXT = {
  complete: "completo",
  partial: "parcial",
  error: "com erro",
  missing: "não iniciado",
  unavailable: "sem observações",
};

function oddCeil(value) {
  const size = Math.max(3, Math.ceil(value));
  return size % 2 === 0 ? size + 1 : size;
}

function decimal(value, digits) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function percent(value) {
  if (value == null) return "—";
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: value >= 99.95 ? 0 : 1 })}%`;
}

function arcmin(value) {
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}′`;
}

function shortBand(bandpass) {
  return bandpass.replace("SPHEREx-", "");
}

function seconds(milliseconds) {
  return `${(milliseconds / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} s`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

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
  engines: [],
  engine: readEngine(),
  currentCode: null,
  records: [],
  recordsPoll: null,
  historyFilter: "all",
  editing: null,
};

// ----------------------------------------------------------------- preferências

function readSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...(stored && typeof stored === "object" ? stored : {}) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function readEngine() {
  try {
    return localStorage.getItem(ENGINE_KEY);
  } catch (_) {
    return null;
  }
}

function writeEngine(engineId) {
  state.engine = engineId;
  try {
    localStorage.setItem(ENGINE_KEY, engineId);
  } catch (_) {
    // Preferência local apenas.
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
    `recorte ${arcmin(option.cutout_fov_arcmin)} → janela ${arcmin(option.fov_arcmin)} · ${pixels} px · ${(SAMPLING_TEXT[state.settings.sampling] || [state.settings.sampling])[0].toLowerCase()}`;

  elements.fovOptions.replaceChildren(...state.catalog.fov_options.map((item) => {
    const label = el("label");
    const input = el("input");
    input.type = "radio";
    input.name = "fov";
    input.value = item.fov_arcmin;
    input.checked = item.fov_arcmin === option.fov_arcmin;
    input.addEventListener("change", () => writeSettings({ fov_arcmin: item.fov_arcmin }));
    const size = item.pixels[state.settings.sampling];
    label.append(input, el("strong", null, arcmin(item.fov_arcmin)),
      el("small", null, `recorte ${arcmin(item.cutout_fov_arcmin)}`), el("small", null, `${size} × ${size} px`));
    return label;
  }));

  elements.samplingOptions.replaceChildren(...state.catalog.sampling_options.map((item) => {
    const [title, detail] = SAMPLING_TEXT[item.name] || [item.name, `${item.pixel_scale_arcsec}″/px`];
    const label = el("label");
    const input = el("input");
    input.type = "radio";
    input.name = "sampling";
    input.value = item.name;
    input.checked = item.name === state.settings.sampling;
    input.addEventListener("change", () => writeSettings({ sampling: item.name }));
    label.append(input, el("strong", null, title), el("small", null, detail));
    return label;
  }));

  elements.profileButtons.replaceChildren(...state.catalog.render_profiles.map((profile) => {
    const button = el("button", null, profile.label);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.title = profile.description;
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

// ------------------------------------------------------------------- HTTP

const configuredApiOrigin = new URLSearchParams(window.location.search).get("api") || "";

function resourceUrl(path) {
  if (!path || /^(https?:|data:|blob:)/.test(path)) return path;
  return `${configuredApiOrigin}${path}`;
}

function enginePath(path) {
  return `/api/e/${encodeURIComponent(state.engine)}${path}`;
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${configuredApiOrigin}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch (error) {
    throw new Error("Não foi possível acessar o laboratório. Verifique a conexão e tente novamente.", { cause: error });
  }
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch (error) {
    throw new Error(`A rota ${path} devolveu uma resposta inválida (HTTP ${response.status}).`, { cause: error });
  }
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}

// ------------------------------------------------------------- coordenadas

function readCoordinates() {
  const ra = parseRa(elements.ra.value);
  const dec = parseDec(elements.dec.value);
  return { ra_deg: ra.degrees, dec_deg: dec.degrees };
}

function updateCoordinateHints() {
  [
    [elements.ra, elements.raHint, parseRa, (value) => `${decimal(value, 6)}° · ${formatRaHms(value)}`],
    [elements.dec, elements.decHint, parseDec, (value) => `${decimal(value, 6)}° · ${formatDecDms(value)}`],
  ].forEach(([input, hint, parse, format]) => {
    try {
      const { degrees } = parse(input.value);
      hint.textContent = `= ${format(degrees)}`;
      hint.classList.remove("invalid");
      input.setCustomValidity("");
    } catch (error) {
      hint.textContent = error.message;
      hint.classList.add("invalid");
      input.setCustomValidity(error.message);
    }
  });
}

function coordinateText(record) {
  return `RA ${decimal(record.ra_deg, 6)}° (${formatRaHms(record.ra_deg)}) · `
    + `Dec ${decimal(record.dec_deg, 6)}° (${formatDecDms(record.dec_deg)})`;
}

// -------------------------------------------------------------------- abas

function switchTab(name) {
  Object.entries(elements.tabs).forEach(([key, [button, panel]]) => {
    const active = key === name;
    panel.hidden = !active;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (name === "history") loadRecords().catch((error) => setMessage(error.message, true));
  if (name === "engines") renderEngines();
}

function setMessage(message, error = false) {
  elements.message.textContent = message;
  elements.message.classList.toggle("error", error);
}

function setSearching(searching, label = "Consultando IRSA…") {
  elements.searchButton.disabled = searching;
  elements.searchButton.textContent = searching ? label : "Buscar sequência";
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

// ----------------------------------------------------------------- motores

function engineLabel(engine) {
  return `${engine.id} — ${engine.title}`;
}

function renderEngineSelect() {
  elements.engineSelect.replaceChildren(...state.engines.map((engine) => {
    const option = el("option", null, engineLabel(engine));
    option.value = engine.id;
    option.selected = engine.id === state.engine;
    return option;
  }));
  const exists = state.engines.some((engine) => engine.id === state.engine);
  if (!exists && state.engines.length) writeEngine(state.engines[state.engines.length - 1].id);
  elements.engineSelect.value = state.engine || "";
  elements.exportIndexLink.href = `/exports/${state.engine}/index.json`;

  const current = state.engines.find((engine) => engine.id === state.engine);
  const latest = state.engines[state.engines.length - 1];
  const notices = [];
  if (current && latest && current.id !== latest.id) {
    notices.push(`Usando ${engineLabel(current)}, que não é a versão mais recente (${latest.id}).`);
  }
  if (state.currentCode && !state.currentCode.frozen) {
    notices.push("Esta release trouxe código novo do motor. Para usá-lo, crie uma versão em “Versões do motor”.");
  }
  elements.engineBanner.hidden = notices.length === 0;
  elements.engineBanner.textContent = notices.join(" ");
}

function renderEngines() {
  const unfrozen = state.currentCode && !state.currentCode.frozen;
  elements.engineCreateForm.hidden = !unfrozen;
  if (unfrozen) {
    elements.engineCreateText.textContent =
      `O código do backend desta release (hash ${state.currentCode.hash}) ainda não corresponde a nenhuma versão. `
      + "Congele-o para gerar registros com ele; as versões existentes não mudam.";
  }
  const latest = state.engines[state.engines.length - 1];
  elements.engineList.replaceChildren(...[...state.engines].reverse().map((engine) => {
    const card = el("article", `engine-card${engine.id === state.engine ? " selected" : ""}`);
    const header = el("div", "engine-card-header");
    const title = el("div", "engine-card-title");
    title.append(el("span", "badge badge-id", engine.id), el("h3", null, engine.title));
    const badges = el("div", "badge-row");
    if (engine.id === latest?.id) badges.append(el("span", "badge badge-info", "mais recente"));
    if (engine.id === state.engine) badges.append(el("span", "badge badge-ok", "em uso"));
    if (engine.is_current_code) badges.append(el("span", "badge badge-muted", "código desta release"));
    header.append(title, badges);

    const description = el("p", "engine-description", engine.description || "Sem descrição.");
    const meta = el("p", "engine-meta",
      `Criada em ${new Date(engine.created_at).toLocaleString("pt-BR")} · commit ${(engine.git_sha || "local").slice(0, 7)} · código ${engine.code_hash}`);

    const actions = el("div", "card-actions");
    const use = el("button", "primary-button compact", engine.id === state.engine ? "Em uso" : "Usar esta versão");
    use.type = "button";
    use.disabled = engine.id === state.engine;
    use.addEventListener("click", () => selectEngine(engine.id));
    const edit = el("button", "ghost-button compact", "Editar título e descrição");
    edit.type = "button";
    edit.addEventListener("click", () => editEngine(card, engine));
    actions.append(use, edit);
    card.append(header, description, meta, actions);
    return card;
  }));
}

function editEngine(card, engine) {
  const form = el("form", "inline-edit");
  const title = el("input");
  title.value = engine.title;
  title.maxLength = 120;
  title.required = true;
  title.setAttribute("aria-label", "Título da versão");
  const description = el("textarea");
  description.value = engine.description || "";
  description.rows = 3;
  description.maxLength = 2000;
  description.setAttribute("aria-label", "Descrição da versão");
  const actions = el("div", "card-actions");
  const save = el("button", "primary-button compact", "Salvar");
  save.type = "submit";
  const cancel = el("button", "ghost-button compact", "Cancelar");
  cancel.type = "button";
  cancel.addEventListener("click", renderEngines);
  actions.append(save, cancel);
  form.append(title, description, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/api/engines/${engine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.value, description: description.value }),
      });
      await loadHealth();
      renderEngines();
    } catch (error) {
      alertInline(form, error.message);
    }
  });
  card.replaceChildren(form);
  title.focus();
}

function alertInline(container, message) {
  container.querySelector(".inline-error")?.remove();
  container.append(el("p", "inline-error", message));
}

function selectEngine(engineId) {
  writeEngine(engineId);
  renderEngineSelect();
  renderEngines();
  state.lastQuery = null;
  elements.viewer.hidden = true;
  elements.spectrumPanel.hidden = true;
  loadRecords().catch(() => {});
  loadCatalog().catch(() => {});
  setMessage(`Motor ${engineId} selecionado. Novas consultas usam o cache desta versão.`);
}

elements.engineCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const engine = await api("/api/engines", {
      method: "POST",
      body: JSON.stringify({
        title: elements.engineTitleInput.value,
        description: elements.engineDescriptionInput.value,
      }),
    });
    elements.engineTitleInput.value = "";
    elements.engineDescriptionInput.value = "";
    await loadHealth();
    selectEngine(engine.id);
  } catch (error) {
    alertInline(elements.engineCreateForm, error.message);
  }
});

// ---------------------------------------------------------------- registros

async function saveRecord(coordinates, query) {
  return api("/api/records", {
    method: "POST",
    body: JSON.stringify({
      ...coordinates,
      name: elements.name.value,
      description: elements.description.value,
      query,
    }),
  });
}

async function loadRecords() {
  if (!state.engine) return;
  const data = await api(`/api/records?engine=${encodeURIComponent(state.engine)}`);
  state.records = data.records;
  state.queue = data.queue;
  renderHistory();
  const active = state.records.some((record) => ["running", "queued"].includes(record.coverage.status));
  clearTimeout(state.recordsPoll);
  if (active || !elements.tabs.history[1].hidden) {
    state.recordsPoll = setTimeout(() => loadRecords().catch(() => {}), active ? 3000 : 15000);
  }
}

function matchesFilter(record) {
  const query = elements.historySearch.value.trim().toLowerCase();
  if (query) {
    const haystack = `${record.name} ${record.description} ${record.ra_deg} ${record.dec_deg}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  const status = record.coverage.status;
  switch (state.historyFilter) {
    case "complete": return status === "complete";
    case "partial": return status === "partial" || status === "empty";
    case "error": return status === "error";
    case "active": return status === "running" || status === "queued";
    default: return true;
  }
}

function statusBadge(coverage) {
  const status = coverage.status;
  let text = STATUS_TEXT[status] || status;
  if (status === "partial" || status === "error") text += ` · ${percent(coverage.percent)}`;
  return el("span", `badge badge-${status}`, text);
}

function bandChip(bandpass, info) {
  const chip = el("span", `band-chip status-${info.status}`, shortBand(bandpass));
  const detail = info.percent == null
    ? BAND_STATUS_TEXT[info.status]
    : `${BAND_STATUS_TEXT[info.status] || info.status} · ${percent(info.percent)}`
      + (info.fits_percent != null ? ` · FITS ${percent(info.fits_percent)}` : "")
      + (info.total != null ? ` · ${info.total} observações` : "");
  chip.title = `${shortBand(bandpass)}: ${detail}`;
  chip.setAttribute("aria-label", chip.title);
  return chip;
}

function coverageRow(label, percentValue, bands, status) {
  const row = el("div", "coverage-row");
  const head = el("div", "coverage-label");
  head.append(el("span", null, label), el("strong", `coverage-percent status-${status}`, percent(percentValue)));
  const chips = el("div", "band-chips");
  Object.entries(bands).forEach(([bandpass, info]) => chips.append(bandChip(bandpass, info)));
  const bar = el("div", "coverage-bar");
  const fill = el("i", `status-${status}`);
  fill.style.width = `${Math.max(0, Math.min(100, percentValue || 0))}%`;
  bar.append(fill);
  row.append(head, chips, bar);
  return row;
}

function rowStatus(percentValue, bands) {
  const values = Object.values(bands);
  if (values.some((band) => band.status === "error")) return "error";
  if (percentValue >= 100) return "complete";
  return percentValue > 0 ? "partial" : "empty";
}

function renderHistory() {
  const records = state.records.filter(matchesFilter);
  elements.historyCount.textContent = String(state.records.length);
  elements.historyEmpty.hidden = records.length > 0;
  const queue = state.queue || {};
  const waiting = (queue.queued || []).length;
  elements.queueLine.hidden = !queue.current && !waiting;
  if (queue.current) {
    const current = state.records.find((record) => record.id === queue.current[0]);
    elements.queueLine.textContent = `Mapeando agora: ${current?.name || queue.current[0]} (${queue.current[1]})`
      + (waiting ? ` · ${waiting} na fila` : "");
  } else if (waiting) {
    elements.queueLine.textContent = `${waiting} na fila`;
  }
  elements.historyList.replaceChildren(...records.map(renderRecordCard));
}

function renderRecordCard(record) {
  const coverage = record.coverage;
  const card = el("article", `history-card status-border-${coverage.status}`);
  if (state.editing === record.id) {
    card.append(recordEditForm(record));
    return card;
  }
  const header = el("div", "history-card-header");
  const titleBlock = el("div", "history-title");
  titleBlock.append(el("h3", record.name ? null : "untitled", record.name || "Sem nome"));
  if (record.description) titleBlock.append(el("p", "history-description-text", record.description));
  titleBlock.append(el("p", "history-coordinates", coordinateText(record)));
  const badges = el("div", "badge-row");
  badges.append(statusBadge(coverage));
  coverage.images.configs.forEach((config) => {
    const extra = coverage.basis === "plan" && !config.planned;
    const shown = config.planned && config.plan_percent != null ? config.plan_percent : config.percent;
    const configStatus = rowStatus(shown, config.bands);
    const badge = el("span", `badge badge-${configStatus}${extra ? " badge-extra" : ""}`,
      `${arcmin(config.fov_arcmin)} ${config.sampling === "2x" ? "2×" : "nativa"} · ${percent(shown)}`);
    if (extra) badge.title = "Exploração avulsa, fora do plano de mapeamento (não conta para o 100%).";
    badges.append(badge);
  });
  if (coverage.spectrum.percent != null) {
    badges.append(el("span", `badge badge-${rowStatus(coverage.spectrum.percent, coverage.spectrum.bands)}`,
      `Espectro · ${percent(coverage.spectrum.percent)}`));
  }
  header.append(titleBlock, badges);
  card.append(header);

  const details = el("div", "coverage");
  coverage.images.configs.forEach((config) => {
    details.append(coverageRow(
      `Imagens ${arcmin(config.fov_arcmin)} · ${(SAMPLING_TEXT[config.sampling] || [config.sampling])[0]} · ${coverage.images.variants.length} variantes · FITS ${percent(config.fits_percent)}`,
      config.percent,
      config.bands,
      rowStatus(config.percent, config.bands),
    ));
  });
  if (coverage.spectrum.percent != null) {
    details.append(coverageRow("Espectro · fotometria multi-época", coverage.spectrum.percent,
      coverage.spectrum.bands, rowStatus(coverage.spectrum.percent, coverage.spectrum.bands)));
  }
  if (details.childElementCount) card.append(details);

  const mapping = record.mapping?.[state.engine];
  if (mapping && ["running", "queued"].includes(mapping.status)) {
    const progress = el("div", "mapping-progress");
    const done = mapping.progress?.done || 0;
    const total = mapping.progress?.total || 1;
    progress.append(el("span", null, `${mapping.progress?.label || "Mapeando"} · etapa ${Math.min(done + 1, total)}/${total}`));
    const bar = el("div", "coverage-bar");
    const fill = el("i", "status-running");
    fill.style.width = `${(100 * done) / total}%`;
    bar.append(fill);
    progress.append(bar);
    card.append(progress);
  }
  if (mapping?.errors?.length) {
    const errors = el("details", "mapping-errors");
    errors.append(el("summary", null, `${mapping.errors.length} falha(s) no último mapeamento`));
    const list = el("ul");
    mapping.errors.slice(0, 12).forEach((item) => {
      list.append(el("li", null, `${item.bandpass ? `${shortBand(item.bandpass)} · ` : ""}${item.step}: ${item.error}`));
    });
    errors.append(list);
    card.append(errors);
  }

  const footer = el("div", "history-card-footer");
  const meta = el("span", "history-meta",
    `Atualizado ${new Date(record.updated_at).toLocaleString("pt-BR")}`
    + (mapping?.finished_at ? ` · mapeado ${new Date(mapping.finished_at).toLocaleString("pt-BR")}` : ""));
  const actions = el("div", "card-actions");
  const busy = ["running", "queued"].includes(mapping?.status);
  actions.append(
    actionButton("Abrir", "primary-button compact", () => openRecord(record)),
    busy
      ? actionButton("Cancelar mapeamento", "ghost-button compact", () => cancelMapping(record))
      : actionButton("Mapear…", "ghost-button compact", () => openMapDialog(record)),
    actionButton("Exportar", "ghost-button compact", () => exportRecord(record), busy),
    actionButton("Editar", "ghost-button compact", () => { state.editing = record.id; renderHistory(); }),
    actionButton("Apagar…", "ghost-button compact danger", () => deleteRecord(record), busy),
  );
  footer.append(meta, actions);
  card.append(footer);
  return card;
}

function actionButton(text, className, handler, disabled = false) {
  const button = el("button", className, text);
  button.type = "button";
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
}

function recordEditForm(record) {
  const form = el("form", "inline-edit");
  const nameLabel = el("label", "field");
  const name = el("input");
  name.value = record.name || "";
  name.maxLength = 160;
  name.placeholder = "Nome do alvo";
  nameLabel.append(el("span", null, "Nome"), name);
  const descriptionLabel = el("label", "field");
  const description = el("textarea");
  description.value = record.description || "";
  description.rows = 3;
  description.maxLength = 4000;
  description.placeholder = "Descrição para o produto";
  descriptionLabel.append(el("span", null, "Descrição"), description);
  const actions = el("div", "card-actions");
  const save = el("button", "primary-button compact", "Salvar");
  save.type = "submit";
  actions.append(save, actionButton("Cancelar", "ghost-button compact", () => { state.editing = null; renderHistory(); }));
  form.append(nameLabel, descriptionLabel, el("p", "history-coordinates", coordinateText(record)), actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/api/records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.value, description: description.value }),
      });
      state.editing = null;
      await loadRecords();
    } catch (error) {
      alertInline(form, error.message);
    }
  });
  setTimeout(() => name.focus(), 0);
  return form;
}

function fillFormFromRecord(record) {
  elements.name.value = record.name || "";
  elements.description.value = record.description || "";
  elements.ra.value = String(record.ra_deg);
  elements.dec.value = String(record.dec_deg);
  updateCoordinateHints();
  const query = record.last_query || {};
  if (query.bandpasses?.length) setSelectedBandpasses(query.bandpasses);
  if (query.mode) elements.mode.value = query.mode;
  if (query.output) elements.output.value = query.output;
  if (query.fov_arcmin || query.sampling) {
    writeSettings({
      ...(query.fov_arcmin ? { fov_arcmin: query.fov_arcmin } : {}),
      ...(query.sampling ? { sampling: query.sampling } : {}),
    });
  }
  syncOutputControls();
}

function openRecord(record) {
  fillFormFromRecord(record);
  switchTab("explore");
  elements.form.requestSubmit();
}

async function cancelMapping(record) {
  try {
    await api(`/api/records/${record.id}/map?engine=${encodeURIComponent(state.engine)}`, { method: "DELETE" });
    await loadRecords();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function exportRecord(record) {
  try {
    const result = await api(`/api/records/${record.id}/export?engine=${encodeURIComponent(state.engine)}`, { method: "POST" });
    window.open(`/exports/${result.path}/manifest.json`, "_blank", "noopener");
  } catch (error) {
    setMessage(error.message, true);
    switchTab("explore");
  }
}

function confirmAction({ title, html, confirmText = "Apagar", option = null }) {
  elements.confirmTitle.textContent = title;
  elements.confirmText.replaceChildren(...html);
  elements.confirmButton.textContent = confirmText;
  elements.confirmOptionRow.hidden = !option;
  elements.confirmOption.checked = false;
  if (option) elements.confirmOptionText.textContent = option;
  elements.confirmDialog.returnValue = "cancel";
  elements.confirmDialog.showModal();
  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener("close", () => {
      resolve(elements.confirmDialog.returnValue === "confirm"
        ? { confirmed: true, option: elements.confirmOption.checked }
        : { confirmed: false });
    }, { once: true });
  });
}

async function deleteRecord(record) {
  const engine = state.engines.find((item) => item.id === state.engine);
  const { confirmed, option } = await confirmAction({
    title: `Apagar “${record.name || "registro sem nome"}”?`,
    html: [
      el("p", null, `Remove do motor ${engine ? engineLabel(engine) : state.engine} os FITS, as imagens renderizadas, os espectros e a exportação deste alvo.`),
      el("p", "modal-coords", coordinateText(record)),
      el("p", "modal-warning", "Esta ação não pode ser desfeita. Os dados de outras versões do motor são preservados."),
    ],
    confirmText: "Apagar cache",
    option: "Remover também o registro (nome e descrição) do acervo",
  });
  if (!confirmed) return;
  try {
    await api(`/api/records/${record.id}?engine=${encodeURIComponent(state.engine)}${option ? "&forget=1" : ""}`, { method: "DELETE" });
    await loadRecords();
  } catch (error) {
    setMessage(error.message, true);
    switchTab("explore");
  }
}

// --------------------------------------------------------------- mapeamento

function chipOption(type, name, value, label, checked) {
  const wrapper = el("label", "chip-option");
  const input = el("input");
  input.type = type;
  input.name = name;
  input.value = value;
  input.checked = checked;
  wrapper.append(input, el("span", null, label));
  return wrapper;
}

function variantCount() {
  return (state.catalog.render_profiles?.length || 5) * (state.catalog.color_modes?.length || 2);
}

function openMapDialog(record) {
  const plan = record.mapping?.[state.engine]?.plan;
  const fovs = new Set((plan?.configs || [{ fov_arcmin: state.settings.fov_arcmin }]).map((item) => Number(item.fov_arcmin)));
  const sampling = plan?.configs?.[0]?.sampling || state.settings.sampling;
  const bands = new Set(plan?.bands || BANDS);
  elements.mapLead.textContent = `${record.name || "Registro sem nome"} · ${coordinateText(record)}`;
  elements.mapFovOptions.replaceChildren(...state.catalog.fov_options.map((item) =>
    chipOption("checkbox", "mapFov", item.fov_arcmin, arcmin(item.fov_arcmin), fovs.has(item.fov_arcmin))));
  elements.mapSamplingOptions.replaceChildren(...state.catalog.sampling_options.map((item) =>
    chipOption("radio", "mapSampling", item.name, (SAMPLING_TEXT[item.name] || [item.name])[0], item.name === sampling)));
  elements.mapBandOptions.replaceChildren(...BANDS.map((band) =>
    chipOption("checkbox", "mapBand", band, shortBand(band), bands.has(band))));
  elements.mapSpectrum.checked = plan ? Boolean(plan.spectrum) : true;
  elements.mapNote.textContent =
    `Para cada FOV e banda: todas as épocas (modo completo) em ${variantCount()} variantes de renderização `
    + "(perfis × falsa cor/mono). Roda no servidor, um alvo por vez; pode fechar a aba. "
    + "Falhas do IRSA são repetidas automaticamente e o que já foi baixado não é refeito.";
  elements.mapDialog.returnValue = "cancel";
  elements.mapDialog.showModal();
  elements.mapDialog.addEventListener("close", async () => {
    if (elements.mapDialog.returnValue !== "confirm") return;
    const checked = (name) => Array.from(elements.mapDialog.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
    const samplingValue = checked("mapSampling")[0] || "native";
    const payload = {
      configs: checked("mapFov").map((fov) => ({ fov_arcmin: Number(fov), sampling: samplingValue })),
      bands: checked("mapBand"),
      spectrum: elements.mapSpectrum.checked,
    };
    try {
      await api(`/api/records/${record.id}/map?engine=${encodeURIComponent(state.engine)}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      switchTab("history");
    } catch (error) {
      setMessage(error.message, true);
      switchTab("explore");
    }
  }, { once: true });
}

elements.mapCurrent.addEventListener("click", async () => {
  let coordinates;
  try {
    coordinates = readCoordinates();
  } catch (error) {
    setMessage(error.message, true);
    return;
  }
  try {
    const record = await saveRecord(coordinates, currentQuery(coordinates));
    openMapDialog(record);
  } catch (error) {
    setMessage(error.message, true);
  }
});

// ------------------------------------------------------------- visualizador

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
  elements.colorSwatch.style.background = colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(",")})`;
  elements.colorSwatch.style.color = colors[0];
}

function renderLayerLegend(item) {
  elements.layerLegend.replaceChildren(...item.layers.map((layer) => {
    const cached = state.loaded.get(layerKey(layer.bandpass, layer.observation_index));
    const band = bandMetadata(layer.bandpass);
    const chip = el("span", `layer-chip${cached ? "" : " pending"}`);
    const swatch = el("i", "color-swatch");
    const mono = state.dataset.color_mode === "mono";
    const rgb = mono ? [210, 210, 210] : (cached?.false_color_rgb || band.display_rgb);
    swatch.style.background = `rgb(${rgb.join(",")})`;
    swatch.style.color = swatch.style.background;
    let wavelength = " · preparando";
    if (cached && cached.wavelength_min_um != null && cached.wavelength_max_um != null) {
      wavelength = ` · ${decimal(cached.wavelength_min_um, 3)}–${decimal(cached.wavelength_max_um, 3)} µm`;
    } else if (cached) {
      wavelength = ` · ${decimal(band.wavelength_min_um, 3)}–${decimal(band.wavelength_max_um, 3)} µm`;
    }
    chip.append(swatch, el("span", null, `${shortBand(layer.bandpass)} · ${formatSignedGap(layer.delta_seconds)}${wavelength}`));
    return chip;
  }));
}

function loadedLayers(item) {
  return item.layers
    .map((layer) => ({ layer, cached: state.loaded.get(layerKey(layer.bandpass, layer.observation_index)) }))
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
    elements.loadingTitle.textContent = first ? "Carregando primeira composição…" : `Preparando composição ${position + 1}…`;
    elements.frameTimer.textContent = "aguardando camadas…";
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
    setMessage("Falha ao carregar uma camada da composição.", true);
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
      entries.map(async ([bandpass, jobId]) => [bandpass, await api(enginePath(`/prefetch/${jobId}`))]),
    );
    if (requestToken !== state.requestToken) return;
    snapshots.forEach(([, snapshot]) => mergePrefetchedFrames(snapshot));
    const sum = (key) => snapshots.reduce((total, [, snapshot]) => total + snapshot[key], 0);
    const totals = sum("total");
    const processed = sum("processed");
    const completed = sum("completed");
    const failed = sum("failed");
    const cacheHits = sum("cache_hits");
    elements.prefetchProgress.textContent = `${processed} / ${totals}`;
    elements.cacheStatus.textContent = completed
      ? `${cacheHits}/${completed} do cache`
      : (state.dataset.datasets.every((dataset) => dataset.cache_hit) ? "datasets cacheados" : "consulta nova");

    await showFrame(state.currentPosition, { first: state.currentPosition === 0 }).catch(() => {});
    const finished = snapshots.every(([, snapshot]) => snapshot.status !== "running");
    if (finished) {
      stopTimer();
      if (failed === 0) {
        setMessage(`Composição completa: ${completed} camadas prontas em ${seconds(performance.now() - state.timerStarted)}. Guardada no motor ${state.engine}.`);
      } else {
        setMessage(`${completed} camadas prontas e ${failed} com falha (IRSA instável?). Busque de novo para completar; o que já foi baixado é reaproveitado.`, true);
      }
      return;
    }
    setSearching(true, `Preparando ${processed}/${totals} camadas…`);
    setMessage(completed
      ? `Composição disponível parcialmente; preparando o restante (${processed}/${totals}).`
      : "Metadados encontrados; preparando as primeiras camadas…");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function currentQuery(coordinates) {
  return {
    ...coordinates,
    bandpasses: selectedBandpasses(),
    mode: elements.mode.value,
    output: elements.output.value,
    fov_arcmin: state.settings.fov_arcmin,
    sampling: state.settings.sampling,
  };
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
  elements.spectrumPanel.hidden = true;
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
    const dataset = await api(enginePath("/composites"), {
      method: "POST",
      body: JSON.stringify({
        ra_deg: query.ra_deg,
        dec_deg: query.dec_deg,
        bandpasses: query.bandpasses,
        mode: query.mode,
        fov_arcmin: state.settings.fov_arcmin,
        sampling: state.settings.sampling,
        render_profile: state.settings.render_profile,
        color_mode: state.settings.color_mode,
      }),
    });
    if (requestToken !== state.requestToken) return;
    state.dataset = dataset;
    state.frames = dataset.frames;
    state.jobs = Object.fromEntries(Object.entries(dataset.prefetch).map(([bandpass, job]) => [bandpass, job.job_id]));
    state.currentPosition = Math.min(position, Math.max(0, dataset.frames.length - 1));
    elements.discoveryTimer.textContent = seconds(dataset.discovery_ms);
    elements.cacheStatus.textContent = dataset.datasets.every((item) => item.cache_hit) ? "datasets cacheados" : "consulta nova";
    const available = dataset.datasets.map((item) => `${shortBand(item.bandpass)}:${item.available_frame_count}`).join(" · ");
    elements.availableCount.textContent = `${dataset.timeline_count} composições · ${available} · ${dataset.grid_pixels} px`;
    elements.slider.min = "0";
    elements.slider.max = String(Math.max(0, dataset.frames.length - 1));
    elements.viewer.hidden = false;
    updateFrameMetadata(state.currentPosition);
    elements.overlay.hidden = false;
    elements.loadingTitle.textContent = keepPosition ? "Aplicando renderização…" : "Carregando primeira composição…";
    if (!keepPosition) setMessage(`${dataset.timeline_count} épocas de referência; preparando ${dataset.bandpasses.length} bandas.`);
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
      loadRecords().catch(() => {});
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
  let coordinates;
  try {
    coordinates = readCoordinates();
  } catch (error) {
    setMessage(error.message, true);
    return;
  }
  const query = currentQuery(coordinates);
  try {
    await saveRecord(coordinates, query);
  } catch (error) {
    setMessage(error.message, true);
    return;
  }
  if (query.output === "spectrum") {
    await runSpectrum(query);
  } else {
    await runComposite(query);
  }
});

function syncOutputControls() {
  const spectrum = elements.output.value === "spectrum";
  elements.mode.disabled = spectrum;
  elements.mode.title = spectrum ? "O espectro usa todas as observações disponíveis." : "";
  elements.searchButton.textContent = "Buscar sequência";
}

function bandRangeText(band) {
  return `${decimal(band.wavelength_min_um, 3)}–${decimal(band.wavelength_max_um, 3)} µm`;
}

function renderSpectrumProgress(bands, snapshot) {
  elements.spectrumProgress.replaceChildren(...bands.map((band) => {
    const progress = snapshot?.progress?.[band.bandpass] || {};
    const result = snapshot?.result?.bands.find((item) => item.bandpass === band.bandpass);
    const chip = el("span", `spectrum-chip${result ? (result.error ? " failed" : " done") : ""}`);
    const swatch = el("i", "color-swatch");
    swatch.style.background = `rgb(${band.display_rgb.join(",")})`;
    swatch.style.color = swatch.style.background;
    let text;
    if (result?.error) {
      text = `${shortBand(band.bandpass)} · ${result.error}`;
    } else if (result) {
      const failed = Object.keys(result.failed || {}).length;
      text = `${shortBand(band.bandpass)} · ${result.measured_count}/${result.observation_count} medidas`
        + (failed ? ` · ${failed} falhas de rede` : "");
    } else if (progress.total) {
      text = `${shortBand(band.bandpass)} · ${progress.done}/${progress.total}`;
    } else {
      text = `${shortBand(band.bandpass)} · buscando observações…`;
    }
    chip.append(swatch, el("span", null, text));
    return chip;
  }));
}

function rejectionSummary(rejected) {
  const counts = {};
  Object.values(rejected || {}).forEach((reason) => { counts[reason] = (counts[reason] || 0) + 1; });
  return Object.entries(counts).map(([reason, count]) => `${count}× ${reason}`).join(" · ");
}

function renderSpectrumResult(result) {
  elements.spectrumCombinedImage.src = resourceUrl(result.combined_chart_url);
  elements.spectrumCombined.hidden = false;
  elements.spectrumBands.replaceChildren(...result.bands.filter((band) => band.chart_url).map((band) => {
    const figure = el("figure", "spectrum-card");
    const image = el("img");
    image.src = resourceUrl(band.chart_url);
    image.alt = `Espectro da banda ${shortBand(band.bandpass)} (${bandRangeText(band.band)})`;
    image.loading = "lazy";
    const rejected = rejectionSummary(band.rejected);
    const failed = Object.keys(band.failed || {}).length;
    figure.append(image, el("figcaption", null, `${shortBand(band.bandpass)} · ${bandRangeText(band.band)} · `
      + `${band.measured_count}/${band.observation_count} observações medidas`
      + (rejected ? ` · descartadas: ${rejected}` : "")
      + (failed ? ` · ${failed} falhas de rede (busque de novo para completar)` : "")));
    return figure;
  }));
}

async function runSpectrum(query) {
  state.lastQuery = null;
  const requestToken = ++state.requestToken;
  setSearching(true, "Medindo espectro…");
  elements.viewer.hidden = true;
  elements.spectrumPanel.hidden = false;
  elements.spectrumCombined.hidden = true;
  elements.spectrumBands.replaceChildren();
  elements.discoveryTimer.textContent = "—";
  elements.frameTimer.textContent = "—";
  elements.prefetchProgress.textContent = "—";
  setMessage("Buscando observações e medindo o alvo em cada uma (recortes de 4′)…");
  startTimer();
  try {
    const started = await api(enginePath("/composites"), {
      method: "POST",
      body: JSON.stringify({
        ra_deg: query.ra_deg, dec_deg: query.dec_deg, bandpasses: query.bandpasses, output: "spectrum", theme: "dark",
      }),
    });
    let snapshot = started.job;
    while (requestToken === state.requestToken) {
      renderSpectrumProgress(started.bands, snapshot);
      const totals = Object.values(snapshot.progress).reduce(
        (sum, item) => ({ done: sum.done + (item.done || 0), total: sum.total + (item.total || 0) }),
        { done: 0, total: 0 },
      );
      elements.prefetchProgress.textContent = `${totals.done} / ${totals.total}`;
      if (snapshot.status === "completed") {
        stopTimer();
        renderSpectrumResult(snapshot.result);
        const measured = snapshot.result.bands.reduce((sum, band) => sum + band.measured_count, 0);
        setMessage(`Espectro pronto: ${measured} medições em ${started.bands.length} bandas (${seconds(snapshot.elapsed_ms)}). Guardado no motor ${state.engine}.`);
        return;
      }
      if (snapshot.status === "failed") throw new Error(snapshot.error || "Falha ao montar o espectro.");
      await new Promise((resolve) => setTimeout(resolve, 700));
      snapshot = await api(enginePath(`/spectra/${started.job.job_id}`));
    }
  } catch (error) {
    if (requestToken === state.requestToken) {
      stopTimer();
      setMessage(error.message, true);
    }
  } finally {
    if (requestToken === state.requestToken) {
      setSearching(false);
      loadRecords().catch(() => {});
    }
  }
}

// ------------------------------------------------------------------ eventos

elements.slider.addEventListener("input", () => updateFrameMetadata(Number(elements.slider.value)));
elements.slider.addEventListener("change", () => showFrame(Number(elements.slider.value)).catch(() => {}));
elements.previous.addEventListener("click", () => showFrame(Math.max(0, state.currentPosition - 1)).catch(() => {}));
elements.next.addEventListener("click", () => showFrame(Math.min(state.frames.length - 1, state.currentPosition + 1)).catch(() => {}));
Object.entries(elements.tabs).forEach(([name, [button]]) => button.addEventListener("click", () => switchTab(name)));
elements.output.addEventListener("change", syncOutputControls);
elements.ra.addEventListener("input", updateCoordinateHints);
elements.dec.addEventListener("input", updateCoordinateHints);
elements.applySettings.addEventListener("click", () => {
  switchTab("explore");
  elements.form.requestSubmit();
});
elements.colorModeButtons.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => changeRendering({ color_mode: button.dataset.colorMode }));
});
elements.selectAllBands.addEventListener("click", () => setSelectedBandpasses(elements.bandInputs.map((input) => input.value)));
elements.clearBands.addEventListener("click", () => setSelectedBandpasses([]));
elements.engineSelect.addEventListener("change", () => selectEngine(elements.engineSelect.value));
elements.historySearch.addEventListener("input", renderHistory);
elements.historyFilter.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    state.historyFilter = button.dataset.filter;
    elements.historyFilter.querySelectorAll("button").forEach((item) => {
      item.setAttribute("aria-checked", String(item === button));
    });
    renderHistory();
  });
});

elements.clearDataset.addEventListener("click", async () => {
  if (!state.dataset) return;
  const bands = state.dataset.datasets.map((dataset) => shortBand(dataset.bandpass)).join(", ");
  const { confirmed } = await confirmAction({
    title: "Apagar o cache desta composição?",
    html: [
      el("p", null, `Remove do motor ${state.engine} os FITS e as imagens das bandas ${bands} nesta janela de ${arcmin(state.dataset.fov_arcmin)}.`),
      el("p", "modal-warning", "Esta ação não pode ser desfeita. Outras janelas, o espectro e o registro são preservados."),
    ],
    confirmText: "Apagar cache",
  });
  if (!confirmed) return;
  try {
    const results = await Promise.all(
      state.dataset.datasets.map((dataset) => api(enginePath(`/cache/${dataset.request_id}`), { method: "DELETE" })),
    );
    const removed = results.reduce((sum, result) => sum + result.removed, 0);
    state.loaded.clear();
    state.lastQuery = null;
    elements.viewer.hidden = true;
    setMessage(`${removed} datasets removidos do cache do motor ${state.engine}.`);
    loadRecords().catch(() => {});
  } catch (error) {
    setMessage(error.message, true);
  }
});

// -------------------------------------------------------------- inicialização

async function loadCatalog() {
  const health = await api("/api/health");
  if (health.settings) applyCatalog(health.settings);
}

function applyCatalog(settings) {
  state.catalog = settings;
  const valid = (list, key, value) => list.some((item) => item[key] === value);
  const fixes = {};
  if (!valid(state.catalog.fov_options, "fov_arcmin", Number(state.settings.fov_arcmin))) fixes.fov_arcmin = 30;
  if (!valid(state.catalog.sampling_options, "name", state.settings.sampling)) fixes.sampling = "native";
  if (!valid(state.catalog.render_profiles, "name", state.settings.render_profile)) {
    fixes.render_profile = settings.defaults?.render_profile || "limpa";
  }
  writeSettings(fixes);
}

async function loadHealth() {
  const health = await api("/api/health");
  state.engines = health.engines || [];
  state.currentCode = health.current_code;
  if (!state.engine || !state.engines.some((engine) => engine.id === state.engine)) {
    writeEngine(health.default_engine);
  }
  if (health.settings) applyCatalog(health.settings);
  renderEngineSelect();
  elements.serviceStatus.textContent = `Online${health.version ? ` · ${health.version.slice(0, 7)}` : ""}`;
  if (health.disk) {
    const low = health.disk.free_gb < 10;
    elements.diskStatus.hidden = false;
    elements.diskStatus.classList.toggle("warning", low);
    elements.diskStatus.textContent = `Disco: ${decimal(health.disk.free_gb, 1)} GB livres`;
    elements.diskStatus.title = `${decimal(health.disk.used_percent, 1)}% de ${decimal(health.disk.total_gb, 0)} GB usados. `
      + "Cada alvo mapeado em um FOV ocupa da ordem de 1 GB (FITS + matrizes alinhadas + imagens).";
  }
  elements.serviceStatus.classList.add("online");
  return health;
}

renderSettings();
syncOutputControls();
updateCoordinateHints();
loadHealth()
  .then(() => loadRecords())
  .catch((error) => {
    elements.serviceStatus.textContent = "Serviço indisponível";
    setMessage(error.message, true);
  });
