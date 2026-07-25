# Inspoter metrics agent

A small Dockerized agent that runs **on a monitored Linux host** (your VPS), reads
OS-level metrics from `/proc` and the root filesystem, and pushes them to an
Inspoter dashboard over HTTPS.

- Python 3.12, standard library only — no pip dependencies.
- One snapshot every 60 seconds by default; the dashboard keeps only the latest
  snapshot per server (no time-series history).
- Outbound HTTPS only — the agent opens no inbound port and needs no Docker
  socket.
- Non-root, read-only container with all Linux capabilities dropped.

The agent is published separately from the dashboard image:

```text
ghcr.io/biggora/inspoter-metrics-agent:<tag>
```

## What it collects

| Metric                            | Source                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------- |
| CPU usage percent                 | Delta between two `/host/proc/stat` samples, clamped to `0..100`                |
| Load average 1 / 5 / 15           | `/host/proc/loadavg`                                                            |
| Memory total / available          | `MemTotal` / `MemAvailable` from `/host/proc/meminfo`, converted to bytes       |
| Swap total / free                 | `SwapTotal` / `SwapFree` from `/host/proc/meminfo`, converted to bytes          |
| Root filesystem total / available | `os.statvfs()` on the probe directory; available uses `f_bavail`, not `f_bfree` |
| Uptime seconds                    | First field of `/host/proc/uptime`                                              |
| Hostname                          | `/host/proc/sys/kernel/hostname`, falling back to the container hostname        |
| IP addresses                      | The configured `SERVER_IPS` value — never guessed from Docker interfaces        |

Nothing else is read: no process list, no containers, no services, no network
counters.

## Requirements

- A Linux host with `/proc` (the agent is Linux-only).
- Docker Engine with the Compose plugin.
- Outbound HTTPS access from the host to your dashboard URL.
- A workspace API token from the dashboard: **Settings → API Tokens**. The same
  universal token authenticates both incoming webhooks and metrics ingestion.
  The raw secret is shown once at creation; rotation is available on the same
  page.

## Install on a VPS

Run everything below on the monitored host, as root.

### 1. Create the root-filesystem probe directory

```bash
install -d -m 0555 /var/lib/inspoter-metrics-agent/rootfs-probe
```

This empty directory is mounted into the container and is the target of
`os.statvfs()`. It exists so the agent can measure the host root filesystem
**without mounting `/` into the container**. It must stay empty.

> **The probe directory must live on the root filesystem.** `statvfs` reports
> the filesystem that actually holds the directory, but the payload always
> declares `"mount": "/"`. On a host where `/var` (or `/var/lib`) is a separate
> partition or dataset, the default path measures that partition and the
> dashboard shows the wrong disk capacity. Verify before starting the agent:
>
> ```bash
> findmnt -no SOURCE --target /var/lib/inspoter-metrics-agent/rootfs-probe
> findmnt -no SOURCE --target /
> ```
>
> If the two sources differ, put the probe directory somewhere on the root
> filesystem instead — for example `/opt/inspoter-metrics-agent/rootfs-probe` —
> and update the left-hand side of the probe volume in `compose.yml` to match.

### 2. Place `compose.yml` on the host

Copy [`compose.yml`](./compose.yml) from this repository into a working
directory, for example `/opt/inspoter-metrics-agent/compose.yml`.

### 3. Create the `.env` file next to it

```dotenv
AGENT_TAG=latest
METRICS_ENDPOINT=https://your-dashboard.example.com/api/server-metrics
METRICS_TOKEN=<workspace-api-token>
SERVER_IPS=203.0.113.20,2001:db8:1234::20
```

`AGENT_TAG` has **no default** in `compose.yml`. If it is unset, Compose
resolves the image to `ghcr.io/biggora/inspoter-metrics-agent:` and the pull
fails. Use `latest` or pin a released version tag.

### 4. Start the agent

```bash
docker compose up -d
docker compose logs -f
```

A healthy first run logs the startup line, then a push result:

