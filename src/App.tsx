import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SystemStatusProvider } from "@/contexts/SystemStatusContext";
import { TeamProvider } from "@/contexts/TeamContext";
import { SystemStatusBanner } from "@/components/SystemStatusBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Beta from "./pages/Beta";
import AdminSignups from "./pages/AdminSignups";
import AdminUsers from "./pages/AdminUsers";
import CatalogAnalysis from "./pages/CatalogAnalysis";
import AdminStreamingRates from "./pages/AdminStreamingRates";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary fallbackTitle="Something went wrong. Please refresh the page.">
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <QueryClientProvider client={queryClient}>
        <SystemStatusProvider>
          <TeamProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <SystemStatusBanner />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/beta" element={<Beta />} />
                  <Route path="/admin/signups" element={<AdminSignups />} />
                  <Route path="/admin/users" element={<AdminUsers />} />
                  <Route path="/catalog-analysis" element={<CatalogAnalysis />} />
                  <Route path="/admin/streaming-rates" element={<AdminStreamingRates />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </TeamProvider>
        </SystemStatusProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
