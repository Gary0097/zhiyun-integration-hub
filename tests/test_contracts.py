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
        self.assertIn("正在检查依赖", ui)
        self.assertIn('status: "degraded"', ui)
        self.assertIn("确认写入统一数据中心", ui)
        self.assertIn("读取数据并自动匹配字段", ui)
        self.assertIn("功能说明书", ui)
        self.assertNotIn("字段映射 JSON", ui)
        self.assertNotIn("配置 JSON", ui)
        self.assertIn("reduce(function (all, row)", ui)
        self.assertIn("onValuesChange", ui)
        self.assertIn("readGeneration.current += 1", ui)
        self.assertIn("generation !== readGeneration.current", ui)
        self.assertIn("setMapping(next); setPending(null); setResult(null)", ui)
        self.assertNotIn("sqlite_limit", ui)
        self.assertIn("/zhiyun-data-core/imports/", ui)
        self.assertIn('Q.registerRoutes("zhiyun-integration-hub"', ui)
        self.assertNotIn('document.getElementById("app")', ui)


if __name__ == "__main__":
    unittest.main()
