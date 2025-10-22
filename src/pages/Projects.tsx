import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Database } from "@/integrations/supabase/types";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Filter, FolderArchive, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { ProjectDashboard } from "@/components/projects/ProjectDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

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
  updated_at: string;
  property: {
    name: string;
  };
}

export default function Projects() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (user) {
      fetchProjects();
      fetchProperties();
    }
  }, [user, authLoading, navigate]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .select(`
          *,
          property:properties(name)
        `)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setProjects((data as any) || []);
    } catch (error: any) {
      toast.error("Kunde inte hämta projekt");
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    const { data } = await supabase
      .from("properties")
      .select("id, name")
      .order("name");
    setProperties(data || []);
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
      renovering: { label: "Renovering", className: "bg-purple-500" },
      underhall: { label: "Underhåll", className: "bg-blue-500" },
      energi: { label: "Energi", className: "bg-green-500" },
      annat: { label: "Annat", className: "bg-gray-500" },
    };
    const config = typeConfig[type];
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  const getBudgetVarianceColor = (budget: number, actual: number) => {
    if (actual === 0) return "text-muted-foreground";
    const variance = ((actual - budget) / budget) * 100;
    if (variance > 10) return "text-red-600";
    if (variance > 0) return "text-yellow-600";
    return "text-green-600";
  };

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.project_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.property.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    const matchesType = typeFilter === "all" || project.type === typeFilter;
    const matchesProperty = propertyFilter === "all" || project.property_id === propertyFilter;

    return matchesSearch && matchesStatus && matchesType && matchesProperty;
  });

  if (authLoading || loading) {
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
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Projekthantering</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <Tabs defaultValue="active" className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <TabsList>
                    <TabsTrigger value="active">Aktiva projekt</TabsTrigger>
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                  </TabsList>
                  <Button onClick={() => setFormDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nytt projekt
                  </Button>
                </div>

                <TabsContent value="active" className="space-y-6">
                  {/* Filters */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Filter className="h-4 w-4" />
                        Filter & Sökning
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Sök projekt..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                          />
                        </div>

                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Alla status</SelectItem>
                            <SelectItem value="planerat">Planerat</SelectItem>
                            <SelectItem value="invantar_offert">Inväntar offert</SelectItem>
                            <SelectItem value="offert_finns">Offert finns</SelectItem>
                            <SelectItem value="pagaende">Pågående</SelectItem>
                            <SelectItem value="pausat">Pausat</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Typ" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Alla typer</SelectItem>
                            <SelectItem value="renovering">Renovering</SelectItem>
                            <SelectItem value="underhall">Underhåll</SelectItem>
                            <SelectItem value="energi">Energi</SelectItem>
                            <SelectItem value="annat">Annat</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Fastighet" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Alla fastigheter</SelectItem>
                            {properties.map((prop) => (
                              <SelectItem key={prop.id} value={prop.id}>
                                {prop.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Projects Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        Projekt ({filteredProjects.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {filteredProjects.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p className="text-lg mb-2">Inga projekt hittades</p>
                          <p className="text-sm">
                            {projects.length === 0
                              ? "Skapa ditt första projekt för att komma igång"
                              : "Prova att justera filtren"}
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Projektnr</TableHead>
                                <TableHead>Namn</TableHead>
                                <TableHead>Fastighet</TableHead>
                                <TableHead>Typ</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Datum</TableHead>
                                <TableHead className="text-right">Budget</TableHead>
                                <TableHead className="text-right">Utfall</TableHead>
                                <TableHead className="text-right">Avvikelse</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredProjects.map((project) => {
                                const variance = project.budget > 0
                                  ? ((project.actual_cost - project.budget) / project.budget) * 100
                                  : 0;
                                return (
                                  <TableRow
                                    key={project.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => navigate(`/projects/${project.id}`)}
                                  >
                                    <TableCell className="font-medium">
                                      {project.project_number}
                                    </TableCell>
                                    <TableCell>{project.name}</TableCell>
                                    <TableCell>{project.property.name}</TableCell>
                                    <TableCell>{getTypeBadge(project.type)}</TableCell>
                                    <TableCell>{getStatusBadge(project.status)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {project.start_date && project.end_date
                                        ? `${format(new Date(project.start_date), "MMM yy", { locale: sv })} - ${format(new Date(project.end_date), "MMM yy", { locale: sv })}`
                                        : "-"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {project.budget.toLocaleString("sv-SE")} kr
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {project.actual_cost.toLocaleString("sv-SE")} kr
                                    </TableCell>
                                    <TableCell
                                      className={`text-right font-medium ${getBudgetVarianceColor(
                                        project.budget,
                                        project.actual_cost
                                      )}`}
                                    >
                                      {variance !== 0 ? `${variance > 0 ? "+" : ""}${variance.toFixed(1)}%` : "-"}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="dashboard">
                  <ProjectDashboard projects={projects} />
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </SidebarInset>
      </div>

      <ProjectFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        onSuccess={fetchProjects}
      />
    </SidebarProvider>
  );
}
