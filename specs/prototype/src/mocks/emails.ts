export interface Email {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  bodyHtml: string;
  receivedAt: string;
  isRead: boolean;
}

export const mockEmails: Email[] = [
  {
    id: "mail-01",
    from: "alerts@monitoring.inspot.app",
    fromName: "Inspot Monitoring",
    subject: "[CRITICAL] web-prod-01 CPU usage exceeded 95% threshold",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #dc2626;">🚨 Critical Alert — CPU Threshold Exceeded</h3>
      <p><strong>Server:</strong> web-prod-01 (49.12.34.56)</p>
      <p><strong>Metric:</strong> CPU Usage</p>
      <p><strong>Current Value:</strong> 97.3%</p>
      <p><strong>Threshold:</strong> 95%</p>
      <p><strong>Duration:</strong> 12 minutes</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5;" />
      <p>The CPU usage on <code>web-prod-01</code> has been above the critical threshold for over 10 minutes. This may indicate a runaway process or sudden traffic spike.</p>
      <p><strong>Recommended actions:</strong></p>
      <ul>
        <li>SSH into the server and run <code>htop</code> to identify the process</li>
        <li>Check Nginx access logs for unusual patterns</li>
        <li>Consider scaling up if load is legitimate</li>
      </ul>
      <p style="color: #888; font-size: 0.85em;">This is an automated alert from Inspot Monitoring. Reply to this email to acknowledge.</p>
    </div>`,
    receivedAt: "2026-07-12T09:34:00Z",
    isRead: false,
  },
  {
    id: "mail-02",
    from: "noreply@hetzner.com",
    fromName: "Hetzner Cloud",
    subject: "Invoice #INV-2026-07 for July 2026 is now available",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>Your Hetzner Invoice is Ready</h3>
      <p>Dear customer,</p>
      <p>Your invoice <strong>#INV-2026-07</strong> for the billing period <strong>July 1–31, 2026</strong> is now available in your Hetzner Cloud Console.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Total amount:</strong></td><td>€ 247.53</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Due date:</strong></td><td>August 7, 2026</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Payment method:</strong></td><td>Visa •••• 4242</td></tr>
      </table>
      <p>The invoice will be charged automatically on the due date.</p>
      <p style="color: #888; font-size: 0.85em;">Hetzner Cloud — Invoice Department</p>
    </div>`,
    receivedAt: "2026-07-12T08:15:00Z",
    isRead: true,
  },
  {
    id: "mail-03",
    from: "security@cloudflare.com",
    fromName: "Cloudflare Security",
    subject: "DDoS attack mitigated for inspot.app — 2.4M requests blocked",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>🛡 DDoS Attack Mitigated</h3>
      <p>A Layer 7 DDoS attack targeting <strong>inspot.app</strong> was automatically detected and mitigated by Cloudflare.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Attack start:</strong></td><td>July 12, 2026 06:42 UTC</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Attack end:</strong></td><td>July 12, 2026 07:18 UTC</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Requests blocked:</strong></td><td>2,412,883</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Peak RPS:</strong></td><td>84,200 req/s</td></tr>
      </table>
      <p>No origin server was impacted. All traffic was filtered at the edge.</p>
      <p><a href="#" style="color: #f48220;">View detailed attack report →</a></p>
    </div>`,
    receivedAt: "2026-07-12T07:45:00Z",
    isRead: false,
  },
  {
    id: "mail-04",
    from: "support@github.com",
    fromName: "GitHub",
    subject:
      "[inspot/dashboard] Secret scanning alert — AWS key detected in commit a3f8c21",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #dc2626;">⚠ Secret Scanning Alert</h3>
      <p>GitHub Secret Scanning detected an <strong>AWS Access Key</strong> in repository <strong>inspot/dashboard</strong>.</p>
      <p><strong>Commit:</strong> a3f8c21 — "Add deployment config"</p>
      <p><strong>Author:</strong> dev-team</p>
      <p><strong>Detected at:</strong> July 12, 2026 04:33 UTC</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5;" />
      <p>The secret has been <strong>automatically revoked</strong> and a new key has been generated. Please rotate the key in your deployment pipeline immediately.</p>
      <p style="color: #888; font-size: 0.85em;">GitHub Security Team</p>
    </div>`,
    receivedAt: "2026-07-12T05:02:00Z",
    isRead: true,
  },
  {
    id: "mail-05",
    from: "domains@godaddy.com",
    fromName: "GoDaddy Domains",
    subject: "Reminder: brand-site.com expires in 45 days — renew now",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>Domain Expiration Reminder</h3>
      <p>Your domain <strong>brand-site.com</strong> will expire in <strong>45 days</strong> on <strong>September 25, 2026</strong>.</p>
      <p>Auto-renewal is <strong>enabled</strong>. No action is required — the domain will be renewed automatically on the expiration date using your saved payment method.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Domain:</strong></td><td>brand-site.com</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Expires:</strong></td><td>September 25, 2026</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Renewal price:</strong></td><td>$19.99/year</td></tr>
      </table>
      <p style="color: #888; font-size: 0.85em;">GoDaddy Domain Services</p>
    </div>`,
    receivedAt: "2026-07-11T18:30:00Z",
    isRead: true,
  },
  {
    id: "mail-06",
    from: "info@certify.letsencrypt.org",
    fromName: "Let's Encrypt",
    subject: "Certificate renewal completed for 5 domains",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>✅ SSL Certificate Renewal Successful</h3>
      <p>Certificates for the following domains were successfully renewed and deployed:</p>
      <ul>
        <li><strong>inspot.app</strong> — valid until October 10, 2026</li>
        <li><strong>inspot.io</strong> — valid until October 10, 2026</li>
        <li><strong>api-gateway.net</strong> — valid until October 10, 2026</li>
        <li><strong>monitoring-tool.com</strong> — valid until October 10, 2026</li>
        <li><strong>cdn-delivery.net</strong> — valid until October 10, 2026</li>
      </ul>
      <p>All renewals completed without errors. No manual intervention needed.</p>
    </div>`,
    receivedAt: "2026-07-11T14:22:00Z",
    isRead: true,
  },
  {
    id: "mail-07",
    from: "alerts@monitoring.inspot.app",
    fromName: "Inspot Monitoring",
    subject: "[RESOLVED] web-prod-01 CPU usage returned to normal (23%)",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #16a34a;">✅ Alert Resolved — CPU Usage Normalized</h3>
      <p>The previously reported high CPU usage on <strong>web-prod-01</strong> has returned to normal levels.</p>
      <p><strong>Current Value:</strong> 23.4%</p>
      <p><strong>Resolution time:</strong> 12:05 UTC</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5;" />
      <p><strong>Root cause:</strong> A background image processing job spawned too many worker processes. The job has been rate-limited.</p>
      <p style="color: #888; font-size: 0.85em;">Inspot Monitoring — Alert resolved automatically.</p>
    </div>`,
    receivedAt: "2026-07-11T12:15:00Z",
    isRead: true,
  },
  {
    id: "mail-08",
    from: "noreply@hetzner.com",
    fromName: "Hetzner Cloud",
    subject: "Scheduled maintenance — Nuremberg DC July 15, 02:00–04:00 UTC",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>🔧 Scheduled Maintenance Notice</h3>
      <p>We will be performing scheduled maintenance on our <strong>Nuremberg data center</strong>.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Date:</strong></td><td>July 15, 2026</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Window:</strong></td><td>02:00–04:00 UTC</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Expected impact:</strong></td><td>None (redundant power)</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Affected servers:</strong></td><td>web-prod-01, db-primary, cache-node</td></tr>
      </table>
      <p>We do not anticipate any downtime, as redundant power feeds are in place. However, we recommend verifying backups before the window.</p>
      <p style="color: #888; font-size: 0.85em;">Hetzner Cloud Operations</p>
    </div>`,
    receivedAt: "2026-07-11T10:00:00Z",
    isRead: true,
  },
  {
    id: "mail-09",
    from: "support@cloudflare.com",
    fromName: "Cloudflare Support",
    subject:
      "Weekly traffic summary for inspot.app — 14.8M requests, 99.97% cached",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>📊 Weekly Traffic Report — inspot.app</h3>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Total requests:</strong></td><td>14,832,400</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Bandwidth saved:</strong></td><td>842 GB (87%)</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Cache rate:</strong></td><td>99.97%</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Threats blocked:</strong></td><td>24,512</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Unique visitors:</strong></td><td>386,200</td></tr>
      </table>
      <p>Your site is performing well with near-perfect cache hit rate. No configuration changes recommended.</p>
    </div>`,
    receivedAt: "2026-07-11T08:00:00Z",
    isRead: true,
  },
  {
    id: "mail-10",
    from: "info@docker.com",
    fromName: "Docker Hub",
    subject:
      "Image scan results: inspot/api — 0 critical, 2 medium vulnerabilities",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>🔍 Docker Image Vulnerability Scan</h3>
      <p>Scan completed for <strong>inspot/api:latest</strong> (SHA: def89ab...)</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Critical:</strong></td><td style="color: #16a34a;">0</td></tr>
        <tr><td style="padding: 6px 0;"><strong>High:</strong></td><td style="color: #16a34a;">0</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Medium:</strong></td><td style="color: #ca8a04;">2</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Low:</strong></td><td>4</td></tr>
      </table>
      <p><strong>Medium vulnerabilities:</strong> CVE-2026-28391 (libssl), CVE-2026-28400 (libcrypto). Patches available in base image update.</p>
      <p style="color: #888; font-size: 0.85em;">Docker Security Scanning</p>
    </div>`,
    receivedAt: "2026-07-10T22:45:00Z",
    isRead: false,
  },
  {
    id: "mail-11",
    from: "billing@hetzner.com",
    fromName: "Hetzner Billing",
    subject: "Payment confirmation — €247.53 charged to Visa •••• 4242",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>Payment Confirmed</h3>
      <p>Your payment of <strong>€247.53</strong> for invoice <strong>#INV-2026-06</strong> has been processed successfully.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Amount:</strong></td><td>€247.53</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Transaction ID:</strong></td><td>HTZ-TXN-9283746</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Date:</strong></td><td>July 10, 2026</td></tr>
      </table>
      <p style="color: #888; font-size: 0.85em;">Hetzner Billing Department</p>
    </div>`,
    receivedAt: "2026-07-10T16:20:00Z",
    isRead: true,
  },
  {
    id: "mail-12",
    from: "noreply@google.com",
    fromName: "Google Search Console",
    subject: "New indexing issues detected on inspot.app — 3 pages excluded",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>⚠ Index Coverage Issues</h3>
      <p>Google detected <strong>3 pages</strong> on <strong>inspot.app</strong> that could not be indexed.</p>
      <p><strong>Issues found:</strong></p>
      <ul>
        <li><code>/admin/login</code> — Blocked by robots.txt</li>
        <li><code>/api/internal/status</code> — Noindex tag detected</li>
        <li><code>/docs/v1/deprecated</code> — Soft 404</li>
      </ul>
      <p>Review these pages in Search Console to determine if action is needed.</p>
    </div>`,
    receivedAt: "2026-07-10T11:30:00Z",
    isRead: false,
  },
  {
    id: "mail-13",
    from: "team@linear.app",
    fromName: "Linear",
    subject: "Sprint review: 19 tasks completed this week — 94% velocity",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>📈 Sprint #14 Review</h3>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Tasks completed:</strong></td><td style="color: #16a34a;">19 / 20</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Velocity:</strong></td><td>94%</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Bugs fixed:</strong></td><td>7</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Cycle time avg:</strong></td><td>1.8 days</td></tr>
      </table>
      <p>Great sprint! The only carry-over is the DNS bulk-edit feature which needs backend API changes first.</p>
    </div>`,
    receivedAt: "2026-07-09T20:00:00Z",
    isRead: true,
  },
  {
    id: "mail-14",
    from: "alerts@monitoring.inspot.app",
    fromName: "Inspot Monitoring",
    subject: "[WARNING] db-replica replication lag — 45 seconds behind primary",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #ca8a04;">⚠ Warning — Replication Lag Detected</h3>
      <p><strong>Server:</strong> db-replica (78.46.12.56)</p>
      <p><strong>Replication lag:</strong> 45 seconds (threshold: 30s)</p>
      <p><strong>Duration:</strong> 8 minutes</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5;" />
      <p>Replication lag has exceeded the warning threshold. This may impact read consistency for applications using the replica.</p>
      <p><strong>Check:</strong> <code>SHOW SLAVE STATUS</code> on db-replica for details.</p>
    </div>`,
    receivedAt: "2026-07-09T15:40:00Z",
    isRead: true,
  },
  {
    id: "mail-15",
    from: "noreply@statuspage.io",
    fromName: "Statuspage",
    subject: "Incident resolved: API gateway latency spike (32 min downtime)",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>Incident Report — API Gateway Latency</h3>
      <p><strong>Incident:</strong> Elevated latency on api-gateway.net</p>
      <p><strong>Duration:</strong> July 9, 14:05–14:37 UTC (32 minutes)</p>
      <p><strong>Impact:</strong> P95 latency increased from 120ms to 3.4s</p>
      <p><strong>Root cause:</strong> Memory pressure on cache-node caused connection pool exhaustion. Cache node was restarted and connection limits were adjusted.</p>
      <p><strong>Preventive action:</strong> Added memory-based auto-scaling trigger for cache tier.</p>
    </div>`,
    receivedAt: "2026-07-09T15:00:00Z",
    isRead: true,
  },
  {
    id: "mail-16",
    from: "support@cloudflare.com",
    fromName: "Cloudflare",
    subject: "WAF rule update — new managed ruleset deployed for inspot.app",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>🛡 WAF Ruleset Updated</h3>
      <p>A new managed WAF ruleset has been deployed for <strong>inspot.app</strong>.</p>
      <p><strong>New rules:</strong> SQLi detection v3 (improved), XSS detection v4, File inclusion attack v2</p>
      <p><strong>Mode:</strong> Block</p>
      <p>All rules are active and set to block mode. No false positives detected in the past 24 hours.</p>
    </div>`,
    receivedAt: "2026-07-09T09:00:00Z",
    isRead: true,
  },
  {
    id: "mail-17",
    from: "no-reply@aws.amazon.com",
    fromName: "AWS Notifications",
    subject: "Root account — MFA device added from IP 185.220.x.x (Germany)",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>🔐 Security Notification — MFA Device Added</h3>
      <p>A new MFA device was added to the AWS root account.</p>
      <p><strong>IP address:</strong> 185.220.101.34 (Hetzner, Germany)</p>
      <p><strong>Time:</strong> July 9, 2026 08:15 UTC</p>
      <p><strong>Device type:</strong> Virtual MFA (Authenticator app)</p>
      <p>If this was you, no action is required. If you did not authorize this, <strong>secure your account immediately</strong>.</p>
    </div>`,
    receivedAt: "2026-07-09T08:20:00Z",
    isRead: true,
  },
  {
    id: "mail-18",
    from: "info@certify.letsencrypt.org",
    fromName: "Let's Encrypt",
    subject:
      "Certificate expiration warning: cdn-delivery.net expires in 7 days",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #ca8a04;">⚠ Certificate Expiration Warning</h3>
      <p>The SSL/TLS certificate for <strong>cdn-delivery.net</strong> will expire in <strong>7 days</strong>.</p>
      <p>Auto-renewal has been triggered but has <strong>failed 3 times</strong>. Please check your ACME challenge configuration.</p>
      <p><strong>Error:</strong> DNS-01 challenge timed out for _acme-challenge.cdn-delivery.net</p>
      <p style="color: #888; font-size: 0.85em;">Let's Encrypt — Automated Certificate Management</p>
    </div>`,
    receivedAt: "2026-07-08T19:30:00Z",
    isRead: false,
  },
  {
    id: "mail-19",
    from: "noreply@github.com",
    fromName: "GitHub",
    subject:
      "Dependabot alert: 4 vulnerable dependencies found in inspot/dashboard",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>⚠ Dependabot Security Alerts</h3>
      <p>Dependabot found <strong>4 vulnerable dependencies</strong> in <strong>inspot/dashboard</strong>.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>axios</strong> 1.7.2</td><td style="color: #ca8a04;">Medium — SSRF</td></tr>
        <tr><td style="padding: 6px 0;"><strong>express</strong> 4.19.0</td><td style="color: #dc2626;">High — Open Redirect</td></tr>
        <tr><td style="padding: 6px 0;"><strong>jsonwebtoken</strong> 9.0.1</td><td style="color: #dc2626;">High — Algorithm Confusion</td></tr>
        <tr><td style="padding: 6px 0;"><strong>follow-redirects</strong> 1.15.3</td><td style="color: #ca8a04;">Medium — SSRF</td></tr>
      </table>
      <p>Dependabot will open automated PRs with the fixes.</p>
    </div>`,
    receivedAt: "2026-07-08T14:00:00Z",
    isRead: false,
  },
  {
    id: "mail-20",
    from: "alerts@monitoring.inspot.app",
    fromName: "Inspot Monitoring",
    subject: "[RESOLVED] db-replica replication lag caught up — 0s behind",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #16a34a;">✅ Replication Lag Resolved</h3>
      <p>Replication on <strong>db-replica</strong> has caught up. Current lag: <strong>0 seconds</strong>.</p>
      <p>The issue was caused by a large batch DELETE operation on the primary. The operation completed and the replica has re-synchronized.</p>
    </div>`,
    receivedAt: "2026-07-08T10:15:00Z",
    isRead: true,
  },
  {
    id: "mail-21",
    from: "noreply@google.com",
    fromName: "Google Analytics",
    subject: "Monthly report: inspot.app — 1.2M visitors, +23% MoM",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>📊 Monthly Analytics — June 2026</h3>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Users:</strong></td><td>1,238,400 (+23% MoM)</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Sessions:</strong></td><td>1,892,100</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Bounce rate:</strong></td><td>34.2% (-12% MoM)</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Avg session:</strong></td><td>4m 12s</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Top country:</strong></td><td>Germany (42%)</td></tr>
      </table>
      <p>Strong growth across all metrics. The new onboarding flow reduced bounce rate significantly.</p>
    </div>`,
    receivedAt: "2026-07-07T18:00:00Z",
    isRead: true,
  },
  {
    id: "mail-22",
    from: "info@cronitor.io",
    fromName: "Cronitor",
    subject: "Job failure: nightly-backup (db-primary) — exit code 1",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #dc2626;">❌ Cron Job Failure</h3>
      <p><strong>Job:</strong> nightly-backup</p>
      <p><strong>Server:</strong> db-primary</p>
      <p><strong>Scheduled:</strong> July 8, 02:00 UTC</p>
      <p><strong>Exit code:</strong> 1</p>
      <p><strong>Error:</strong> <code>pg_dump: error: connection to database failed: FATAL: too many connections</code></p>
      <hr style="border: none; border-top: 1px solid #e5e5e5;" />
      <p>The backup job failed because the database connection pool was exhausted. Increase <code>max_connections</code> or schedule the backup during lower-traffic hours.</p>
    </div>`,
    receivedAt: "2026-07-08T02:05:00Z",
    isRead: false,
  },
  {
    id: "mail-23",
    from: "billing@cloudflare.com",
    fromName: "Cloudflare Billing",
    subject: "Invoice for June 2026 — Pro Plan $25.00 + Argo $5.00",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>Cloudflare Invoice — June 2026</h3>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 6px 0;"><strong>Pro Plan:</strong></td><td>$25.00</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Argo Smart Routing:</strong></td><td>$5.00</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Total:</strong></td><td><strong>$30.00</strong></td></tr>
      </table>
      <p>Paid automatically via Visa •••• 4242 on July 1, 2026.</p>
    </div>`,
    receivedAt: "2026-07-07T12:00:00Z",
    isRead: true,
  },
  {
    id: "mail-24",
    from: "welcome@slack.com",
    fromName: "Slack",
    subject: "devops-team workspace — 5 new members joined this week",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3>👋 New Team Members</h3>
      <p>Five people joined the <strong>devops-team</strong> workspace this week:</p>
      <ul>
        <li>Anna K. — SRE Engineer</li>
        <li>Marco L. — Backend Developer</li>
        <li>Sofia R. — DevOps Intern</li>
        <li>Thomas W. — Security Engineer</li>
        <li>Elena V. — Product Manager</li>
      </ul>
      <p>Total workspace members: <strong>28</strong></p>
    </div>`,
    receivedAt: "2026-07-06T16:00:00Z",
    isRead: true,
  },
  {
    id: "mail-25",
    from: "security@haveibeenpwned.com",
    fromName: "Have I Been Pwned",
    subject:
      "Domain search: 2 email addresses from inspot.app found in breaches",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #dc2626;">🔓 Breach Alert — Domain Search</h3>
      <p>Two email addresses from your domain <strong>inspot.app</strong> were found in known data breaches:</p>
      <ul>
        <li><strong>admin@inspot.app</strong> — Found in "LinkedIn 2025 scrape" (May 2025)</li>
        <li><strong>devops@inspot.app</strong> — Found in "Atlassian breach" (April 2025)</li>
      </ul>
      <p>Please ensure these accounts use strong, unique passwords and have MFA enabled.</p>
    </div>`,
    receivedAt: "2026-07-05T22:00:00Z",
    isRead: false,
  },
  {
    id: "mail-26",
    from: "noreply@letsencrypt.org",
    fromName: "Let's Encrypt",
    subject: "Certificate auto-renewal succeeded for cdn-delivery.net",
    bodyHtml: `<div style="font-family: system-ui, sans-serif; color: #333; line-height: 1.6;">
      <h3 style="color: #16a34a;">✅ Certificate Renewed</h3>
      <p>The SSL/TLS certificate for <strong>cdn-delivery.net</strong> has been successfully renewed after manual intervention.</p>
      <p>The DNS-01 challenge was resolved and the new certificate is valid until October 7, 2026.</p>
    </div>`,
    receivedAt: "2026-07-05T15:00:00Z",
    isRead: true,
  },
];
