import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { Building2, Wrench, FolderKanban, CheckSquare, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AttentionRequiredSection } from '@/components/AttentionRequiredSection';
import { RecentlyVisitedWidget } from '@/components/RecentlyVisitedWidget';

interface DashboardStats {
  totalProperties: number;
  totalWorkOrders: number;
  totalProjects: number;
  totalTodos: number;
  pendingWorkOrders: number;
  activeProjects: number;
  completedTodos: number;
}

interface Property {
  id: string;
  name: string;
}

interface WorkOrder {
  id: string;
  action: string;
  status: string;
  priority: string;
  created_at: string;
  contractor: string | null;
  due_date: string | null;
  properties: { name: string };
}

interface Project {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  properties: { name: string };
}

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  due_date: string;
  properties: { name: string };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organization } = useOrganization();
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalProperties: 0,
    totalWorkOrders: 0,
    totalProjects: 0,
    totalTodos: 0,
    pendingWorkOrders: 0,
    activeProjects: 0,
    completedTodos: 0,
  });
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [prevStats, setPrevStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchProperties();
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (properties.length > 0) {
      fetchDashboardData();
    }
  }, [selectedProperty, properties]);

  const fetchProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error('Error fetching properties:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const propertyFilter = selectedProperty === "all" 
        ? properties.map(p => p.id)
        : [selectedProperty];

      // Fetch work orders
      const { data: workOrdersData, error: woError } = await supabase
        .from('work_orders')
        .select('*, properties(name)')
        .in('property_id', propertyFilter)
        .order('created_at', { ascending: false })
        .limit(5);

      if (woError) throw woError;

      // Fetch projects
      const { data: projectsData, error: projError } = await supabase
        .from('projects')
        .select('*, properties(name)')
        .in('property_id', propertyFilter)
        .order('start_date', { ascending: false })
        .limit(5);

      if (projError) throw projError;

      // Fetch todos
      const { data: todosData, error: todosError } = await supabase
        .from('property_todos')
        .select('*, properties(name)')
        .in('property_id', propertyFilter)
        .order('due_date', { ascending: true })
        .limit(10);

      if (todosError) throw todosError;

      // Count all work orders
      const { count: totalWO } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .in('property_id', propertyFilter);

      // Count pending work orders (not_started + awaiting_quote + ordered)
      const { count: pendingWO } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .in('property_id', propertyFilter)
        .in('status', ['not_started', 'awaiting_quote', 'ordered']);

      // Count all projects
      const { count: totalProj } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .in('property_id', propertyFilter);

      // Count active projects (pagaende)
      const { count: activeProj } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .in('property_id', propertyFilter)
        .eq('status', 'pagaende');

      // Count all todos
      const { count: totalTodoCount } = await supabase
        .from('property_todos')
        .select('*', { count: 'exact', head: true })
        .in('property_id', propertyFilter);

      // Count completed todos
      const { count: completedTodoCount } = await supabase
        .from('property_todos')
        .select('*', { count: 'exact', head: true })
        .in('property_id', propertyFilter)
        .eq('completed', true);

      setWorkOrders(workOrdersData || []);
      setProjects(projectsData || []);
      setTodos(todosData || []);
      
      const newStats = {
        totalProperties: selectedProperty === "all" ? properties.length : 1,
        totalWorkOrders: totalWO || 0,
        totalProjects: totalProj || 0,
        totalTodos: totalTodoCount || 0,
        pendingWorkOrders: pendingWO || 0,
        activeProjects: activeProj || 0,
        completedTodos: completedTodoCount || 0,
      };
      
      setPrevStats(stats.totalWorkOrders > 0 ? stats : prevStats);
      setStats(newStats);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      not_started: "outline",
      awaiting_quote: "secondary",
      ordered: "default",
      completed: "secondary",
      archived: "outline",
      planerat: "outline",
      invantar_offert: "secondary",
      offert_finns: "secondary",
      pagaende: "default",
      pausat: "outline",
      avslutat: "secondary",
    };
    const labels: Record<string, string> = {
      not_started: "Ej påbörjad",
      awaiting_quote: "Inväntar offert",
      ordered: "Beställd",
      completed: "Klar",
      archived: "Arkiverad",
      planerat: "Planerad",
      invantar_offert: "Inväntar offert",
      offert_finns: "Offert finns",
      pagaende: "Pågående",
      pausat: "Pausad",
      avslutat: "Avslutad",
    };
    return <Badge variant={variants[status] || "outline"}>{labels[status] || status}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      low: "outline",
      medium: "secondary",
      high: "destructive",
    };
    const labels: Record<string, string> = {
      low: "Låg",
      medium: "Medel",
      high: "Hög",
    };
    return <Badge variant={variants[priority] || "outline"}>{labels[priority] || priority}</Badge>;
  };

  if (authLoading || loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset>
            <div className="flex items-center justify-center h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  const getTrendIcon = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 1) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (change > 0) return <TrendingUp className="h-3 w-3 text-green-500" />;
    return <TrendingDown className="h-3 w-3 text-red-500" />;
  };

  const getTrendText = (current: number, previous: number | undefined) => {
    if (!previous || previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 1) return null;
    const sign = change > 0 ? "+" : "";
    return `${sign}${change.toFixed(0)}% från förra perioden`;
  };

  const kpiCards = [
    {
      title: 'Fastigheter',
      value: stats.totalProperties,
      prev: prevStats?.totalProperties,
      icon: Building2,
      description: selectedProperty === "all" ? 'Alla fastigheter' : 'Vald fastighet',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Arbetsordrar',
      value: stats.totalWorkOrders,
      prev: prevStats?.totalWorkOrders,
      subtitle: `${stats.pendingWorkOrders} pågående`,
      icon: Wrench,
      description: 'Totalt antal arbetsordrar',
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      title: 'Projekt',
      value: stats.totalProjects,
      prev: prevStats?.totalProjects,
      subtitle: `${stats.activeProjects} aktiva`,
      icon: FolderKanban,
      description: 'Totalt antal projekt',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Att göra',
      value: stats.totalTodos,
      prev: prevStats?.totalTodos,
      subtitle: `${stats.completedTodos} klara`,
      icon: CheckSquare,
      description: 'Totalt antal uppgifter',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Dashboard</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Header with Property Filter */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold">Välkommen till {organization?.name || 'NavRitning'}</h2>
                  <p className="text-muted-foreground">
                    Sammanställning av {organization?.name ? 'organisationens' : 'dina'} fastigheter och uppgifter
                  </p>
                </div>
                <div className="w-64">
                  <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj fastighet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla fastigheter</SelectItem>
                      {properties.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Attention Required Section */}
              <AttentionRequiredSection 
                propertyId={selectedProperty === "all" ? undefined : selectedProperty} 
              />

              {/* Recently Visited + KPI Cards */}
              <div className="grid gap-6 lg:grid-cols-5">
                <div className="lg:col-span-1">
                  <RecentlyVisitedWidget />
                </div>
                <div className="lg:col-span-4 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {kpiCards.map((kpi) => (
                    <Card key={kpi.title} className="border-border/50 hover:shadow-[var(--shadow-elegant)] transition-all">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`p-3 rounded-lg ${kpi.bgColor}`}>
                            <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
                          </div>
                          {getTrendIcon(kpi.value, kpi.prev) && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {getTrendIcon(kpi.value, kpi.prev)}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                          <p className="text-3xl font-bold">{kpi.value}</p>
                          {kpi.subtitle && (
                            <p className="text-sm text-muted-foreground">{kpi.subtitle}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {kpi.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Content Grid */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Ongoing Projects */}
                <Card className="border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Pågående Projekt</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/projects')}
                      >
                        Visa alla
                      </Button>
                    </div>
                    <CardDescription>
                      Senaste projekten för {selectedProperty === "all" ? "alla fastigheter" : "vald fastighet"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {projects.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Inga projekt
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {projects.map((project) => (
                          <div
                            key={project.id}
                            className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/projects/${project.id}`)}
                          >
                            <div className="flex-1">
                              <div className="font-medium mb-1">{project.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {project.properties?.name}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {project.start_date && new Date(project.start_date).toLocaleDateString('sv-SE')}
                                {project.end_date && ` - ${new Date(project.end_date).toLocaleDateString('sv-SE')}`}
                              </div>
                            </div>
                            <div>{getStatusBadge(project.status)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Ongoing Work Orders */}
                <Card className="border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Pågående Arbetsordrar</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/work-orders')}
                      >
                        Visa alla
                      </Button>
                    </div>
                    <CardDescription>
                      Senaste arbetsordrar för {selectedProperty === "all" ? "alla fastigheter" : "vald fastighet"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {workOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Inga arbetsordrar
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {workOrders.map((wo) => (
                          <div
                            key={wo.id}
                            className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => navigate('/work-orders')}
                          >
                            <div className="flex-1">
                              <div className="font-medium mb-1">{wo.action}</div>
                              <div className="text-sm text-muted-foreground">
                                {wo.properties?.name}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(wo.created_at).toLocaleDateString('sv-SE')}
                                {wo.contractor && ` • ${wo.contractor}`}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                              {getStatusBadge(wo.status)}
                              {getPriorityBadge(wo.priority)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* To-Do List */}
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle>Att göra</CardTitle>
                  <CardDescription>
                    Kommande uppgifter för {selectedProperty === "all" ? "alla fastigheter" : "vald fastighet"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {todos.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Inga uppgifter
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {todos.map((todo) => (
                        <div
                          key={todo.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors ${
                            todo.completed ? 'opacity-50' : ''
                          }`}
                        >
                          <div className={`h-4 w-4 rounded border ${
                            todo.completed ? 'bg-primary border-primary' : 'border-muted-foreground'
                          }`}>
                            {todo.completed && (
                              <CheckSquare className="h-4 w-4 text-primary-foreground" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className={`font-medium ${todo.completed ? 'line-through' : ''}`}>
                              {todo.title}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {todo.properties?.name}
                              {todo.due_date && ` • Förfaller ${new Date(todo.due_date).toLocaleDateString('sv-SE')}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
