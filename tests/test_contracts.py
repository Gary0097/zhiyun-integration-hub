import json
import re
import unittest
from pathlib import Path


class ContractTests(unittest.TestCase):
    def test_manifest_runtime_and_ui_contract(self):
        root = Path(__file__).resolve().parents[1]
        manifest = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
        source = (root / "backend" / "main.py").read_text(encoding="utf-8")
        ui = (root / "ui" / "index.js").read_text(encoding="utf-8")
        version = re.search(r'^PLUGIN_VERSION = "([^"]+)"$', source, re.MULTILINE).group(1)
        self.assertEqual(version, manifest["version"])
        self.assertIn('@router.post("/sync/preview")', source)
        self.assertIn('@router.post("/sources/read")', source)
        self.assertIn("requires_user_confirmation", source)
        self.assertIn("依赖健康检查失败", ui)
        self.assertIn("确认写入 Data Core", ui)
        self.assertIn("/api/zhiyun-data-core/imports/", ui)


if __name__ == "__main__":
    unittest.main()
