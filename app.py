"""SpectraMedix Tableau Agent - Streamlit chat UI.

Architecture:
    User <-> Streamlit chat  -->  LLM Agent API (/ask) {session_id, question}
    The agent reads dashboard context from, and applies filters via, the
    Tableau MCP server. The UI only sends the question + session_id and renders
    the agent's plain-text answer.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import requests
import streamlit as st


AGENT_API_URL_DEFAULT = "https://tableau-api-agent.onrender.com/ask"
REQUEST_TIMEOUT_SECONDS = 60


# ---------------------------------------------------------------------------
# Page config + global styles
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="SpectraMedix Tableau Agent",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      [data-testid="stSidebar"], [data-testid="stSidebarCollapsedControl"] { display: none !important; }
      .block-container { padding-top: 2rem; padding-bottom: 2rem; max-width: 1200px; }
      .hero {
        background: linear-gradient(135deg, #0f2c4a 0%, #137b80 100%);
        color: white;
        padding: 22px 26px;
        border-radius: 16px;
        margin-bottom: 18px;
        box-shadow: 0 8px 24px rgba(15, 44, 74, 0.18);
      }
      .hero h1 { margin: 0; font-size: 26px; font-weight: 700; }
      .hero p  { margin: 4px 0 0; opacity: 0.85; font-size: 14px; }
      .answer-card {
        background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%);
        border-left: 5px solid #137b80;
        border-radius: 12px;
        padding: 18px 22px;
        margin: 6px 0 14px 0;
        box-shadow: 0 4px 14px rgba(15, 44, 74, 0.08);
        font-size: 17px;
        line-height: 1.55;
        color: #0f2c4a;
        font-weight: 500;
      }
      .answer-card .answer-label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #137b80;
        margin-bottom: 8px;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------
def _init_state() -> None:
    defaults = {
        "session_id": f"session-{uuid.uuid4()}",
        "messages": [],  # list[dict]: {role, content, answer_card?}
        "agent_url": AGENT_API_URL_DEFAULT,
        "embedded_mode": False,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def _apply_query_params() -> None:
    params = st.query_params
    session_id = params.get("session_id")
    embedded = params.get("embedded")

    if session_id:
        st.session_state.session_id = session_id
    if embedded == "1":
        st.session_state.embedded_mode = True


_init_state()
_apply_query_params()


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------
def call_agent(question: str) -> dict[str, Any]:
    """POST to the LLM agent API and return the parsed JSON response.

    The agent reads the dashboard context from the MCP server and applies filters
    itself, so the UI only needs to send the question and session_id.
    """
    payload = {
        "session_id": st.session_state.session_id,
        "question": question,
    }
    response = requests.post(
        st.session_state.agent_url,
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={"Content-Type": "application/json"},
    )
    response.raise_for_status()
    return response.json()


def _stream_endpoint() -> str:
    """Derive the streaming endpoint from the configured /ask URL."""
    return st.session_state.agent_url.rstrip("/") + "/stream"


def call_agent_stream(question: str, placeholder) -> dict[str, Any]:
    """Stream the answer from /ask/stream (SSE), rendering tokens live.

    Updates `placeholder` as tokens arrive and returns the final structured
    response dict. Falls back to the blocking /ask call if the deployed API
    does not have the streaming endpoint yet (HTTP 404/405).
    """
    payload = {
        "session_id": st.session_state.session_id,
        "question": question,
    }

    response = requests.post(
        _stream_endpoint(),
        json=payload,
        stream=True,
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={"Content-Type": "application/json"},
    )
    if response.status_code in (404, 405):
        return call_agent(question)
    response.raise_for_status()

    streamed_text = ""
    final: dict[str, Any] | None = None

    for line in response.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        event = json.loads(line[len("data: "):])

        if event.get("type") == "token":
            streamed_text += event.get("content", "")
            placeholder.markdown(streamed_text + " ▌")
        elif event.get("type") == "final":
            final = event.get("response")
        elif event.get("type") == "error":
            raise RuntimeError(event.get("detail", "Unknown streaming error"))

    if final is None:
        raise ValueError("Stream ended without a final response.")
    return final


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------
def render_answer_highlight(answer_text: str) -> None:
    """Render the agent's answer_text as the visual focal point of the reply."""
    safe = (answer_text or "_(empty answer)_").replace("\n", "<br/>")
    st.markdown(
        f"<div class='answer-card'>"
        f"<span class='answer-label'>Answer</span>{safe}"
        f"</div>",
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Hero header
# ---------------------------------------------------------------------------
st.markdown(
    """
    <div class="hero">
      <h1>📊 SpectraMedix Tableau Agent</h1>
      <p>Chat with your dashboard. The agent decides which filters to apply and pushes them to Tableau via MCP.</p>
    </div>
    """,
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Chat history
# ---------------------------------------------------------------------------
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        if msg["role"] == "assistant" and msg.get("answer_card"):
            render_answer_highlight(msg["content"])
        else:
            st.markdown(msg["content"])


# ---------------------------------------------------------------------------
# Chat input
# ---------------------------------------------------------------------------
prompt = st.chat_input("Ask a question, e.g. 'Filter region to West and year to 2025'")

if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        placeholder = st.empty()
        placeholder.markdown("_Thinking..._")

        try:
            result = call_agent_stream(prompt, placeholder)
        except requests.HTTPError as exc:
            placeholder.empty()
            err = f"Agent API error: {exc.response.status_code} - {exc.response.text[:300]}"
            st.error(err)
            st.session_state.messages.append({"role": "assistant", "content": err})
        except requests.RequestException as exc:
            placeholder.empty()
            err = f"Network error contacting agent: {exc}"
            st.error(err)
            st.session_state.messages.append({"role": "assistant", "content": err})
        except (ValueError, RuntimeError) as exc:
            placeholder.empty()
            err = f"Agent error: {exc}"
            st.error(err)
            st.session_state.messages.append({"role": "assistant", "content": err})
        else:
            answer_text = result.get("answer_text") or result.get("answer") or "_(empty answer)_"

            placeholder.empty()
            render_answer_highlight(answer_text)

            st.session_state.messages.append(
                {"role": "assistant", "content": answer_text, "answer_card": True}
            )
