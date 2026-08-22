# -*- coding: utf-8 -*-
"""Safe connector parsing, mapping and dependency contracts."""

from __future__ import annotations

import csv
import io
import json
import os
import re
import sqlite3
import urllib.parse
import urllib.request
from contextlib import closing
from pathlib import Path
from typing import Any

MAX_ROWS = 10_000
MAX_BYTES = 20 * 1024 * 1024
IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class ConnectorError(ValueError):
    pass


def parse_file(filename: str, content: bytes) -> list[dict[str, Any]]:
    if not content:
        raise ConnectorError("数据文件不能为空")
    if len(content) > MAX_BYTES:
        raise ConnectorError("数据文件不能超过20MB")
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        rows = list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))
    elif suffix == ".json":
        value = json.loads(content.decode("utf-8"))
        rows = value if isinstance(value, list) else value.get("records") if isinstance(value, dict) else None
    else:
        raise ConnectorError("仅支持 CSV 和 JSON；Excel 请使用 Data Core 导入中心")
    if not isinstance(rows, list) or not rows:
        raise ConnectorError("文件中没有可同步记录")
    if len(rows) > MAX_ROWS or any(not isinstance(row, dict) for row in rows):
        raise ConnectorError("记录格式无效或超过10000行")
    return rows


def fetch_https_json(url: str, secret_env: str | None = None, timeout: int = 15) -> list[dict[str, Any]]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ConnectorError("API连接器只允许不含内嵌凭据的HTTPS地址")
    headers = {"Accept": "application/json", "User-Agent": "Zhiyun-Integration-Hub/0.1"}
    if secret_env:
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,100}", secret_env):
            raise ConnectorError("密钥环境变量名称无效")
        secret = os.environ.get(secret_env)
        if not secret:
            raise ConnectorError(f"缺少依赖：环境变量 {secret_env}")
        headers["Authorization"] = f"Bearer {secret}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=max(1, min(timeout, 30))) as response:
        if urllib.parse.urlparse(response.geturl()).scheme != "https":
            raise ConnectorError("API重定向离开HTTPS，已拒绝")
        content = response.read(MAX_BYTES + 1)
    return parse_file("response.json", content)


def read_sqlite(path: str, table: str, limit: int = 1000) -> list[dict[str, Any]]:
    database = Path(path).expanduser().resolve()
    if not database.is_file() or not IDENTIFIER.fullmatch(table):
        raise ConnectorError("只读数据库路径或表名无效")
    limit = max(1, min(int(limit), MAX_ROWS))
    uri = f"file:{database.as_posix()}?mode=ro"
    with closing(sqlite3.connect(uri, uri=True, timeout=5)) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(f'SELECT * FROM "{table}" LIMIT ?', (limit,)).fetchall()
    return [dict(row) for row in rows]


def map_rows(rows: list[dict[str, Any]], mapping: dict[str, str]) -> list[dict[str, Any]]:
    if not rows or not mapping:
        raise ConnectorError("同步记录和字段映射不能为空")
    if len(rows) > MAX_ROWS:
        raise ConnectorError("单次同步不能超过10000行")
    targets = list(mapping.values())
    if len(targets) != len(set(targets)) or any(not IDENTIFIER.fullmatch(value) for value in targets):
        raise ConnectorError("目标字段必须唯一且使用安全标识符")
    return [{target: row.get(source) for source, target in mapping.items()} for row in rows]


def dependency_health(kind: str, config: dict[str, Any]) -> dict[str, Any]:
    try:
        if kind == "file":
            ok = bool(config.get("filename"))
            reason = "等待上传文件" if not ok else "文件连接器已配置"
        elif kind == "api":
            parsed = urllib.parse.urlparse(str(config.get("url", "")))
            ok = parsed.scheme == "https" and bool(parsed.hostname)
            reason = "需要有效HTTPS地址" if not ok else "API连接器已配置；运行同步时探测远端"
        elif kind == "sqlite":
            ok = Path(str(config.get("path", ""))).expanduser().is_file()
            reason = "只读数据库文件不存在" if not ok else "只读数据库可访问"
        else:
            raise ConnectorError("未知连接器类型")
    except OSError as exc:
        ok, reason = False, f"依赖不可用：{exc}"
    return {"status": "available" if ok else "degraded", "impact": "同步已阻止" if not ok else "无", "reason": reason}
