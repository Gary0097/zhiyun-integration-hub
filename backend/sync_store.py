# -*- coding: utf-8 -*-
"""Persistent connector and sync evidence, without credential storage."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SAFE_CONFIG_KEYS = {"filename", "url", "secret_env", "path", "table", "entity"}
SENSITIVE = re.compile(r"token|secret|password|cookie|authorization|api[_-]?key", re.I)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: "[REDACTED]" if SENSITIVE.search(key) and key != "secret_env" else _redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


class SyncStore:
    def __init__(self, database: str | Path | None = None):
        default = Path(os.environ.get("QWENPAW_WORKSPACE", Path.cwd())) / "data" / "zhiyun-integration-hub.sqlite"
        self.database = Path(database or default)
        self.database.parent.mkdir(parents=True, exist_ok=True)
        self._migrate()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database, timeout=10)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _migrate(self) -> None:
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS integration_connectors(
                  connector_id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
                  config_json TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS integration_runs(
                  run_id TEXT PRIMARY KEY, connector_id TEXT NOT NULL, trace_id TEXT NOT NULL,
                  status TEXT NOT NULL, entity TEXT NOT NULL, input_count INTEGER NOT NULL,
                  output_count INTEGER NOT NULL DEFAULT 0, error TEXT, data_core_batch_id TEXT,
                  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            """)

    def create_connector(self, name: str, kind: str, config: dict[str, Any]) -> dict[str, Any]:
        if not name.strip() or kind not in {"file", "api", "sqlite"}:
            raise ValueError("连接器名称或类型无效")
        unknown = set(config) - SAFE_CONFIG_KEYS
        if unknown or any(SENSITIVE.search(key) and key != "secret_env" for key in config):
            raise ValueError("连接器不得保存凭据，只能保存 secret_env 引用")
        item = {"connector_id": uuid.uuid4().hex, "name": name.strip(), "kind": kind,
                "config": _redact(config), "created_at": _now()}
        with self._connect() as db:
            db.execute("INSERT INTO integration_connectors VALUES(?,?,?,?,?)", (
                item["connector_id"], item["name"], kind, json.dumps(item["config"], ensure_ascii=False), item["created_at"]))
        return item

    def start_run(self, connector_id: str, entity: str, input_count: int) -> dict[str, Any]:
        with self._connect() as db:
            if not db.execute("SELECT 1 FROM integration_connectors WHERE connector_id=?", (connector_id,)).fetchone():
                raise KeyError(connector_id)
            now, run_id, trace_id = _now(), uuid.uuid4().hex, uuid.uuid4().hex
            db.execute("INSERT INTO integration_runs VALUES(?,?,?,?,?,?,?,?,?,?,?)", (
                run_id, connector_id, trace_id, "previewed", entity, input_count, 0, None, None, now, now))
        return self.get_run(run_id)

    def complete_run(self, run_id: str, output_count: int, batch_id: str) -> dict[str, Any]:
        with self._connect() as db:
            changed = db.execute("UPDATE integration_runs SET status='completed', output_count=?, data_core_batch_id=?, updated_at=? WHERE run_id=? AND status='previewed'", (output_count, batch_id, _now(), run_id)).rowcount
        if not changed:
            raise ValueError("同步运行不存在或当前状态不可提交")
        return self.get_run(run_id)

    def fail_run(self, run_id: str, error: str) -> dict[str, Any]:
        safe_error = str(_redact({"error": error})["error"])[:2000]
        with self._connect() as db:
            db.execute("UPDATE integration_runs SET status='failed', error=?, updated_at=? WHERE run_id=?", (safe_error, _now(), run_id))
        return self.get_run(run_id)

    def retry_run(self, run_id: str) -> dict[str, Any]:
        with self._connect() as db:
            changed = db.execute("UPDATE integration_runs SET status='previewed', error=NULL, updated_at=? WHERE run_id=? AND status='failed'", (_now(), run_id)).rowcount
        if not changed:
            raise ValueError("只有失败运行可以重试")
        return self.get_run(run_id)

    def get_run(self, run_id: str) -> dict[str, Any]:
        with self._connect() as db:
            row = db.execute("SELECT * FROM integration_runs WHERE run_id=?", (run_id,)).fetchone()
        if not row:
            raise KeyError(run_id)
        return dict(row)
