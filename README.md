# SpectraMedix Tableau Agent (Streamlit)

A Streamlit chat UI that sits on top of a Tableau dashboard. Users chat with an
LLM agent; the agent returns an answer plus a `filters` JSON describing the
dashboard filters to apply. Those filters are forwarded to a Tableau **MCP
server** which actually mutates the live dashboard.

```
 User ──▶ Streamlit UI ──▶ LLM Agent API  (/ask)  ──▶ {answer_text, filters}
                       └─▶ Tableau MCP server (apply_filters) ──▶ Tableau dashboard
```

## Run locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

Then in the sidebar:

1. Confirm the **LLM Agent API URL** (defaults to your Render endpoint).
2. Paste your **Tableau MCP server URL** (e.g. `http://localhost:8765/apply_filters`).
   Leave blank to just see the filter JSON the agent proposes.
3. Edit **Dashboard Context** JSON so the agent knows your dashboard's
   worksheets, available filters, and allowed values.

## Agent API contract

`POST {agent_url}` with:

```json
{
  "session_id": "session-...",
  "question": "Filter region to West",
  "dashboard_context": { ... }
}
```

Expected response:

```json
{
  "intent": "filter_only",
  "answer_text": "Filtered region to West.",
  "filters": [
    { "field": "Region", "operator": "in", "value": ["West"] }
  ],
  "confidence": 0.92
}
```

## MCP server contract (what the Streamlit app POSTs)

```json
{
  "session_id": "session-...",
  "dashboard_name": "Sales Overview",
  "filters": [
    { "field": "Region", "operator": "in", "value": ["West"] }
  ]
}
```

Your MCP server is responsible for translating that into Tableau REST / JS
Extensions calls.
