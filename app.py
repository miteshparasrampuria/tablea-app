"""SpectraMedix Tableau Agent - Streamlit chat UI.

Architecture:
    User <-> Streamlit chat  <-->  LLM Agent API (/ask)   -> returns {answer_text, filters, ...}
                              <-->  Tableau MCP server     -> applies filters to live dashboard
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import requests
import streamlit as st


AGENT_API_URL_DEFAULT = "https://tableau-api-agent.onrender.com/ask"
MCP_SERVER_URL_DEFAULT = ""  # e.g. "http://localhost:8765/apply_filters"
REQUEST_TIMEOUT_SECONDS = 60


# ---------------------------------------------------------------------------
# Page config + global styles
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="SpectraMedix Tableau Agent",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
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
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        margin-right: 6px;
      }
      .pill-ok    { background: #d1fae5; color: #065f46; }
      .pill-warn  { background: #fef3c7; color: #92400e; }
      .pill-err   { background: #fee2e2; color: #991b1b; }
      .pill-info  { background: #e0f2fe; color: #075985; }
      .filter-chip {
        display: inline-block;
        background: #eef6ff;
        color: #0f2c4a;
        border: 1px solid #cfe2ff;
        padding: 6px 10px;
        margin: 3px 4px 0 0;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
      }
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
      .meta-row { margin-top: 4px; margin-bottom: 10px; }
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
        "messages": [],  # list[dict]: {role, content, meta?}
        "last_filters": [],
        "dashboard_context": {
            "dashboard_name": "Untitled Dashboard",
            "worksheets": [],
            "available_filters": [],
            "worksheet_contexts": [],
            "available_measures": [],
            "available_chart_types": ["none"],
        },
        "agent_url": AGENT_API_URL_DEFAULT,
        "mcp_url": MCP_SERVER_URL_DEFAULT,
        "auto_apply_filters": True,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


_init_state()


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------
def call_agent(question: str) -> dict[str, Any]:
    """POST to the LLM agent API and return the parsed JSON response."""
    payload = {
        "session_id": st.session_state.session_id,
        "question": question,
        "dashboard_context": st.session_state.dashboard_context,
    }
    response = requests.post(
        st.session_state.agent_url,
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
        headers={"Content-Type": "application/json"},
    )
    response.raise_for_status()
    return response.json()


def apply_filters_via_mcp(filters: list[dict[str, Any]]) -> tuple[bool, str]:
    """Forward the agent's filter JSON to the Tableau MCP server.

    Returns (ok, message). When no MCP URL is configured this is a no-op.
    """
    if not filters:
        return True, "No filters to apply."

    mcp_url = (st.session_state.mcp_url or "").strip()
    if not mcp_url:
        return False, "MCP server URL not configured - filters not pushed to Tableau."

    try:
        response = requests.post(
            mcp_url,
            json={
                "session_id": st.session_state.session_id,
                "dashboard_name": st.session_state.dashboard_context.get("dashboard_name"),
                "filters": filters,
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return True, f"MCP server applied {len(filters)} filter(s)."
    except requests.RequestException as exc:
        return False, f"MCP server error: {exc}"


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------
def render_filters(filters: list[dict[str, Any]]) -> None:
    if not filters:
        st.caption("No filters returned.")
        return

    chips_html = ""
    for f in filters:
        field = f.get("field", "?")
        operator = f.get("operator", "=")
        value = f.get("value", "")
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value)
        chips_html += f"<span class='filter-chip'><b>{field}</b> {operator} {value}</span>"
    st.markdown(chips_html, unsafe_allow_html=True)


def render_answer_highlight(answer_text: str) -> None:
    """Render the agent's answer_text as the visual focal point of the reply."""
    safe = (answer_text or "_(empty answer)_").replace("\n", "<br/>")
    st.markdown(
        f"<div class='answer-card'>"
        f"<span class='answer-label'>Answer</span>{safe}"
        f"</div>",
        unsafe_allow_html=True,
    )


def render_assistant_message(meta: dict[str, Any]) -> None:
    """Show only the MCP push status (if any). Filters/intent/confidence are hidden."""
    mcp_status = meta.get("mcp_status")
    if mcp_status:
        ok, message = mcp_status
        pill_class = "pill-ok" if ok else "pill-warn"
        st.markdown(
            f"<span class='pill {pill_class}'>{message}</span>",
            unsafe_allow_html=True,
        )


# ---------------------------------------------------------------------------
# Sidebar - configuration
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown("### Configuration")

    st.session_state.agent_url = st.text_input(
        "LLM Agent API URL",
        value=st.session_state.agent_url,
        help="POST {session_id, question, dashboard_context} -> JSON",
    )
    st.session_state.mcp_url = st.text_input(
        "Tableau MCP server URL",
        value=st.session_state.mcp_url,
        placeholder="http://localhost:8765/apply_filters",
        help="Optional. When set, filters from the agent are POSTed here to update the live dashboard.",
    )
    st.session_state.auto_apply_filters = st.toggle(
        "Auto-apply filters via MCP",
        value=st.session_state.auto_apply_filters,
    )

    st.divider()
    st.markdown("### Dashboard Context")
    st.caption(
        "Sent to the LLM agent so it knows which fields and values exist. "
        "Edit this JSON to match your Tableau dashboard."
    )

    context_text = st.text_area(
        "dashboard_context (JSON)",
        value=json.dumps(st.session_state.dashboard_context, indent=2),
        height=280,
        label_visibility="collapsed",
    )
    if st.button("Save context", use_container_width=True):
        try:
            st.session_state.dashboard_context = json.loads(context_text)
            st.success("Dashboard context updated.")
        except json.JSONDecodeError as exc:
            st.error(f"Invalid JSON: {exc}")

    st.divider()
    st.markdown("### Session")
    st.code(st.session_state.session_id, language="text")
    if st.button("Reset chat", use_container_width=True):
        st.session_state.messages = []
        st.session_state.last_filters = []
        st.session_state.session_id = f"session-{uuid.uuid4()}"
        st.rerun()


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

ctx = st.session_state.dashboard_context
top_cols = st.columns(4)
top_cols[0].metric("Dashboard", ctx.get("dashboard_name", "—"))
top_cols[1].metric("Worksheets", len(ctx.get("worksheets", [])))
top_cols[2].metric("Known filters", len(ctx.get("available_filters", [])))
top_cols[3].metric("Messages", len(st.session_state.messages))


# ---------------------------------------------------------------------------
# Chat history
# ---------------------------------------------------------------------------
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        if msg["role"] == "assistant" and msg.get("meta"):
            render_answer_highlight(msg["content"])
            render_assistant_message(msg["meta"])
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
            result = call_agent(prompt)
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
        except ValueError as exc:
            placeholder.empty()
            err = f"Agent returned non-JSON response: {exc}"
            st.error(err)
            st.session_state.messages.append({"role": "assistant", "content": err})
        else:
            answer_text = result.get("answer_text") or result.get("answer") or "_(empty answer)_"
            filters = result.get("filters") or []

            mcp_status = None
            if filters and st.session_state.auto_apply_filters:
                mcp_status = apply_filters_via_mcp(filters)

            meta = {
                "intent": result.get("intent", "unknown"),
                "confidence": result.get("confidence"),
                "filters": filters,
                "mcp_status": mcp_status,
                "raw": result,
            }

            placeholder.empty()
            render_answer_highlight(answer_text)
            render_assistant_message(meta)

            st.session_state.last_filters = filters
            st.session_state.messages.append(
                {"role": "assistant", "content": answer_text, "meta": meta}
            )
