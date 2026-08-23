# 智造云系统集成中心

QwenPaw 2.1.x PawApp for controlled ERP/WMS and external-system ingestion.

Version 0.2.0 provides a Chinese guided workflow for real CSV/JSON uploads,
HTTPS JSON APIs and read-only SQLite. Users no longer write connector or field
mapping JSON: the page renders source-specific fields and automatically matches
source headers to the Data Core schema before review.
sources. It provides dependency health, safe field mapping, persistent Run and
Trace evidence, retry state, and a confirmation boundary before Data Core
commit. It never stores plaintext credentials or writes shared tables directly.

Install with `qwenpaw plugin install /path/to/zhiyun-integration-hub --force`
and open `/apps/zhiyun-integration-hub`.

Verify with `python scripts/verify_release.py`.
