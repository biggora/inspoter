import { createProviderHttpClient } from "@/lib/providers/http";
import type { ProviderResult } from "@/lib/providers/result";
import type {
  HostingAccount,
  HostingAccountStatus,
  HostingProvider,
} from "./types";

const BASE_URL = "https://developers.hostinger.com";

// The API caps per_page at 100 and paginates everything that can grow. The
// page ceiling is a runaway guard, not a real limit: 10 pages is 1000 items.
const PER_PAGE = 100;
const MAX_PAGES = 10;

// Per-website calls (PHP details, WordPress core version) are the only part
// of the fan-out that scales with the account's size, and Hostinger blocks an
// IP that trips its rate limit repeatedly — so they go out in small batches
// rather than all at once. Mirrors the chunking in services/scheduler.ts.
const CHUNK_SIZE = 5;

interface Paginated<T> {
  data?: T[];
  meta?: { pagination?: { total?: number } };
}

interface HostingerWebsite {
  domain?: string;
  vhost_type?: string;
  is_enabled?: boolean;
  username?: string;
  client_id?: number;
  order_id?: number;
  created_at?: string;
  root_directory?: string;
  parent_domain?: string;
}

interface HostingerOrder {
  id?: number;
  subscription_id?: string | null;
  status?: string;
  plan?: { name?: string };
}

interface HostingerSubscription {
  id?: string;
  name?: string;
  status?: string;
  expires_at?: string | null;
}

interface HostingerDatabase {
  name?: string;
  domain?: string | null;
  disk_usage_mb?: number | null;
}

interface HostingerMailOrder {
  id?: string;
  seats?: number;
  domain?: { name?: string } | null;
}

interface HostingerMailbox {
  id?: string;
}

interface HostingerPhpDetails {
  php_version?: string;
}

interface HostingerWordPressInstallation {
  id?: string;
  username?: string;
  domain?: string;
}

interface HostingerWordPressVersion {
  version?: string;
}

// Per-account facts collected once and shared by every website of that
// account, keyed the way the website rows join onto them.
interface AccountContext {
  plans: Map<number, string>; // order id -> plan/subscription name
  expiries: Map<number, string>; // order id -> subscription expiry (ISO)
  databases: Map<string, HostingerDatabase[]>; // username -> databases
  mailOrders: Map<string, { seats: number | null; mailboxes: number | null }>;
  wordpress: Map<string, string>; // "username domain" -> core version
}

function toStatus(isEnabled: boolean | undefined): HostingAccountStatus {
  if (isEnabled === true) return "active";
  if (isEnabled === false) return "suspended";
  return "unknown";
}

function domainKey(username: string, domain: string): string {
  return `${username} ${domain}`;
}

async function mapInChunks<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

// Hostinger hosting accounts (websites) via the public API. The websites
// endpoint alone carries no plan, no quota, and no expiry, so the listing
// joins it against orders, billing subscriptions, databases, mail orders, and
// WordPress installations. Only the websites call is load-bearing: every
// enrichment call degrades to null on failure, because an API token may lack
// the scope for billing or mail and a partial card beats an empty section.
//
// Disk usage, bandwidth, and the account IP are absent from the whole
// specification for shared hosting and stay null by necessity, not oversight.
//
// Read-only: suspend is not exposed, so setSuspended is "unsupported".
export class HostingerProvider implements HostingProvider {
  readonly id: string;
  readonly providerType = "hostinger";
  readonly label: string;
  readonly mode = "real" as const;
  private readonly client;

