import React from "react";

export default function Header({ tableauReady }) {
  return (
    <header className="topbar">
      <div>
        <div className="brand">Spectramedix</div>
        <h1>LLM Dashboard Assistant</h1>
        <p className="subtitle">
          Ask questions, inspect dashboard context, and update filters.
        </p>
      </div>

      <div className={`pill ${tableauReady ? "pill-success" : "pill-warning"}`}>
        {tableauReady ? "Tableau Connected" : "Tableau Not Connected"}
      </div>
    </header>
  );
}