```text
2026-07-25T09:15:00Z INFO metrics agent starting (version=0.1.0, interval=60s, ip_count=2)
2026-07-25T09:15:01Z INFO metrics push succeeded (2xx)
2026-07-25T09:15:01Z INFO server enrolled; switching to steady-state interval
```

The server then appears on the dashboard's **Servers** page with live metrics.

## Configuration

All configuration comes from environment variables. Values are validated at
startup; any invalid value logs `configuration error: ...` and exits with code 1
before any network request is made.

| Variable                 | Required | Default              | Description                                                                                     |
| ------------------------ | -------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `METRICS_ENDPOINT`       | yes      | —                    | Full ingest URL. Must start with `https://`; plain HTTP is rejected.                            |
| `METRICS_TOKEN`          | yes      | —                    | Workspace API token, sent as `Authorization: Bearer <token>`.                                   |
| `SERVER_IPS`             | yes      | —                    | Comma-separated IP literals of the host. See below.                                             |
| `METRICS_INTERVAL`       | no       | `60`                 | Seconds between snapshots.                                                                      |
| `METRICS_TIMEOUT`        | no       | `10`                 | Request timeout (seconds) once the dashboard has confirmed the server.                          |
| `METRICS_ENROLL_TIMEOUT` | no       | `60`                 | Request timeout (seconds) for the first push, which may trigger provider discovery server-side. |
| `HOST_PROC`              | no       | `/host/proc`         | Container path where host `/proc` files are mounted.                                            |
| `HOST_ROOT_PROBE`        | no       | `/host/rootfs-probe` | Container path of the root-filesystem probe directory.                                          |
| `RUN_ONCE`               | no       | `false`              | Collect and push a single snapshot, then exit. Accepts `1`, `true`, `yes`, `on`.                |

The bundled `compose.yml` passes `METRICS_ENDPOINT`, `METRICS_TOKEN`,
`SERVER_IPS` and `METRICS_INTERVAL`. To use any of the others, add them to the
service's `environment:` block.

### `SERVER_IPS`

The agent never infers host addresses from its Docker bridge interface — list
them explicitly. Each entry is parsed with the standard-library `ipaddress`
module.

Accepted:

- public (global) IPv4 — for example `203.0.113.20`
- private IPv4 — for example `10.0.0.5`
- global IPv6 — for example `2001:db8::1`
- unique-local IPv6 — for example `fd00::1`

Rejected at startup (the agent exits before sending anything):

- loopback (`127.0.0.1`, `::1`)
- unspecified (`0.0.0.0`, `::`)
- multicast (`224.0.0.1`, `ff02::1`)
- reserved (`240.0.0.1`)
- link-local (`169.254.1.1`, `fe80::1`)
- anything that is not a valid IP literal

Only **global IPv4** addresses take part in server matching. IPv6 and private
IPv4 values are stored as metadata and never link the agent to a provider
server.

## How the dashboard identifies the server

The token is not bound to a server. On every push the dashboard resolves
identity from the reported global IPv4 addresses, in this order:

1. **Existing address claim** — one server in the workspace already claims a
   reported IPv4 → the snapshot is stored for it, with no provider lookup.
2. **Provider inventory** — otherwise the dashboard queries the workspace's
   configured providers (45-second deadline). Exactly one match → the server is
   linked and the claim recorded.
3. **Agent-only server** — no provider match → a new agent-only server entry is
   created. A host that reports no global IPv4 at all (NAT-only) instead reuses
   the oldest existing agent-only entry with the same hostname.

More than one eligible match fails closed with `409 SERVER_MATCH_AMBIGUOUS`; no
data is written. The same happens with `409 ADDRESS_CONFLICT` if a reported
address is already claimed by a different server.

One token can serve many hosts, because identity comes from the reported
addresses rather than from the token. The consequences are worth reading before
you roll the agent out widely.

### Each host must report only its own addresses

Never copy an `.env` between hosts without editing `SERVER_IPS`. Two agents
reporting the same global IPv4 write into the same server entry, each snapshot
overwriting the previous one — the dashboard shows a single server flipping
between two machines. The same happens with a stale entry: if your provider
reassigns an address to a different VPS and `SERVER_IPS` still lists it, your
metrics land on that other server.

