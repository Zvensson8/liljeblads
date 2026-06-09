import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProject, useUpdateProject } from "@/hooks/useProjects";
import { useLogProjectActivity } from "@/hooks/useProjectActivityLog";
import { Database } from "@/integrations/supabase/types";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Briefcase,
  Edit,
  Archive,
  RefreshCw,
  Download,
  Home,
  Building2,
} from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { ProjectCostManagement } from "@/components/projects/ProjectCostManagement";
import { ProjectChecklistManagement } from "@/components/projects/ProjectChecklistManagement";
import { ProjectDocuments } from "@/components/projects/ProjectDocuments";
import { ProjectSimulation } from "@/components/projects/ProjectSimulation";
import { ProjectActivityLog } from "@/components/projects/ProjectActivityLog";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { ProjectEconomyOverview } from "@/components/projects/ProjectEconomyOverview";
import { ProjectReportButton } from "@/components/projects/ProjectReportButton";
import { ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu";
import { ProjectQuickStatus } from "@/components/projects/ProjectQuickStatus";
import { ProjectOverviewTab } from "@/components/projects/ProjectOverviewTab";
import { ProjectWorkOrders } from "@/components/projects/ProjectWorkOrders";
import { ProjectOrderPreviewSheet } from "@/components/projects/ProjectOrderPreviewSheet";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useRecentlyVisited } from "@/hooks/useRecentlyVisited";
import { exportProjectToZip } from "@/lib/zipExport";
import { useIsMobile } from "@/hooks/use-mobile";

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
  budget: number;
  forecast: number;
  actual_cost: number;
  is_archived: boolean;
  project_manager: string | null;
  actors: string[] | null;
  created_at: string;
  updated_at: string;
  property: {
    name: string;
  };
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [orderPreviewOpen, setOrderPreviewOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const { addRecentItem } = useRecentlyVisited();
  const isMobile = useIsMobile();

  const activeTab = searchParams.get("tab") || "overview";

  const {
    data: projectData,
    isLoading: projectLoading,
    error: projectError,
    refetch: refetchProject,
  } = useProject(id);
  const project = projectData as Project | null;
  const loading = projectLoading;

  const updateProject = useUpdateProject();
  const logActivity = useLogProjectActivity();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (projectError) {
      toast.error("Kunde inte hämta projekt");
      navigate("/projects");
    }
  }, [projectError, navigate]);

  useEffect(() => {
    if (project) {
      addRecentItem({
        id: project.id,
        type: "project",
        title: project.name,
        path: `/projects/${project.id}`,
      });
    }
  }, [project]);

  const fetchProject = () => {
    refetchProject();
  };

  const handleArchive = async () => {
    if (!project) return;

    try {
      await updateProject.mutateAsync({
        id: project.id,
        patch: { is_archived: true, status: "avslutat" },
      });
      await logActivity.mutateAsync({
        project_id: project.id,
        activity_type: "status_change",
        description: "Projekt arkiverat",
      });
      toast.success("Projekt arkiverat");
      navigate("/projects");
    } catch (error: any) {
      toast.error("Kunde inte arkivera projekt");
    }
  };

  const handleReactivate = async () => {
    if (!project) return;

    try {
      await updateProject.mutateAsync({
        id: project.id,
        patch: { is_archived: false },
      });
      await logActivity.mutateAsync({
        project_id: project.id,
        activity_type: "status_change",
        description: "Projekt återaktiverat",
      });
      toast.success("Projekt återaktiverat");
      fetchProject();
    } catch (error: any) {
      toast.error("Kunde inte återaktivera projekt");
    }
  };

  const handleExport = async () => {
    if (!project) return;
    
    setExporting(true);
    try {
      await exportProjectToZip(project.id);
      toast.success("Projekt exporterat");
    } catch (error: any) {
      toast.error(error.message || "Kunde inte exportera projekt");
    } finally {
      setExporting(false);
    }
  };

  const handleOpenOrderPreview = () => {
    setOrderPreviewOpen(true);
  };

  const getStatusBadge = (status: ProjectStatus) => {
    const statusConfig = {
      planerat: { label: "Planerat", className: "bg-gray-500" },
      invantar_offert: { label: "Inväntar offert", className: "bg-yellow-500" },
      offert_finns: { label: "Offert finns", className: "bg-blue-500" },
      pagaende: { label: "Pågående", className: "bg-green-500" },
      pausat: { label: "Pausat", className: "bg-orange-500" },
      avslutat: { label: "Avslutat", className: "bg-gray-700" },
    };
    const config = statusConfig[status];
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getTypeBadge = (type: ProjectType) => {
    const typeConfig = {
      investering: { label: "Investering", className: "bg-purple-500" },
      underhall: { label: "Underhåll", className: "bg-blue-500" },
      energi: { label: "Energi", className: "bg-green-500" },
      annat: { label: "Annat", className: "bg-gray-500" },
    };
    const config = typeConfig[type];
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const variance = project.budget > 0
    ? ((project.actual_cost - project.budget) / project.budget) * 100
    : 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <Breadcrumb className="py-3">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/" className="flex items-center gap-1">
                    <Home className="h-3 w-3" />
                    Dashboard
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href={`/properties/${project.property_id}`} className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {project.property.name}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/projects">Projekt</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{project.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex h-12 items-center gap-4">
            <SidebarTrigger className="hidden md:flex" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/projects")}
              className="hidden sm:flex"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka
            </Button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Briefcase className="h-5 w-5 text-primary flex-shrink-0" />
              <h1 className="text-lg md:text-xl font-semibold truncate">{project.name}</h1>
              <ProjectQuickStatus
                projectId={project.id}
                currentStatus={project.status}
                onStatusChange={fetchProject}
              />
              {project.is_archived && (
                <Badge variant="outline" className="bg-gray-400">
                  Arkiverat
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                <Edit className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Redigera</span>
              </Button>
              <ProjectActionsMenu
                isArchived={project.is_archived}
                exporting={exporting}
                sendingDraft={false}
                onExport={handleExport}
                onSendDraft={handleOpenOrderPreview}
                onArchive={handleArchive}
                onReactivate={handleReactivate}
                onGenerateReport={() => setReportDialogOpen(true)}
              />
            </div>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Clickable KPI Cards - 2x2 on mobile, 4-col on desktop */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSearchParams({ tab: "economy" })}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                      Budget
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl md:text-2xl font-bold">
                      {(project.budget / 1000).toFixed(0)}k
                    </p>
                  </CardContent>
                </Card>

                <Card 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSearchParams({ tab: "simulation" })}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                      Prognos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl md:text-2xl font-bold">
                      {(project.forecast / 1000).toFixed(0)}k
                    </p>
                  </CardContent>
                </Card>

                <Card 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSearchParams({ tab: "economy" })}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                      Utfall
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl md:text-2xl font-bold">
                      {(project.actual_cost / 1000).toFixed(0)}k
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                      Avvikelse
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-xl md:text-2xl font-bold ${
                        variance > 10
                          ? "text-red-600"
                          : variance > 0
                          ? "text-yellow-600"
                          : "text-green-600"
                      }`}
                    >
                      {variance !== 0
                        ? `${variance > 0 ? "+" : ""}${variance.toFixed(1)}%`
                        : "0%"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Main Content Tabs */}
              <Tabs 
                value={activeTab} 
                onValueChange={(value) => setSearchParams({ tab: value })} 
                className="w-full"
              >
                <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                  <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-8">
                    <TabsTrigger value="overview">Översikt</TabsTrigger>
                    <TabsTrigger value="info">Information</TabsTrigger>
                    <TabsTrigger value="economy">Ekonomi</TabsTrigger>
                    <TabsTrigger value="work-orders">Arbetsordrar</TabsTrigger>
                    <TabsTrigger value="simulation">Simulering</TabsTrigger>
                    <TabsTrigger value="documents">Dokument</TabsTrigger>
                    <TabsTrigger value="checklist">Checklista</TabsTrigger>
                    <TabsTrigger value="activity">Aktivitet</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="overview" className="space-y-4">
                  <ProjectOverviewTab 
                    project={project}
                    onNavigate={(tab) => setSearchParams({ tab })}
                  />
                </TabsContent>

                <TabsContent value="info" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Projektinformation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Projektnummer
                          </p>
                          <p className="text-base">{project.project_number}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Fastighet
                          </p>
                          <p className="text-base">{project.property.name}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Typ
                          </p>
                          <div className="mt-1">{getTypeBadge(project.type)}</div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Projektledare
                          </p>
                          <p className="text-base">
                            {project.project_manager || "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Startdatum
                          </p>
                          <p className="text-base">
                            {project.start_date
                              ? format(new Date(project.start_date), "PPP", {
                                  locale: sv,
                                })
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            Slutdatum
                          </p>
                          <p className="text-base">
                            {project.end_date
                              ? format(new Date(project.end_date), "PPP", {
                                  locale: sv,
                                })
                              : "-"}
                          </p>
                        </div>
                      </div>

                      {project.description && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">
                            Beskrivning
                          </p>
                          <p className="text-base">{project.description}</p>
                        </div>
                      )}

                      {project.actors && project.actors.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">
                            Aktörer
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {project.actors.map((actor, index) => (
                              <Badge key={index} variant="secondary">
                                {actor}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="economy" className="space-y-4">
                  <ProjectEconomyOverview
                    projectId={project.id}
                    budget={project.budget}
                    forecast={project.forecast}
                    actualCost={project.actual_cost}
                    onUpdate={fetchProject}
                  />
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Kostnadshantering</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProjectCostManagement
                        projectId={project.id}
                        onCostUpdate={fetchProject}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="work-orders">
                  <Card>
                    <CardHeader>
                      <CardTitle>Arbetsordrar</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProjectWorkOrders
                        projectId={project.id}
                        propertyId={project.property_id}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="simulation">
                  <Card>
                    <CardHeader>
                      <CardTitle>Ekonomisimulering</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProjectSimulation
                        projectId={project.id}
                        currentBudget={project.budget}
                        currentForecast={project.forecast}
                        currentActualCost={project.actual_cost}
                        onApply={async (newForecast) => {
                          try {
                            const { error } = await supabase
                              .from("projects")
                              .update({ forecast: newForecast })
                              .eq("id", project.id);

                            if (error) throw error;

                            toast.success("Prognos uppdaterad från simulering");
                            fetchProject();
                          } catch (error: any) {
                            toast.error("Kunde inte uppdatera prognos");
                          }
                        }}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="documents">
                  <Card>
                    <CardHeader>
                      <CardTitle>Dokument</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProjectDocuments 
                        projectId={project.id} 
                        onDocumentUpload={fetchProject}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="checklist">
                  <Card>
                    <CardHeader>
                      <CardTitle>Checklista</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProjectChecklistManagement 
                        projectId={project.id}
                        propertyId={project.property_id}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="activity">
                  <Card>
                    <CardHeader>
                      <CardTitle>Aktivitetslogg</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProjectActivityLog projectId={project.id} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </SidebarInset>
      </div>

      <ProjectFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={fetchProject}
        editingProject={project}
      />

      <ProjectOrderPreviewSheet
        open={orderPreviewOpen}
        onOpenChange={setOrderPreviewOpen}
        project={project}
      />
    </SidebarProvider>
  );
}
