# Zhiyun Integration Hub

QwenPaw 2.1.x PawApp for controlled ERP/WMS and external-system ingestion.

Version 0.1.0 supports real CSV/JSON input, HTTPS JSON APIs and read-only SQLite
sources. It provides dependency health, safe field mapping, persistent Run and
Trace evidence, retry state, and a confirmation boundary before Data Core
commit. It never stores plaintext credentials or writes shared tables directly.

Install with `qwenpaw plugin install /path/to/zhiyun-integration-hub --force`
and open `/apps/zhiyun-integration-hub`.

Verify with `python scripts/verify_release.py`.
