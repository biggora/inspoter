"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Play, Square, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchServers, getServer, powerAction } from "./api";

interface Server {
  id: string;
  name: string;
  type: string;
  status: string;
  ip: string;
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
  }
> = {
  running: {
    label: "Running",
    variant: "default",
    className: "bg-emerald-950 text-emerald-400 border-emerald-800",
  },
  stopped: {
    label: "Stopped",
    variant: "secondary",
    className: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
  starting: {
    label: "Starting…",
    variant: "outline",
    className: "bg-amber-950 text-amber-400 border-amber-800 animate-pulse",
  },
  stopping: {
    label: "Stopping…",
    variant: "outline",
    className: "bg-amber-950 text-amber-400 border-amber-800 animate-pulse",
  },
  unknown: {
    label: "Unknown",
    variant: "secondary",
    className: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
}

export function ServersView() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const pollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchServers();
      setServers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = () => load();
    run();
    const pollers = pollingRef.current;
    return () => {
      pollers.forEach((interval) => clearInterval(interval));
    };
  }, [load]);

  const handlePower = async (
    server: Server,
    action: "start" | "stop" | "restart",
  ) => {
    setActionInFlight(server.id);
    try {
      await powerAction(server.id, action);
      setServers((prev) =>
        prev.map((s) =>
          s.id === server.id
            ? { ...s, status: action === "stop" ? "stopping" : "starting" }
            : s,
        ),
      );
      toast.success(
        `${action.charAt(0).toUpperCase() + action.slice(1)} initiated for ${server.name}`,
      );

      const interval = setInterval(async () => {
        try {
          const updated = await getServer(server.id);
          if (updated.status === "running" || updated.status === "stopped") {
            clearInterval(interval);
            pollingRef.current.delete(server.id);
            setServers((prev) =>
              prev.map((s) => (s.id === server.id ? updated : s)),
            );
            setActionInFlight((prev) => (prev === server.id ? null : prev));
          } else {
            setServers((prev) =>
              prev.map((s) => (s.id === server.id ? updated : s)),
            );
          }
        } catch {
          clearInterval(interval);
          pollingRef.current.delete(server.id);
          setActionInFlight((prev) => (prev === server.id ? null : prev));
        }
      }, 2000);
      pollingRef.current.set(server.id, interval);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Power action failed");
      setActionInFlight(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Servers</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Servers</h1>
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Servers</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {servers.map((server) => {
          const sc = getStatusConfig(server.status);
          const isTransitioning =
            server.status === "starting" || server.status === "stopping";
          const isBusy = actionInFlight === server.id || isTransitioning;
          return (
            <Card key={server.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{server.name}</CardTitle>
                <p className="font-mono text-sm text-muted-foreground">
                  {server.type}
                </p>
                <p className="font-mono text-sm text-muted-foreground">
                  {server.ip}
                </p>
              </CardHeader>
              <CardContent className="flex items-center justify-between pt-2">
                <Badge className={sc.className} aria-label={sc.label}>
                  {sc.label}
                </Badge>
                <div className="flex gap-1">
                  {server.status === "stopped" && (
                    <PowerButton
                      server={server}
                      action="start"
                      icon={<Play className="size-3.5" />}
                      label="Start"
                      busy={isBusy}
                      onAction={handlePower}
                    />
                  )}
                  {server.status === "running" && (
                    <>
                      <PowerButton
                        server={server}
                        action="restart"
                        icon={<RotateCcw className="size-3.5" />}
                        label="Restart"
                        busy={isBusy}
                        onAction={handlePower}
                      />
                      <PowerButton
                        server={server}
                        action="stop"
                        icon={<Square className="size-3.5" />}
                        label="Stop"
                        busy={isBusy}
                        onAction={handlePower}
                        destructive
                      />
                    </>
                  )}
                  {isTransitioning && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PowerButton({
  server,
  action,
  icon,
  label,
  busy,
  destructive,
  onAction,
}: {
  server: Server;
  action: "start" | "stop" | "restart";
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  destructive?: boolean;
  onAction: (server: Server, action: "start" | "stop" | "restart") => void;
}) {
  const descriptions: Record<string, string> = {
    start: `${server.name} will be started. This may take a few seconds.`,
    stop: `${server.name} will be stopped and become unreachable.`,
    restart: `${server.name} will restart and be briefly unreachable.`,
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant={destructive ? "destructive" : "outline"}
            size="sm"
            disabled={busy}
          />
        }
      >
        {icon}
        <span className="ml-1">{label}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {label} &ldquo;{server.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {descriptions[action]}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
            onClick={() => onAction(server, action)}
          >
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
