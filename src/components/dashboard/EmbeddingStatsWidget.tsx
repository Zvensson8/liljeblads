import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useGenerateEmbeddings, useBackfillEmbeddings } from '@/hooks/useEdgeFunctions';
import { Database, RefreshCw, CheckCircle2, Clock, AlertCircle, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface EmbeddingStats {
  totalEmbeddings: number;
  queuePending: number;
  queueProcessed: number;
  queueErrors: number;
  byTable: Record<string, number>;
}

export function EmbeddingStatsWidget() {
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const generateEmbeddings = useGenerateEmbeddings();
  const backfillEmbeddings = useBackfillEmbeddings();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch embedding counts by table
      const { data: embeddings, error: embError } = await supabase
        .from('embeddings')
        .select('source_table');

      if (embError) throw embError;

      // Fetch queue stats
      const { data: queue, error: queueError } = await supabase
        .from('embedding_queue')
        .select('processed, error');

      if (queueError) throw queueError;

      // Calculate stats
      const byTable: Record<string, number> = {};
      (embeddings || []).forEach(e => {
        byTable[e.source_table] = (byTable[e.source_table] || 0) + 1;
      });

      const queuePending = (queue || []).filter(q => !q.processed && !q.error).length;
      const queueProcessed = (queue || []).filter(q => q.processed).length;
      const queueErrors = (queue || []).filter(q => q.error).length;

      setStats({
        totalEmbeddings: embeddings?.length || 0,
        queuePending,
        queueProcessed,
        queueErrors,
        byTable
      });
    } catch (error) {
      console.error('Error fetching embedding stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const data = await generateEmbeddings.mutateAsync() as { results?: Array<{ status: string }> };
      const embedded = data.results?.filter((r) => r.status === 'embedded').length || 0;
      const unchanged = data.results?.filter((r) => r.status === 'unchanged').length || 0;
      
      if (embedded > 0) {
        toast.success(`${embedded} nya embeddings skapade`);
      } else if (unchanged > 0) {
        toast.info(`${unchanged} embeddings var redan uppdaterade`);
      } else {
        toast.info('Ingen data att processa');
      }
      
      // Refresh stats
      await fetchStats();
    } catch (error) {
      console.error('Error processing embeddings:', error);
      toast.error('Kunde inte processa embeddings');
    } finally {
      setProcessing(false);
    }
  };

  const handleClearErrors = async () => {
    try {
      const { error } = await supabase
        .from('embedding_queue')
        .delete()
        .not('error', 'is', null);
      
      if (error) throw error;
      
      toast.success('Fel rensade');
      await fetchStats();
    } catch (error) {
      console.error('Error clearing errors:', error);
      toast.error('Kunde inte rensa fel');
    }
  };

  const handleBackfill = async () => {
    setProcessing(true);
    try {
      const data = await backfillEmbeddings.mutateAsync() as { totalQueued: number };
      toast.success(`${data.totalQueued} poster köade för embedding`);
      
      // Refresh stats
      await fetchStats();
    } catch (error) {
      console.error('Error backfilling:', error);
      toast.error('Kunde inte köa data för embedding');
    } finally {
      setProcessing(false);
    }
  };

  const handleForceDocumentBackfill = async () => {
    setProcessing(true);
    try {
      const response = await supabase.functions.invoke('backfill-embeddings', {
        body: { 
          tables: ['maintenance_history_documents'], 
          force: true 
        }
      });
      
      if (response.error) throw response.error;
      
      const data = response.data;
      toast.success(`${data.totalQueued} dokument köade för omprocessning med PDF-parsing`);
      
      // Refresh stats
      await fetchStats();
    } catch (error) {
      console.error('Error force backfilling documents:', error);
      toast.error('Kunde inte köa dokument för omprocessning');
    } finally {
      setProcessing(false);
    }
  };

  const tableLabels: Record<string, string> = {
    properties: 'Fastigheter',
    components: 'Komponenter',
    work_orders: 'Arbetsordrar',
    projects: 'Projekt',
    property_todos: 'Att göra',
    drift_tasks: 'Driftuppgifter',
    maintenance_history: 'Servicehistorik',
    maintenance_history_documents: 'Serviceprotokoll'
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const totalQueue = (stats?.queuePending || 0) + (stats?.queueProcessed || 0) + (stats?.queueErrors || 0);
  const progressPercent = totalQueue > 0 
    ? Math.round((stats?.queueProcessed || 0) / totalQueue * 100) 
    : 100;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Sökning & Embeddings</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleForceDocumentBackfill}
              disabled={processing}
              title="Omprocessar alla serviceprotokoll med PDF-parsing"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
              Uppdatera dokument
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleBackfill}
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Synka alla'}
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleProcess}
              disabled={processing || (stats?.queuePending || 0) === 0}
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Processa kö
            </Button>
          </div>
        </div>
        <CardDescription>
          Vektorsökningsindex för snabb AI-driven sökning
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Queue Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Kö-status</span>
            <div className="flex items-center gap-2">
              {(stats?.queuePending || 0) > 0 ? (
                <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                  <Clock className="h-3 w-3 mr-1" />
                  {stats?.queuePending} väntar
                </Badge>
              ) : (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Allt klart
                </Badge>
              )}
              {(stats?.queueErrors || 0) > 0 && (
                <Badge 
                  variant="destructive" 
                  className="cursor-pointer hover:opacity-80"
                  onClick={handleClearErrors}
                  title="Klicka för att rensa fel"
                >
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {stats?.queueErrors} fel
                </Badge>
              )}
            </div>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">
            {stats?.queueProcessed || 0} av {totalQueue} processade
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{stats?.totalEmbeddings || 0}</div>
            <div className="text-xs text-muted-foreground">Totalt indexerade</div>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{Object.keys(stats?.byTable || {}).length}</div>
            <div className="text-xs text-muted-foreground">Tabeller</div>
          </div>
        </div>

        {/* Table Breakdown */}
        {stats?.byTable && Object.keys(stats.byTable).length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Indexerade per typ</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byTable)
                .sort((a, b) => b[1] - a[1])
                .map(([table, count]) => (
                  <Badge key={table} variant="secondary" className="text-xs">
                    {tableLabels[table] || table}: {count}
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
