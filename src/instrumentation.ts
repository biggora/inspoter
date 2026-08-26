// Next.js instrumentation hook — runs once when a new server instance boots
// (stable since Next.js 15, no config flag required). Code-review fix
// (Slice 1, minor #1, AC-AUTH-005): src/lib/config/env.ts's fail-fast
// validation must run at server boot, not lazily on first DB access, so a
// misconfigured deployment (missing OPERATOR_USERNAME / neither
// OPERATOR_PASSWORD_HASH nor OPERATOR_PASSWORD) crashes immediately with a
// clear message instead of surfacing as a generic login failure later.
//
// Guarded to the Node.js runtime only — env.ts's schema (DATABASE_URL,
// auth vars, etc.) is server-only config that only the Node.js server
// runtime needs.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/config/env");
    await import("@/lib/validation/error-map");

    const { startServiceScheduler } = await import("@/lib/services/scheduler");
    startServiceScheduler();

    const { startReminderScheduler } =
      await import("@/lib/services/reminder-scheduler");
    startReminderScheduler();

    const { startMailScheduler } =
      await import("@/lib/services/mail-scheduler");
    startMailScheduler();

    const { startWebhookScheduler } =
      await import("@/lib/services/webhook-scheduler");
    startWebhookScheduler();

    const { startWebhookRetentionScheduler } =
      await import("@/lib/services/webhook-retention-scheduler");
    startWebhookRetentionScheduler();

    const { startMetricsStalenessScheduler } =
      await import("@/lib/services/metrics-staleness-scheduler");
    startMetricsStalenessScheduler();

    const { startServerMetricsRetentionScheduler } =
      await import("@/lib/services/server-metrics-retention-scheduler");
    startServerMetricsRetentionScheduler();

    const { startLogRetentionScheduler } =
      await import("@/lib/services/log-retention-scheduler");
    startLogRetentionScheduler();

    const { startProviderSnapshotScheduler } =
      await import("@/lib/services/provider-snapshot-scheduler");
    startProviderSnapshotScheduler();

    const { startAgentScheduler } =
      await import("@/lib/services/agent-scheduler");
    startAgentScheduler();

    const { startAgentRunRetentionScheduler } =
      await import("@/lib/services/agent-run-retention-scheduler");
    startAgentRunRetentionScheduler();

    const { startNoteIndexScheduler } =
      await import("@/lib/services/note-index-scheduler");
    startNoteIndexScheduler();
  }
}
