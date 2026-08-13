import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { Activity, CheckCircle2, Undo2, Mail, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/** Fas 2: Jarvis health snapshot for dashboard */
export function JarvisHealthWidget() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const since = subDays(new Date(), 7).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['jarvis-health', orgId, since],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const [logRes, hitlRes, embQueue] = await Promise.all([
        supabase
          .from('jarvis_action_log')
          .select('tool_name, success, undone_at')
          .eq('organization_id', orgId!)
          .gte('created_at', since)
          .limit(500),
        supabase
          .from('ai_suggested_actions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!)
          .eq('status', 'pending'),
        supabase
          .from('embedding_queue')
          .select('id', { count: 'exact', head: true })
          .eq('processed', false)
          .is('error', null),
      ]);

      const rows = logRes.data || [];
      const applyRows = rows.filter((r) => r.tool_name?.startsWith('apply_'));
      const applyOk = applyRows.filter((r) => r.success).length;
      const applyTotal = applyRows.length;
      const undos = rows.filter(
        (r) => r.undone_at || r.tool_name?.startsWith('undo_'),
      ).length;
      const sends = rows.filter((r) => r.tool_name === 'send_to_me');
      const sendOk = sends.filter((r) => r.success).length;

      return {
        applySuccessPct: applyTotal
          ? Math.round((applyOk / applyTotal) * 100)
          : null,
        applyTotal,
        undos,
        sendOk,
        sendTotal: sends.length,
        pendingHitl: hitlRes.count ?? 0,
        embedPending: embQueue.count ?? 0,
      };
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Jarvis hälsa (7 dagar)
        </CardTitle>
        <CardDescription className="text-xs">
          Kill metrics — spår från action log
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border p-2">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <CheckCircle2 className="h-3 w-3" /> Apply OK
              </div>
              <p className="font-semibold">
                {data.applySuccessPct != null
                  ? `${data.applySuccessPct}%`
                  : '—'}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({data.applyTotal})
                </span>
              </p>
            </div>
            <div className="rounded-md border p-2">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Undo2 className="h-3 w-3" /> Ångringar
              </div>
              <p className="font-semibold">{data.undos}</p>
            </div>
            <div className="rounded-md border p-2">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Mail className="h-3 w-3" /> send_to_me
              </div>
              <p className="font-semibold">
                {data.sendOk}/{data.sendTotal}
              </p>
            </div>
            <div className="rounded-md border p-2">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Sparkles className="h-3 w-3" /> Pending HITL
              </div>
              <p className="font-semibold">{data.pendingHitl}</p>
            </div>
          </div>
        )}
        {data && data.embedPending > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {data.embedPending} dokument väntar AI-index
          </p>
        )}
        <Button asChild variant="outline" size="sm" className="w-full text-xs">
          <Link to="/jarvis?tab=log">Öppna Jarvis-logg</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
