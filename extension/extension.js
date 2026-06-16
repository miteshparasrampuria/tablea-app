(function () {
  "use strict";

  const cfg = window.SPECTRAMEDIX_CONFIG || {};
  const STREAMLIT_URL = cfg.STREAMLIT_URL || "";
  const MCP_BASE_URL = (cfg.MCP_BASE_URL || "").replace(/\/$/, "");
  const POLL_INTERVAL_MS = cfg.POLL_INTERVAL_MS || 2000;

  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const chatFrame = document.getElementById("chat-frame");

  let dashboard = null;
  let sessionId = "session-" + crypto.randomUUID();
  let pollTimer = null;

  function setStatus(message, level) {
    statusText.textContent = message;
    statusDot.className = "";
    if (level === "ok") statusDot.classList.add("ok");
    if (level === "err") statusDot.classList.add("err");
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

  async function applyFilterSpec(spec) {
    const field = spec.field;
    const operator = (spec.operator || "=").toLowerCase();
    const rawValue = spec.value;

    if (!field) return false;

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
        setStatus("Applied " + applied + " filter(s) to dashboard", "ok");
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
      setStatus("Connecting to Tableau…");

      await tableau.extensions.initializeAsync();
      dashboard = tableau.extensions.dashboardContent.dashboard;

      setStatus("Reading dashboard filters…");
      const context = await readDashboardContext(dashboard);

      setStatus("Registering session with MCP…");
      await registerContext(context);

      chatFrame.src = buildStreamlitUrl();
      setStatus("Chat ready · " + context.dashboard_name, "ok");
      startPolling();
    } catch (err) {
      console.error(err);
      setStatus("Extension init failed: " + err.message, "err");
    }
  }

  initialize();
})();
