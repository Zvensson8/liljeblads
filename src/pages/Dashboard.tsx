import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { Building2, Package, AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { ComponentsChart } from '@/components/dashboard/ComponentsChart';
import { OperationsProgress } from '@/components/dashboard/OperationsProgress';

interface DashboardStats {
  totalProperties: number;
  totalComponents: number;
  maintenanceComponents: number;
  inactiveComponents: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalProperties: 0,
    totalComponents: 0,
    maintenanceComponents: 0,
    inactiveComponents: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchStats();
    }
  }, [user, authLoading, navigate]);

  const fetchStats = async () => {
    // Fetch properties count
    const { count: propertiesCount } = await supabase
      .from('properties')
      .select('*', { count: 'exact', head: true });

    // Fetch components count
    const { count: componentsCount } = await supabase
      .from('components')
      .select('*', { count: 'exact', head: true });

    // Fetch maintenance components
    const { count: maintenanceCount } = await supabase
      .from('components')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'maintenance');

    // Fetch inactive components
    const { count: inactiveCount } = await supabase
      .from('components')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'inactive');

    setStats({
      totalProperties: propertiesCount || 0,
      totalComponents: componentsCount || 0,
      maintenanceComponents: maintenanceCount || 0,
      inactiveComponents: inactiveCount || 0,
    });

    setLoading(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const kpiCards = [
    {
      title: 'Fastigheter',
      value: stats.totalProperties,
      icon: Building2,
      description: 'Totalt antal fastigheter',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      action: () => navigate('/properties'),
    },
    {
      title: 'Komponenter',
      value: stats.totalComponents,
      icon: Package,
      description: 'Totalt antal komponenter',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      action: () => navigate('/components'),
    },
    {
      title: 'Kräver underhåll',
      value: stats.maintenanceComponents,
      icon: AlertTriangle,
      description: 'Komponenter som behöver service',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      action: () => navigate('/components'),
    },
    {
      title: 'Inaktiva',
      value: stats.inactiveComponents,
      icon: Activity,
      description: 'Inaktiva komponenter',
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      action: () => navigate('/components'),
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
            <div className="max-w-7xl mx-auto space-y-8">
              {/* Welcome Section */}
              <div className="animate-fade-in">
                <h2 className="text-3xl font-bold mb-2">
                  Välkommen till NavRitning
                </h2>
                <p className="text-muted-foreground text-lg">
                  Hantera dina fastigheter och komponenter effektivt
                </p>
              </div>

              {/* KPI Cards */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                {kpiCards.map((kpi, index) => (
                  <Card
                    key={kpi.title}
                    className="group hover:shadow-[var(--shadow-elegant)] transition-all duration-300 cursor-pointer hover-scale border-border/50"
                    onClick={kpi.action}
                    style={{ animationDelay: `${0.1 + index * 0.1}s` }}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {kpi.title}
                      </CardTitle>
                      <div className={`p-2 rounded-lg ${kpi.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                        <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold mb-1">{kpi.value}</div>
                      <p className="text-xs text-muted-foreground">
                        {kpi.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Analytics Section */}
              <div className="grid gap-6 lg:grid-cols-2 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                <ComponentsChart />
                <OperationsProgress />
              </div>

              {/* Activity Feed and Quick Actions */}
              <div className="grid gap-6 lg:grid-cols-3 animate-fade-in" style={{ animationDelay: '0.7s' }}>
                <div className="lg:col-span-2">
                  <ActivityFeed />
                </div>
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle>Snabbåtgärder</CardTitle>
                    <CardDescription>
                      Vanliga uppgifter
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-3 px-4 hover:bg-primary/10 hover:border-primary transition-all"
                      onClick={() => navigate('/properties')}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <Building2 className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="text-left">
                          <div className="font-semibold text-sm">Hantera fastigheter</div>
                          <div className="text-xs text-muted-foreground">
                            Lägg till eller redigera
                          </div>
                        </div>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-3 px-4 hover:bg-primary/10 hover:border-primary transition-all"
                      onClick={() => navigate('/components')}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-500/10">
                          <Package className="h-5 w-5 text-green-500" />
                        </div>
                        <div className="text-left">
                          <div className="font-semibold text-sm">Se komponenter</div>
                          <div className="text-xs text-muted-foreground">
                            Översikt och hantering
                          </div>
                        </div>
                      </div>
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-3 px-4 hover:bg-primary/10 hover:border-primary transition-all"
                      onClick={() => navigate('/operations')}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                          <Activity className="h-5 w-5 text-purple-500" />
                        </div>
                        <div className="text-left">
                          <div className="font-semibold text-sm">Driftuppgifter</div>
                          <div className="text-xs text-muted-foreground">
                            Hantera kvartalsuppgifter
                          </div>
                        </div>
                      </div>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
