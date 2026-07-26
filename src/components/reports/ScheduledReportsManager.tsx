import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Plus, Trash2, Play, Pause } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useState } from 'react';
import { ScheduledReportDialog } from './ScheduledReportDialog';

interface ScheduledReport {
  id: string;
  name: string;
  report_type: string;
  schedule: string;
  recipients: string[];
  is_active: boolean;
  next_run: string | null;
  last_run: string | null;
}

export const ScheduledReportsManager = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: reports, isLoading } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ScheduledReport[];
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Status uppdaterad');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
      toast.success('Schemalagd rapport raderad');
    },
  });

  const getScheduleText = (schedule: string) => {
    // Simple cron to readable text
    if (schedule === '0 8 * * 1') return 'Varje måndag kl 08:00';
    if (schedule === '0 8 1 * *') return 'Första dagen i månaden kl 08:00';
    if (schedule === '0 8 * * *') return 'Dagligen kl 08:00';
    return schedule;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Schemalagda rapporter</CardTitle>
            <CardDescription>
              Automatiska rapporter som skickas via email
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ny schemalagd rapport
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : reports && reports.length > 0 ? (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium">{report.name}</p>
                    <Badge variant={report.is_active ? 'default' : 'secondary'}>
                      {report.is_active ? 'Aktiv' : 'Pausad'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getScheduleText(report.schedule)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Till: {report.recipients.join(', ')}
                  </p>
                  {report.next_run && (
                    <p className="text-xs text-muted-foreground">
                      Nästa körning: {new Date(report.next_run).toLocaleString('sv-SE')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      toggleActiveMutation.mutate({
                        id: report.id,
                        isActive: report.is_active,
                      })
                    }
                  >
                    {report.is_active ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(report.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Inga schemalagda rapporter ännu</p>
            <p className="text-sm mt-2">
              Skapa automatiska rapporter som skickas via email
            </p>
          </div>
        )}
      </CardContent>

      <ScheduledReportDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
};
