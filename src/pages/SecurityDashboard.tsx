import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { BottomNavigation } from '@/components/BottomNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle, CheckCircle2, Activity, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { GDPRDataExport } from '@/components/security/GDPRDataExport';
import { ConsentManager } from '@/components/security/ConsentManager';
import { DeleteAccountDialog } from '@/components/security/DeleteAccountDialog';
import { SecurityMetrics } from '@/components/security/SecurityMetrics';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function SecurityDashboard() {
  const isMobile = useIsMobile();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
            <SecurityMetrics />

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
            <div className="grid gap-6 md:grid-cols-2">
              <GDPRDataExport />
              <ConsentManager />
            </div>

            {/* Danger Zone */}
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  Farlig zon
                </CardTitle>
                <CardDescription>
                  Irreversibla åtgärder - var försiktig
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Radera mitt konto</h4>
                    <p className="text-sm text-muted-foreground">
                      Radera permanent all din data enligt GDPR
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    Radera konto
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>

        {isMobile && <BottomNavigation />}
      </div>
      <DeleteAccountDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} />
    </SidebarProvider>
  );
}
