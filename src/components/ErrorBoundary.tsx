import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.fallbackTitle || 'Component'} crashed:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-muted-foreground flex-1 truncate">
              {this.props.fallbackTitle || "Something went wrong"}
            </span>
            <Button variant="ghost" size="sm" onClick={this.handleReset} className="shrink-0 h-7 text-xs gap-1">
              <RefreshCw className="w-3 h-3" /> Retry
            </Button>
          </div>
        );
      }

      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h3 className="text-sm font-medium text-foreground">
            {this.props.fallbackTitle || "Something went wrong"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            This section encountered an error. Your other data is unaffected.
          </p>
          <Button variant="outline" size="sm" onClick={this.handleReset} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
