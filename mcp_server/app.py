"""Tableau MCP bridge server (Pattern A).

The Streamlit chat UI POSTs filter JSON here. The Tableau Dashboard Extension
polls pending filters and applies them via the Extensions API on the client.

Endpoints:
  PUT  /sessions/{session_id}/context   - extension registers dashboard metadata
  GET  /sessions/{session_id}/context   - Streamlit reads dashboard metadata
  POST /apply_filters                     - Streamlit queues filters for extension
  GET  /sessions/{session_id}/pending_filters
  POST /sessions/{session_id}/pending_filters/ack
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="SpectraMedix Tableau MCP Bridge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = Lock()
_sessions: dict[str, dict[str, Any]] = {}


class DashboardContextBody(BaseModel):
    dashboard_context: dict[str, Any]


class ApplyFiltersBody(BaseModel):
    session_id: str
    dashboard_name: str | None = None
    filters: list[dict[str, Any]] = Field(default_factory=list)


class AckBody(BaseModel):
    applied_count: int = 0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_session(session_id: str, create: bool = False) -> dict[str, Any]:
    with _lock:
        if session_id not in _sessions:
            if not create:
                raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
            _sessions[session_id] = {
                "dashboard_context": {},
                "pending_filters": [],
                "updated_at": _now_iso(),
            }
        return _sessions[session_id]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.put("/sessions/{session_id}/context")
def set_session_context(session_id: str, body: DashboardContextBody) -> dict[str, Any]:
    session = _get_session(session_id, create=True)
    with _lock:
        session["dashboard_context"] = body.dashboard_context
        session["updated_at"] = _now_iso()
    return {"ok": True, "session_id": session_id}


@app.get("/sessions/{session_id}/context")
def get_session_context(session_id: str) -> dict[str, Any]:
    session = _get_session(session_id)
    return {
        "session_id": session_id,
        "dashboard_context": session.get("dashboard_context") or {},
        "updated_at": session.get("updated_at"),
    }


@app.post("/apply_filters")
def apply_filters(body: ApplyFiltersBody) -> dict[str, Any]:
    if not body.filters:
        return {"ok": True, "queued": 0, "message": "No filters to apply."}

    session = _get_session(body.session_id, create=True)
    with _lock:
        session["pending_filters"] = body.filters
        session["dashboard_name"] = body.dashboard_name
        session["updated_at"] = _now_iso()

    return {
        "ok": True,
        "queued": len(body.filters),
        "message": f"Queued {len(body.filters)} filter(s) for Tableau extension.",
    }


@app.get("/sessions/{session_id}/pending_filters")
def get_pending_filters(session_id: str) -> dict[str, Any]:
    session = _get_session(session_id)
    return {
        "session_id": session_id,
        "dashboard_name": session.get("dashboard_name"),
        "filters": session.get("pending_filters") or [],
    }


@app.post("/sessions/{session_id}/pending_filters/ack")
def ack_pending_filters(session_id: str, body: AckBody) -> dict[str, Any]:
    session = _get_session(session_id)
    with _lock:
        session["pending_filters"] = []
        session["last_applied_count"] = body.applied_count
        session["updated_at"] = _now_iso()
    return {"ok": True, "cleared": True}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8765"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
