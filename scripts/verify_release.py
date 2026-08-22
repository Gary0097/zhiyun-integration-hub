from pathlib import Path
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
assert manifest["id"] == "zhiyun-integration-hub"
assert manifest["qwenpaw_version"] == {"min": "2.1.0", "max": "2.2.0"}
result = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"], cwd=root)
if result.returncode:
    raise SystemExit(result.returncode)
print("Integration Hub release gate passed.")
