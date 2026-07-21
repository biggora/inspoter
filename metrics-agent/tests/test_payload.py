import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import collector  # noqa: E402


class ValidatesIpLiteralsTests(unittest.TestCase):
    def test_validates_ip_literals(self):
        self.assertEqual(collector.validate_ip("203.0.113.20"), "203.0.113.20")
        self.assertEqual(collector.validate_ip("10.0.0.5"), "10.0.0.5")  # private IPv4
        self.assertEqual(collector.validate_ip("8.8.8.8"), "8.8.8.8")  # global IPv4
        self.assertEqual(collector.validate_ip("2001:db8::1"), "2001:db8::1")  # global IPv6
        self.assertEqual(collector.validate_ip("fd00::1"), "fd00::1")  # unique-local IPv6


class InvalidServerIpsFailBeforeHttpTests(unittest.TestCase):
    def test_invalid_server_ips_fails_before_http(self):
        invalid_cases = [
            "not-an-ip",
            "999.999.999.999",  # malformed
            "127.0.0.1",  # loopback
            "0.0.0.0",  # unspecified
            "::",  # unspecified
            "::1",  # loopback
            "169.254.1.1",  # link-local (IPv4)
            "fe80::1",  # link-local (IPv6)
            "224.0.0.1",  # multicast
            "ff02::1",  # multicast (IPv6)
            "240.0.0.1",  # reserved
        ]
        for ip in invalid_cases:
            with self.subTest(ip=ip):
                with self.assertRaises(collector.ConfigError):
                    collector.validate_ip(ip)

    def test_load_config_rejects_bad_ip_before_any_http_request(self):
        env = {
            "METRICS_ENDPOINT": "https://dashboard.example.com/api/server-metrics",
            "METRICS_TOKEN": "secret-token",
            "SERVER_IPS": "203.0.113.20, 127.0.0.1",
        }
        with mock.patch("collector.urllib.request.urlopen") as urlopen_mock:
            with self.assertRaises(collector.ConfigError):
                collector.load_config(env)
            urlopen_mock.assert_not_called()

    def test_load_config_accepts_valid_ips(self):
        env = {
            "METRICS_ENDPOINT": "https://dashboard.example.com/api/server-metrics",
            "METRICS_TOKEN": "secret-token",
            "SERVER_IPS": "203.0.113.20,2001:db8::1",
        }
        config = collector.load_config(env)
        self.assertEqual(config["server_ips"], ["203.0.113.20", "2001:db8::1"])

    def test_load_config_requires_https_endpoint(self):
        env = {
            "METRICS_ENDPOINT": "http://dashboard.example.com/api/server-metrics",
            "METRICS_TOKEN": "secret-token",
            "SERVER_IPS": "203.0.113.20",
        }
        with self.assertRaises(collector.ConfigError):
            collector.load_config(env)

    def test_load_config_requires_token(self):
        env = {
            "METRICS_ENDPOINT": "https://dashboard.example.com/api/server-metrics",
            "SERVER_IPS": "203.0.113.20",
        }
        with self.assertRaises(collector.ConfigError):
            collector.load_config(env)


if __name__ == "__main__":
    unittest.main()
