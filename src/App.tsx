import { useEffect, useMemo, useState } from "react";
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