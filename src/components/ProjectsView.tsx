import { useState, useMemo, useCallback } from "react";
import { FolderOpen, Trash2, X, Music, Users, Building2, Edit2, Check, MoreVertical, Download, ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useProjects, Project, PIPELINE_STATUSES, PipelineStatus } from "@/hooks/useProjects";
import { useToast } from "@/hooks/use-toast";

interface ProjectsViewProps {
  onClose: () => void;
  onSearchSong?: (query: string) => void;
}

export const ProjectsView = ({ onClose, onSearchSong }: ProjectsViewProps) => {
  const { projects, deleteProject, renameProject, setPipelineStatus, removeSongFromProject, getProjectStats, exportLeadSheet } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    projects[0]?.id || null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | null>(null);
  const { toast } = useToast();

  const filteredProjects = useMemo(() => {
    if (!statusFilter) return projects;
    return projects.filter((p) => p.pipelineStatus === statusFilter);
  }, [projects, statusFilter]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const stats = useMemo(
    () => (selectedProject ? getProjectStats(selectedProject) : null),
    [selectedProject, getProjectStats]
  );

  const handleStartEdit = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
  };

  const handleSaveEdit = () => {
    if (editingId && editName.trim()) {
      renameProject(editingId, editName);
    }
    setEditingId(null);
    setEditName("");
  };

  const handleDeleteProject = (projectId: string) => {
    deleteProject(projectId);
    if (selectedProjectId === projectId) {
      setSelectedProjectId(projects.find((p) => p.id !== projectId)?.id || null);
    }
  };

  const handleExportLeadSheet = useCallback((project: Project) => {
    const csvContent = exportLeadSheet(project);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PubCheck_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_LeadSheet.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Lead sheet exported", description: `${project.songs.length} songs exported to CSV.` });
  }, [exportLeadSheet, toast]);

  const getSigningStatusColor = (d?: string) => {
    switch (d) {
      case "high": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
      case "medium": return "bg-yellow-500/15 text-yellow-400 border-yellow-500/25";
      case "low": return "bg-red-500/15 text-red-400 border-red-500/25";
      default: return "bg-secondary text-muted-foreground";
    }
  };

  const getPublishingMixColor = (mix?: string) => {
    switch (mix) {
      case "indie": return "bg-emerald-500/10 text-emerald-400";
      case "major": return "bg-purple-500/10 text-purple-400";
      case "mixed": return "bg-blue-500/10 text-blue-400";
      default: return "bg-secondary text-muted-foreground";
    }
  };

  const getPipelineStatusConfig = (status: PipelineStatus) => {
    return PIPELINE_STATUSES.find((s) => s.value === status) || PIPELINE_STATUSES[0];
  };

  return (
    <div className="glass rounded-xl overflow-hidden animate-fade-up">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary" />
          Projects
        </h3>
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex min-h-[400px] max-h-[600px]">
        {/* Project list - left panel */}
        <div className="w-52 sm:w-64 border-r border-border/50 flex flex-col">
          {/* Filter bar */}
          <div className="p-2 border-b border-border/50 flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-muted-foreground" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 flex-1">
                  {statusFilter ? getPipelineStatusConfig(statusFilter).label : "All Stages"}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem onClick={() => setStatusFilter(null)}>
                  All Stages
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {PIPELINE_STATUSES.map((status) => (
                  <DropdownMenuItem
                    key={status.value}
                    onClick={() => setStatusFilter(status.value)}
                  >
                    <Badge variant="outline" className={`text-[10px] mr-2 ${status.color}`}>
                      •
                    </Badge>
                    {status.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {filteredProjects.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2 text-center">
                  {projects.length === 0
                    ? "No projects yet. Add songs from search results to create one."
                    : "No projects match this filter."}
                </p>
              ) : (
                filteredProjects.map((project) => {
                  const statusConfig = getPipelineStatusConfig(project.pipelineStatus);
                  return (
                    <div
                      key={project.id}
                      className={`group flex items-center gap-1 rounded-md transition-colors ${
                        selectedProjectId === project.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent text-foreground"
                      }`}
                    >
                      {editingId === project.id ? (
                        <div className="flex-1 flex items-center gap-1 p-1">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-7 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6"
                            onClick={handleSaveEdit}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setSelectedProjectId(project.id)}
                            className="flex-1 text-left px-2 py-1.5 min-w-0"
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.color.split(' ')[0]}`}
                              />
                              <span className="text-sm truncate">{project.name}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                ({project.songs.length})
                              </span>
                            </div>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              >
                                <MoreVertical className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => handleStartEdit(project)}>
                                <Edit2 className="w-3 h-3 mr-2" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleExportLeadSheet(project)}>
                                <Download className="w-3 h-3 mr-2" /> Export Lead Sheet
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteProject(project.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="w-3 h-3 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Songs list - right panel */}
        <div className="flex-1 flex flex-col">
          {selectedProject && stats ? (
            <>
              {/* Project header with status */}
              <div className="p-3 border-b border-border/50 bg-secondary/30">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="font-medium text-sm text-foreground truncate">
                    {selectedProject.name}
                  </h4>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`h-7 text-[10px] gap-1 ${getPipelineStatusConfig(selectedProject.pipelineStatus).color}`}
                      >
                        {getPipelineStatusConfig(selectedProject.pipelineStatus).label}
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      {PIPELINE_STATUSES.map((status) => (
                        <DropdownMenuItem
                          key={status.value}
                          onClick={() => setPipelineStatus(selectedProject.id, status.value)}
                        >
                          <Badge variant="outline" className={`text-[10px] mr-2 ${status.color}`}>
                            •
                          </Badge>
                          {status.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-foreground font-medium">{stats.songCount}</span>
                    <span className="text-muted-foreground">songs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-foreground font-medium">{stats.avgWriters}</span>
                    <span className="text-muted-foreground">avg writers</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-foreground font-medium">{stats.avgPublishers}</span>
                    <span className="text-muted-foreground">avg publishers</span>
                  </div>
                </div>
                {(stats.dealabilityBreakdown.high > 0 || stats.dealabilityBreakdown.medium > 0 || stats.dealabilityBreakdown.low > 0) && (
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className={`text-[10px] ${getDealabilityColor("high")}`}>
                      {stats.dealabilityBreakdown.high} High
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${getDealabilityColor("medium")}`}>
                      {stats.dealabilityBreakdown.medium} Med
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${getDealabilityColor("low")}`}>
                      {stats.dealabilityBreakdown.low} Low
                    </Badge>
                  </div>
                )}
                {stats.topLabels.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground mb-1">Top labels:</p>
                    <div className="flex flex-wrap gap-1">
                      {stats.topLabels.map((l) => (
                        <Badge key={l.name} variant="outline" className="text-[10px]">
                          {l.name} ({l.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Export button */}
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleExportLeadSheet(selectedProject)}
                    disabled={selectedProject.songs.length === 0}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Lead Sheet
                  </Button>
                </div>
              </div>

              {/* Songs */}
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {selectedProject.songs.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-4 text-center">
                      No songs in this project yet. Search for songs and click "Add to Project".
                    </p>
                  ) : (
                    selectedProject.songs.map((song) => (
                      <div
                        key={song.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
                      >
                        {song.coverUrl ? (
                          <img
                            src={song.coverUrl}
                            alt=""
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center">
                            <Music className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => onSearchSong?.(`${song.artist} - ${song.title}`)}
                            className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block text-left"
                          >
                            {song.title}
                          </button>
                          <p className="text-xs text-muted-foreground truncate">
                            {song.artist}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {song.publishingMix && (
                            <Badge variant="outline" className={`text-[10px] ${getPublishingMixColor(song.publishingMix)}`}>
                              {song.publishingMix}
                            </Badge>
                          )}
                          {song.dealability && (
                            <Badge variant="outline" className={`text-[10px] ${getDealabilityColor(song.dealability)}`}>
                              {song.dealability}
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                            onClick={() => removeSongFromProject(selectedProject.id, song.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a project to view songs
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
