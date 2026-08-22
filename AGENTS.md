# Integration Hub Development Rules

- QwenPaw 2.1.x is the only runtime. This repository owns feature 29.
- Never develop on `main`, merge automatically, or force-push shared branches.
- For multi-repository work use the main-platform issue number and identical branch name.
- External systems are read-only by default. Writes require explicit confirmation.
- Secrets are environment-variable references, never stored connector values.
- Shared business data is committed only through the Data Core API.
- Preserve sync history, trace IDs, error reports, retry state and rollback evidence.
- Run `python scripts/verify_release.py` before delivery.
