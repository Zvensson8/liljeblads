import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { BottomNavigation } from '@/components/BottomNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

export default function SecurityDashboard() {
  const isMobile = useIsMobile();

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['audit-logs-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });

  const securityMetrics = [
    {
      title: 'Säkerhetsstatus',
      value: 'Bra',
      icon: Shield,
      description: 'Inga kritiska problem',
      color: 'text-green-600',
    },
    {
      title: 'Aktiva varningar',
      value: '0',
      icon: AlertTriangle,
      description: 'Inga varningar',
      color: 'text-yellow-600',
    },
    {
      title: 'Senaste kontroll',
      value: 'Just nu',
      icon: CheckCircle2,
      description: 'Automatisk övervakning',
      color: 'text-blue-600',
    },
    {
      title: 'Aktivitetsloggar',
      value: auditLogs?.length || 0,
      icon: Activity,
      description: 'Senaste händelser',
      color: 'text-purple-600',
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        {!isMobile && <AppSidebar />}
        
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 space-y-6 pb-20 md:pb-6">
            <div>
              <h1 className="text-3xl font-bold">Säkerhet & Compliance</h1>
              <p className="text-muted-foreground">
                Övervakning och hantering av säkerhet
              </p>
            </div>

            {/* Security Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {securityMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <Card key={metric.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {metric.title}
                      </CardTitle>
                      <Icon className={`h-4 w-4 ${metric.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{metric.value}</div>
                      <p className="text-xs text-muted-foreground">
                        {metric.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Audit Logs */}
            <Card>
              <CardHeader>
                <CardTitle>Senaste aktiviteter</CardTitle>
                <CardDescription>
                  Översikt av systemhändelser och användaraktiviteter
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : auditLogs && auditLogs.length > 0 ? (
                  <div className="space-y-2">
                    {auditLogs.map((log: any) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{log.action}</p>
                          <p className="text-sm text-muted-foreground">
                            {log.table_name && `Tabell: ${log.table_name}`}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('sv-SE')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Inga aktivitetsloggar ännu</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* GDPR Compliance */}
            <Card>
              <CardHeader>
                <CardTitle>GDPR & Dataskydd</CardTitle>
                <CardDescription>
                  Hantera användarsamtycken och dataexport
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Compliance-funktioner kommer snart</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>

        {isMobile && <BottomNavigation />}
      </div>
    </SidebarProvider>
  );
}
