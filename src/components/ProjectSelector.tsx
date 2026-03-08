import { useState, useCallback } from "react";
import { FolderPlus, Plus, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Project, ProjectSong, useProjects } from "@/hooks/useProjects";

interface ProjectSelectorProps {
  song: Omit<ProjectSong, "id" | "addedAt">;
  variant?: "button" | "icon";
}

export const ProjectSelector = ({ song, variant = "button" }: ProjectSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const { toast } = useToast();
  const { projects, createProject, addSongToProject } = useProjects();

  const handleAddToProject = useCallback(
    (projectId: string, projectName: string) => {
      addSongToProject(projectId, song);
      toast({
        title: "Added to project",
        description: `"${song.title}" added to "${projectName}"`,
      });
      setOpen(false);
    },
    [addSongToProject, song, toast]
  );

  const handleCreateAndAdd = useCallback(() => {
    if (!newProjectName.trim()) return;
    const project = createProject(newProjectName);
    addSongToProject(project.id, song);
    toast({
      title: "Project created",
      description: `"${song.title}" added to "${project.name}"`,
    });
    setNewProjectName("");
    setShowNewInput(false);
    setOpen(false);
  }, [newProjectName, createProject, addSongToProject, song, toast]);

  const isSongInProject = (project: Project) => {
    return project.songs.some(
      (s) =>
        s.title.toLowerCase() === song.title.toLowerCase() &&
        s.artist.toLowerCase() === song.artist.toLowerCase()
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <FolderPlus className="w-4 h-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <FolderPlus className="w-3.5 h-3.5" />
            Add to Project
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">
            Add to project
          </p>

          {projects.length === 0 && !showNewInput && (
            <p className="text-xs text-muted-foreground px-2 py-2">
              No projects yet. Create one below.
            </p>
          )}

          {projects.map((project) => {
            const inProject = isSongInProject(project);
            return (
              <button
                key={project.id}
                onClick={() =>
                  !inProject && handleAddToProject(project.id, project.name)
                }
                disabled={inProject}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between ${
                  inProject
                    ? "text-muted-foreground bg-secondary/50 cursor-not-allowed"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <span className="truncate">{project.name}</span>
                {inProject && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            );
          })}

          <div className="border-t border-border/50 pt-1 mt-1">
            {showNewInput ? (
              <div className="flex gap-1.5 px-1">
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name..."
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateAndAdd();
                    if (e.key === "Escape") {
                      setShowNewInput(false);
                      setNewProjectName("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 px-2"
                  onClick={handleCreateAndAdd}
                  disabled={!newProjectName.trim()}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewInput(true)}
                className="w-full text-left px-2 py-1.5 rounded-md text-sm text-primary hover:bg-primary/10 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Create new project
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
