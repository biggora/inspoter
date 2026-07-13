import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import LoginPage from "@/pages/login/page";
import BookmarksPage from "@/pages/bookmarks/page";
import ServersPage from "@/pages/servers/page";
import DomainsPage from "@/pages/domains/page";
import DnsDetailPage from "@/pages/domains/dns/page";
import PlaceholderPage from "@/pages/placeholder/page";
import AuthGuard from "@/components/base/AuthGuard";
import AppLayout from "@/components/feature/AppLayout";
import MailPage from "@/pages/mail/page";
import MailDetailPage from "@/pages/mail/detail/page";
import MessagesPage from "@/pages/messages/page";
import LogsPage from "@/pages/logs/page";
import AlertsPage from "@/pages/alerts/page";
import SettingsPage from "@/pages/settings/page";
import MonitoringPage from "@/pages/monitoring/page";
import DashboardPage from "@/pages/dashboard/page";
import BackupsPage from "@/pages/backups/page";

function ProtectedPlaceholder({ path }: { path: string }) {
  return (
    <AuthGuard>
      <AppLayout>
        <PlaceholderPage path={path} />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedBookmarks() {
  return (
    <AuthGuard>
      <AppLayout>
        <BookmarksPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedServers() {
  return (
    <AuthGuard>
      <AppLayout>
        <ServersPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedDomains() {
  return (
    <AuthGuard>
      <AppLayout>
        <DomainsPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedDnsDetail() {
  return (
    <AuthGuard>
      <AppLayout>
        <DnsDetailPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedMail() {
  return (
    <AuthGuard>
      <AppLayout>
        <MailPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedMailDetail() {
  return (
    <AuthGuard>
      <AppLayout>
        <MailDetailPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedMessages() {
  return (
    <AuthGuard>
      <AppLayout>
        <MessagesPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedLogs() {
  return (
    <AuthGuard>
      <AppLayout>
        <LogsPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedAlerts() {
  return (
    <AuthGuard>
      <AppLayout>
        <AlertsPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedSettings() {
  return (
    <AuthGuard>
      <AppLayout>
        <SettingsPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedMonitoring() {
  return (
    <AuthGuard>
      <AppLayout>
        <MonitoringPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedDashboard() {
  return (
    <AuthGuard>
      <AppLayout>
        <DashboardPage />
      </AppLayout>
    </AuthGuard>
  );
}

function ProtectedBackups() {
  return (
    <AuthGuard>
      <AppLayout>
        <BackupsPage />
      </AppLayout>
    </AuthGuard>
  );
}

const routes: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/bookmarks",
    element: <ProtectedBookmarks />,
  },
  {
    path: "/servers",
    element: <ProtectedServers />,
  },
  {
    path: "/domains",
    element: <ProtectedDomains />,
  },
  {
    path: "/domains/dns/:domainId",
    element: <ProtectedDnsDetail />,
  },
  {
    path: "/mail",
    element: <ProtectedMail />,
  },
  {
    path: "/mail/:emailId",
    element: <ProtectedMailDetail />,
  },
  {
    path: "/messages",
    element: <ProtectedMessages />,
  },
  {
    path: "/logs",
    element: <ProtectedLogs />,
  },
  {
    path: "/alerts",
    element: <ProtectedAlerts />,
  },
  {
    path: "/settings",
    element: <ProtectedSettings />,
  },
  {
    path: "/monitoring",
    element: <ProtectedMonitoring />,
  },
  {
    path: "/backups",
    element: <ProtectedBackups />,
  },
  {
    path: "/",
    element: <ProtectedDashboard />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
