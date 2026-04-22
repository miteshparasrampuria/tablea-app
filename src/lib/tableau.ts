import { DashboardContext, FilterCondition, TableauFilter, WorksheetContext } from "./types";
        entry.allowed_values = Array.from(new Set([...(entry.allowed_values || []), ...f.appliedValues]));
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