  constructor(id: string, label: string, apiToken: string) {
    this.id = id;
    this.label = label;
    this.client = createProviderHttpClient({
      baseUrl: BASE_URL,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  // Walks the paginated endpoints until the reported total is covered. A
  // response without pagination meta is treated as the only page.
  private async fetchAllPages<T>(path: string): Promise<ProviderResult<T[]>> {
    const separator = path.includes("?") ? "&" : "?";
    const items: T[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await this.client.request<Paginated<T>>({
        path: `${path}${separator}per_page=${PER_PAGE}&page=${page}`,
      });
      if (!result.ok) return result;

      const batch = Array.isArray(result.data?.data) ? result.data.data : [];
      items.push(...batch);

      const total = result.data?.meta?.pagination?.total;
      if (batch.length < PER_PAGE) break;
      if (typeof total === "number" && items.length >= total) break;
    }

    return { ok: true, data: items };
  }

  // Enrichment helper: a failure is an absent fact, not an error to surface.
  // Null and an empty array are deliberately different — "the call failed" is
  // a dash on the card, "the account has none" is a zero.
  private async tryPages<T>(path: string): Promise<T[] | null> {
    const result = await this.fetchAllPages<T>(path);
    return result.ok ? result.data : null;
  }

  private async tryOne<T>(path: string): Promise<T | null> {
    const result = await this.client.request<T>({ path });
    return result.ok ? (result.data ?? null) : null;
  }

  async listAccounts(): Promise<ProviderResult<HostingAccount[]>> {
    const websitesResult = await this.fetchAllPages<HostingerWebsite>(
      "/api/hosting/v1/websites",
    );
    if (!websitesResult.ok) return websitesResult;

    const websites = websitesResult.data;
    const context = await this.loadContext(websites);
    const phpVersions = await this.loadPhpVersions(websites);

    return {
      ok: true,
      data: websites.map((website) =>
        this.toAccount(website, context, phpVersions),
      ),
    };
  }

  // Everything that is fetched once per account rather than once per website.
  private async loadContext(
    websites: HostingerWebsite[],
  ): Promise<AccountContext> {
    const usernames = [
      ...new Set(
        websites.map((w) => w.username).filter((u): u is string => !!u),
      ),
    ];

    const [orders, subscriptions, mailOrders, wpInstalls, databaseLists] =
      await Promise.all([
        this.tryPages<HostingerOrder>("/api/hosting/v1/orders"),
        this.tryPages<HostingerSubscription>("/api/billing/v1/subscriptions"),
        this.tryPages<HostingerMailOrder>("/api/mail/v1/orders"),
        this.tryPages<HostingerWordPressInstallation>(
          "/api/hosting/v1/wordpress/installations?ownership=all",
        ),
        Promise.all(
          usernames.map(async (username) => ({
            username,
            databases: await this.tryPages<HostingerDatabase>(
              `/api/hosting/v1/accounts/${encodeURIComponent(username)}/databases`,
            ),
          })),
        ),
      ]);

    const subscriptionsById = new Map(
      (subscriptions ?? [])
        .filter((s): s is HostingerSubscription & { id: string } => !!s.id)
        .map((s) => [s.id, s]),
    );

    const plans = new Map<number, string>();
    const expiries = new Map<number, string>();
    for (const order of orders ?? []) {
      if (typeof order.id !== "number") continue;
      const subscription = order.subscription_id
        ? subscriptionsById.get(order.subscription_id)
        : undefined;
      // The subscription carries the marketing name ("Premium Web Hosting");
      // the order only has the machine name ("hostinger_premium").
      const plan = subscription?.name ?? order.plan?.name;
      if (plan) plans.set(order.id, plan);
      if (subscription?.expires_at) {
        expiries.set(order.id, subscription.expires_at);
      }
    }

    // Only accounts whose database call succeeded get an entry, so a failed
    // call leaves the lookup empty and the card shows a dash, not a zero.
    const databases = new Map<string, HostingerDatabase[]>();
    for (const entry of databaseLists) {
      if (entry.databases) databases.set(entry.username, entry.databases);
    }

    const mailTargets = mailOrders
      ?.map((order) => ({
        id: order.id,
        domain: order.domain?.name,
        seats: order.seats ?? null,
      }))
      .filter(
        (
          order,
        ): order is { id: string; domain: string; seats: number | null } =>
          !!order.id && !!order.domain,
      );

    const mailCounts = await mapInChunks(
      mailTargets ?? [],
      CHUNK_SIZE,
      async (order) => ({
        domain: order.domain,
        seats: order.seats,
        mailboxes:
          (
            await this.tryPages<HostingerMailbox>(
              `/api/mail/v1/orders/${encodeURIComponent(order.id)}/mailboxes`,
            )
          )?.length ?? null,
      }),
    );
    const mailByDomain = new Map(
      mailCounts.map(({ domain, seats, mailboxes }) => [
        domain,
        { seats, mailboxes },
      ]),
    );

    const wpTargets = wpInstalls
      ?.map((install) => ({
        id: install.id,
        username: install.username,
        domain: install.domain,
      }))
      .filter(
        (
          install,
        ): install is { id: string; username: string; domain: string } =>
          !!install.id && !!install.username && !!install.domain,
      );

    const versions = await mapInChunks(
      wpTargets ?? [],
      CHUNK_SIZE,
      async (install) => ({
        key: domainKey(install.username, install.domain),
        version: (
          await this.tryOne<HostingerWordPressVersion>(
            `/api/hosting/v1/accounts/${encodeURIComponent(install.username)}/wordpress/${encodeURIComponent(install.id)}/version`,
          )
        )?.version,
      }),
    );
    const wordpress = new Map<string, string>();
    for (const { key, version } of versions) {
      if (version) wordpress.set(key, version);
    }

    return { plans, expiries, databases, mailOrders: mailByDomain, wordpress };
  }

  private async loadPhpVersions(
    websites: HostingerWebsite[],
  ): Promise<Map<string, string>> {
    const targets = websites
      .map((website) => ({
        username: website.username,
        domain: website.domain,
      }))
      .filter(
        (site): site is { username: string; domain: string } =>
          !!site.username && !!site.domain,
      );

    const entries = await mapInChunks(targets, CHUNK_SIZE, async (site) => ({
      key: domainKey(site.username, site.domain),
      version: (
        await this.tryOne<HostingerPhpDetails>(
          `/api/hosting/v1/accounts/${encodeURIComponent(site.username)}/websites/${encodeURIComponent(site.domain)}/php/details`,
        )
      )?.php_version,
    }));

    const versions = new Map<string, string>();
    for (const { key, version } of entries) {
      if (version) versions.set(key, version);
    }
    return versions;
  }

  private toAccount(
    website: HostingerWebsite,
    context: AccountContext,
    phpVersions: Map<string, string>,
  ): HostingAccount {
    const domain = website.domain ?? "";
    const username = website.username ?? "";
    const key = domainKey(username, domain);
    const orderId = website.order_id;

    // Databases are an account-level resource that each carry the domain they
    // were assigned to. Unassigned ones (domain: null) belong to the account
    // rather than to any one site, so they are attributed to its main vhost —
    // otherwise they would be invisible on every card.
    const accountDatabases = context.databases.get(username);
    const siteDatabases = accountDatabases?.filter(
      (db) =>
        db.domain === domain || (!db.domain && website.vhost_type === "main"),
    );
    // A database whose size the API omits must not be counted as zero MB.
    const reportedSizes = siteDatabases
      ?.map((db) => db.disk_usage_mb)
      .filter((size): size is number => typeof size === "number");
    const mail = context.mailOrders.get(domain);

    return {
      id: domain,
      domain,
      user: username,
      // Falls back to the vhost type only when neither the order nor its
      // subscription could be read — it is at least a truthful label.
      plan:
        (orderId !== undefined ? context.plans.get(orderId) : undefined) ??
        website.vhost_type ??
        "",
      status: toStatus(website.is_enabled),
      ip: "",
      diskUsedMb: null,
      diskLimitMb: null,
      bandwidthUsedMb: null,
      bandwidthLimitMb: null,
      databases: siteDatabases?.length ?? null,
      databaseDiskUsedMb: reportedSizes?.length
        ? reportedSizes.reduce((sum, size) => sum + size, 0)
        : null,
      emailAccounts: mail?.mailboxes ?? null,
      emailAccountsLimit: mail?.seats ?? null,
      phpVersion: phpVersions.get(key) ?? null,
      wordpressVersion: context.wordpress.get(key) ?? null,
      expiresAt:
        (orderId !== undefined ? context.expiries.get(orderId) : undefined) ??
        null,
      supportsSuspend: false,
    };
  }

  async getAccount(id: string): Promise<ProviderResult<HostingAccount>> {
    const result = await this.listAccounts();
    if (!result.ok) return result;
    const account = result.data.find((item) => item.id === id);
    if (!account) {
      return { ok: false, kind: "error", message: "Account not found" };
    }
    return { ok: true, data: account };
  }

  async setSuspended(): Promise<ProviderResult<void>> {
    return { ok: false, kind: "unsupported", operation: "setSuspended" };
  }
}
