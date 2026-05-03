import { AlertCircle, Clock, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type ApiErrorKind = "rate_limit" | "network" | "auth" | "validation" | "not_found" | "server" | "unknown";

export function classifyError(err: unknown): { kind: ApiErrorKind; status?: number; message: string } {
  if (!err) return { kind: "unknown", message: "Something went wrong." };
  const e: any = err;
  const status = typeof e?.status === "number" ? e.status : (typeof e?.statusCode === "number" ? e.statusCode : undefined);
  const msg = typeof e?.message === "string" ? e.message : String(err);
  if (status === 429 || /rate.?limit|too many requests/i.test(msg)) return { kind: "rate_limit", status, message: msg };
  if (status === 401 || status === 403) return { kind: "auth", status, message: msg };
  if (status === 404) return { kind: "not_found", status, message: msg };
  if (status && status >= 500) return { kind: "server", status, message: msg };
  if (/validation|invalid/i.test(msg)) return { kind: "validation", status, message: msg };
  if (/network|failed to fetch|timeout/i.test(msg)) return { kind: "network", status, message: msg };
  return { kind: "unknown", status, message: msg };
}

const META: Record<ApiErrorKind, { title: string; hint: string; icon: typeof AlertCircle }> = {
  rate_limit: { title: "We're being rate-limited", hint: "Too many requests in the last minute. Wait a moment and retry.", icon: Clock },
  network:    { title: "Network problem", hint: "Couldn't reach our backend. Check your connection and retry.", icon: WifiOff },
  auth:       { title: "Sign-in required", hint: "Please sign in to load this data.", icon: ShieldAlert },
  validation: { title: "Invalid request", hint: "The request was rejected by validation. Try a different query.", icon: AlertCircle },
  not_found:  { title: "Nothing found", hint: "We couldn't find anything for that query.", icon: AlertCircle },
  server:     { title: "Source service is failing", hint: "An upstream service is down. We'll retry automatically.", icon: AlertCircle },
  unknown:    { title: "Couldn't load results", hint: "An unexpected error occurred. Please retry.", icon: AlertCircle },
};

export interface ApiErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** Optional partial data to show even when the call partially failed. */
  partialDataNote?: string;
}

export function ApiErrorState({ error, onRetry, partialDataNote }: ApiErrorStateProps) {
  const { kind, status, message } = classifyError(error);
  const m = META[kind];
  const Icon = m.icon;
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Icon className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium">{m.title}{status ? ` · ${status}` : ""}</div>
            <div className="text-sm text-muted-foreground">{m.hint}</div>
            {message && message !== m.hint && (
              <div className="text-xs text-muted-foreground/80 mt-1 truncate">{message}</div>
            )}
            {partialDataNote && (
              <div className="text-xs text-amber-300 mt-1">{partialDataNote}</div>
            )}
          </div>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}