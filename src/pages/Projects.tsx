import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Database } from "@/integrations/supabase/types";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Plus, FolderArchive, Briefcase, Sparkles, Download } from "lucide-react";
import { toast } from "sonner";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { ProjectProposals } from "@/components/projects/ProjectProposals";
import { ProjectsFilters } from "@/components/projects/ProjectsFilters";
import { ProjectsTable } from "@/components/projects/ProjectsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filterAndSortProjects } from "@/lib/projectsListFilter";
import { exportProjectsToExcel } from "@/lib/exportUtils";

type ProjectStatus = Database["public"]["Enums"]["project_status"];
type ProjectType = Database["public"]["Enums"]["project_type"];

interface Project {
  id: string;
  project_number: string;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  property_id: string;
  start_date: string | null;
  end_date: string | null;
  year: number;
  start_quarter: number;
  budget: number;
  forecast: number;
  actual_cost: number;
  is_archived: boolean;
  updated_at: string;
  property: {
    name: string;
  };
}

export default function Projects() {
  const { user, loading: authLoading } = useAuth();
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const PROJECT_TABS = ["active", "proposals", "archived"] as const;
  type ProjectTab = (typeof PROJECT_TABS)[number];
  const tabFromUrl = searchParams.get("tab");
  const activeTab: ProjectTab =
    tabFromUrl && (PROJECT_TABS as readonly string[]).includes(tabFromUrl)
      ? (tabFromUrl as ProjectTab)
      : "active";

  const setActiveTab = (tab: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        // keep unrelated params (e.g. edit) but drop empty noise
        return next;
      },
      { replace: true },
    );
  };

  const [sortField, setSortField] = useState<string>("updated_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [editingCell, setEditingCell] = useState<{ projectId: string; field: string } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tempValue, setTempValue] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const orgId = organization?.id;
  const editId = searchParams.get("edit");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (!user || !orgId) return;

    let cancelled = false;
    (async () => {
      await Promise.all([
        fetchProjects(activeTab === "archived", { quiet: initialLoadDone }),
        fetchProperties(),
      ]);
      if (!cancelled) setInitialLoadDone(true);
    })();

    return () => {
      cancelled = true;
    };
    // organization object identity must not be a dep — use orgId only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, navigate, activeTab, orgId]);

  useEffect(() => {
    if (user && orgId && editId && !formDialogOpen) {
      void handleEditFromUrl(editId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, orgId, editId, formDialogOpen]);

  const handleEditFromUrl = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select(`*, property:properties(name)`)
        .eq("id", projectId)
        .single();

      if (error) throw error;

      setEditingProject(data as unknown as Project);
      setFormDialogOpen(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          return next;
        },
        { replace: true },
      );
    } catch {
      toast.error("Kunde inte hämta projekt för redigering");
    }
  };

  const fetchProjects = async (
    archived = false,
    opts: { quiet?: boolean } = {},
  ) => {
    if (!organization?.id) return;

    if (!opts.quiet) setLoading(true);
    try {
      const { data: orgProperties, error: propError } = await supabase
        .from("properties")
        .select("id")
        .eq("organization_id", organization.id);

      if (propError) throw propError;

      const propertyIds = orgProperties?.map((p) => p.id) || [];

      if (propertyIds.length === 0) {
        setProjects([]);
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .select(`*, property:properties(name)`)
        .in("property_id", propertyIds)
        .eq("is_archived", archived)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setProjects((data as unknown as Project[]) || []);
    } catch {
      toast.error("Kunde inte hämta projekt");
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    if (!organization?.id) return;

    const { data } = await supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("name");
    setProperties(data || []);
  };

  const updateProject = async (projectId: string, field: string, value: unknown) => {
    setUpdating(true);
    try {
      const updateData: Record<string, unknown> = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("projects")
        .update(updateData)
        .eq("id", projectId);

      if (error) throw error;

      setProjects(
        projects.map((p) =>
          p.id === projectId ? ({ ...p, [field]: value } as Project) : p,
        ),
      );

      toast.success("Projektet uppdaterades");
    } catch {
      toast.error("Kunde inte uppdatera projektet");
    } finally {
      setUpdating(false);
      setEditingCell(null);
      setTempValue(null);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startEditing = (projectId: string, field: string, currentValue: any) => {
    setEditingCell({ projectId, field });
    setTempValue(currentValue);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setTempValue(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, projectId: string, field: string) => {
    if (e.key === "Enter" && tempValue !== null) {
      updateProject(projectId, field, tempValue);
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredProjects = useMemo(
    () =>
      filterAndSortProjects(projects as Parameters<typeof filterAndSortProjects>[0], {
        searchQuery,
        statusFilter,
        typeFilter,
        propertyFilter,
        sortField,
        sortDirection,
      }) as Project[],
    [projects, searchQuery, statusFilter, typeFilter, propertyFilter, sortField, sortDirection],
  );

  const [exporting, setExporting] = useState(false);

  const handleExportExcel = async () => {
    const rows = filteredProjects.length > 0 ? filteredProjects : projects;
    if (rows.length === 0) {
      toast.error("Inga projekt att exportera");
      return;
    }
    setExporting(true);
    try {
      await exportProjectsToExcel(
        rows.map((p) => ({
          project_number: p.project_number,
          name: p.name,
          type: p.type,
          status: p.status,
          property_name: p.property?.name ?? null,
          year: p.year,
          start_quarter: p.start_quarter,
          start_date: p.start_date,
          end_date: p.end_date,
          budget: p.budget,
          forecast: p.forecast,
          actual_cost: p.actual_cost,
          description: p.description,
        })),
      );
      toast.success(`${rows.length} projekt exporterade`);
    } catch {
      toast.error("Kunde inte exportera projekt");
    } finally {
      setExporting(false);
    }
  };

  const tableProps = {
    projects: filteredProjects,
    totalUnfilteredCount: projects.length,
    sortField,
    sortDirection,
    onSort: handleSort,
    editingCell,
    tempValue,
    setTempValue,
    updating,
    onStartEditing: startEditing,
    onUpdateProject: updateProject,
    onKeyDown: handleKeyDown,
    onRowClick: (id: string) =>
      navigate(`/projects/${id}`, { state: { fromProjectsTab: activeTab } }),
    onEditClick: (project: Project) => {
      setEditingProject(project);
      setFormDialogOpen(true);
    },
  };

  if (authLoading || (!initialLoadDone && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Projekthantering</h1>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <TabsList>
                    <TabsTrigger value="active">Aktiva projekt</TabsTrigger>
                    <TabsTrigger value="proposals" className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Förslag
                    </TabsTrigger>
                    <TabsTrigger value="archived">Arkiverade</TabsTrigger>
                  </TabsList>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void handleExportExcel()}
                      disabled={exporting}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exporting ? "Exporterar..." : "Exportera XLSX"}
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingProject(null);
                        setFormDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Nytt projekt
                    </Button>
                  </div>
                </div>

                <TabsContent value="proposals" className="space-y-6">
                  <ProjectProposals />
                </TabsContent>

                <TabsContent value="active" className="space-y-6">
                  <ProjectsFilters
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    statusFilter={statusFilter}
                    onStatusChange={setStatusFilter}
                    typeFilter={typeFilter}
                    onTypeChange={setTypeFilter}
                    propertyFilter={propertyFilter}
                    onPropertyChange={setPropertyFilter}
                    properties={properties}
                  />
                  <ProjectsTable {...tableProps} />
                </TabsContent>

                <TabsContent value="archived" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <FolderArchive className="h-4 w-4" />
                        Arkiverade projekt
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <ProjectsTable
                    {...tableProps}
                    archived
                    emptyTitle="Inga arkiverade projekt"
                    emptyDescription=""
                    emptyIcon="archive"
                  />
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </SidebarInset>
      </div>

      <ProjectFormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) setEditingProject(null);
        }}
        onSuccess={() => {
          fetchProjects(activeTab === "archived");
          setEditingProject(null);
        }}
        editingProject={editingProject}
      />
    </SidebarProvider>
  );
}
