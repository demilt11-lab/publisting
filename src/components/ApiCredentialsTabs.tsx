import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MlcCredentialsPanel } from "@/components/MlcCredentialsPanel";
import { SpotifyCredentialsPanel } from "@/components/SpotifyCredentialsPanel";
import { YoutubeCredentialsPanel } from "@/components/YoutubeCredentialsPanel";

/**
 * Phase 5 — single tabbed surface for all API credentials used by the
 * Catalog Analysis verification flows. Each tab is a self-contained panel
 * with its own Test Connection / Save logic.
 */
export function ApiCredentialsTabs() {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-sm font-semibold">API credentials</div>
      <Tabs defaultValue="mlc">
        <TabsList>
          <TabsTrigger value="mlc">MLC API</TabsTrigger>
          <TabsTrigger value="spotify">Spotify API</TabsTrigger>
          <TabsTrigger value="youtube">YouTube API</TabsTrigger>
        </TabsList>
        <TabsContent value="mlc"><MlcCredentialsPanel /></TabsContent>
        <TabsContent value="spotify"><SpotifyCredentialsPanel /></TabsContent>
        <TabsContent value="youtube"><YoutubeCredentialsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}