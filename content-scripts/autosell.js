/**
 * LazyFrog — inventory autosell (devvit iframe).
 * Originally a Tampermonkey script; runs as an extension content script on *.devvit.net
 */
(function lazyfrogAutosell() {
  "use strict";

  if (window.__lazyfrogAutosellInit) return;
  if (!/devvit\.net/i.test(window.location.hostname)) return;

  window.__lazyfrogAutosellBooted = true;
  console.log("[LazyFrog Autosell] content script loaded", window.location.href);

  const LOG_PREFIX = "[LazyFrog Autosell]";
  const STORAGE_KEY = "autosellConfig";

  const DEFAULT_CONFIG = {
    stackMinQty: 10,
    bulkKeywords: "ore, iron, stone, rock",
    bulkMinQty: 2000,
    bulkBatchSize: 100,
    bulkKeepQty: 2000,
    sellOtherDuplicates: false,
    otherMinQty: 2,
  };

  const CSS = `
.lazyfrog-autosell-root {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
  font: 12px/1.35 sans-serif;
  pointer-events: none;
}
.lazyfrog-autosell-root * {
  pointer-events: auto;
}
.lazyfrog-autosell-fab {
  padding: 0.45rem 0.85rem 0.45rem 0.55rem;
  border: 0;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  background: #5a7a3a;
  box-shadow: -2px 2px 10px rgba(0,0,0,0.4);
}
.lazyfrog-autosell-fab.running {
  background: #8a3a3a;
}
.lazyfrog-autosell-gear {
  padding: 0.25rem 0.55rem;
  border: 0;
  border-radius: 6px 0 0 6px;
  cursor: pointer;
  font-size: 14px;
  color: #fff;
  background: #3a4a7a;
  box-shadow: -2px 2px 8px rgba(0,0,0,0.35);
}
.lazyfrog-autosell-panel {
  display: none;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 17rem;
  padding: 0.55rem;
  color: #fff;
  background: #2b2d54;
  border-radius: 8px 0 0 8px;
  box-shadow: -2px 2px 12px rgba(0,0,0,0.45);
  max-height: 70vh;
  overflow-y: auto;
}
.lazyfrog-autosell-panel.open {
  display: flex;
}
.lazyfrog-autosell-panel h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.lazyfrog-autosell-panel label {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 11px;
  opacity: 0.92;
}
.lazyfrog-autosell-panel label.inline {
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
}
.lazyfrog-autosell-panel input[type="text"],
.lazyfrog-autosell-panel input[type="number"] {
  width: 100%;
  box-sizing: border-box;
  padding: 0.2rem 0.35rem;
  border: 1px solid #4a4d8a;
  border-radius: 4px;
  background: #1a1c38;
  color: #fff;
}
.lazyfrog-autosell-panel .row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}
.lazyfrog-autosell-actions {
  display: flex;
  gap: 0.35rem;
}
.lazyfrog-autosell-actions button {
  flex: 1;
  padding: 0.35rem 0.5rem;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 600;
}
.lazyfrog-autosell-sell {
  background: #5a7a3a;
  color: #fff;
}
.lazyfrog-autosell-sell.running {
  background: #8a3a3a;
}
.lazyfrog-autosell-save {
  background: #3a4a7a;
  color: #fff;
}
.lazyfrog-autosell-status {
  min-height: 1.5em;
  font-size: 10px;
  opacity: 0.9;
  white-space: pre-wrap;
  color: #cfe8ff;
}
.lazyfrog-autosell-status.error {
  color: #ffb4b4;
  font-weight: 600;
}
`;

  let config = { ...DEFAULT_CONFIG };
  let running = false;
  let statusText = "Ready.";

  const log = (msg, ...params) => console.log(`${LOG_PREFIX} ${msg}`, ...params);

  const jitterDelay = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 34 - 17));

  const retry = async (fn, { retries = 3, delayMs = 300 } = {}) => {
    let lastErr;
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (i < retries - 1) await jitterDelay(delayMs);
      }
    }
    throw lastErr;
  };

  const parseKeywords = (text) =>
    String(text)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  const matchesKeywords = (name, keywords) => {
    const lower = name.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  };

  const isVisible = (el) => {
    if (!el?.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const setNativeInputValue = (el, value) => {
    const str = String(value);
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, str);
    else el.value = str;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: str, inputType: "insertFromPaste" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const getSellRule = (itemName, quantity, cfg) => {
    const bulkKw = parseKeywords(cfg.bulkKeywords);
    const stackMin = Number(cfg.stackMinQty ?? cfg.gearMinQty ?? 10);

    if (matchesKeywords(itemName, bulkKw)) {
      const keep = Number(cfg.bulkKeepQty);
      const minQty = Number(cfg.bulkMinQty);
      if (quantity <= minQty) return null;
      const batch = Number(cfg.bulkBatchSize);
      const sellAmount = Math.min(batch, quantity - keep);
      if (sellAmount <= 0) return null;
      return {
        kind: "bulk",
        sellAmount,
        reason: `bulk qty ${quantity}, sell ${sellAmount} (keep ${keep})`,
      };
    }

    if (quantity > stackMin) {
      return {
        kind: "stack",
        sellAmount: 1,
        reason: `qty ${quantity} > ${stackMin}`,
      };
    }

    if (cfg.sellOtherDuplicates && quantity > Number(cfg.otherMinQty)) {
      return { kind: "duplicate", sellAmount: 1, reason: `duplicate qty ${quantity}` };
    }

    return null;
  };

  const waitForSellPanel = async () => {
    for (let i = 0; i < 12; i++) {
      const panel =
        document.querySelector(".sell-button") ||
        document.querySelector('[class*="sell-button"]') ||
        document.querySelector(".item-detail-panel") ||
        document.querySelector('[class*="item-detail"]');
      if (panel && isVisible(panel)) return panel;
      await jitterDelay(80);
    }
    return null;
  };

  const findQuantityControls = (root = document) => {
    const inputs = [...root.querySelectorAll("input")].filter(
      (el) =>
        isVisible(el) &&
        (el.type === "number" ||
          el.type === "range" ||
          el.inputMode === "numeric" ||
          /qty|quantity|amount|count/i.test(el.className + el.name + el.id))
    );
    return inputs;
  };

  const clickMaxQuantity = () => {
    const buttons = [...document.querySelectorAll("button, [role='button'], div[class*='btn']")].filter(
      isVisible
    );
    const maxBtn = buttons.find((el) => /^(max|all)$/i.test(el.textContent?.trim()));
    if (maxBtn) {
      maxBtn.click();
      return true;
    }
    return false;
  };

  const setSellQuantity = async (amount, panelRoot = document) => {
    await jitterDelay(150);

    const roots = [
      panelRoot,
      document.querySelector('[class*="sell"]'),
      document.querySelector('[class*="modal"]'),
      document.body,
    ].filter(Boolean);

    for (const root of roots) {
      for (const input of findQuantityControls(root)) {
        setNativeInputValue(input, amount);
        await jitterDelay(80);
        const parsed = Number.parseInt(String(input.value).replace(/,/g, ""), 10);
        if (parsed === amount) {
          log(`Set sell quantity to ${amount} via input`);
          return true;
        }
      }
    }

    const range = document.querySelector('input[type="range"]');
    if (range && isVisible(range)) {
      const max = Number(range.max) || amount;
      range.value = String(Math.min(amount, max));
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
      log(`Set sell quantity via range slider`);
      return true;
    }

    const plusBtn = [...document.querySelectorAll("button, [role='button']")].find(
      (el) => isVisible(el) && /^\+$/.test(el.textContent?.trim())
    );
    if (plusBtn && amount <= 50) {
      for (let i = 1; i < amount; i++) {
        plusBtn.click();
        await jitterDelay(30);
      }
      log(`Set sell quantity via + button (${amount})`);
      return true;
    }

    return false;
  };

  const findSellButton = ({ preferBulk = false } = {}) => {
    if (preferBulk) {
      const sellAll = document.querySelector(".sell-button:has(.sell-all)");
      if (sellAll && isVisible(sellAll)) return sellAll;
    }
    const single = document.querySelector(".sell-button:has(.sell-button-info:not(.sell-all))");
    if (single && isVisible(single)) return single;
    return (
      [...document.querySelectorAll(".sell-button")].find(isVisible) ||
      [...document.querySelectorAll('[class*="sell-button"]')].find(isVisible)
    );
  };

  const closePopups = async () => {
    const closeSelectors = [
      ".close-button",
      ".modal-close",
      ".cancel-button",
    ];
    for (const sel of closeSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        await jitterDelay(200);
      }
    }
  };

  const performSell = async (item, sellAmount, kind, totalQty = 0) => {
    if (!item?.isConnected) throw new Error("Item node detached");

    item.click();
    await jitterDelay(450);

    const panel = await waitForSellPanel();
    if (!panel) {
      await closePopups();
      throw new Error("Sell panel did not open");
    }

    if (kind === "bulk" && sellAmount > 1) {
      let setOk = await setSellQuantity(sellAmount, panel);
      if (!setOk && totalQty > 0) {
        const excess = totalQty - Number(config.bulkKeepQty);
        if (excess > sellAmount) {
          log(`Batch input failed — trying single bulk sell of ${excess}`);
          setOk = await setSellQuantity(excess, panel);
        }
      }
      if (!setOk) {
        log(`Could not set quantity — check ⚙ batch size or sell manually once to inspect UI`);
      }
    }

    const sellBtn = findSellButton({ preferBulk: kind === "bulk" && sellAmount > 1 });
    if (!sellBtn) {
      await closePopups();
      throw new Error("No sell button");
    }
    sellBtn.click();
    await jitterDelay(450);

    const confirmBtn = document.querySelector(".confirm-button.continue");
    if (!confirmBtn) {
      await closePopups();
      throw new Error("No confirm popup");
    }
    confirmBtn.click();
    await jitterDelay(350);
  };

  const readItemQuantity = (item) => {
    const raw = item.querySelector(".item_quantity")?.innerText ?? "1";
    const qty = Number.parseInt(raw.replace(/,/g, ""), 10);
    return Number.isFinite(qty) ? qty : 1;
  };

  const readItemName = (item) => item.querySelector(".item-image")?.alt?.trim() || "";

  const clearProcessed = (grid) => {
    grid.querySelectorAll(".equipment-slot[processed]").forEach((el) => {
      el.removeAttribute("processed");
    });
  };

  let statusEl = null;
  let sellBtnEl = null;
  let panelEl = null;

  const setStatus = (text, { error = false } = {}) => {
    statusText = text;
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.classList.toggle("error", error);
    }
    if (error) {
      console.warn(`${LOG_PREFIX} ${text}`);
    }
  };

  const setRunningUi = (isRunning) => {
    running = isRunning;
    if (sellBtnEl) {
      sellBtnEl.textContent = isRunning ? "LF Stop" : "LF Sell";
      sellBtnEl.classList.toggle("running", isRunning);
    }
  };

  const loadConfig = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          const saved = result[STORAGE_KEY] || {};
          if (saved.gearMinQty != null && saved.stackMinQty == null) {
            saved.stackMinQty = saved.gearMinQty;
          }
          config = { ...DEFAULT_CONFIG, ...saved };
          resolve(config);
        });
      } catch {
        config = { ...DEFAULT_CONFIG };
        resolve(config);
      }
    });

  const saveConfigToStorage = (cfg) =>
    new Promise((resolve) => {
      config = { ...DEFAULT_CONFIG, ...cfg };
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: config }, () => resolve(config));
      } catch {
        resolve(config);
      }
    });

  const readConfigFromPanel = (panel) => {
    const val = (name) => panel.querySelector(`[name="${name}"]`);
    return {
      stackMinQty: Number(val("stackMinQty")?.value ?? DEFAULT_CONFIG.stackMinQty),
      bulkKeywords: val("bulkKeywords")?.value ?? DEFAULT_CONFIG.bulkKeywords,
      bulkMinQty: Number(val("bulkMinQty")?.value ?? DEFAULT_CONFIG.bulkMinQty),
      bulkKeepQty: Number(val("bulkKeepQty")?.value ?? DEFAULT_CONFIG.bulkKeepQty),
      bulkBatchSize: Number(val("bulkBatchSize")?.value ?? DEFAULT_CONFIG.bulkBatchSize),
      sellOtherDuplicates: !!val("sellOtherDuplicates")?.checked,
      otherMinQty: Number(val("otherMinQty")?.value ?? DEFAULT_CONFIG.otherMinQty),
    };
  };

  const applyConfigToPanel = (panel, cfg) => {
    for (const [key, value] of Object.entries(cfg)) {
      const el = panel.querySelector(`[name="${key}"]`);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value;
    }
  };

  const findNextItem = (grid) => {
    const slots = [...grid.querySelectorAll(".equipment-slot:not([processed])")].filter(isVisible);
    return slots[0] || null;
  };

  const runAutosell = async () => {
    const grid = document.querySelector(".virtual-items-grid");
    if (!grid) {
      const msg = "Open INVENTORY first, then click LF Sell.";
      setStatus(msg, { error: true });
      log("Could not find .virtual-items-grid — open inventory screen");
      if (panelEl) panelEl.classList.add("open");
      return;
    }

    const cfg = { ...config };
    setRunningUi(true);
    clearProcessed(grid);

    let sold = 0;
    let skipped = 0;
    let staleScrolls = 0;

    setStatus("Running…");

    while (running) {
      const item = findNextItem(grid);
      if (!item) {
        const preScroll = grid.scrollTop;
        grid.scrollTop += 220;
        await jitterDelay(450);
        if (grid.scrollTop === preScroll) {
          staleScrolls += 1;
          if (staleScrolls >= 2) break;
        } else {
          staleScrolls = 0;
        }
        continue;
      }

      const name = readItemName(item);
      if (!name) {
        item.setAttribute("processed", "true");
        skipped += 1;
        continue;
      }

      const quantity = readItemQuantity(item);
      const rule = getSellRule(name, quantity, cfg);

      if (!rule) {
        log(`Skip '${name}' (qty ${quantity})`);
        item.setAttribute("processed", "true");
        skipped += 1;
        continue;
      }

      log(`${rule.reason}: '${name}'`);

      try {
        await retry(
          () => performSell(item, rule.sellAmount, rule.kind, quantity),
          { retries: 3, delayMs: 350 }
        );
        sold += 1;
        setStatus(`Sold ${sold} · skipped ${skipped}\nLast: ${name} x${rule.sellAmount}`);
      } catch (err) {
        log(`Sell failed for '${name}'`, err);
        item.setAttribute("processed", "true");
        skipped += 1;
        await closePopups();
      }

      await jitterDelay(250);

      if (!item.isConnected) continue;

      const qtyAfter = readItemQuantity(item);
      if (!getSellRule(name, qtyAfter, cfg)) {
        item.setAttribute("processed", "true");
      }
    }

    setRunningUi(false);
    setStatus(`Done. Sold ${sold}, skipped ${skipped}.`);
    log(statusText);
  };

  const addField = (parent, name, labelText, type = "text") => {
    const wrap = document.createElement("label");
    wrap.textContent = labelText;
    const input = document.createElement("input");
    input.name = name;
    input.type = type;
    wrap.appendChild(input);
    parent.appendChild(wrap);
    return input;
  };

  const init = async () => {
    window.__lazyfrogAutosellInit = true;
    await loadConfig();

    const style = document.createElement("style");
    style.textContent = CSS;
    document.documentElement.appendChild(style);

    const root = document.createElement("div");
    root.className = "lazyfrog-autosell-root";

    sellBtnEl = document.createElement("button");
    sellBtnEl.type = "button";
    sellBtnEl.className = "lazyfrog-autosell-fab";
    sellBtnEl.textContent = "LF Sell";
    sellBtnEl.title = "LazyFrog autosell — open inventory first";
    sellBtnEl.addEventListener("click", async () => {
      if (running) {
        setRunningUi(false);
        setStatus("Stopping…");
      } else {
        if (panelEl) config = readConfigFromPanel(panelEl);
        await runAutosell();
      }
    });

    const gearBtn = document.createElement("button");
    gearBtn.type = "button";
    gearBtn.className = "lazyfrog-autosell-gear";
    gearBtn.textContent = "⚙";
    gearBtn.title = "Autosell settings";

    const panel = document.createElement("div");
    panel.className = "lazyfrog-autosell-panel";
    panelEl = panel;

    gearBtn.addEventListener("click", () => panel.classList.toggle("open"));

    addField(panel, "stackMinQty", "Sell if qty > (current tab)", "number");
    addField(panel, "bulkKeywords", "Bulk mat. keywords (comma)");

    const row = document.createElement("div");
    row.className = "row";
    addField(row, "bulkMinQty", "Bulk: sell if qty >", "number");
    addField(row, "bulkKeepQty", "Keep at least", "number");
    panel.appendChild(row);

    addField(panel, "bulkBatchSize", "Bulk batch size", "number");

    const checkLabel = document.createElement("label");
    checkLabel.className = "inline";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.name = "sellOtherDuplicates";
    checkLabel.appendChild(check);
    checkLabel.append(" Also sell other duplicates");
    panel.appendChild(checkLabel);

    addField(panel, "otherMinQty", "Other duplicate min qty", "number");
    applyConfigToPanel(panel, config);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "lazyfrog-autosell-save";
    saveBtn.textContent = "Save settings";
    saveBtn.addEventListener("click", async () => {
      await saveConfigToStorage(readConfigFromPanel(panel));
      setStatus("Settings saved.");
    });
    panel.appendChild(saveBtn);

    statusEl = document.createElement("div");
    statusEl.className = "lazyfrog-autosell-status";
    statusEl.textContent = statusText;
    panel.appendChild(statusEl);

    root.appendChild(sellBtnEl);
    root.appendChild(gearBtn);
    root.appendChild(panel);
    document.body.appendChild(root);

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[STORAGE_KEY]) return;
        config = { ...DEFAULT_CONFIG, ...changes[STORAGE_KEY].newValue };
        applyConfigToPanel(panel, config);
      });
    } catch {
      /* ignore */
    }

    window.lazyfrogAutosell = {
      ready: true,
      run: runAutosell,
      stop: () => setRunningUi(false),
      getConfig: () => ({ ...config }),
      saveConfig: saveConfigToStorage,
      /** Open one item and log sell-panel inputs (debug bulk quantity UI) */
      probeSellUi: async () => {
        const item = findNextItem(document.querySelector(".virtual-items-grid") || document.body);
        if (!item) return log("No item to probe");
        item.click();
        await jitterDelay(600);
        log("Quantity inputs:", findQuantityControls(document));
        log("Sell buttons:", [...document.querySelectorAll(".sell-button")].map((b) => b.outerHTML.slice(0, 120)));
      },
    };

    log("Initialized — green LF Sell button on right edge; open inventory first");
  };

  window.lazyfrogAutosell = {
    ready: false,
    run: async () => {
      if (!window.__lazyfrogAutosellInit) {
        log("Still starting… try again in a second");
        return;
      }
      return runAutosell();
    },
    stop: () => setRunningUi(false),
    getConfig: () => ({ ...config }),
    saveConfig: saveConfigToStorage,
    openSettings: () => panelEl?.classList.add("open"),
  };

  const boot = () => {
    if (window.__lazyfrogAutosellBooting || window.__lazyfrogAutosellInit) return;
    window.__lazyfrogAutosellBooting = true;
    init()
      .catch((err) => console.error(`${LOG_PREFIX} Init failed`, err))
      .finally(() => {
        window.__lazyfrogAutosellBooting = false;
      });
  };

  if (document.body) {
    boot();
  } else {
    const obs = new MutationObserver(() => {
      if (document.body) {
        obs.disconnect();
        boot();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
