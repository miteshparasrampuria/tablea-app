# SpectraMedix Tableau Agent (Pattern A)

Chat widget embedded in a Tableau dashboard. Users ask questions in natural language;
the LLM agent returns filter JSON; the MCP bridge queues filters; the Tableau extension
applies them to the live dashboard.

```
Tableau Dashboard
  └── Dashboard Extension (iframe)
        ├── reads filters via Extensions API  ──PUT──▶ MCP /sessions/{id}/context
        ├── polls MCP for pending filters     ◀─GET───  MCP /sessions/{id}/pending_filters
        ├── applies filters locally           applyFilterAsync()
        └── embeds Streamlit chat UI (iframe)
              ├── POST /ask ──▶ LLM Agent API
              └── POST /apply_filters ──▶ MCP bridge
```

## Components

| Folder / file | Purpose |
|---------------|---------|
| `app.py` | Streamlit chat UI |
| `mcp_server/app.py` | MCP bridge (session context + filter queue) |
| `extension/` | Tableau Dashboard Extension (widget shell) |

---

## 1. Deploy MCP bridge

```bash
cd mcp_server
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8765
```

**Render settings**

- Build: `pip install -r mcp_server/requirements.txt`
- Start: `cd mcp_server && uvicorn app:app --host 0.0.0.0 --port $PORT`

Note the public base URL: `https://tableau-mcpbridge.onrender.com`.

**Health check:** `GET /health`

---

## 2. Deploy Streamlit chat UI

```bash
pip install -r requirements.txt
streamlit run app.py --server.port=8501 --server.address=0.0.0.0
```

**Render / Streamlit Cloud**

- Start: `streamlit run app.py --server.port=$PORT --server.address=0.0.0.0 --server.headless=true`
- Env (optional override): `MCP_SERVER_URL=https://tableau-mcpbridge.onrender.com`

Note the public URL: `https://tableau-app.onrender.com`.

When opened from the Tableau extension, Streamlit receives query params:
`?session_id=...&mcp_url=...&embedded=1` and auto-loads dashboard context from MCP.

---

## 3. Host the Tableau extension

1. Edit `extension/config.js`:

```javascript
window.SPECTRAMEDIX_CONFIG = {
  STREAMLIT_URL: "https://tableau-app.onrender.com",
  MCP_BASE_URL: "https://tableau-mcpbridge.onrender.com",
  POLL_INTERVAL_MS: 2000,
};
```

2. Edit `extension/manifest.trex` — set `<url>` to your hosted `index.html` (must be **HTTPS**):

```xml
<url>https://your-extension-host.example.com/index.html</url>
```

3. Host `extension/` as static files (Render static site, S3, Azure Blob, GitHub Pages, etc.).

4. In **Tableau Desktop / Server / Cloud**:
   - Dashboard → **Extensions** → add extension
   - Choose **My Extensions** → select `manifest.trex` (or register on Server)
   - Resize the extension zone to fit the chat widget

---

## 4. Configure agent API

Default agent URL in Streamlit: `https://tableau-api-agent.onrender.com/ask`

Ensure your agent accepts:

```json
{
  "session_id": "session-...",
  "question": "Filter region to West",
  "dashboard_context": { ... }
}
```

And returns:

```json
{
  "answer_text": "Filtered region to West.",
  "filters": [
    { "field": "Region", "operator": "in", "value": ["West"] }
  ]
}
```

Filter `field` names must match Tableau field names exactly (the extension reads these from the dashboard).

---

## Message flow (per chat turn)

1. Extension reads dashboard filters → `PUT /sessions/{id}/context`
2. User types in Streamlit chat
3. Streamlit → Agent `/ask` with `dashboard_context`
4. Agent returns `{ answer_text, filters }`
5. Streamlit → `POST /apply_filters` on MCP
6. Extension polls `GET /sessions/{id}/pending_filters` every 2s
7. Extension calls `dashboard.applyFilterAsync(...)` on the live dashboard
8. Extension → `POST /sessions/{id}/pending_filters/ack`

---

## Local development

Terminal 1 — MCP:

```bash
cd mcp_server && uvicorn app:app --reload --port 8765
```

Terminal 2 — Streamlit:

```bash
streamlit run app.py
```

Terminal 3 — serve extension (HTTPS required for Tableau Server; Desktop allows localhost):

```bash
cd extension && python -m http.server 8080
```

Update `config.js` with `http://localhost:8501` and `http://localhost:8765`.
Use Tableau Desktop to load the extension from `http://localhost:8080/index.html`.

---

## MCP API reference

| Method | Path | Caller | Description |
|--------|------|--------|-------------|
| GET | `/health` | ops | Health check |
| PUT | `/sessions/{id}/context` | Extension | Register dashboard metadata |
| GET | `/sessions/{id}/context` | Streamlit | Read dashboard metadata |
| POST | `/apply_filters` | Streamlit | Queue filters for extension |
| GET | `/sessions/{id}/pending_filters` | Extension | Poll queued filters |
| POST | `/sessions/{id}/pending_filters/ack` | Extension | Clear queue after apply |

**POST /apply_filters**

```json
{
  "session_id": "session-...",
  "dashboard_name": "Sales Overview",
  "filters": [
    { "field": "Region", "operator": "in", "value": ["West"] }
  ]
}
```

---

## Production notes

- MCP session store is in-memory; use Redis/Postgres for multi-instance deployments.
- Add API key auth on MCP endpoints before going public.
- Tableau extension + Streamlit + MCP must all be reachable over HTTPS (except Desktop localhost dev).
- Supported filter operators in the extension: `in`, `=`, `>`, `>=`, `<`, `<=`.
