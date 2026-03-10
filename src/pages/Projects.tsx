import { useState, useEffect } from "react";
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
import { Plus, Search, Filter, FolderArchive, Briefcase, Edit, ArrowUpDown, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog";
import { ProjectDashboard } from "@/components/projects/ProjectDashboard";
import { ProjectProposals } from "@/components/projects/ProjectProposals";
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
  const [activeTab, setActiveTab] = useState("overview");
  const [sortField, setSortField] = useState<string>("updated_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [editingCell, setEditingCell] = useState<{ projectId: string; field: string } | null>(null);
  const [tempValue, setTempValue] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (user && organization) {
      fetchProjects(activeTab === "archived");
      fetchProperties();
      
      // Check if we should open edit dialog from URL
      const editId = searchParams.get('edit');
      if (editId && !formDialogOpen) {
        handleEditFromUrl(editId);
      }
    }
  }, [user, authLoading, navigate, activeTab, searchParams, organization]);

  const handleEditFromUrl = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select(`
          *,
          property:properties(name)
        `)
        .eq("id", projectId)
        .single();

      if (error) throw error;
      
      setEditingProject(data as any);
      setFormDialogOpen(true);
      
      // Remove edit parameter from URL
      setSearchParams({});
    } catch (error: any) {
      toast.error("Kunde inte hämta projekt för redigering");
    }
  };

  const fetchProjects = async (archived = false) => {
    if (!organization) return;
    
    setLoading(true);
    try {
      // First get all properties for the organization
      const { data: orgProperties, error: propError } = await supabase
        .from("properties")
        .select("id")
        .eq("organization_id", organization.id);

      if (propError) throw propError;
      
      const propertyIds = orgProperties?.map(p => p.id) || [];
      
      if (propertyIds.length === 0) {
        setProjects([]);
        return;
      }

      // Then get projects for those properties
      const { data, error } = await supabase
        .from("projects")
        .select(`
          *,
          property:properties(name)
        `)
        .in("property_id", propertyIds)
        .eq("is_archived", archived)
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
    if (!organization) return;
    
    const { data } = await supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("name");
    setProperties(data || []);
  };

  const getStatusBadge = (status: ProjectStatus) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      forslag: { label: "Förslag", className: "bg-yellow-500" },
      planerat: { label: "Planerat", className: "bg-gray-500" },
      invantar_offert: { label: "Inväntar offert", className: "bg-yellow-500" },
      offert_finns: { label: "Offert finns", className: "bg-blue-500" },
      pagaende: { label: "Pågående", className: "bg-green-500" },
      pausat: { label: "Pausat", className: "bg-orange-500" },
      avslutat: { label: "Avslutat", className: "bg-gray-700" },
    };
    const config = statusConfig[status] || statusConfig.planerat;
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

  const getBudgetVarianceColor = (budget: number, actual: number) => {
    if (actual === 0) return "text-muted-foreground";
    const variance = ((actual - budget) / budget) * 100;
    if (variance > 10) return "text-red-600";
    if (variance > 0) return "text-yellow-600";
    return "text-green-600";
  };

  const updateProject = async (projectId: string, field: string, value: any) => {
    setUpdating(true);
    try {
      const updateData: any = { [field]: value, updated_at: new Date().toISOString() };
      
      const { error } = await supabase
        .from("projects")
        .update(updateData)
        .eq("id", projectId);
      
      if (error) throw error;
      
      setProjects(projects.map(p => 
        p.id === projectId ? { ...p, [field]: value } : p
      ));
      
      toast.success("Projektet uppdaterades");
    } catch (error) {
      toast.error("Kunde inte uppdatera projektet");
    } finally {
      setUpdating(false);
      setEditingCell(null);
      setTempValue(null);
    }
  };

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

  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
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
  }).sort((a, b) => {
    let aValue: any = a[sortField as keyof Project];
    let bValue: any = b[sortField as keyof Project];

    // Handle nested property name
    if (sortField === "property_name") {
      aValue = a.property.name;
      bValue = b.property.name;
    }

    // Handle quarter sorting
    if (sortField === "quarter") {
      aValue = a.year * 10 + (a.start_quarter || 0);
      bValue = b.year * 10 + (b.start_quarter || 0);
    }

    // Handle null values
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    // String comparison
    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc" 
        ? aValue.localeCompare(bValue, "sv")
        : bValue.localeCompare(aValue, "sv");
    }

    // Number comparison
    if (sortDirection === "asc") {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
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
                    <TabsTrigger value="overview">Översikt</TabsTrigger>
                    <TabsTrigger value="active">Aktiva projekt</TabsTrigger>
                    <TabsTrigger value="proposals" className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Förslag
                    </TabsTrigger>
                    <TabsTrigger value="archived">Arkiverade</TabsTrigger>
                  </TabsList>
                  <Button onClick={() => { setEditingProject(null); setFormDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nytt projekt
                  </Button>
                </div>

                <TabsContent value="overview" className="space-y-6">
                  <ProjectDashboard projects={projects} />
                </TabsContent>

                <TabsContent value="proposals" className="space-y-6">
                  <ProjectProposals />
                </TabsContent>

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
                            <SelectItem value="investering">Investering</SelectItem>
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
                    <CardContent className="overflow-x-auto">
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
                        <div className="min-w-[800px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleSort("project_number")}
                                >
                                  <div className="flex items-center">
                                    Projektnr
                                    {getSortIcon("project_number")}
                                  </div>
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleSort("name")}
                                >
                                  <div className="flex items-center">
                                    Namn
                                    {getSortIcon("name")}
                                  </div>
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleSort("property_name")}
                                >
                                  <div className="flex items-center">
                                    Fastighet
                                    {getSortIcon("property_name")}
                                  </div>
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleSort("type")}
                                >
                                  <div className="flex items-center">
                                    Typ
                                    {getSortIcon("type")}
                                  </div>
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleSort("status")}
                                >
                                  <div className="flex items-center">
                                    Status
                                    {getSortIcon("status")}
                                  </div>
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleSort("quarter")}
                                >
                                  <div className="flex items-center">
                                    Kvartal
                                    {getSortIcon("quarter")}
                                  </div>
                                </TableHead>
                                <TableHead 
                                  className="text-right cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleSort("budget")}
                                >
                                  <div className="flex items-center justify-end">
                                    Budget
                                    {getSortIcon("budget")}
                                  </div>
                                </TableHead>
                                <TableHead 
                                  className="text-right cursor-pointer hover:bg-muted/50"
                                  onClick={() => handleSort("actual_cost")}
                                >
                                  <div className="flex items-center justify-end">
                                    Utfall
                                    {getSortIcon("actual_cost")}
                                  </div>
                                </TableHead>
                                <TableHead className="text-right">Avvikelse</TableHead>
                                <TableHead>Åtgärder</TableHead>
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
                                    <TableCell 
                                      className="font-medium group cursor-text hover:bg-muted/30"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditing(project.id, "project_number", project.project_number);
                                      }}
                                    >
                                      {editingCell?.projectId === project.id && editingCell?.field === "project_number" ? (
                                        <Input
                                          value={tempValue}
                                          onChange={(e) => setTempValue(e.target.value)}
                                          onBlur={() => updateProject(project.id, "project_number", tempValue)}
                                          onKeyDown={(e) => handleKeyDown(e, project.id, "project_number")}
                                          className="h-8 w-full"
                                          autoFocus
                                          disabled={updating}
                                        />
                                      ) : (
                                        <span className="group-hover:underline">{project.project_number}</span>
                                      )}
                                    </TableCell>
                                    <TableCell>{project.name}</TableCell>
                                    <TableCell>{project.property.name}</TableCell>
                                    <TableCell 
                                      className="group cursor-pointer hover:bg-muted/30"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {editingCell?.projectId === project.id && editingCell?.field === "type" ? (
                                        <Select
                                          value={tempValue}
                                          onValueChange={(value) => {
                                            setTempValue(value);
                                            updateProject(project.id, "type", value);
                                          }}
                                          disabled={updating}
                                        >
                                          <SelectTrigger className="h-8 w-full">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="investering">Investering</SelectItem>
                                            <SelectItem value="underhall">Underhåll</SelectItem>
                                            <SelectItem value="energi">Energi</SelectItem>
                                            <SelectItem value="annat">Annat</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <div onClick={() => startEditing(project.id, "type", project.type)}>
                                          {getTypeBadge(project.type)}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell 
                                      className="group cursor-pointer hover:bg-muted/30"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {editingCell?.projectId === project.id && editingCell?.field === "status" ? (
                                        <Select
                                          value={tempValue}
                                          onValueChange={(value) => {
                                            setTempValue(value);
                                            updateProject(project.id, "status", value);
                                          }}
                                          disabled={updating}
                                        >
                                          <SelectTrigger className="h-8 w-full">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="planerat">Planerat</SelectItem>
                                            <SelectItem value="invantar_offert">Inväntar offert</SelectItem>
                                            <SelectItem value="offert_finns">Offert finns</SelectItem>
                                            <SelectItem value="pagaende">Pågående</SelectItem>
                                            <SelectItem value="pausat">Pausat</SelectItem>
                                            <SelectItem value="avslutat">Avslutat</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <div onClick={() => startEditing(project.id, "status", project.status)}>
                                          {getStatusBadge(project.status)}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell 
                                      className="text-sm text-muted-foreground group cursor-pointer hover:bg-muted/30"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {editingCell?.projectId === project.id && editingCell?.field === "quarter" ? (
                                        <div className="flex gap-2">
                                          <Select
                                            value={tempValue?.quarter?.toString() || ""}
                                            onValueChange={(value) => {
                                              const newValue = { 
                                                quarter: parseInt(value), 
                                                year: tempValue?.year || project.year 
                                              };
                                              setTempValue(newValue);
                                              updateProject(project.id, "start_quarter", parseInt(value));
                                            }}
                                            disabled={updating}
                                          >
                                            <SelectTrigger className="h-8 w-20">
                                              <SelectValue placeholder="Q" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="1">Q1</SelectItem>
                                              <SelectItem value="2">Q2</SelectItem>
                                              <SelectItem value="3">Q3</SelectItem>
                                              <SelectItem value="4">Q4</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <Select
                                            value={tempValue?.year?.toString() || ""}
                                            onValueChange={(value) => {
                                              const newValue = { 
                                                quarter: tempValue?.quarter || project.start_quarter, 
                                                year: parseInt(value) 
                                              };
                                              setTempValue(newValue);
                                              updateProject(project.id, "year", parseInt(value));
                                            }}
                                            disabled={updating}
                                          >
                                            <SelectTrigger className="h-8 w-24">
                                              <SelectValue placeholder="År" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {Array.from({ length: 7 }, (_, i) => 2024 + i).map((year) => (
                                                <SelectItem key={year} value={year.toString()}>
                                                  {year}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      ) : (
                                        <div 
                                          className="group-hover:underline"
                                          onClick={() => startEditing(project.id, "quarter", { 
                                            quarter: project.start_quarter, 
                                            year: project.year 
                                          })}
                                        >
                                          {project.start_quarter && project.year
                                            ? `Q${project.start_quarter} ${project.year}`
                                            : "-"}
                                        </div>
                                      )}
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
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setEditingProject(project);
                                          setFormDialogOpen(true);
                                        }}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
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

                <TabsContent value="archived" className="space-y-6">
                  {/* Same filters for archived */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <FolderArchive className="h-4 w-4" />
                        Arkiverade projekt
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      {filteredProjects.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <FolderArchive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p className="text-lg mb-2">Inga arkiverade projekt</p>
                        </div>
                      ) : (
                        <div className="min-w-[800px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Projektnr</TableHead>
                                <TableHead>Namn</TableHead>
                                <TableHead>Fastighet</TableHead>
                                <TableHead>Typ</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Kvartal</TableHead>
                                <TableHead className="text-right">Budget</TableHead>
                                <TableHead className="text-right">Utfall</TableHead>
                                <TableHead className="text-right">Avvikelse</TableHead>
                                <TableHead>Åtgärder</TableHead>
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
                                    <TableCell 
                                      className="font-medium group cursor-text hover:bg-muted/30"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEditing(project.id, "project_number", project.project_number);
                                      }}
                                    >
                                      {editingCell?.projectId === project.id && editingCell?.field === "project_number" ? (
                                        <Input
                                          value={tempValue}
                                          onChange={(e) => setTempValue(e.target.value)}
                                          onBlur={() => updateProject(project.id, "project_number", tempValue)}
                                          onKeyDown={(e) => handleKeyDown(e, project.id, "project_number")}
                                          className="h-8 w-full"
                                          autoFocus
                                          disabled={updating}
                                        />
                                      ) : (
                                        <span className="group-hover:underline">{project.project_number}</span>
                                      )}
                                    </TableCell>
                                    <TableCell>{project.name}</TableCell>
                                    <TableCell>{project.property.name}</TableCell>
                                    <TableCell 
                                      className="group cursor-pointer hover:bg-muted/30"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {editingCell?.projectId === project.id && editingCell?.field === "type" ? (
                                        <Select
                                          value={tempValue}
                                          onValueChange={(value) => {
                                            setTempValue(value);
                                            updateProject(project.id, "type", value);
                                          }}
                                          disabled={updating}
                                        >
                                          <SelectTrigger className="h-8 w-full">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="investering">Investering</SelectItem>
                                            <SelectItem value="underhall">Underhåll</SelectItem>
                                            <SelectItem value="energi">Energi</SelectItem>
                                            <SelectItem value="annat">Annat</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <div onClick={() => startEditing(project.id, "type", project.type)}>
                                          {getTypeBadge(project.type)}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell 
                                      className="group cursor-pointer hover:bg-muted/30"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {editingCell?.projectId === project.id && editingCell?.field === "status" ? (
                                        <Select
                                          value={tempValue}
                                          onValueChange={(value) => {
                                            setTempValue(value);
                                            updateProject(project.id, "status", value);
                                          }}
                                          disabled={updating}
                                        >
                                          <SelectTrigger className="h-8 w-full">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="planerat">Planerat</SelectItem>
                                            <SelectItem value="invantar_offert">Inväntar offert</SelectItem>
                                            <SelectItem value="offert_finns">Offert finns</SelectItem>
                                            <SelectItem value="pagaende">Pågående</SelectItem>
                                            <SelectItem value="pausat">Pausat</SelectItem>
                                            <SelectItem value="avslutat">Avslutat</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <div onClick={() => startEditing(project.id, "status", project.status)}>
                                          {getStatusBadge(project.status)}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell 
                                      className="text-sm text-muted-foreground group cursor-pointer hover:bg-muted/30"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {editingCell?.projectId === project.id && editingCell?.field === "quarter" ? (
                                        <div className="flex gap-2">
                                          <Select
                                            value={tempValue?.quarter?.toString() || ""}
                                            onValueChange={(value) => {
                                              const newValue = { 
                                                quarter: parseInt(value), 
                                                year: tempValue?.year || project.year 
                                              };
                                              setTempValue(newValue);
                                              updateProject(project.id, "start_quarter", parseInt(value));
                                            }}
                                            disabled={updating}
                                          >
                                            <SelectTrigger className="h-8 w-20">
                                              <SelectValue placeholder="Q" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="1">Q1</SelectItem>
                                              <SelectItem value="2">Q2</SelectItem>
                                              <SelectItem value="3">Q3</SelectItem>
                                              <SelectItem value="4">Q4</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <Select
                                            value={tempValue?.year?.toString() || ""}
                                            onValueChange={(value) => {
                                              const newValue = { 
                                                quarter: tempValue?.quarter || project.start_quarter, 
                                                year: parseInt(value) 
                                              };
                                              setTempValue(newValue);
                                              updateProject(project.id, "year", parseInt(value));
                                            }}
                                            disabled={updating}
                                          >
                                            <SelectTrigger className="h-8 w-24">
                                              <SelectValue placeholder="År" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {Array.from({ length: 7 }, (_, i) => 2024 + i).map((year) => (
                                                <SelectItem key={year} value={year.toString()}>
                                                  {year}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      ) : (
                                        <div 
                                          className="group-hover:underline"
                                          onClick={() => startEditing(project.id, "quarter", { 
                                            quarter: project.start_quarter, 
                                            year: project.year 
                                          })}
                                        >
                                          {project.start_quarter && project.year
                                            ? `Q${project.start_quarter} ${project.year}`
                                            : "-"}
                                        </div>
                                      )}
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
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => navigate(`/projects/${project.id}`)}
                                      >
                                        Visa
                                      </Button>
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
          fetchProjects(showArchived);
          setEditingProject(null);
        }}
        editingProject={editingProject}
      />
    </SidebarProvider>
  );
}
