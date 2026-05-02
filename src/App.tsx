import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SystemStatusProvider } from "@/contexts/SystemStatusContext";
import { TeamProvider } from "@/contexts/TeamContext";
import { CatalogImportProvider } from "@/contexts/CatalogImportContext";
import { SystemStatusBanner } from "@/components/SystemStatusBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Beta from "./pages/Beta";
import AdminSignups from "./pages/AdminSignups";
import AdminUsers from "./pages/AdminUsers";
import CatalogAnalysis from "./pages/CatalogAnalysis";
import OutreachTemplates from "./pages/OutreachTemplates";
import AdminStreamingRates from "./pages/AdminStreamingRates";
import AdminDataConflicts from "./pages/AdminDataConflicts";
import AdminAccuracy from "./pages/AdminAccuracy";
import DealScoringSettings from "./pages/DealScoringSettings";
import AdminLookupIntelligence from "./pages/AdminLookupIntelligence";
import CollaboratorNetwork from "./pages/CollaboratorNetwork";
import Alerts from "./pages/Alerts";
import AdminReviewQueue from "./pages/AdminReviewQueue";
import AdminEntityMerges from "./pages/AdminEntityMerges";
import Portfolio from "./pages/Portfolio";
import AdminAutomationRules from "./pages/AdminAutomationRules";
import OutreachCrm from "./pages/OutreachCrm";
import Reports from "./pages/Reports";
import SharedWatchlists from "./pages/SharedWatchlists";
import NotFound from "./pages/NotFound";
import EntityHub from "./pages/EntityHub";
import EntityDetail from "./pages/EntityDetail";
import EntityCompare from "./pages/EntityCompare";
import AdminSyncHistory from "./pages/AdminSyncHistory";
import AdminRankingQA from "./pages/AdminRankingQA";
import AdminSearchTelemetry from "./pages/AdminSearchTelemetry";
import AdminSavedQueries from "./pages/AdminSavedQueries";
import AdminMergeSplit from "./pages/AdminMergeSplit";
import AdminApiClients from "./pages/AdminApiClients";
import CanonicalEntityDetail from "./pages/CanonicalEntityDetail";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary fallbackTitle="Something went wrong. Please refresh the page.">
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      <QueryClientProvider client={queryClient}>
        <SystemStatusProvider>
          <TeamProvider>
            <CatalogImportProvider>
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
                    <Route path="/outreach" element={<OutreachTemplates />} />
                    <Route path="/admin/streaming-rates" element={<AdminStreamingRates />} />
                    <Route path="/admin/data-conflicts" element={<AdminDataConflicts />} />
                    <Route path="/admin/accuracy" element={<AdminAccuracy />} />
                    <Route path="/settings/deal-scoring" element={<DealScoringSettings />} />
                    <Route path="/admin/lookup-intelligence" element={<AdminLookupIntelligence />} />
                    <Route path="/network/:name" element={<CollaboratorNetwork />} />
                    <Route path="/alerts" element={<ErrorBoundary fallbackTitle="Alerts inbox failed to load"><Alerts /></ErrorBoundary>} />
                    <Route path="/admin/review-queue" element={<AdminReviewQueue />} />
                    <Route path="/admin/entity-merges" element={<AdminEntityMerges />} />
                    <Route path="/portfolio" element={<ErrorBoundary fallbackTitle="Portfolio failed to load"><Portfolio /></ErrorBoundary>} />
                    <Route path="/admin/automation-rules" element={<AdminAutomationRules />} />
                    <Route path="/crm" element={<OutreachCrm />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/shared-watchlists" element={<SharedWatchlists />} />
                    <Route path="/entity-hub" element={<ErrorBoundary fallbackTitle="Entity hub failed to load"><EntityHub /></ErrorBoundary>} />
                    <Route path="/artist/:pubId" element={<ErrorBoundary fallbackTitle="Artist page failed to load"><EntityDetail kind="artist" /></ErrorBoundary>} />
                    <Route path="/track/:pubId" element={<ErrorBoundary fallbackTitle="Track page failed to load"><EntityDetail kind="track" /></ErrorBoundary>} />
                    <Route path="/writer/:pubId" element={<ErrorBoundary fallbackTitle="Writer page failed to load"><EntityDetail kind="writer" /></ErrorBoundary>} />
                    <Route path="/producer/:pubId" element={<ErrorBoundary fallbackTitle="Producer page failed to load"><EntityDetail kind="producer" /></ErrorBoundary>} />
                    <Route path="/compare" element={<ErrorBoundary fallbackTitle="Compare failed to load"><EntityCompare /></ErrorBoundary>} />
                    <Route path="/admin/sync-history" element={<AdminSyncHistory />} />
                    <Route path="/admin/ranking-qa" element={<AdminRankingQA />} />
                    <Route path="/admin/search-telemetry" element={<AdminSearchTelemetry />} />
                    <Route path="/admin/saved-queries" element={<AdminSavedQueries />} />
                    <Route path="/admin/merge-split" element={<AdminMergeSplit />} />
                    <Route path="/admin/api-clients" element={<AdminApiClients />} />
                    <Route path="/playlist/:pubId" element={<ErrorBoundary fallbackTitle="Playlist page failed to load"><CanonicalEntityDetail kind="playlist" /></ErrorBoundary>} />
                    <Route path="/publisher/:pubId" element={<ErrorBoundary fallbackTitle="Publisher page failed to load"><CanonicalEntityDetail kind="publisher" /></ErrorBoundary>} />
                    <Route path="/label/:pubId" element={<ErrorBoundary fallbackTitle="Label page failed to load"><CanonicalEntityDetail kind="label" /></ErrorBoundary>} />
                    <Route path="/work/:pubId" element={<ErrorBoundary fallbackTitle="Work page failed to load"><CanonicalEntityDetail kind="work" /></ErrorBoundary>} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </TooltipProvider>
            </CatalogImportProvider>
          </TeamProvider>
        </SystemStatusProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
