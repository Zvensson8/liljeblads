import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useRecentlyVisited } from "@/hooks/useRecentlyVisited";
import { exportProjectToZip } from "@/lib/zipExport";

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
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { addRecentItem } = useRecentlyVisited();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (user && id) {
      fetchProject();
    }
  }, [user, authLoading, id, navigate]);

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

  const fetchProject = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .select(`
          *,
          property:properties(name)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setProject(data as any);
    } catch (error: any) {
      toast.error("Kunde inte hämta projekt");
      navigate("/projects");
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!project) return;

    try {
      const { error } = await supabase
        .from("projects")
        .update({ is_archived: true, status: "avslutat" })
        .eq("id", project.id);

      if (error) throw error;

      toast.success("Projekt arkiverat");
      navigate("/projects");
    } catch (error: any) {
      toast.error("Kunde inte arkivera projekt");
    }
  };

  const handleReactivate = async () => {
    if (!project) return;

    try {
      const { error } = await supabase
        .from("projects")
        .update({ is_archived: false })
        .eq("id", project.id);

      if (error) throw error;

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
            <SidebarTrigger />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/projects")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka
            </Button>
            <div className="flex items-center gap-2 flex-1">
              <Briefcase className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">{project.name}</h1>
              {getStatusBadge(project.status)}
              {project.is_archived && (
                <Badge variant="outline" className="bg-gray-400">
                  Arkiverat
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Redigera
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? "Exporterar..." : "Exportera"}
              </Button>
              {project.is_archived ? (
                <Button variant="outline" size="sm" onClick={handleReactivate}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Återaktivera
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleArchive}>
                  <Archive className="h-4 w-4 mr-2" />
                  Arkivera
                </Button>
              )}
            </div>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Project Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Budget
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {project.budget.toLocaleString("sv-SE")} kr
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Prognos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {project.forecast.toLocaleString("sv-SE")} kr
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Utfall
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {project.actual_cost.toLocaleString("sv-SE")} kr
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Avvikelse
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${
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
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="info">Information</TabsTrigger>
                  <TabsTrigger value="economy">Ekonomi</TabsTrigger>
                  <TabsTrigger value="simulation">Simulering</TabsTrigger>
                  <TabsTrigger value="documents">Dokument</TabsTrigger>
                  <TabsTrigger value="checklist">Checklista</TabsTrigger>
                  <TabsTrigger value="activity">Aktivitetslogg</TabsTrigger>
                </TabsList>

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

                <TabsContent value="economy">
                  <Card>
                    <CardHeader>
                      <CardTitle>Ekonomi</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProjectCostManagement
                        projectId={project.id}
                        onCostUpdate={fetchProject}
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
                      <ProjectDocuments projectId={project.id} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="checklist">
                  <Card>
                    <CardHeader>
                      <CardTitle>Checklista</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProjectChecklistManagement projectId={project.id} />
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
    </SidebarProvider>
  );
}
