import React, { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import ChatPanel from "./components/ChatPanel";
import FilterPanel from "./components/FilterPanel";
import StatusBar from "./components/StatusBar";
import {
  initializeTableau,
  getWorksheets,
  applyFilterToWorksheet,
  clearFilterFromWorksheet
} from "./services/tableauService";
import { sendChatMessage } from "./services/api";

export default function App() {
  const [tableauReady, setTableauReady] = useState(false);
  const [worksheets, setWorksheets] = useState([]);
  const [selectedWorksheet, setSelectedWorksheet] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi — I can help answer questions about this dashboard and update filters."
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Initializing Tableau extension...");

  useEffect(() => {
    async function boot() {
      try {
        await initializeTableau();
        const ws = getWorksheets();
        setWorksheets(ws);

        if (ws.length > 0) {
          setSelectedWorksheet(ws[0].name);
        }

        setTableauReady(true);
        setStatus("Connected to Tableau dashboard");
      } catch (error) {
        console.error(error);
        setStatus("Running outside Tableau or Tableau initialization failed");
      }
    }

    boot();
  }, []);

  const worksheetNames = useMemo(
    () => worksheets.map((w) => w.name),
    [worksheets]
  );

  async function handleSendMessage(userInput) {
    const nextMessages = [...messages, { role: "user", content: userInput }];
    setMessages(nextMessages);
    setLoading(true);
    setStatus("Thinking...");

    try {
      const response = await sendChatMessage({
        message: userInput,
        worksheet: selectedWorksheet,
        availableWorksheets: worksheetNames
      });

      const assistantText =
        response?.answer || "I received your message, but no answer came back.";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText }
      ]);

      if (response?.action?.type === "filter" && response?.action?.field && response?.action?.value) {
        await applyFilterToWorksheet(
          selectedWorksheet,
          response.action.field,
          response.action.value
        );

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Applied filter: ${response.action.field} = ${response.action.value}`
          }
        ]);
      }

      if (response?.action?.type === "clear_filter" && response?.action?.field) {
        await clearFilterFromWorksheet(selectedWorksheet, response.action.field);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Cleared filter on ${response.action.field}`
          }
        ]);
      }

      setStatus("Ready");
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Something went wrong while contacting the assistant or Tableau."
        }
      ]);
      setStatus("Error while processing request");
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyManualFilter(field, value) {
    if (!selectedWorksheet || !field || !value) return;

    try {
      await applyFilterToWorksheet(selectedWorksheet, field, value);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Applied manual filter: ${field} = ${value}`
        }
      ]);
      setStatus("Filter applied");
    } catch (error) {
      console.error(error);
      setStatus("Failed to apply filter");
    }
  }

  async function handleClearManualFilter(field) {
    if (!selectedWorksheet || !field) return;

    try {
      await clearFilterFromWorksheet(selectedWorksheet, field);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Cleared filter: ${field}`
        }
      ]);
      setStatus("Filter cleared");
    } catch (error) {
      console.error(error);
      setStatus("Failed to clear filter");
    }
  }

  return (
    <div className="app-shell">
      <Header tableauReady={tableauReady} />

      <main className="main-grid">
        <section className="left-panel card">
          <div className="section-title-row">
            <h2>Dashboard Controls</h2>
            <span className="badge">
              {selectedWorksheet || "No worksheet selected"}
            </span>
          </div>

          <label className="label">Worksheet</label>
          <select
            className="input"
            value={selectedWorksheet}
            onChange={(e) => setSelectedWorksheet(e.target.value)}
          >
            {worksheetNames.length === 0 ? (
              <option value="">No worksheets found</option>
            ) : (
              worksheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            )}
          </select>

          <FilterPanel
            onApplyFilter={handleApplyManualFilter}
            onClearFilter={handleClearManualFilter}
          />
        </section>

        <section className="right-panel card">
          <ChatPanel
            messages={messages}
            onSend={handleSendMessage}
            loading={loading}
          />
        </section>
      </main>

      <StatusBar status={status} />
    </div>
  );
}