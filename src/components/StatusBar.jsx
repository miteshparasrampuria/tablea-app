import React from "react";

export default function StatusBar({ status }) {
  return (
    <footer className="statusbar">
      <span>Status:</span>
      <strong>{status}</strong>
    </footer>
  );
}