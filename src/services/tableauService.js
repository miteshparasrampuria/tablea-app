let dashboard = null;

export async function initializeTableau() {
  if (!window.tableau?.extensions) {
    throw new Error("Tableau Extensions API not found.");
  }

  await window.tableau.extensions.initializeAsync();
  dashboard = window.tableau.extensions.dashboardContent.dashboard;
  return dashboard;
}

export function getWorksheets() {
  if (!dashboard) return [];
  return dashboard.worksheets || [];
}

export async function applyFilterToWorksheet(worksheetName, fieldName, value) {
  if (!dashboard) throw new Error("Dashboard not initialized");

  const worksheet = dashboard.worksheets.find((ws) => ws.name === worksheetName);
  if (!worksheet) throw new Error(`Worksheet "${worksheetName}" not found`);

  await worksheet.applyFilterAsync(
    fieldName,
    [value],
    window.tableau.FilterUpdateType.Replace
  );
}

export async function clearFilterFromWorksheet(worksheetName, fieldName) {
  if (!dashboard) throw new Error("Dashboard not initialized");

  const worksheet = dashboard.worksheets.find((ws) => ws.name === worksheetName);
  if (!worksheet) throw new Error(`Worksheet "${worksheetName}" not found`);

  await worksheet.clearFilterAsync(fieldName);
}