### NAT-only hosts are deduplicated by hostname

A host whose `SERVER_IPS` contains no global IPv4 cannot be matched by address,
so it reuses the oldest agent-only entry with the same hostname in the
workspace. Stock image hostnames collide easily — several machines named
`ubuntu`, `debian` or `localhost` all collapse into one entry. Give each host a
unique hostname, or list a global IPv4 in `SERVER_IPS`.

### Renumbering: add the new address before removing the old one

Identity is resolved per push, so a host that suddenly reports only an unknown
address is not recognised as the same machine. Migrate in three steps:

1. Add the new address next to the old one and restart the container:
   `SERVER_IPS=203.0.113.20,203.0.113.99`.
2. Wait out at least two push intervals (two minutes with the default
   `METRICS_INTERVAL`), then **reload** the Servers page twice, a minute apart,
   and watch the card's **Updated** age. Across the two reloads it must fall
   back down — `Updated 1m ago` then `Updated 15s ago` — instead of climbing.
3. Only then drop the old address and restart again.

The push in step 1 is matched through the still-claimed old address and records
the new one for the same server; step 3 retires the old claim.

Two details make step 2 work the way it is written:

- The Servers page does not poll metrics on its own — it renders what was
  fetched when the page loaded. Staring at an open tab proves nothing; reload
  it.
- **Updated** is relative (`Updated 12s ago`, `Updated 4m ago`), so it cannot be
  compared against the restart time directly — and a single reading proves
  nothing either. A healthy agent's age sits anywhere between zero and one push
  interval, so `Updated 1m ago` is perfectly normal with the default interval.
  What distinguishes an accepted stream is that the age **drops back** on a
  later reload, because each stored snapshot resets it. A refused snapshot
  updates neither the receive time nor the addresses, so its age only climbs —
  and once it passes 180 seconds the dashboard marks the server stale.

Do not use the agent log as the gate. It records only the status class, so
`metrics push succeeded (2xx)` is printed both when the snapshot was stored and
when the dashboard ignored it as out of order — and an ignored push does **not**
record the new address.

Replacing the address in a single step is only safe for a provider-managed
server, and only once the provider's inventory reports the new address — the
match then comes from provider discovery. An **agent-only** server handled that
way gets a **second, duplicate entry**, while the original entry keeps the old
claim and goes stale.

> This version of the dashboard has no way to delete or merge server entries, so
> a duplicate stays on the Servers page until someone removes it from the
> database directly. Do **not** try to reunite the two entries by listing the old
> and the new address together afterwards: the reported addresses then resolve to
> two different servers, and every push fails with
> `409 SERVER_MATCH_AMBIGUOUS` until you narrow the list again.

## Payload

`POST <METRICS_ENDPOINT>` with `Content-Type: application/json` and the bearer
token. Body (schema version 1):

```json
{
  "schemaVersion": 1,
  "agentVersion": "0.1.0",
  "capturedAt": "2026-07-25T09:15:00Z",
  "hostname": "web-prod-01",
  "ips": ["203.0.113.20", "2001:db8:1234::20"],
  "cpu": {
    "usagePercent": 23.4,
    "load1": 0.42,
    "load5": 0.31,
    "load15": 0.28
  },
  "memory": {
    "totalBytes": 16777216000,
    "availableBytes": 9126805504,
    "swapTotalBytes": 2147483648,
    "swapFreeBytes": 2147483648
  },
  "filesystem": {
    "mount": "/",
    "totalBytes": 171798691840,
    "availableBytes": 112742891520
  },
  "uptimeSeconds": 348120
}
```

Server-side limits: body at most 16 KiB, at most 16 unique IPs, `capturedAt`
must be valid UTC and no more than five minutes ahead of dashboard time. A
snapshot whose `capturedAt` is not newer than the stored one is ignored rather
than applied.

## Response codes

