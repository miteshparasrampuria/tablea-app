import React, { useState } from "react";

export default function ChatPanel({ messages, onSend, loading }) {
  const [input, setInput] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const text = input.trim();
    setInput("");
    await onSend(text);
  }

  return (
    <div className="chat-panel">
      <div className="section-title-row">
        <h2>Assistant</h2>
      </div>

      <div className="chat-window">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`chat-bubble ${msg.role === "user" ? "user" : "assistant"}`}
          >
            <div className="chat-role">
              {msg.role === "user" ? "You" : "Assistant"}
            </div>
            <div>{msg.content}</div>
          </div>
        ))}
      </div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          className="input chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the dashboard or request a filter change..."
        />
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? "Working..." : "Send"}
        </button>
      </form>
    </div>
  );
}