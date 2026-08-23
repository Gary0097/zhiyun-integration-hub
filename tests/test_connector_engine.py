import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from backend.connector_engine import ConnectorError, dependency_health, map_rows, parse_file, read_sqlite


class ConnectorEngineTests(unittest.TestCase):
    def test_csv_and_json_are_real_inputs(self):
        self.assertEqual(parse_file("a.csv", b"order_no,qty\nA1,2\n")[0]["order_no"], "A1")
        self.assertEqual(parse_file("a.json", json.dumps([{"id": 1}]).encode())[0]["id"], 1)

    def test_common_chinese_csv_encodings_are_detected_automatically(self):
        csv_text = "订单号,客户名称\nA1,耀宇塑胶\n"
        self.assertEqual(parse_file("应收收款事实_线上_数据导出.csv", csv_text.encode("gb18030"))[0]["客户名称"], "耀宇塑胶")
        self.assertEqual(parse_file("utf16.csv", csv_text.encode("utf-16"))[0]["订单号"], "A1")

    def test_mapping_does_not_invent_missing_values(self):
        self.assertEqual(map_rows([{"external": "A"}], {"external": "order_no", "missing": "qty"}),
                         [{"order_no": "A", "qty": None}])

    def test_duplicate_or_unsafe_targets_are_rejected(self):
        with self.assertRaises(ConnectorError):
            map_rows([{"a": 1}], {"a": "drop table"})

    def test_sqlite_is_opened_read_only_and_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.sqlite"
            with closing(sqlite3.connect(path)) as db:
                db.execute("CREATE TABLE orders(id INTEGER, name TEXT)")
                db.execute("INSERT INTO orders VALUES(1, 'real')")
                db.commit()
            self.assertEqual(read_sqlite(str(path), "orders", 1), [{"id": 1, "name": "real"}])

    def test_missing_dependency_is_degraded(self):
        health = dependency_health("sqlite", {"path": "definitely-missing.sqlite"})
        self.assertEqual(health["status"], "degraded")
        self.assertEqual(health["impact"], "同步已阻止")


if __name__ == "__main__":
    unittest.main()