| Status | Code                             | Meaning                                                          |
| -----: | -------------------------------- | ---------------------------------------------------------------- |
|    200 | `SNAPSHOT_UPDATED`               | Snapshot stored                                                  |
|    200 | `SNAPSHOT_IGNORED_OUT_OF_ORDER`  | Duplicate or older sample; previous snapshot left untouched      |
|    201 | `AGENT_ENROLLED`                 | Server entry created or linked, first snapshot stored            |
|    400 | `INVALID_PAYLOAD`                | Malformed JSON or failed schema invariant                        |
|    401 | `UNAUTHORIZED`                   | Missing, invalid, revoked, or channel-scoped token               |
|    409 | `SERVER_MATCH_AMBIGUOUS`         | Reported IPs matched more than one server                        |
|    409 | `ADDRESS_CONFLICT`               | A reported address is claimed by a different server              |
|    413 | `PAYLOAD_TOO_LARGE`              | Body exceeds 16 KiB                                              |
|    422 | `UNSUPPORTED_SCHEMA_VERSION`     | `schemaVersion` is not 1                                         |
|    422 | `CLOCK_SKEW_FUTURE`              | `capturedAt` more than five minutes ahead of dashboard time      |
|    429 | `RATE_LIMITED`                   | Submission limit exceeded; `Retry-After` header is set           |
|    503 | `PROVIDER_INVENTORY_UNAVAILABLE` | Provider inventory could not be read safely; nothing was written |

Agent behaviour on failure:

- Every outcome is logged as a status class only (`2xx`, `4xx`, `5xx`) — the
  token and the payload never appear in logs.
- A failed push never terminates the agent. There is no retry queue: the next
  interval collects a **fresh** snapshot and sends that.
- The first push uses `METRICS_ENROLL_TIMEOUT`. After any 2xx response carrying
  a non-empty `localServerId`, the agent switches to `METRICS_TIMEOUT`.
- With `RUN_ONCE`, the process exits 0 on a 2xx response and 1 otherwise.

## Rate limits

The dashboard applies a fixed-window limit of 12 requests per 60 seconds per
`token + source IP` pair (configurable server-side through
`SERVER_METRICS_RATE_LIMIT` and `SERVER_METRICS_RATE_WINDOW_MS`), plus a
per-token ceiling 25× that value. One snapshot per minute per host stays well
inside both, leaving room for restarts and manual retries.

## Security model

- Runs as the non-root image user `agent`; the container filesystem is
  `read_only: true` with a small `noexec,nosuid,nodev` tmpfs for `/tmp`.
- `cap_drop: ALL` and `no-new-privileges:true`; not privileged, no host PID
  namespace, no Docker socket, no inbound port.
- Only five individual `/proc` files are mounted read-only
  (`stat`, `meminfo`, `loadavg`, `uptime`, `sys/kernel/hostname`) plus the empty
  probe directory. Neither all of `/proc` nor `/` is mounted.
- TLS certificate verification is on by default (`ssl.create_default_context()`),
  and a non-HTTPS endpoint is refused at startup.
- The bearer token and the payload body are never logged.

Treat `.env` as a secret file: `chmod 600` it and keep it out of version
control. If a token leaks, rotate it in **Settings → API Tokens** and update
every host that uses it.

## Local development

Run the tests from the repository root:

```bash
python -m unittest discover -s metrics-agent/tests -v
```

Tests use the `/proc` fixtures in [`tests/fixtures/proc`](./tests/fixtures/proc)
by overriding module globals (`collector.HOST_PROC`, `collector.HOST_ROOT_PROBE`,
`collector.CPU_SAMPLE_INTERVAL`) and mock `os.statvfs` and `urllib.request.urlopen`
— nothing touches a real host or network.

A single collect-and-push cycle against the fixtures:

```bash
cd metrics-agent
HOST_PROC=tests/fixtures/proc \
HOST_ROOT_PROBE=. \
METRICS_ENDPOINT=https://your-dashboard.example.com/api/server-metrics \
METRICS_TOKEN=<workspace-api-token> \
SERVER_IPS=203.0.113.20 \
RUN_ONCE=1 \
python -u collector.py
```

