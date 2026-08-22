# -*- coding: utf-8 -*-
"""Integration Hub QwenPaw routes and Agent interface."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from qwenpaw.plugins.api import PluginApi

try:
    from .connector_engine import ConnectorError, dependency_health, fetch_https_json, map_rows, parse_file, read_sqlite
    from .sync_store import SyncStore
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from connector_engine import ConnectorError, dependency_health, fetch_https_json, map_rows, parse_file, read_sqlite
    from sync_store import SyncStore

PLUGIN_VERSION = "0.1.0"
router = APIRouter()


def _store() -> SyncStore:
    return SyncStore()


class ConnectorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: str
    config: dict[str, Any]


class PreviewRequest(BaseModel):
    connector_id: str
    entity: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    rows: list[dict[str, Any]] = Field(min_length=1, max_length=10000)
    mapping: dict[str, str]


class SourceReadRequest(BaseModel):
    kind: str
    config: dict[str, Any]


class CommitRequest(BaseModel):
    output_count: int = Field(ge=0, le=10000)
    data_core_batch_id: str = Field(min_length=1, max_length=200)
    confirmed: bool = False


@router.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "available", "version": PLUGIN_VERSION, "data_core_required": True,
            "connector_types": ["file", "api", "sqlite"], "writes_require_confirmation": True}


@router.post("/connectors")
async def create_connector(request: ConnectorCreate) -> dict[str, Any]:
    try:
        return _store().create_connector(request.name, request.kind, request.config)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/connectors/health")
async def connector_health(request: ConnectorCreate) -> dict[str, Any]:
    try:
        return dependency_health(request.kind, request.config)
    except ConnectorError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/files/parse")
async def upload(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        rows = parse_file(file.filename or "upload", await file.read(20 * 1024 * 1024 + 1))
        return {"rows": rows, "count": len(rows)}
    except (ConnectorError, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/sources/read")
async def read_source(request: SourceReadRequest) -> dict[str, Any]:
    try:
        if request.kind == "api":
            rows = fetch_https_json(str(request.config.get("url", "")), request.config.get("secret_env"))
        elif request.kind == "sqlite":
            rows = read_sqlite(str(request.config.get("path", "")), str(request.config.get("table", "")),
                               int(request.config.get("limit", 1000)))
        else:
            raise ConnectorError("文件连接器请通过上传接口读取")
        return {"rows": rows, "count": len(rows)}
    except (ConnectorError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/sync/preview")
async def preview(request: PreviewRequest) -> dict[str, Any]:
    try:
        rows = map_rows(request.rows, request.mapping)
        run = _store().start_run(request.connector_id, request.entity, len(request.rows))
        return {"run": run, "data_core_request": {"entity": request.entity, "rows": rows,
                "mapping": None, "source_name": f"integration:{request.connector_id}"}}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="连接器不存在") from exc
    except (ConnectorError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/sync/{run_id}/commit")
async def commit(run_id: str, request: CommitRequest) -> dict[str, Any]:
    if not request.confirmed:
        raise HTTPException(status_code=409, detail="向 Data Core 写入前必须由用户明确确认")
    try:
        return _store().complete_run(run_id, request.output_count, request.data_core_batch_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="同步运行不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/sync/{run_id}/retry")
async def retry(run_id: str) -> dict[str, Any]:
    try:
        return _store().retry_run(run_id)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def inspect_integration_mapping(rows: list[dict[str, Any]], mapping: dict[str, str]) -> dict[str, Any]:
    mapped = map_rows(rows, mapping)
    return {"count": len(mapped), "fields": list(mapping.values()), "preview": mapped[:20],
            "requires_user_confirmation": True, "next": "在 Integration Hub 审阅后提交到 Data Core"}


class IntegrationHubPlugin:
    def register(self, api: PluginApi) -> None:
        api.register_http_router(router, prefix="/zhiyun-integration-hub", tags=["zhiyun-integration-hub"])
        api.register_tool(tool_name="inspect_integration_mapping", tool_func=inspect_integration_mapping,
                          description="预览外部系统字段到 Data Core 字段的映射，不执行写入。",
                          icon="🔌", tool_type="internal")


plugin = IntegrationHubPlugin()
