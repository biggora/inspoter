import json
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


class PushMetricsBoundModeTests(unittest.TestCase):
    """Steady-state switch trigger (push_metrics): a 2xx response carrying a
    non-empty localServerId flips _bound_mode, which shortens the request
    timeout on subsequent pushes. Replaces the retired tokenState == "BOUND"
    trigger."""

    def setUp(self):
        self._orig_endpoint = collector.METRICS_ENDPOINT
        self._orig_token = collector.METRICS_TOKEN
        self._orig_bound_mode = collector._bound_mode
        collector.METRICS_ENDPOINT = "https://example.test/api/server-metrics"
        collector.METRICS_TOKEN = "test-token"
        collector._bound_mode = False

    def tearDown(self):
        collector.METRICS_ENDPOINT = self._orig_endpoint
        collector.METRICS_TOKEN = self._orig_token
        collector._bound_mode = self._orig_bound_mode

    @staticmethod
    def _mock_response(status, body):
        response = mock.MagicMock()
        response.status = status
        response.read.return_value = json.dumps(body).encode("utf-8")
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        return response

    def test_2xx_with_non_empty_local_server_id_switches_to_bound_mode(self):
        response = self._mock_response(200, {"localServerId": "abc"})
        with mock.patch("collector.urllib.request.urlopen", return_value=response):
            status = collector.push_metrics({"hostname": "x"}, timeout=5)

        self.assertEqual(status, 200)
        self.assertTrue(collector._bound_mode)

    def test_2xx_with_empty_body_stays_unbound(self):
        response = self._mock_response(200, {})
        with mock.patch("collector.urllib.request.urlopen", return_value=response):
            collector.push_metrics({"hostname": "x"}, timeout=5)

        self.assertFalse(collector._bound_mode)

    def test_2xx_with_empty_local_server_id_stays_unbound(self):
        response = self._mock_response(200, {"localServerId": ""})
        with mock.patch("collector.urllib.request.urlopen", return_value=response):
            collector.push_metrics({"hostname": "x"}, timeout=5)

        self.assertFalse(collector._bound_mode)


if __name__ == "__main__":
    unittest.main()
