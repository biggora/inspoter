import math
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import collector  # noqa: E402

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "proc")


class FakeStatvfs:
    """Minimal stand-in for os.statvfs_result."""

    def __init__(self, f_blocks, f_frsize, f_bavail, f_bfree):
        self.f_blocks = f_blocks
        self.f_frsize = f_frsize
        self.f_bavail = f_bavail
        self.f_bfree = f_bfree


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self._orig_host_proc = collector.HOST_PROC
        self._orig_host_root_probe = collector.HOST_ROOT_PROBE
        self._orig_server_ips = list(collector.SERVER_IPS)
        self._orig_sample_interval = collector.CPU_SAMPLE_INTERVAL

        collector.HOST_PROC = FIXTURES_DIR
        collector.HOST_ROOT_PROBE = "/host/rootfs-probe"
        collector.SERVER_IPS = ["203.0.113.20", "2001:db8::1"]
        collector.CPU_SAMPLE_INTERVAL = 0

        # f_bavail and f_bfree are deliberately different so a regression
        # that swaps them is caught by test_filesystem_uses_f_bavail.
        self.statvfs_patch = mock.patch(
            "collector.os.statvfs",
            return_value=FakeStatvfs(
                f_blocks=41943040, f_frsize=4096, f_bavail=27524144, f_bfree=30000000
            ),
            create=True,
        )
        self.statvfs_mock = self.statvfs_patch.start()

    def tearDown(self):
        self.statvfs_patch.stop()
        collector.HOST_PROC = self._orig_host_proc
        collector.HOST_ROOT_PROBE = self._orig_host_root_probe
        collector.SERVER_IPS = self._orig_server_ips
        collector.CPU_SAMPLE_INTERVAL = self._orig_sample_interval

    def test_collector_complete_host_payload(self):
        payload = collector.collect_metrics()

        self.assertEqual(payload["schemaVersion"], 1)
        self.assertEqual(payload["agentVersion"], "0.1.0")
        self.assertTrue(payload["capturedAt"].endswith("Z"))
        self.assertEqual(payload["hostname"], "test-host-01")
        self.assertEqual(payload["ips"], ["203.0.113.20", "2001:db8::1"])

        cpu = payload["cpu"]
        for key in ("usagePercent", "load1", "load5", "load15"):
            self.assertIn(key, cpu)
            self.assertTrue(math.isfinite(cpu[key]))
        self.assertAlmostEqual(cpu["load1"], 0.42)
        self.assertAlmostEqual(cpu["load5"], 0.31)
        self.assertAlmostEqual(cpu["load15"], 0.28)

        memory = payload["memory"]
        self.assertEqual(memory["totalBytes"], 16384000 * 1024)
        self.assertEqual(memory["availableBytes"], 9000000 * 1024)
        self.assertEqual(memory["swapTotalBytes"], 2097152 * 1024)
        self.assertEqual(memory["swapFreeBytes"], 2097152 * 1024)
        for value in memory.values():
            self.assertTrue(math.isfinite(value))

        filesystem = payload["filesystem"]
        self.assertEqual(filesystem["mount"], "/")
        self.assertEqual(filesystem["totalBytes"], 41943040 * 4096)
        self.assertEqual(filesystem["availableBytes"], 27524144 * 4096)

        self.assertEqual(payload["uptimeSeconds"], 348120)
        self.assertIsInstance(payload["uptimeSeconds"], int)

    def test_collector_cpu_delta_bounds(self):
        payload = collector.collect_metrics()
        usage = payload["cpu"]["usagePercent"]
        self.assertGreaterEqual(usage, 0)
        self.assertLessEqual(usage, 100)
        self.assertTrue(math.isfinite(usage))

    def test_collector_favail(self):
        payload = collector.collect_metrics()
        available = payload["filesystem"]["availableBytes"]
        # f_bavail (27524144) * 4096, distinct from f_bfree (30000000) * 4096.
        self.assertEqual(available, 27524144 * 4096)
        self.assertNotEqual(available, 30000000 * 4096)

    def test_collector_host_paths_not_overlay(self):
        real_open = open
        seen_paths = []

        def spy_open(path, *args, **kwargs):
            seen_paths.append(str(path))
            return real_open(path, *args, **kwargs)

        with mock.patch("builtins.open", side_effect=spy_open):
            collector.collect_metrics()

        proc_paths = [
            path
            for path in seen_paths
            if any(name in path for name in ("stat", "meminfo", "loadavg", "uptime", "hostname"))
        ]
        self.assertTrue(proc_paths, "expected at least one proc file to be read")
        for path in proc_paths:
            self.assertTrue(
                path.startswith(collector.HOST_PROC),
                f"{path} does not start with configured HOST_PROC {collector.HOST_PROC}",
            )

        self.statvfs_mock.assert_called_with(collector.HOST_ROOT_PROBE)


if __name__ == "__main__":
    unittest.main()