This sends a real request against the given endpoint. CPU, memory, load and
uptime come from the fixtures, while `HOST_ROOT_PROBE=.` measures whatever
filesystem the checkout sits on — the disk figures are development noise, not
host capacity. Requires a POSIX `os.statvfs`, so run it on Linux or macOS
(WSL on Windows).

CI ([`.github/workflows/metrics-agent-ci.yml`](../.github/workflows/metrics-agent-ci.yml))
runs the same test command, builds the image, asserts the image user is `agent`,
and validates `compose.yml`.

## Build the image

```bash
docker build -t inspoter-metrics-agent:dev ./metrics-agent
```

Releases are published by
[`.github/workflows/release-metrics-agent.yml`](../.github/workflows/release-metrics-agent.yml)
on every published GitHub release, for `linux/amd64` and `linux/arm64`, tagged
with the release tag plus `latest` for non-prereleases.

## Troubleshooting

| Symptom                                                           | Cause                                                                    | Fix                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `configuration error: Invalid IP literal` / `Rejected ... IP`     | A `SERVER_IPS` entry is malformed or in a rejected class                 | List only real host addresses; drop loopback/link-local/multicast entries                                                       |
| `configuration error: METRICS_ENDPOINT must be an HTTPS URL`      | Endpoint uses `http://`                                                  | Use HTTPS; the agent refuses plaintext                                                                                          |
| `configuration error: METRICS_TOKEN is required`                  | `.env` not loaded or variable empty                                      | Check `.env` sits next to `compose.yml` and the values are unquoted                                                             |
| Image pull fails with an empty tag                                | `AGENT_TAG` is unset                                                     | Add `AGENT_TAG=latest` to `.env`                                                                                                |
| Container fails to start on the probe mount                       | `/var/lib/inspoter-metrics-agent/rootfs-probe` does not exist            | Re-run the `install -d` command from step 1                                                                                     |
| `metrics push failed (4xx)` right after start                     | Token invalid, revoked, or rotated                                       | Issue or rotate a token in Settings → API Tokens and update `.env`                                                              |
| Repeated `4xx` with `SERVER_MATCH_AMBIGUOUS`                      | Reported IPs match several servers in the workspace                      | Report only the addresses that belong to this host; resolve duplicates in UI                                                    |
| `metrics push failed (5xx)` with `PROVIDER_INVENTORY_UNAVAILABLE` | The dashboard could not read provider inventory                          | Check the provider credential in the dashboard; the agent retries next cycle                                                    |
| `metrics push network error: ...`                                 | No outbound HTTPS, DNS failure, or TLS interception                      | Verify egress and that the dashboard certificate chain is trusted                                                               |
| Server shows `stale` in the dashboard                             | No snapshot received for more than 180 seconds                           | `docker compose logs` on the host; check the container is running                                                               |
| Metrics look like container values, not host values               | `/proc` mounts missing or overridden                                     | Use the bundled `compose.yml` mounts; do not change `HOST_PROC` in Docker                                                       |
| Disk total/available do not match `df /` on the host              | The probe directory sits on a separate partition, not `/`                | Compare `findmnt --target` for the probe path and `/`; move the probe directory onto the root filesystem                        |
| Two hosts share one server entry, metrics keep flipping           | Identical `SERVER_IPS`, or NAT-only hosts with equal hostname            | Give each host its own `SERVER_IPS`; give NAT-only hosts distinct hostnames                                                     |
| A duplicate server entry appeared after an IP change              | The new address was reported without the old one, so the host looked new | Keep using the new entry — the old one cannot be removed from the UI; next time add the new address before removing the old one |

## Related documentation

- Root [`README.md`](../README.md) — "Метрики серверов (VPS Metrics Agent)": the
  dashboard-side view, token management, and metric states.
- [`docs/architecture.md`](../docs/architecture.md) §7C — ingestion pipeline,
  identity resolution, and provider reconciliation.
- [`specs/metrics-script.md`](../specs/metrics-script.md) — the original
  implementation plan. Historical only: its per-server agent-token model was
  superseded by universal API tokens.
