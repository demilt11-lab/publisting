import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchCatalog } from "@/lib/api/catalogLookup";
import { fetchStreamingStats } from "@/lib/api/streamingStats";

export interface ImportedCatalogSong {
  id: string;
  title: string;
  artist: string;
  spotifyStreams: number;
  youtubeViews: number;
  ownershipPercent?: number;
  releaseDate?: string;
}

export interface CatalogImportResult {
  artist: string;
  role: string;
  songs: ImportedCatalogSong[];
  completedAt: number;
}

interface CatalogImportState {
  importing: boolean;
  artist: string | null;
  role: string | null;
  progress: string;
  error: string | null;
  /** Latest completed result (consumed by the page when it mounts/matches). */
  result: CatalogImportResult | null;
}

interface CatalogImportContextValue extends CatalogImportState {
  startImport: (artist: string, role: string, options?: { onNavigate?: () => void }) => void;
  consumeResult: (artist: string) => CatalogImportResult | null;
  clearResult: () => void;
}

const CatalogImportContext = createContext<CatalogImportContextValue | undefined>(undefined);

const initialState: CatalogImportState = {
  importing: false,
  artist: null,
  role: null,
  progress: "",
  error: null,
  result: null,
};

export const CatalogImportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CatalogImportState>(initialState);
  // Guard against duplicate concurrent imports for the same artist
  const runningKeyRef = useRef<string | null>(null);

  const startImport = useCallback((artist: string, role: string, options?: { onNavigate?: () => void }) => {
    const key = `${artist}::${role}`.toLowerCase();
    if (runningKeyRef.current === key) return; // already running this exact import
    runningKeyRef.current = key;

    setState({
      importing: true,
      artist,
      role,
      progress: `Fetching catalog for ${artist}...`,
      error: null,
      result: null,
    });

    const run = async () => {
      try {
        const data = await fetchCatalog(artist, role);
        if (!data || data.songs.length === 0) {
          setState((s) => ({ ...s, importing: false, progress: "", error: `No catalog data found for "${artist}".` }));
          toast.error(`No catalog found for ${artist}`);
          runningKeyRef.current = null;
          return;
        }

        setState((s) => ({ ...s, progress: `Found ${data.songs.length} songs. Enriching with streaming data...` }));

        const BATCH = 3;
        const DELAY_MS = 1500;
        const enriched = [...data.songs];

        const fetchWithRetry = async (song: any, retries = 2): Promise<any> => {
          for (let attempt = 0; attempt <= retries; attempt++) {
            try {
              const stats = await fetchStreamingStats(song.title, song.artist);
              const spotifyCount = stats?.spotify?.streamCount ?? stats?.spotify?.estimatedStreams ?? null;
              const ytViewStr = stats?.youtube?.viewCount || null;
              const ytViews = ytViewStr ? parseInt(ytViewStr.replace(/,/g, ""), 10) : 0;
              if (ytViews > 0 || attempt === retries) {
                return { ...song, spotifyStreamCount: spotifyCount, youtubeViews: ytViewStr, _spotifyNum: spotifyCount ?? 0, _youtubeNum: ytViews };
              }
              await new Promise((r) => setTimeout(r, 1000));
            } catch {
              if (attempt === retries) return { ...song, _spotifyNum: 0, _youtubeNum: 0 };
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
          return { ...song, _spotifyNum: 0, _youtubeNum: 0 };
        };

        for (let i = 0; i < enriched.length; i += BATCH) {
          const batch = enriched.slice(i, i + BATCH);
          const results = await Promise.allSettled(batch.map((s) => fetchWithRetry(s)));
          results.forEach((r, idx) => {
            if (r.status === "fulfilled") {
              const songIdx = i + idx;
              if (songIdx < enriched.length) enriched[songIdx] = r.value as any;
            }
          });
          const done = Math.min(i + BATCH, enriched.length);
          setState((s) => ({ ...s, progress: `Enriched ${done} of ${enriched.length} songs...` }));
          if (i + BATCH < enriched.length) {
            await new Promise((r) => setTimeout(r, DELAY_MS));
          }
        }

        const songs: ImportedCatalogSong[] = enriched.map((song: any, idx) => {
          const youtubeViews = song._youtubeNum || 0;
          const spotifyStreams = song._spotifyNum || 0;
          return {
            id: String(idx),
            title: song.title,
            artist: song.artist || artist,
            spotifyStreams,
            youtubeViews,
            ownershipPercent: song.publishingShare ? song.publishingShare / 100 : undefined,
            releaseDate: song.releaseDate || undefined,
          };
        });

        const result: CatalogImportResult = {
          artist,
          role,
          songs,
          completedAt: Date.now(),
        };

        setState({
          importing: false,
          artist,
          role,
          progress: "",
          error: null,
          result,
        });

        toast.success(`Catalog analysis complete`, {
          description: `${songs.length} songs imported for ${artist}.`,
          duration: 8000,
          action: options?.onNavigate
            ? { label: "View results", onClick: options.onNavigate }
            : undefined,
        });
      } catch (err) {
        console.error("Catalog import failed:", err);
        setState((s) => ({ ...s, importing: false, progress: "", error: `Failed to import catalog for "${artist}".` }));
        toast.error(`Catalog import failed for ${artist}`);
      } finally {
        runningKeyRef.current = null;
      }
    };

    // Fire and forget — runs independent of any mounted page
    void run();
  }, []);

  const consumeResult = useCallback((artist: string): CatalogImportResult | null => {
    let consumed: CatalogImportResult | null = null;
    setState((s) => {
      if (s.result && s.result.artist.toLowerCase() === artist.toLowerCase()) {
        consumed = s.result;
        return { ...s, result: null };
      }
      return s;
    });
    return consumed;
  }, []);

  const clearResult = useCallback(() => {
    setState((s) => ({ ...s, result: null, error: null }));
  }, []);

  return (
    <CatalogImportContext.Provider value={{ ...state, startImport, consumeResult, clearResult }}>
      {children}
    </CatalogImportContext.Provider>
  );
};

export const useCatalogImport = (): CatalogImportContextValue => {
  const ctx = useContext(CatalogImportContext);
  if (!ctx) throw new Error("useCatalogImport must be used within CatalogImportProvider");
  return ctx;
};
