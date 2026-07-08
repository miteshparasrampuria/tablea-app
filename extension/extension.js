(function () {
  "use strict";

  const cfg = window.SPECTRAMEDIX_CONFIG || {};
  const STREAMLIT_URL = cfg.STREAMLIT_URL || "";
  const MCP_BASE_URL = (cfg.MCP_BASE_URL || "").replace(/\/$/, "");
  const POLL_INTERVAL_MS = cfg.POLL_INTERVAL_MS || 2000;

  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const chatFrame = document.getElementById("chat-frame");
  const filterSummary = document.getElementById("filter-summary");

  let dashboard = null;
  let sessionId = "session-" + crypto.randomUUID();
  let pollTimer = null;
  let summaryDebounce = null;

  const filterHistory = [];
  const MAX_HISTORY = 20;

  function setStatus(message, level) {
    statusText.textContent = message;
    statusDot.className = "";
    if (level === "ok") statusDot.classList.add("ok");
    if (level === "err") statusDot.classList.add("err");
  }

  function describeError(err) {
    if (err == null) return "unknown error (no details)";
    if (typeof err === "string") return err;
    if (err.message) return err.message;
    if (err.errorCode) return "Tableau error code " + err.errorCode;
    try {
      return JSON.stringify(err);
    } catch (e) {
      return String(err);
    }
  }

  function assertConfig() {
    if (!STREAMLIT_URL || STREAMLIT_URL.includes("YOUR_")) {
      throw new Error("Set STREAMLIT_URL in extension/config.js");
    }
    if (!MCP_BASE_URL || MCP_BASE_URL.includes("YOUR_")) {
      throw new Error("Set MCP_BASE_URL in extension/config.js");
    }
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error("HTTP " + response.status + ": " + text.slice(0, 200));
    }
    return response.json();
  }

  async function readDashboardContext(dashboardObj) {
    const worksheetNames = dashboardObj.worksheets.map(function (ws) {
      return ws.name;
    });

    const filterMap = new Map();

    for (const worksheet of dashboardObj.worksheets) {
      const filters = await worksheet.getFiltersAsync();
      for (const filter of filters) {
        const fieldName = filter.fieldName;
        if (!fieldName || filterMap.has(fieldName)) continue;

        const entry = {
          field: fieldName,
          worksheet: worksheet.name,
          filter_type: String(filter.filterType),
        };

        try {
          if (filter.filterType === tableau.FilterType.Categorical) {
            const domain = await filter.getDomainAsync();
            if (domain && domain.values) {
              entry.values = domain.values.map(function (v) {
                return typeof v === "object" && v.formattedValue != null
                  ? v.formattedValue
                  : v;
              });
            }
            entry.type = "categorical";
          } else if (filter.filterType === tableau.FilterType.Quantitative) {
            const domain = await filter.getDomainAsync();
            if (domain) {
              entry.min = domain.min;
              entry.max = domain.max;
            }
            entry.type = "quantitative";
          } else {
            entry.type = String(filter.filterType);
          }
        } catch (err) {
          entry.type = "unknown";
          entry.note = "Could not read filter domain";
        }

        filterMap.set(fieldName, entry);
      }
    }

    return {
      dashboard_name: dashboardObj.name,
      worksheets: worksheetNames,
      available_filters: Array.from(filterMap.values()),
      worksheet_contexts: [],
      available_measures: [],
      available_chart_types: ["none"],
    };
  }

  async function registerContext(context) {
    await fetchJson(
      MCP_BASE_URL + "/sessions/" + encodeURIComponent(sessionId) + "/context",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboard_context: context }),
      }
    );
  }

  function buildStreamlitUrl() {
    const params = new URLSearchParams({
      session_id: sessionId,
      mcp_url: MCP_BASE_URL,
      embedded: "1",
    });
    return STREAMLIT_URL + "?" + params.toString();
  }

  function normalizeFilterValues(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  async function snapshotCurrentFilters() {
    const snapshot = [];
    for (const worksheet of dashboard.worksheets) {
      try {
        const filters = await worksheet.getFiltersAsync();
        for (const filter of filters) {
          try {
            if (filter.filterType === tableau.FilterType.Categorical) {
              const applied = filter.appliedValues || [];
              snapshot.push({
                worksheet: worksheet.name,
                field: filter.fieldName,
                type: "categorical",
                isAllSelected: filter.isAllSelected || false,
                values: applied.map(function (v) {
                  return typeof v === "object" && v.formattedValue != null
                    ? v.formattedValue
                    : String(v);
                }),
              });
            } else if (filter.filterType === tableau.FilterType.Quantitative) {
              snapshot.push({
                worksheet: worksheet.name,
                field: filter.fieldName,
                type: "range",
                min: filter.minValue ? filter.minValue.value : null,
                max: filter.maxValue ? filter.maxValue.value : null,
              });
            }
          } catch (err) {
            console.warn("Could not snapshot filter", filter.fieldName, err);
          }
        }
      } catch (err) {
        console.warn("Could not read filters for worksheet", worksheet.name, err);
      }
    }
    return snapshot;
  }

  async function restoreFilterSnapshot(snapshot) {
    // Clear all active filters first so we start from a clean slate.
    for (const worksheet of dashboard.worksheets) {
      try {
        const filters = await worksheet.getFiltersAsync();
        for (const f of filters) {
          try {
            await worksheet.clearFilterAsync(f.fieldName);
          } catch (err) {
            console.warn("Could not clear filter during restore", f.fieldName, err);
          }
        }
      } catch (err) {
        console.warn("Could not read filters during restore for worksheet", worksheet.name, err);
      }
    }

    // Re-apply each filter from the snapshot, grouped by worksheet.
    const worksheetMap = new Map(
      dashboard.worksheets.map(function (ws) { return [ws.name, ws]; })
    );

    for (const entry of snapshot) {
      const worksheet = worksheetMap.get(entry.worksheet);
      if (!worksheet) continue;
      try {
        if (entry.type === "categorical") {
          if (entry.isAllSelected || entry.values.length === 0) {
            await worksheet.clearFilterAsync(entry.field);
          } else {
            await worksheet.applyFilterAsync(
              entry.field,
              entry.values,
              tableau.FilterUpdateType.Replace
            );
          }
        } else if (entry.type === "range") {
          await worksheet.applyRangeFilterAsync(
            entry.field,
            { min: entry.min, max: entry.max },
            tableau.FilterUpdateType.Replace
          );
        }
      } catch (err) {
        console.warn("Could not restore filter", entry.field, err);
      }
    }
  }

  function formatFilterValue(v) {
    return typeof v === "object" && v !== null && v.formattedValue != null
      ? v.formattedValue
      : String(v);
  }

  async function updateFilterSummary() {
    if (!dashboard || !filterSummary) return;

    try {
      const parts = [];
      const seen = new Set();

      for (const worksheet of dashboard.worksheets) {
        const filters = await worksheet.getFiltersAsync();
        for (const filter of filters) {
          const field = filter.fieldName;
          if (!field || seen.has(field)) continue;
          seen.add(field);

          if (filter.filterType === tableau.FilterType.Categorical) {
            if (filter.isAllSelected) continue;
            const applied = (filter.appliedValues || []).map(formatFilterValue);
            if (!applied.length) continue;
            const shown =
              applied.length > 3
                ? applied.slice(0, 3).join(", ") + " +" + (applied.length - 3) + " more"
                : applied.join(", ");
            parts.push(field + ": " + shown);
          } else if (filter.filterType === tableau.FilterType.Quantitative) {
            const min = filter.minValue ? filter.minValue.formattedValue : null;
            const max = filter.maxValue ? filter.maxValue.formattedValue : null;
            if (min == null && max == null) continue;
            parts.push(field + ": " + (min != null ? min : "…") + " – " + (max != null ? max : "…"));
          }
        }
      }

      if (parts.length) {
        filterSummary.textContent = "🔎 Showing: " + parts.join("  ·  ");
        filterSummary.classList.add("active");
      } else {
        filterSummary.textContent = "No active filters";
        filterSummary.classList.remove("active");
      }
      filterSummary.title = filterSummary.textContent;
    } catch (err) {
      console.warn("Could not update filter summary", err);
    }
  }

  function scheduleSummaryUpdate() {
    clearTimeout(summaryDebounce);
    summaryDebounce = setTimeout(updateFilterSummary, 400);
  }

  function watchFilterChanges() {
    // Catches manual filter changes made directly on the dashboard, not just
    // ones the agent applies.
    for (const worksheet of dashboard.worksheets) {
      try {
        worksheet.addEventListener(
          tableau.TableauEventType.FilterChanged,
          scheduleSummaryUpdate
        );
      } catch (err) {
        console.warn("Could not watch filters on worksheet", worksheet.name, err);
      }
    }
  }

  async function clearFieldAcrossWorksheets(fieldName) {
    for (const worksheet of dashboard.worksheets) {
      try {
        await worksheet.clearFilterAsync(fieldName);
      } catch (err) {
        // Field may not exist on this worksheet — not an error
      }
    }
  }

  async function applyFilterSpec(spec) {
    const field = spec.field;
    const operator = (spec.operator || "=").toLowerCase();
    const rawValue = spec.value;

    if (!field) return false;

    if (operator === "clear") {
      if (field === "__all__") {
        for (const worksheet of dashboard.worksheets) {
          try {
            const filters = await worksheet.getFiltersAsync();
            for (const f of filters) {
              try {
                await worksheet.clearFilterAsync(f.fieldName);
              } catch (err) {
                console.warn("Could not clear filter", f.fieldName, err);
              }
            }
          } catch (err) {
            console.warn("Could not read filters from worksheet", worksheet.name, err);
          }
        }
      } else {
        await clearFieldAcrossWorksheets(field);
      }
      return true;
    }

    if (operator === "undo") {
      const steps = Math.max(1, parseInt(rawValue, 10) || 1);
      let snapshot = null;
      for (let i = 0; i < steps && filterHistory.length > 0; i++) {
        snapshot = filterHistory.pop();
      }
      if (snapshot === null) {
        console.warn("Undo requested but filter history is empty.");
        return false;
      }
      await restoreFilterSnapshot(snapshot);
      return true;
    }

    if (operator === "in" || Array.isArray(rawValue)) {
      const values = normalizeFilterValues(rawValue).map(String);
      await dashboard.applyFilterAsync(
        field,
        values,
        tableau.FilterUpdateType.Replace,
        tableau.FilterType.Categorical
      );
      return true;
    }

    if (operator === ">" || operator === ">=" || operator === "<" || operator === "<=") {
      const num = Number(rawValue);
      if (Number.isNaN(num)) return false;
      const min = operator === ">" || operator === ">=" ? num : null;
      const max = operator === "<" || operator === "<=" ? num : null;
      await dashboard.applyRangeFilterAsync(
        field,
        { min: min, max: max },
        tableau.FilterUpdateType.Replace
      );
      return true;
    }

    await dashboard.applyFilterAsync(
      field,
      normalizeFilterValues(rawValue).map(String),
      tableau.FilterUpdateType.Replace,
      tableau.FilterType.Categorical
    );
    return true;
  }

  async function pollPendingFilters() {
    if (!dashboard) return;

    try {
      const payload = await fetchJson(
        MCP_BASE_URL +
          "/sessions/" +
          encodeURIComponent(sessionId) +
          "/pending_filters"
      );

      const filters = payload.filters || [];
      if (!filters.length) return;

      const hasNonUndo = filters.some(function (f) {
        return (f.operator || "").toLowerCase() !== "undo";
      });

      // Snapshot current filter state before any mutating operation so the user
      // can undo back to this point.
      if (hasNonUndo) {
        const snapshot = await snapshotCurrentFilters();
        if (filterHistory.length >= MAX_HISTORY) filterHistory.shift();
        filterHistory.push(snapshot);
      }

      let applied = 0;
      for (const spec of filters) {
        try {
          const ok = await applyFilterSpec(spec);
          if (ok) applied += 1;
        } catch (err) {
          console.error("Failed to apply filter", spec, err);
        }
      }

      await fetchJson(
        MCP_BASE_URL +
          "/sessions/" +
          encodeURIComponent(sessionId) +
          "/pending_filters/ack",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applied_count: applied }),
        }
      );

      if (applied > 0) {
        const operators = filters.map(function (f) {
          return (f.operator || "").toLowerCase();
        });
        const allUndo = operators.every(function (op) { return op === "undo"; });
        const allClear = operators.every(function (op) { return op === "clear"; });
        const msg = allUndo
          ? "Reverted to previous filter state (" + filterHistory.length + " step(s) remaining in history)"
          : allClear
          ? "Cleared filter(s) on dashboard"
          : "Applied " + applied + " filter operation(s) to dashboard";
        setStatus(msg, "ok");
        scheduleSummaryUpdate();
      }
    } catch (err) {
      console.error("Poll error", err);
      setStatus("MCP poll error: " + err.message, "err");
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollPendingFilters, POLL_INTERVAL_MS);
  }

  async function initialize() {
    try {
      assertConfig();

      if (typeof tableau === "undefined" || !tableau.extensions) {
        setStatus(
          "Preview mode — open inside Tableau Desktop to sync dashboard filters.",
          "err"
        );
        if (filterSummary) {
          filterSummary.textContent = "Filter summary unavailable in preview mode";
        }
        chatFrame.src = buildStreamlitUrl();
        return;
      }

      setStatus("Connecting to Tableau…");
      try {
        await tableau.extensions.initializeAsync();
      } catch (err) {
        throw new Error("initializeAsync failed: " + describeError(err));
      }

      dashboard = tableau.extensions.dashboardContent.dashboard;
      if (!dashboard) {
        throw new Error("No dashboard content available from Tableau.");
      }

      setStatus("Reading dashboard filters…");
      let context;
      try {
        context = await readDashboardContext(dashboard);
      } catch (err) {
        throw new Error("Reading dashboard failed: " + describeError(err));
      }

      // Load the chat immediately; filter sync is best-effort.
      chatFrame.src = buildStreamlitUrl();
      setStatus("Chat ready · " + (context.dashboard_name || "dashboard"), "ok");

      setStatus("Registering session with MCP…");
      try {
        await registerContext(context);
        setStatus("Chat ready · " + (context.dashboard_name || "dashboard"), "ok");
      } catch (err) {
        console.error("MCP register failed", err);
        setStatus(
          "Chat ready (MCP sync failed: " + describeError(err) + ")",
          "err"
        );
      }

      startPolling();
      watchFilterChanges();
      updateFilterSummary();
    } catch (err) {
      console.error(err);
      setStatus("Extension init failed: " + describeError(err), "err");
    }
  }

  initialize();
})();
