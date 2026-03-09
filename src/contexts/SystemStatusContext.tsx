import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type ServiceName = "song-lookup" | "pro-lookup" | "streaming-stats" | "radio-airplay" | "chart-lookup";

interface SystemStatusContextType {
  degradedServices: Set<ServiceName>;
  dismissedServices: Set<ServiceName>;
  reportDegraded: (service: ServiceName) => void;
  clearDegraded: (service: ServiceName) => void;
  dismissService: (service: ServiceName) => void;
  dismissAll: () => void;
}

const SystemStatusContext = createContext<SystemStatusContextType | undefined>(undefined);

export function SystemStatusProvider({ children }: { children: ReactNode }) {
  const [degradedServices, setDegradedServices] = useState<Set<ServiceName>>(new Set());
  const [dismissedServices, setDismissedServices] = useState<Set<ServiceName>>(new Set());

  const reportDegraded = useCallback((service: ServiceName) => {
    setDegradedServices((prev) => {
      if (prev.has(service)) return prev;
      const next = new Set(prev);
      next.add(service);
      return next;
    });
    // If a new service degrades that wasn't dismissed, it will show
    // But we don't auto-remove from dismissed - that stays until reload
  }, []);

  const clearDegraded = useCallback((service: ServiceName) => {
    setDegradedServices((prev) => {
      if (!prev.has(service)) return prev;
      const next = new Set(prev);
      next.delete(service);
      return next;
    });
  }, []);

  const dismissService = useCallback((service: ServiceName) => {
    setDismissedServices((prev) => {
      const next = new Set(prev);
      next.add(service);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    setDismissedServices(new Set(degradedServices));
  }, [degradedServices]);

  return (
    <SystemStatusContext.Provider
      value={{
        degradedServices,
        dismissedServices,
        reportDegraded,
        clearDegraded,
        dismissService,
        dismissAll,
      }}
    >
      {children}
    </SystemStatusContext.Provider>
  );
}

export function useSystemStatus() {
  const context = useContext(SystemStatusContext);
  if (!context) {
    throw new Error("useSystemStatus must be used within a SystemStatusProvider");
  }
  return context;
}
