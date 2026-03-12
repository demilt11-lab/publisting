import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SystemStatusProvider } from "@/contexts/SystemStatusContext";
import { TeamProvider } from "@/contexts/TeamContext";
import { SystemStatusBanner } from "@/components/SystemStatusBanner";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Beta from "./pages/Beta";
import AdminSignups from "./pages/AdminSignups";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </TeamProvider>
      </SystemStatusProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
