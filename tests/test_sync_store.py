import tempfile
import unittest
from pathlib import Path

from backend.sync_store import SyncStore


class SyncStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = SyncStore(Path(self.temp.name) / "hub.sqlite")

    def tearDown(self):
        self.temp.cleanup()

    def test_connector_rejects_plaintext_secret(self):
        with self.assertRaises(ValueError):
            self.store.create_connector("ERP", "api", {"url": "https://erp.example/api", "token": "secret"})

    def test_run_preserves_trace_and_data_core_batch(self):
        connector = self.store.create_connector("WMS", "file", {"filename": "orders.csv"})
        run = self.store.start_run(connector["connector_id"], "orders", 2)
        self.assertEqual(run["status"], "previewed")
        self.assertTrue(run["trace_id"])
        completed = self.store.complete_run(run["run_id"], 2, "batch-real-1")
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["data_core_batch_id"], "batch-real-1")

    def test_failed_run_can_retry(self):
        connector = self.store.create_connector("ERP", "api", {"url": "https://erp.example/api", "secret_env": "ERP_TOKEN"})
        run = self.store.start_run(connector["connector_id"], "orders", 1)
        failed = self.store.fail_run(run["run_id"], "timeout")
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(self.store.retry_run(run["run_id"])["status"], "previewed")


if __name__ == "__main__":
    unittest.main()
