import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ReportHistory {
  id: string;
  name: string;
  report_type: string;
  created_at: string;
  file_url?: string;
}

export const ReportHistoryCard = () => {
  const { data: history, isLoading } = useQuery({
    queryKey: ['report-history'],
    queryFn: async () => {
      // For now, return empty array
      // In production, you'd fetch from a report_history table
      return [] as ReportHistory[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Senaste rapporter</CardTitle>
        <CardDescription>
          Dina nyligen genererade rapporter (senaste 30 dagarna)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : history && history.length > 0 ? (
          <div className="space-y-2">
            {history.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{report.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(report.created_at).toLocaleDateString('sv-SE')}
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Inga rapporter genererade ännu</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
