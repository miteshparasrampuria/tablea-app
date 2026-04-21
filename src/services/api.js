const API_BASE_URL = "https://tableau-api-agent.onrender.com";

export async function sendChatMessage(payload) {
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Failed to call assistant backend. Please check");
  }

  return response.json();
} 