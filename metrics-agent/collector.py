#!/usr/bin/env python3
"""Inspoter metrics agent.

Collects host metrics (CPU, memory, load, filesystem, uptime) from files
bind-mounted read-only into the container under HOST_PROC / HOST_ROOT_PROBE,
and pushes them to the dashboard's ingest endpoint over HTTPS.

Standard library only - no third-party dependencies.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import math
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

AGENT_VERSION = "0.1.0"
SCHEMA_VERSION = 1

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.Formatter.converter = time.gmtime
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)sZ %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("metrics-agent")

# ---------------------------------------------------------------------------
# Module-level configuration (populated by load_config()/main(); overridable
# directly by tests so collect_metrics()/push_metrics() keep the exact
# no-frills signatures described in the spec).
# ---------------------------------------------------------------------------

HOST_PROC = os.environ.get("HOST_PROC", "/host/proc")
HOST_ROOT_PROBE = os.environ.get("HOST_ROOT_PROBE", "/host/rootfs-probe")

METRICS_ENDPOINT: str | None = None
METRICS_TOKEN: str | None = None
SERVER_IPS: list[str] = []

# Seconds between the two /proc/stat samples used to compute CPU usage.
# Tests may lower this to keep the suite fast.
CPU_SAMPLE_INTERVAL = 1.0

# Flips to True once the server has confirmed enrollment by returning a
# non-empty localServerId, which shortens the request timeout.
_bound_mode = False


class ConfigError(Exception):
    """Raised for invalid or missing configuration."""


# ---------------------------------------------------------------------------
# Configuration / IP validation
# ---------------------------------------------------------------------------


def _env_int(env, name, default):
    value = env.get(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {value!r}") from exc


def _env_bool(env, name, default=False):
    value = env.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def validate_ip(ip_str: str) -> str:
    """Validate a single IP literal per the agent's enrollment policy.

    Rejects loopback, unspecified, multicast, reserved and link-local
    addresses (IPv4 link-local == 169.254.0.0/16, handled natively by
    ipaddress.is_link_local). Private IPv4, global IPv4, global IPv6 and
    unique-local IPv6 are all allowed.
    """
    ip_str = ip_str.strip()
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError as exc:
        raise ConfigError(f"Invalid IP literal: {ip_str!r}") from exc

    if ip.is_loopback:
        raise ConfigError(f"Rejected loopback IP: {ip_str}")
    if ip.is_unspecified:
        raise ConfigError(f"Rejected unspecified IP: {ip_str}")
    if ip.is_multicast:
        raise ConfigError(f"Rejected multicast IP: {ip_str}")
    if ip.is_reserved:
        raise ConfigError(f"Rejected reserved IP: {ip_str}")
    if ip.is_link_local:
        raise ConfigError(f"Rejected link-local IP: {ip_str}")

    return str(ip)


def load_config(env=None) -> dict:
    """Read and validate configuration from the environment.

    Raises ConfigError on any invalid value. IP validation happens here,
    before any network activity, so a bad SERVER_IPS entry fails fast.
    """
    env = os.environ if env is None else env

    endpoint = env.get("METRICS_ENDPOINT", "").strip()
    token = env.get("METRICS_TOKEN", "").strip()
    server_ips_raw = env.get("SERVER_IPS", "").strip()

    if not endpoint:
        raise ConfigError("METRICS_ENDPOINT is required")
    if not endpoint.lower().startswith("https://"):
        raise ConfigError("METRICS_ENDPOINT must be an HTTPS URL")
    if not token:
        raise ConfigError("METRICS_TOKEN is required")
    if not server_ips_raw:
        raise ConfigError("SERVER_IPS is required")

    raw_ips = [part.strip() for part in server_ips_raw.split(",") if part.strip()]
    if not raw_ips:
        raise ConfigError("SERVER_IPS must contain at least one IP")

    # Validate every IP before returning; a single bad entry aborts startup.
    validated_ips = [validate_ip(ip) for ip in raw_ips]

    return {
        "endpoint": endpoint,
        "token": token,
        "server_ips": validated_ips,
        "interval": _env_int(env, "METRICS_INTERVAL", 60),
        "timeout": _env_int(env, "METRICS_TIMEOUT", 10),
        "enroll_timeout": _env_int(env, "METRICS_ENROLL_TIMEOUT", 60),
        "host_proc": env.get("HOST_PROC", "/host/proc"),
        "host_root_probe": env.get("HOST_ROOT_PROBE", "/host/rootfs-probe"),
        "run_once": _env_bool(env, "RUN_ONCE", False),
    }


# ---------------------------------------------------------------------------
# Collection helpers
# ---------------------------------------------------------------------------


def _read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def _read_cpu_fields(stat_path: str) -> list[int]:
    for line in _read_text(stat_path).splitlines():
        if line.startswith("cpu "):
            fields = [int(value) for value in line.split()[1:]]
            while len(fields) < 8:
                fields.append(0)
            return fields[:8]
    raise ValueError(f"no aggregate 'cpu ' line found in {stat_path}")


def _cpu_busy_total(fields: list[int]) -> tuple[int, int]:
    user, nice, system, idle, iowait, irq, softirq, steal = fields
    busy = user + nice + system + irq + softirq + steal
    total = busy + idle + iowait
    return busy, total


def _read_cpu_percent(stat_path: str) -> float:
    first = _read_cpu_fields(stat_path)
    time.sleep(CPU_SAMPLE_INTERVAL)
    second = _read_cpu_fields(stat_path)

    busy1, total1 = _cpu_busy_total(first)
    busy2, total2 = _cpu_busy_total(second)

    total_delta = total2 - total1
    busy_delta = busy2 - busy1

    if total_delta <= 0:
        return 0.0

    percent = (busy_delta / total_delta) * 100.0
    if not math.isfinite(percent):
        return 0.0
    return round(max(0.0, min(100.0, percent)), 2)


def _read_meminfo(meminfo_path: str) -> dict:
    values: dict[str, int] = {}
    for line in _read_text(meminfo_path).splitlines():
        if ":" not in line:
            continue
        key, _, rest = line.partition(":")
        parts = rest.strip().split()
        if not parts:
            continue
        try:
            values[key.strip()] = int(parts[0])
        except ValueError:
            continue

    def kb_to_bytes(key: str) -> int:
        return values.get(key, 0) * 1024

    return {
        "totalBytes": kb_to_bytes("MemTotal"),
        "availableBytes": kb_to_bytes("MemAvailable"),
        "swapTotalBytes": kb_to_bytes("SwapTotal"),
        "swapFreeBytes": kb_to_bytes("SwapFree"),
    }


def _read_loadavg(loadavg_path: str) -> dict:
    parts = _read_text(loadavg_path).strip().split()
    return {
        "load1": float(parts[0]),
        "load5": float(parts[1]),
        "load15": float(parts[2]),
    }


def _read_uptime(uptime_path: str) -> int:
    first_field = _read_text(uptime_path).strip().split()[0]
    return int(float(first_field))


def _read_filesystem(root_probe_path: str) -> dict:
    stats = os.statvfs(root_probe_path)
    return {
        "mount": "/",
        "totalBytes": stats.f_blocks * stats.f_frsize,
        # Deliberately f_bavail (available to unprivileged users), not
        # f_bfree (raw free blocks, includes root-reserved space).
        "availableBytes": stats.f_bavail * stats.f_frsize,
    }


def _read_hostname(host_proc: str) -> str:
    hostname_path = os.path.join(host_proc, "sys", "kernel", "hostname")
    try:
        name = _read_text(hostname_path).strip()
        if name:
            return name
    except OSError:
        pass
    return socket.gethostname()


def _assert_all_finite(payload: dict) -> None:
    def walk(value):
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, float) and not math.isfinite(value):
            raise ValueError("non-finite metric value encountered")

    walk(payload)


def collect_metrics() -> dict:
    """Collect a fresh metrics payload from the mounted host paths."""
    stat_path = os.path.join(HOST_PROC, "stat")
    meminfo_path = os.path.join(HOST_PROC, "meminfo")
    loadavg_path = os.path.join(HOST_PROC, "loadavg")
    uptime_path = os.path.join(HOST_PROC, "uptime")

    cpu_percent = _read_cpu_percent(stat_path)
    load = _read_loadavg(loadavg_path)
    memory = _read_meminfo(meminfo_path)
    uptime_seconds = _read_uptime(uptime_path)
    filesystem = _read_filesystem(HOST_ROOT_PROBE)
    hostname = _read_hostname(HOST_PROC)

    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "agentVersion": AGENT_VERSION,
        "capturedAt": captured_at,
        "hostname": hostname,
        "ips": list(SERVER_IPS),
        "cpu": {
            "usagePercent": cpu_percent,
            "load1": load["load1"],
            "load5": load["load5"],
            "load15": load["load15"],
        },
        "memory": memory,
        "filesystem": filesystem,
        "uptimeSeconds": uptime_seconds,
    }

    _assert_all_finite(payload)
    return payload


# ---------------------------------------------------------------------------
# HTTP push
# ---------------------------------------------------------------------------


def _status_class(status: int) -> str:
    return f"{status // 100}xx"


def push_metrics(payload: dict, timeout: int):
    """POST the payload to METRICS_ENDPOINT.

    Returns the HTTP status code on a completed request (any class), or
    None if the request could not be completed at all (network error).
    Never logs the bearer token or the payload body.
    """
    global _bound_mode

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        METRICS_ENDPOINT,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {METRICS_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    context = ssl.create_default_context()

    status = None
    response_body = b""
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            status = response.status
            response_body = response.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        try:
            response_body = exc.read()
        except OSError:
            response_body = b""
        logger.warning("metrics push failed (%s)", _status_class(status))
        return status
    except urllib.error.URLError as exc:
        logger.error("metrics push network error: %s", type(exc.reason).__name__)
        return None
    except (OSError, TimeoutError) as exc:
        logger.error("metrics push network error: %s", type(exc).__name__)
        return None

    logger.info("metrics push succeeded (%s)", _status_class(status))

    if 200 <= status < 300 and response_body:
        try:
            parsed = json.loads(response_body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            parsed = None
        if isinstance(parsed, dict) and parsed.get("localServerId"):
            if not _bound_mode:
                logger.info("server enrolled; switching to steady-state interval")
            _bound_mode = True

    return status


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main() -> None:
    global HOST_PROC, HOST_ROOT_PROBE, METRICS_ENDPOINT, METRICS_TOKEN, SERVER_IPS

    try:
        config = load_config()
    except ConfigError as exc:
        logger.error("configuration error: %s", exc)
        sys.exit(1)

    METRICS_ENDPOINT = config["endpoint"]
    METRICS_TOKEN = config["token"]
    SERVER_IPS = config["server_ips"]
    HOST_PROC = config["host_proc"]
    HOST_ROOT_PROBE = config["host_root_probe"]

    interval = config["interval"]
    bound_timeout = config["timeout"]
    current_timeout = config["enroll_timeout"]
    run_once = config["run_once"]

    logger.info(
        "metrics agent starting (version=%s, interval=%ss, ip_count=%d)",
        AGENT_VERSION,
        interval,
        len(SERVER_IPS),
    )

    while True:
        payload = collect_metrics()
        status = push_metrics(payload, current_timeout)

        if _bound_mode:
            current_timeout = bound_timeout

        if run_once:
            sys.exit(0 if (status is not None and 200 <= status < 300) else 1)

        time.sleep(interval)


if __name__ == "__main__":
    main()
