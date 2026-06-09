import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useProperties } from '@/hooks/useProperties';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import {
  Building2,
  Wrench,
  FolderKanban,
  CheckSquare,
  Loader2,
  TrendingUp,
  Map as MapIcon,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AttentionRequiredSection } from '@/components/AttentionRequiredSection';
import { RecentlyVisitedWidget } from '@/components/RecentlyVisitedWidget';
import { TodoWidget } from '@/components/TodoWidget';
import { DashboardCustomizer } from '@/components/dashboard/DashboardCustomizer';
import { PropertyMapDialog } from '@/components/maps/PropertyMapDialog';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { EmbeddingStatsWidget } from '@/components/dashboard/EmbeddingStatsWidget';

interface RecentWorkOrder {
  id: string;
  action: string;
  status: string;
  priority: string;
  created_at: string;
  contractor: string | null;
  due_date: string | null;
  properties: { name: string };
}

interface RecentProject {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  properties: { name: string };
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organization } = useOrganization();
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [mapDialogOpen, setMapDialogOpen] = useState(false);

  const { data: properties = [] } = useProperties();

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  const propertyIds = useMemo(
    () => (selectedProperty === 'all' ? properties.map((p) => p.id) : [selectedProperty]),
    [selectedProperty, properties],
  );

  const { data: dashboardData, isLoading: statsLoading } = useDashboardStats({ propertyIds });

  const stats = useMemo(
    () => ({
      totalProperties: selectedProperty === 'all' ? properties.length : 1,
      totalWorkOrders: dashboardData?.total_work_orders ?? 0,
      totalProjects: dashboardData?.total_projects ?? 0,
      totalTodos: dashboardData?.total_todos ?? 0,
      pendingTodos: dashboardData?.pending_todos ?? 0,
      pendingWorkOrders: dashboardData?.pending_work_orders ?? 0,
      activeProjects: dashboardData?.active_projects ?? 0,
      completedTodos: dashboardData?.completed_todos ?? 0,
    }),
    [dashboardData, properties.length, selectedProperty],
  );

  const recentWorkOrders = (dashboardData?.recent_work_orders ?? []) as RecentWorkOrder[];
  const recentProjects = (dashboardData?.recent_projects ?? []) as RecentProject[];

  const loading = authLoading || (propertyIds.length > 0 && statsLoading);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      not_started: 'outline',
      awaiting_quote: 'secondary',
      ordered: 'default',
      completed: 'secondary',
      archived: 'outline',
      planerat: 'outline',
      invantar_offert: 'secondary',
      offert_finns: 'secondary',
      pagaende: 'default',
      pausat: 'outline',
      avslutat: 'secondary',
    };
    const labels: Record<string, string> = {
      not_started: 'Ej påbörjad',
      awaiting_quote: 'Inväntar offert',
      ordered: 'Beställd',
      completed: 'Klar',
      archived: 'Arkiverad',
      planerat: 'Planerad',
      invantar_offert: 'Inväntar offert',
      offert_finns: 'Offert finns',
      pagaende: 'Pågående',
      pausat: 'Pausad',
      avslutat: 'Avslutad',
    };
    return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      low: 'outline',
      medium: 'secondary',
      high: 'destructive',
    };
    const labels: Record<string, string> = { low: 'Låg', medium: 'Medel', high: 'Hög' };
    return <Badge variant={variants[priority] || 'outline'}>{labels[priority] || priority}</Badge>;
  };

  if (loading) {
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

  const kpiCards = [
    {
      id: 'kpi-properties',
      title: 'Fastigheter',
      value: stats.totalProperties,
      icon: Building2,
      description: selectedProperty === 'all' ? 'Alla fastigheter' : 'Vald fastighet',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      id: 'kpi-workorders',
      title: 'Arbetsordrar',
      value: stats.totalWorkOrders,
      subtitle: `${stats.pendingWorkOrders} pågående`,
      icon: Wrench,
      description: 'Totalt antal arbetsordrar',
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      id: 'kpi-projects',
      title: 'Projekt',
      value: stats.totalProjects,
      subtitle: `${stats.activeProjects} aktiva`,
      icon: FolderKanban,
      description: 'Totalt antal projekt',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      id: 'kpi-todos',
      title: 'Att göra',
      value: stats.pendingTodos,
      subtitle: `${stats.completedTodos} klara`,
      icon: CheckSquare,
      description: 'Öppna uppgifter',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2 flex-1">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="hidden sm:flex" onClick={() => setMapDialogOpen(true)}>
                <MapIcon className="h-4 w-4 mr-2" />
                Visa karta
              </Button>
              <Button variant="outline" size="icon" className="sm:hidden" onClick={() => setMapDialogOpen(true)}>
                <MapIcon className="h-4 w-4" />
              </Button>
              <DashboardCustomizer />
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold">
                    Välkommen till {organization?.name || 'NavRitning'}
                  </h2>
                  <p className="text-muted-foreground">
                    Sammanställning av {organization?.name ? 'organisationens' : 'dina'} fastigheter och uppgifter
                  </p>
                </div>
                <div className="w-full sm:w-64">
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

              <AttentionRequiredSection
                propertyId={selectedProperty === 'all' ? undefined : selectedProperty}
              />

              <DashboardGrid kpiCards={kpiCards} />

              <TodoWidget propertyId={selectedProperty === 'all' ? undefined : selectedProperty} />

              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Pågående Projekt</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
                        Visa alla
                      </Button>
                    </div>
                    <CardDescription>
                      Senaste projekten för {selectedProperty === 'all' ? 'alla fastigheter' : 'vald fastighet'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {recentProjects.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Inga projekt</p>
                    ) : (
                      <div className="space-y-4">
                        {recentProjects.map((project) => (
                          <div
                            key={project.id}
                            className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => navigate(`/projects/${project.id}`)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium mb-1 truncate">{project.name}</div>
                              <div className="text-sm text-muted-foreground truncate">
                                {project.properties?.name}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {project.start_date && new Date(project.start_date).toLocaleDateString('sv-SE')}
                                {project.end_date && ` - ${new Date(project.end_date).toLocaleDateString('sv-SE')}`}
                              </div>
                            </div>
                            <div className="ml-2 shrink-0">{getStatusBadge(project.status)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Pågående Arbetsordrar</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => navigate('/work-orders')}>
                        Visa alla
                      </Button>
                    </div>
                    <CardDescription>
                      Senaste arbetsordrar för {selectedProperty === 'all' ? 'alla fastigheter' : 'vald fastighet'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {recentWorkOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Inga arbetsordrar</p>
                    ) : (
                      <div className="space-y-4">
                        {recentWorkOrders.map((wo) => (
                          <div
                            key={wo.id}
                            className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => navigate('/work-orders')}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium mb-1 truncate">{wo.action}</div>
                              <div className="text-sm text-muted-foreground truncate">
                                {wo.properties?.name}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(wo.created_at).toLocaleDateString('sv-SE')}
                                {wo.contractor && ` • ${wo.contractor}`}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 items-end ml-2 shrink-0">
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

              <EmbeddingStatsWidget />
              <RecentlyVisitedWidget />
            </div>
          </main>
        </SidebarInset>
      </div>
      <PropertyMapDialog open={mapDialogOpen} onOpenChange={setMapDialogOpen} />
    </SidebarProvider>
  );
};

export default Dashboard;
