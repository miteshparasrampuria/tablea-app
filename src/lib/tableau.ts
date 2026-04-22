import { DashboardContext, FilterCondition, TableauFilter, WorksheetContext } from "./types";

async function waitForTableauExtensions(timeoutMs = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (window.tableau?.extensions) {
      return window.tableau.extensions;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Tableau Extensions API was not found.");
}

export async function initializeTableau() {
  const extensions = await waitForTableauExtensions();
  await extensions.initializeAsync();
  return extensions.dashboardContent.dashboard;
}

export async function getWorksheetContext(dashboard: any): Promise<WorksheetContext[]> {
  const worksheetContexts: WorksheetContext[] = [];

  for (const worksheet of dashboard.worksheets || []) {
    let filters: TableauFilter[] = [];

    try {
      const wsFilters = await worksheet.getFiltersAsync();

      filters = wsFilters.map((filter: any) => {
        const out: TableauFilter = {
          field: filter.fieldName,
          filterType: filter.filterType,
        };

        if (filter.appliedValues) {
          out.appliedValues = filter.appliedValues.map((v: any) => v.value);
        }

        if (filter.minValue !== undefined) out.minValue = filter.minValue;
        if (filter.maxValue !== undefined) out.maxValue = filter.maxValue;

        return out;
      });
    } catch {
      filters = [];
    }

    worksheetContexts.push({
      worksheet_name: worksheet.name,
      current_filters: filters,
    });
  }

  return worksheetContexts;
}

export function collectAvailableFiltersFromCurrentState(worksheetContexts: WorksheetContext[]) {
  const seen = new Map<string, { field: string; type: string; allowed_values: Array<string | number> }>();

  for (const ws of worksheetContexts) {
    for (const f of ws.current_filters || []) {
      if (!seen.has(f.field)) {
        seen.set(f.field, {
          field: f.field,
          type: "unknown",
          allowed_values: [],
        });
      }

      const entry = seen.get(f.field)!;

      if (Array.isArray(f.appliedValues) && f.appliedValues.length > 0) {
        entry.allowed_values = Array.from(
          new Set([...(entry.allowed_values || []), ...f.appliedValues])
        );
      }
    }
  }

  return [...seen.values()];
}

export async function buildDashboardContext(dashboard: any): Promise<DashboardContext> {
  const worksheetContexts = await getWorksheetContext(dashboard);

  return {
    dashboard_name: dashboard.name,
    worksheets: worksheetContexts.map((w) => w.worksheet_name),
    available_filters: collectAvailableFiltersFromCurrentState(worksheetContexts),
    worksheet_contexts: worksheetContexts,
    available_measures: [],
    available_chart_types: ["none"],
  };
}

function normalizeValueToArray(value: FilterCondition["value"]): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined) return [];
  return [String(value)];
}

export async function applyFiltersToDashboard(dashboard: any, filters: FilterCondition[]) {
  if (!Array.isArray(filters) || filters.length === 0) return;

  for (const filter of filters) {
    const field = filter.field;
    const operator = filter.operator;
    const rawValue = filter.value;

    if (!field) continue;

    for (const worksheet of dashboard.worksheets || []) {
      try {
        if (operator === "equals" || operator === "in") {
          const values = normalizeValueToArray(rawValue);

          if (values.length > 0) {
            await worksheet.applyFilterAsync(
              field,
              values,
              window.tableau.FilterUpdateType.Replace
            );
          }
        }
      } catch (err) {
        console.warn(`Could not apply filter ${field} on worksheet ${worksheet.name}:`, err);
      }
    }
  }
}