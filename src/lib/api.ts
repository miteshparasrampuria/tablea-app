import { AgentResponse, DashboardContext } from "./types";

const API_URL = "https://tableau-api-agent.onrender.com/ask";

export async function askAgent(question: string, dashboardContext: DashboardContext): Promise<AgentResponse> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      dashboard_context: dashboardContext,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}