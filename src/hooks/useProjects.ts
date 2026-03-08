import { useState, useCallback, useEffect } from "react";

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
  dealability?: "high" | "medium" | "low";
  recordLabel?: string;
  addedAt: number;
}

export interface Project {
  id: string;
  name: string;
  songs: ProjectSong[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "pubcheck-projects";
const MAX_PROJECTS = 50;

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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

  const addSongToProject = useCallback(
    (projectId: string, song: Omit<ProjectSong, "id" | "addedAt">) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          // Check if song already exists by title+artist
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
        dealabilityBreakdown: { high: 0, medium: 0, low: 0 },
        topLabels: [] as { name: string; count: number }[],
        topPublishingMix: null as string | null,
      };
    }

    const avgWriters =
      songs.reduce((sum, s) => sum + (s.writersCount || 0), 0) / songs.length;
    const avgPublishers =
      songs.reduce((sum, s) => sum + (s.publishersCount || 0), 0) / songs.length;

    const dealabilityBreakdown = {
      high: songs.filter((s) => s.dealability === "high").length,
      medium: songs.filter((s) => s.dealability === "medium").length,
      low: songs.filter((s) => s.dealability === "low").length,
    };

    // Count labels
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

    // Top publishing mix
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

  return {
    projects,
    createProject,
    deleteProject,
    renameProject,
    addSongToProject,
    removeSongFromProject,
    getProjectStats,
  };
}
