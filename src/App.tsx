import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Send, Sparkles } from "lucide-react";
import StatusBanner from "./components/StatusBanner";
import DashboardMeta from "./components/DashboardMeta";
import ResponsePanel from "./components/ResponsePanel";
import { askAgent } from "./lib/api";
import { applyFiltersToDashboard, buildDashboardContext, initializeTableau } from "./lib/tableau";
import { DashboardContext, FilterCondition } from "./lib/types";

export default function App() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [dashboardName, setDashboardName] = useState("Not connected");
  const [worksheets, setWorksheets] = useState<string[]>([]);
  const [dashboardContext, setDashboardContext] = useState<DashboardContext | null>(null);
  const [status, setStatus] = useState("Initializing Tableau extension...");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [intent, setIntent] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<FilterCondition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const dashboardObj = await initializeTableau();
        setDashboard(dashboardObj);
        setDashboardName(dashboardObj.name);
        setWorksheets((dashboardObj.worksheets || []).map((w: any) => w.name));
        setStatus(`Connected to ${dashboardObj.name}`);

        const context = await buildDashboardContext(dashboardObj);
        setDashboardContext(context);
      } catch (err: any) {
        setError(err.message || "Failed to initialize Tableau extension.");
        setStatus("Initialization failed");
      }
    }

    init();
  }, []);

  const filterCount = useMemo(() => dashboardContext?.available_filters?.length || 0, [dashboardContext]);

  async function refreshContext() {
    if (!dashboard) return;
    const context = await buildDashboardContext(dashboard);
    setDashboardContext(context);
    setWorksheets(context.worksheets);
  }

  async function handleAsk() {
    setError("");
    setAnswer("");
    setIntent("");
    setConfidence(null);
    setAppliedFilters([]);

    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }

    if (!dashboard || !dashboardContext) {
      setError("Dashboard context is not ready yet.");
      return;
    }

    setLoading(true);
    setStatus("Sending request to agent...");

    try {
      const result = await askAgent(question, dashboardContext);
      const filters = result.filters || [];

      await applyFiltersToDashboard(dashboard, filters);
      await refreshContext();

      setAnswer(result.answer_text || "No answer returned.");
      setIntent(result.intent || "unknown");
      setConfidence(typeof result.confidence === "number" ? result.confidence : null);
      setAppliedFilters(filters);
      setStatus("Completed successfully");
    } catch (err: any) {
      setError(err.message || "Something went wrong while contacting the agent.");
      setStatus("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="hero-card"
      >
        <div className="hero-top">
          <div className="hero-title-wrap">
            <div className="hero-icon">
              <Sparkles size={22} />
            </div>
            <div>
              <h1>SpectraMedix Tableau Agent</h1>
              <p>Ask questions and update filters without changing the dashboard layout.</p>
            </div>
          </div>
        </div>

        <StatusBanner status={status} error={error} connected={!!dashboard && !error} />
        <DashboardMeta dashboardName={dashboardName} worksheets={worksheets} filterCount={filterCount} />
      </motion.div>

      <div className="content-grid">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.35 }}
          className="panel"
        >
          <div className="panel-header">Ask the dashboard</div>
          <div className="muted-text panel-copy">
            This extension sends Tableau context to your hosted agent and applies only the returned filters.
          </div>

          <textarea
            className="question-box"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Example: Filter Region to West and Year to 2025"
          />

          <button className="send-button" onClick={handleAsk} disabled={loading}>
            <Send size={16} />
            <span>{loading ? "Working..." : "Send to Agent"}</span>
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.35 }}
        >
          <ResponsePanel
            answer={answer}
            intent={intent}
            confidence={confidence}
            appliedFilters={appliedFilters}
          />
        </motion.div>
      </div>
    </div>
  );
}