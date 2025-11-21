// Simple sealed Pokémon portfolio tracker
// - Stores data in localStorage
// - Images are compressed to JPEG before saving to reduce storage

const STORAGE_KEY = "sealedPokemonPortfolio:v1";
const SETTINGS_KEY = "sealedPokemonPortfolio:settings";
const CACHE_KEY = "sealedPokemonPortfolio:apiCache:v1";
const API_PROXY_BASE = "http://localhost:3000"; // backend proxy base

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function currencySymbol(code) {
  switch (code) {
    case "USD": return "$";
    case "GBP": return "£";
    case "CHF": return "CHF ";
    case "EUR":
    default: return "€";
  }
}

function formatMoney(value, code) {
  const symbol = currencySymbol(code);
  const formatted = Number(value || 0).toFixed(2);
  if (symbol === "CHF ") return `${symbol}${formatted}`;
  if (symbol === "$" || symbol === "£") return `${symbol}${formatted}`;
  return `${symbol}${formatted}`; // default prefix
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    return {
      currency: data.currency || "EUR",
      theme: data.theme || "dark",
      sortBy: data.sortBy || "name",
      sortDir: data.sortDir || "asc",
    };
  } catch {
    return { currency: "EUR", theme: "dark", sortBy: "name", sortDir: "asc" };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveData(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function saveCache(cache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = t === "light" ? "🌙 Dark" : "☀️ Light";
  }
}

// Debounce helper
function debounce(fn, delay = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  const keys = ["results", "data", "list", "items", "products", "cards"];
  for (const k of keys) {
    if (data && Array.isArray(data[k])) return data[k];
  }
  // nested like { results: { data: [] } }
  if (data && data.results && Array.isArray(data.results.data)) return data.results.data;
  // fallback: first array prop
  if (data && typeof data === "object") {
    for (const k of Object.keys(data)) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

async function apiSearchProducts(q, limit = 10) {
  if (!q || q.length < 3) return [];
  const url = `${API_PROXY_BASE}/api/products/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("Search request failed", resp.status, resp.statusText);
      return [];
    }
    const data = await resp.json();
    return extractArray(data);
  } catch (err) {
    console.error("Search request error", err);
    return [];
  }
}

function normalizeProduct(p) {
  const id = p.id || p.productId || p._id || p.uuid || p.code;
  const name = p.name || p.title || p.productName || "Unknown Product";
  const series = p.series || p.set || p.collection || p.expansion || (p.episode && (p.episode.name || p.episode.slug)) || "";
  const image = p.image || p.imageUrl || p.thumbnail || (p.images && (p.images.small || p.images.thumb || p.images[0])) || null;
  const cmLink = (p.links && p.links.cardmarket) || null;
  return { id, name, series, image, cmLink };
}

function priceForLanguage(cardmarketPrices, language) {
  if (!cardmarketPrices) return null;
  const lang = (language || '').toLowerCase();
  if (lang.startsWith('german')) return (cardmarketPrices.lowest_DE ?? cardmarketPrices.lowest ?? null);
  if (lang.startsWith('french')) return (cardmarketPrices.lowest_FR ?? cardmarketPrices.lowest ?? null);
  return cardmarketPrices.lowest ?? cardmarketPrices.lowest_DE ?? cardmarketPrices.lowest_FR ?? null;
}

async function fetchProductDetailById(id) {
  const url = `${API_PROXY_BASE}/api/products/${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  try { return await resp.json(); } catch { return null; }
}

function canRefreshPrices(settings, cooldownMs = 30 * 60 * 1000) {
  const last = settings.lastRefreshAt ? Number(settings.lastRefreshAt) : 0;
  const now = Date.now();
  const remaining = Math.max(0, cooldownMs - (now - last));
  return { allowed: remaining === 0, remainingMs: remaining };
}

function formatRemaining(ms) {
  const m = Math.ceil(ms / 60000);
  return m <= 1 ? '1 min' : `${m} mins`;
}

// Image compression via canvas to keep localStorage small
async function compressImage(file, maxW = 800, maxH = 800, quality = 0.8) {
  if (!file) return null;
  const blob = file instanceof Blob ? file : null;
  const imgUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = imgUrl;
    });
    let { width, height } = img;
    const ratio = Math.min(maxW / width, maxH / height, 1);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return dataUrl;
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

function resetForm() {
  $("#product-id").value = "";
  $("#product-form").reset();
  $("#save-btn").textContent = "Save Product";
}

function render(items, settings, searchTerm = "") {
  const tbody = $("#portfolio-body");
  tbody.innerHTML = "";
  const currency = settings.currency || "EUR";

  const filtered = items.filter((it) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      (it.name || "").toLowerCase().includes(s) ||
      (it.series || "").toLowerCase().includes(s) ||
      (it.language || "").toLowerCase().includes(s) ||
      (it.notes || "").toLowerCase().includes(s)
    );
  });

  let totalItems = 0;
  let invested = 0;
  let estimated = 0;

  // Sort
  const sortBy = settings.sortBy || "name";
  const sortDir = (settings.sortDir || "asc").toLowerCase() === "desc" ? -1 : 1;
  const getKey = (it) => {
    const qty = Number(it.quantity || 0);
    const price = Number(it.pricePaid || 0);
    const market = Number(it.marketPrice || 0);
    switch (sortBy) {
      case "purchaseDate": return it.purchaseDate || "";
      case "quantity": return qty;
      case "pricePaid": return price;
      case "marketPrice": return market;
      case "invested": return qty * price;
      case "marketTotal": return qty * market;
      case "pl": return qty * (market - price);
      case "name":
      default: return (it.name || "").toLowerCase();
    }
  };
  filtered.sort((a, b) => {
    const ka = getKey(a);
    const kb = getKey(b);
    if (typeof ka === "number" && typeof kb === "number") return (ka - kb) * sortDir;
    return String(ka).localeCompare(String(kb)) * sortDir;
  });

  for (const it of filtered) {
    const qty = Number(it.quantity || 0);
    const price = Number(it.pricePaid || 0);
    const market = Number(it.marketPrice || 0);
    totalItems += qty;
    invested += qty * price;
    estimated += qty * market;

    const tr = document.createElement("tr");
    const imgSrc = it.image || it.imageUrl || "";
    let cmHref = isValidHttpUrl(it.cardmarketUrl) ? buildCardmarketUrl(it.cardmarketUrl, it.language) : "";
    if (!cmHref) cmHref = buildCardmarketSearch(it.name, it.language);
    const wrapLink = (html) => cmHref ? `<a href="${cmHref}" target="_blank" rel="noopener" title="Open on Cardmarket (${it.language || ''})">${html}</a>` : html;
    tr.innerHTML = `
      <td>${imgSrc ? `<img src="${imgSrc}" class="thumb" data-img="${imgSrc}" alt="${it.name||"Image"}" />` : ""}</td>
      <td>
        <div><strong>${it.name || "Unnamed"}</strong></div>
        <div class="sub">${[it.purchaseDate].filter(Boolean).join(" • ")}</div>
      </td>
      <td>${it.language || ""}</td>
      <td>${qty}</td>
      <td>${formatMoney(price, currency)}</td>
      <td>${formatMoney(qty * price, currency)}</td>
      <td>${wrapLink(market ? formatMoney(market, currency) : "-")}</td>
      <td>${wrapLink(market ? formatMoney(qty * market, currency) : "-")}</td>
      <td class="${market - price >= 0 ? "price-pos" : "price-neg"}">${wrapLink(market ? formatMoney(qty * (market - price), currency) : "-")}</td>
      <td>
        <button class="icon" data-action="edit" data-id="${it.id}">✎</button>
        <button class="icon danger" data-action="delete" data-id="${it.id}">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  $("#summary-items").textContent = String(totalItems);
  $("#summary-invested").textContent = formatMoney(invested, currency);
  $("#summary-estimated").textContent = formatMoney(estimated, currency);
  $("#summary-pl").textContent = formatMoney(estimated - invested, currency);

  // Update overview fields
  const avgPaid = totalItems ? invested / totalItems : 0;
  const avgMarket = totalItems ? estimated / totalItems : 0;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal("ov-items", String(totalItems));
  setVal("ov-invested", formatMoney(invested, currency));
  setVal("ov-estimated", formatMoney(estimated, currency));
  setVal("ov-pl", formatMoney(estimated - invested, currency));
  setVal("ov-avg-paid", formatMoney(avgPaid, currency));
  setVal("ov-avg-market", formatMoney(avgMarket, currency));

  // Render charts
  renderCharts(items, settings);
}

function loadToForm(item) {
  $("#product-id").value = item.id;
  $("#apiId").value = item.apiId || "";
  $("#imageUrl").value = item.imageUrl || "";
  $("#cardmarketUrl").value = item.cardmarketUrl || "";
  $("#name").value = item.name || "";
  $("#language").value = item.language || "English";
  $("#purchaseDate").value = item.purchaseDate || "";
  $("#quantity").value = item.quantity || 1;
  $("#pricePaid").value = item.pricePaid || "";
      $("#save-btn").textContent = "Update Product";
}

async function main() {
  let settings = loadSettings();
  let items = loadData();

  // Init currency select
  const currencySelect = $("#currency-select");
  currencySelect.value = settings.currency || "EUR";
  currencySelect.addEventListener("change", () => {
    settings.currency = currencySelect.value;
    saveSettings(settings);
    render(items, settings, $("#search").value.trim());
  });

  // Init theme
  applyTheme(settings.theme);
  const themeToggle = $("#theme-toggle");
  themeToggle.addEventListener("click", () => {
    settings.theme = settings.theme === "light" ? "dark" : "light";
    saveSettings(settings);
    applyTheme(settings.theme);
  });

  // Render initial
  render(items, settings);

  // Setup refresh UI and behavior
  const refreshBtn = $("#refresh-btn");
  const refreshStatus = $("#refresh-status");
  function updateRefreshUI() {
    const { allowed, remainingMs } = canRefreshPrices(settings);
    refreshBtn.disabled = !allowed;
    refreshStatus.textContent = allowed ? '' : `Next in ${formatRemaining(remainingMs)}`;
  }
  updateRefreshUI();

  refreshBtn.addEventListener('click', async () => {
    const { allowed, remainingMs } = canRefreshPrices(settings);
    if (!allowed) {
      alert(`Please wait ${formatRemaining(remainingMs)} before refreshing again.`);
      return;
    }
    refreshBtn.disabled = true;
    refreshStatus.textContent = 'Refreshing…';
    await refreshAllMarketData(items);
    settings.lastRefreshAt = Date.now();
    saveSettings(settings);
    updateRefreshUI();
    render(items, settings, $("#search").value.trim());
  });

  // Add / Update product
  $("#product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#product-id").value || uid();
    const name = $("#name").value.trim();
    // series removed
    const language = $("#language").value;
    const purchaseDate = $("#purchaseDate").value;
    const quantity = Number($("#quantity").value) || 1;
    const pricePaid = Number($("#pricePaid").value);
    let marketPrice = Number($("#marketPriceApi").value || 0);
    const notes = "";
    let apiId = $("#apiId").value.trim();
    let imageUrl = $("#imageUrl").value.trim();
    const file = null;

    let imageDataUrl = null;
    if (file) {
      try {
        imageDataUrl = null;
      } catch {
        alert("Could not process image. Try a smaller file.");
      }
    }

    // Ensure we have image and a language-specific market price
    try {
      if (apiId) {
        const detail = await fetchProductDetailById(apiId);
        if (detail) {
          const dp = Array.isArray(detail) ? detail[0] : (detail.data || detail.product || detail);
          if (dp) {
            const cm = dp.prices && dp.prices.cardmarket ? dp.prices.cardmarket : null;
            const n = normalizeProduct(dp);
            if (!imageUrl && n.image) imageUrl = n.image;
            if (!cardmarketUrl && dp.links && dp.links.cardmarket) cardmarketUrl = dp.links.cardmarket;
            const langPrice = priceForLanguage(cm, language);
            if (langPrice != null) marketPrice = Number(langPrice);
          }
        }
      }
      if ((!apiId || !imageUrl || !marketPrice) && name) {
        const guess = await apiSearchProducts(name, 1);
        if (guess && guess.length) {
          const p = guess[0];
          const n = normalizeProduct(p);
          apiId = String(n.id || apiId || "");
          imageUrl = n.image || imageUrl || "";
          const cm = p && p.prices && p.prices.cardmarket ? p.prices.cardmarket : null;
          if (!cardmarketUrl && n.cmLink) cardmarketUrl = n.cmLink;
          const langPrice = priceForLanguage(cm, language);
          if (langPrice != null) marketPrice = Number(langPrice);
        }
      }
    } catch {}

    const existingIndex = items.findIndex((x) => x.id === id);
    const base = existingIndex >= 0 ? items[existingIndex].image : null;

    const product = {
      id, name, language, purchaseDate,
      quantity, pricePaid, marketPrice, notes,
      image: imageDataUrl || base || null,
      imageUrl: imageUrl || null,
      cardmarketUrl: cardmarketUrl || null,
      apiId: apiId || null,
      apiSource: apiId ? "rapidapi:pokemon-tcg" : null,
      // future: store cardmarket ids, urls, etc.
    };

    if (existingIndex >= 0) items[existingIndex] = product; else items.push(product);
    saveData(items);
    render(items, settings, $("#search").value.trim());
    resetForm();
  });

  // Reset form
  $("#reset-btn").addEventListener("click", resetForm);

  // Suggestions under Name input
  const nameInput = $("#name");
  const sugEl = $("#name-suggestions");
  const hideSuggestions = () => { sugEl.classList.add("hidden"); sugEl.innerHTML = ""; };
  const showSuggestions = (items) => {
    if (!items || !items.length) { hideSuggestions(); return; }
    const currentLang = $("#language").value;
    sugEl.innerHTML = items.map((p) => {
      const n = normalizeProduct(p);
      const img = n.image ? `<img class=\"suggestion-img\" src=\"${n.image}\" alt=\"\">` : "";
      const cm = p && p.prices && p.prices.cardmarket ? p.prices.cardmarket : null;
      const priceRaw = priceForLanguage(cm, currentLang);
      const curr = (cm && cm.currency) || "EUR";
      const priceBadge = (priceRaw != null) ? `<span class=\"badge-price\">${curr} ${Number(priceRaw)}</span>` : "";
      const sub = `<div class=\"suggestion-sub\">${n.series ? `${n.series}` : ""} ${priceBadge}</div>`;
      return `<div class=\"suggestion-item\" data-id=\"${n.id || ""}\" data-name=\"${(n.name||"").replace(/"/g,'&quot;')}\" data-image=\"${n.image || ""}\" data-price=\"${priceRaw != null ? String(priceRaw) : ""}\" data-cmlink=\"${n.cmLink || ""}\">${img}<div class=\"suggestion-text\"><div class=\"suggestion-title\">${n.name}</div>${sub}</div></div>`;
    }).join("");
    sugEl.classList.remove("hidden");
  };
  const handleSuggest = debounce(async () => {
    const q = nameInput.value.trim();
    if (q.length < 3) { hideSuggestions(); return; }
    try {
      const results = await apiSearchProducts(q, 10);
      showSuggestions(results);
    } catch { hideSuggestions(); }
  }, 450);
  nameInput.addEventListener("input", handleSuggest);
  nameInput.addEventListener("focus", handleSuggest);
  $("#language").addEventListener("change", () => {
    if (!sugEl.classList.contains("hidden")) handleSuggest();
  });
  document.addEventListener("click", (e) => {
    if (!sugEl.contains(e.target) && e.target !== nameInput) hideSuggestions();
  });
  sugEl.addEventListener("click", (e) => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    const pname = item.getAttribute('data-name') || '';
    const pid = item.getAttribute('data-id') || '';
    const pimg = item.getAttribute('data-image') || '';
    const pprice = item.getAttribute('data-price') || '';
    const pcl = item.getAttribute('data-cmlink') || '';
    $("#name").value = pname;
    $("#apiId").value = pid;
    $("#imageUrl").value = pimg;
    $("#marketPriceApi").value = pprice ? Number(pprice) : "";
    $("#cardmarketUrl").value = pcl;
    hideSuggestions();
  });

  // Table actions
  $("#portfolio-body").addEventListener("click", (e) => {
    const target = e.target;
    if (target.matches("img.thumb")) {
      const src = target.getAttribute("data-img");
      $("#modal-image").src = src;
      $("#image-modal").classList.remove("hidden");
      return;
    }
    if (target.closest("button")) {
      const btn = target.closest("button");
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (action === "edit") {
        const item = items.find((x) => x.id === id);
        if (item) loadToForm(item);
      } else if (action === "delete") {
        if (confirm("Delete this product?")) {
          items = items.filter((x) => x.id !== id);
          saveData(items);
          render(items, settings, $("#search").value.trim());
        }
      }
    }
  });

  // Close image modal
  $("#modal-close").addEventListener("click", () => {
    $("#image-modal").classList.add("hidden");
    $("#modal-image").src = "";
  });
  $("#image-modal").addEventListener("click", (e) => {
    if (e.target.id === "image-modal") {
      $("#modal-close").click();
    }
  });

  // Export
  $("#export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ settings, items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0,10);
    a.download = `sealed-pokemon-portfolio-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Import
  $("#import-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        items = data; // legacy format
      } else {
        if (Array.isArray(data.items)) items = data.items;
        if (data.settings && data.settings.currency) settings.currency = data.settings.currency;
        if (data.settings && data.settings.theme) settings.theme = data.settings.theme;
      }
      saveData(items);
      saveSettings(settings);
      $("#currency-select").value = settings.currency;
      applyTheme(settings.theme);
      render(items, settings, $("#search").value.trim());
      e.target.value = "";
    } catch (err) {
      alert("Invalid file format");
    }
  });

  // Search
  $("#search").addEventListener("input", (e) => {
    render(items, settings, e.target.value.trim());
  });

  // Sort controls
  const sortBySel = document.getElementById("sort-by");
  const sortDirSel = document.getElementById("sort-dir");
  sortBySel.value = settings.sortBy || "name";
  sortDirSel.value = settings.sortDir || "asc";
  sortBySel.addEventListener("change", () => {
    settings.sortBy = sortBySel.value;
    saveSettings(settings);
    render(items, settings, $("#search").value.trim());
  });
  sortDirSel.addEventListener("change", () => {
    settings.sortDir = sortDirSel.value;
    saveSettings(settings);
    render(items, settings, $("#search").value.trim());
  });

  // Simple hash routing for views
  function applyRoute() {
    const hash = (location.hash || "#overview").toLowerCase();
    const isOverview = hash === "#overview";
    const ov = document.getElementById("view-overview");
    const itf = document.getElementById("view-items");
    const itt = document.getElementById("view-items-table");
    if (ov && itf && itt) {
      ov.style.display = isOverview ? "block" : "none";
      itf.style.display = isOverview ? "none" : "block";
      itt.style.display = isOverview ? "none" : "block";
    }
    const navOv = document.getElementById("nav-overview");
    const navIt = document.getElementById("nav-items");
    if (navOv && navIt) {
      navOv.classList.toggle("active", isOverview);
      navIt.classList.toggle("active", !isOverview);
    }
  }
  window.addEventListener("hashchange", () => { applyRoute(); });
  applyRoute();
}

document.addEventListener("DOMContentLoaded", main);

// Manual refresh: fetch details per item with cache and 30m staleness window
async function refreshAllMarketData(items) {
  const cache = loadCache();
  const COOLDOWN_MS = 30 * 60 * 1000;
  let changed = false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.apiId) continue;
    const key = String(it.apiId);
    let dp = null;
    const entry = cache[key];
    const fresh = entry && (Date.now() - (entry.fetchedAt || 0) < COOLDOWN_MS);
    if (fresh) {
      dp = entry.data;
    } else {
      try {
        const detail = await fetchProductDetailById(it.apiId);
        dp = Array.isArray(detail) ? detail[0] : (detail?.data || detail?.product || detail);
        if (dp) {
          cache[key] = { data: dp, fetchedAt: Date.now() };
          saveCache(cache);
        }
      } catch {}
    }
    if (dp) {
      const cm = dp.prices && dp.prices.cardmarket ? dp.prices.cardmarket : null;
      const n = normalizeProduct(dp);
      const newImage = n.image || it.imageUrl || null;
      const newLink = (dp.links && dp.links.cardmarket) || it.cardmarketUrl || null;
      const langPrice = priceForLanguage(cm, it.language);
      const newPrice = (langPrice != null) ? Number(langPrice) : it.marketPrice;
      // Apply updates if changed
      if (newImage && newImage !== it.imageUrl) { it.imageUrl = newImage; changed = true; }
      if (newLink && newLink !== it.cardmarketUrl) { it.cardmarketUrl = newLink; changed = true; }
      if (typeof newPrice === 'number' && isFinite(newPrice) && newPrice !== it.marketPrice) { it.marketPrice = newPrice; changed = true; }
      it.marketUpdatedAt = Date.now();
    }
  }
  if (changed) saveData(items);
}

// ---------- Charts ----------
function dprScaleCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(300, Math.floor(rect.width * dpr));
  canvas.height = Math.max(150, Math.floor((canvas.getAttribute('height') || rect.height || 200) * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function monthKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function computeTimeSeries(items) {
  const map = new Map(); // key -> { invested, estimated }
  for (const it of items) {
    const key = monthKey(it.purchaseDate);
    if (!key) continue;
    const qty = Number(it.quantity || 0);
    const paid = qty * Number(it.pricePaid || 0);
    const est = qty * Number(it.marketPrice || 0);
    const cur = map.get(key) || { invested: 0, estimated: 0 };
    cur.invested += paid;
    cur.estimated += est;
    map.set(key, cur);
  }
  const keys = Array.from(map.keys()).sort();
  let ci = 0, ce = 0;
  const invested = [], estimated = [], labels = [];
  for (const k of keys) {
    labels.push(k);
    ci += map.get(k).invested;
    ce += map.get(k).estimated;
    invested.push(ci);
    estimated.push(ce);
  }
  return { labels, invested, estimated };
}

function drawLineChart(canvas, labels, series, colors) {
  if (!canvas) return;
  const ctx = dprScaleCanvas(canvas);
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, W, H);

  const allValues = series.flat();
  const maxV = Math.max(1, ...allValues);
  const padL = 40, padR = 10, padT = 10, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  // axes
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border');
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  const n = Math.max(1, labels.length - 1);
  function x(i) { return padL + (plotW * (n ? i / n : 0)); }
  function y(v) { return padT + plotH - (v / maxV) * plotH; }

  // grid y
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border');
  ctx.globalAlpha = 0.5;
  for (let g = 0; g <= 4; g++) {
    const gy = y((maxV / 4) * g);
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + plotW, gy); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // lines
  series.forEach((arr, si) => {
    ctx.strokeStyle = colors[si];
    ctx.lineWidth = 2;
    ctx.beginPath();
    arr.forEach((v, i) => {
      const xi = x(i), yi = y(v);
      if (i === 0) ctx.moveTo(xi, yi); else ctx.lineTo(xi, yi);
    });
    ctx.stroke();
  });

  // labels x (sparse)
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted');
  ctx.font = '12px system-ui';
  const step = Math.ceil(labels.length / 6) || 1;
  labels.forEach((lb, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    const xi = x(i);
    ctx.fillText(lb, xi - 12, padT + plotH + 16);
  });
}

function drawBarChart(canvas, labels, values, color) {
  if (!canvas) return;
  const ctx = dprScaleCanvas(canvas);
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, W, H);
  const pad = { l: 40, r: 10, t: 10, b: 28 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const maxV = Math.max(1, ...values);
  const bw = plotW / Math.max(1, values.length);
  ctx.fillStyle = color;
  values.forEach((v, i) => {
    const h = (v / maxV) * plotH;
    const x = pad.l + i * bw + 6;
    const y = pad.t + plotH - h;
    ctx.fillRect(x, y, Math.max(8, bw - 12), h);
  });
  // x labels (rotated-ish)
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted');
  ctx.font = '12px system-ui';
  labels.forEach((lb, i) => {
    const x = pad.l + i * bw + bw / 2 - 20;
    ctx.fillText(lb.slice(0, 18), x, H - 6);
  });
}

function drawDonutChart(canvas, labels, values, colors) {
  if (!canvas) return;
  const ctx = dprScaleCanvas(canvas);
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 10;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let start = -Math.PI / 2;
  values.forEach((v, i) => {
    const ang = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + ang);
    ctx.closePath();
    ctx.fill();
    start += ang;
  });
  // hole
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function renderCharts(items, settings) {
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#6ea8fe';
  const success = css.getPropertyValue('--success').trim() || '#4cc38a';
  const surface = css.getPropertyValue('--surface-1').trim() || '#0f131c';

  // Line chart: cumulative invested vs estimated
  const ts = computeTimeSeries(items);
  drawLineChart(document.getElementById('chart-line'), ts.labels, [ts.invested, ts.estimated], [accent, success]);

  // Bar chart: top holdings by market total
  const withMarket = items.map(it => ({ name: it.name || 'Item', v: Number(it.quantity || 0) * Number(it.marketPrice || 0) }))
                         .sort((a,b)=>b.v-a.v).slice(0, 6);
  drawBarChart(document.getElementById('chart-bar'), withMarket.map(x=>x.name), withMarket.map(x=>x.v), accent);

  // Donut: by language (market total)
  const byLang = new Map();
  for (const it of items) {
    const key = it.language || 'Other';
    const v = Number(it.quantity || 0) * Number(it.marketPrice || 0);
    byLang.set(key, (byLang.get(key) || 0) + v);
  }
  const langEntries = Array.from(byLang.entries()).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const pieLabels = langEntries.map(x=>x[0]);
  const pieValues = langEntries.map(x=>x[1]);
  const pieColors = [accent, success, '#f59e0b', '#ef4444', '#a78bfa', '#22d3ee'];
  drawDonutChart(document.getElementById('chart-donut'), pieLabels, pieValues, pieColors);
}

// Redraw charts on resize
window.addEventListener('resize', debounce(() => {
  const settings = loadSettings();
  const items = loadData();
  renderCharts(items, settings);
}, 250));
function isValidHttpUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

// Cardmarket helpers: always set sellerCountry=7 and language param by product language
function cmLanguageParam(language) {
  if (!language) return null;
  const l = String(language).toLowerCase();
  if (l.startsWith("english")) return "1"; // EN
  if (l.startsWith("german")) return "3";  // DE
  return null; // other languages left unchanged
}

function buildCardmarketUrl(baseUrl, language) {
  if (!isValidHttpUrl(baseUrl)) return "";
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("sellerCountry", "7");
    const lp = cmLanguageParam(language);
    if (lp) url.searchParams.set("language", lp);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function buildCardmarketSearch(name, language) {
  if (!name) return "";
  const lp = cmLanguageParam(language);
  const base = new URL("https://www.cardmarket.com/de/Pokemon/Products/Search");
  base.searchParams.set("searchString", name);
  base.searchParams.set("sellerCountry", "7");
  if (lp) base.searchParams.set("language", lp);
  return base.toString();
}
