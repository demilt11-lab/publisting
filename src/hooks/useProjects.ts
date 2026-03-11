import { useState, useCallback, useEffect } from "react";

export type PipelineStatus = "scouting" | "shortlisted" | "in-talks" | "closed" | "passed";

export const PIPELINE_STATUSES: { value: PipelineStatus; label: string; color: string }[] = [
  { value: "scouting", label: "Scouting", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "shortlisted", label: "Shortlisted", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { value: "in-talks", label: "In Talks", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { value: "closed", label: "Closed / Signed", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "passed", label: "Passed", color: "bg-red-500/20 text-red-400 border-red-500/30" },
];

export interface ProjectSong {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  genre?: string;
  region?: string;
  writersCount?: number;
  publishersCount?: number;
  publishingMix?: "indie" | "mixed" | "major";
  labelType?: "indie" | "major";
  signingStatus?: "high" | "medium" | "low";
  recordLabel?: string;
  addedAt: number;
  // Extended fields for lead sheet
  primaryWriter?: string;
  primaryWriterPro?: string;
  primaryWriterIpi?: string;
  secondaryWriter?: string;
  mainPublisher?: string;
  mainPublisherPro?: string;
}

export interface Project {
  id: string;
  name: string;
  songs: ProjectSong[];
  pipelineStatus: PipelineStatus;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "pubcheck-projects";
const MAX_PROJECTS = 50;

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const projects = raw ? JSON.parse(raw) : [];
    // Migrate old projects without pipelineStatus
    return projects.map((p: any) => ({
      ...p,
      pipelineStatus: p.pipelineStatus || "scouting",
    }));
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(loadProjects);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  const createProject = useCallback((name: string): Project => {
    const newProject: Project = {
      id: generateId(),
      name: name.trim(),
      songs: [],
      pipelineStatus: "scouting",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setProjects((prev) => [newProject, ...prev].slice(0, MAX_PROJECTS));
    return newProject;
  }, []);

  const deleteProject = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }, []);

  const renameProject = useCallback((projectId: string, newName: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, name: newName.trim(), updatedAt: Date.now() }
          : p
      )
    );
  }, []);

  const setPipelineStatus = useCallback((projectId: string, status: PipelineStatus) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, pipelineStatus: status, updatedAt: Date.now() }
          : p
      )
    );
  }, []);

  const addSongToProject = useCallback(
    (projectId: string, song: Omit<ProjectSong, "id" | "addedAt">) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          const exists = p.songs.some(
            (s) =>
              s.title.toLowerCase() === song.title.toLowerCase() &&
              s.artist.toLowerCase() === song.artist.toLowerCase()
          );
          if (exists) return p;
          const newSong: ProjectSong = {
            ...song,
            id: generateId(),
            addedAt: Date.now(),
          };
          return { ...p, songs: [...p.songs, newSong], updatedAt: Date.now() };
        })
      );
    },
    []
  );

  const removeSongFromProject = useCallback(
    (projectId: string, songId: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                songs: p.songs.filter((s) => s.id !== songId),
                updatedAt: Date.now(),
              }
            : p
        )
      );
    },
    []
  );

  const getProjectStats = useCallback((project: Project) => {
    const songs = project.songs;
    if (songs.length === 0) {
      return {
        songCount: 0,
        avgWriters: 0,
        avgPublishers: 0,
        signingStatusBreakdown: { high: 0, medium: 0, low: 0 },
        topLabels: [] as { name: string; count: number }[],
        topPublishingMix: null as string | null,
      };
    }

    const avgWriters =
      songs.reduce((sum, s) => sum + (s.writersCount || 0), 0) / songs.length;
    const avgPublishers =
      songs.reduce((sum, s) => sum + (s.publishersCount || 0), 0) / songs.length;

    const signingStatusBreakdown = {
      high: songs.filter((s) => s.signingStatus === "high").length,
      medium: songs.filter((s) => s.signingStatus === "medium").length,
      low: songs.filter((s) => s.signingStatus === "low").length,
    };

    const labelCounts = new Map<string, number>();
    songs.forEach((s) => {
      if (s.recordLabel) {
        labelCounts.set(
          s.recordLabel,
          (labelCounts.get(s.recordLabel) || 0) + 1
        );
      }
    });
    const topLabels = Array.from(labelCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const mixCounts = { indie: 0, mixed: 0, major: 0 };
    songs.forEach((s) => {
      if (s.publishingMix) mixCounts[s.publishingMix]++;
    });
    const topMix = Object.entries(mixCounts).sort((a, b) => b[1] - a[1])[0];
    const topPublishingMix = topMix && topMix[1] > 0 ? topMix[0] : null;

    return {
      songCount: songs.length,
      avgWriters: Math.round(avgWriters * 10) / 10,
      avgPublishers: Math.round(avgPublishers * 10) / 10,
      dealabilityBreakdown,
      topLabels,
      topPublishingMix,
    };
  }, []);

  const exportLeadSheet = useCallback((project: Project): string => {
    const headers = [
      "Project Name",
      "Pipeline Status",
      "Song Title",
      "Primary Artist",
      "Primary Writer",
      "Primary Writer PRO",
      "Primary Writer IPI",
      "Secondary Writer",
      "Main Publisher/Admin",
      "Main Publisher PRO",
      "Record Label",
      "Dealability",
      "Publishing Mix",
      "Label Type",
      "Writers Count",
      "Publishers Count",
      "Status",
    ];

    const statusLabel = PIPELINE_STATUSES.find(s => s.value === project.pipelineStatus)?.label || project.pipelineStatus;

    const rows = project.songs.map((song) => [
      project.name,
      statusLabel,
      song.title,
      song.artist,
      song.primaryWriter || "",
      song.primaryWriterPro || "",
      song.primaryWriterIpi || "",
      song.secondaryWriter || "",
      song.mainPublisher || "",
      song.mainPublisherPro || "",
      song.recordLabel || "",
      song.dealability ? song.dealability.charAt(0).toUpperCase() + song.dealability.slice(1) : "",
      song.publishingMix ? (song.publishingMix === "indie" ? "Mostly Indie" : song.publishingMix === "major" ? "Mostly Major" : "Mixed") : "",
      song.labelType ? (song.labelType === "indie" ? "Indie" : "Major") : "",
      song.writersCount?.toString() || "",
      song.publishersCount?.toString() || "",
      "Not contacted",
    ]);

    const BOM = "\uFEFF";
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => {
          const escaped = String(cell).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(",")
      ),
    ].join("\n");

    return BOM + csvContent;
  }, []);

  return {
    projects,
    createProject,
    deleteProject,
    renameProject,
    setPipelineStatus,
    addSongToProject,
    removeSongFromProject,
    getProjectStats,
    exportLeadSheet,
  };
}
