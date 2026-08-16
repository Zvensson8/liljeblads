import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { History, ExternalLink, Undo2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useJarvisUndo } from '@/hooks/useEdgeFunctions';
import { isWithinJarvisUndoWindow } from '@/lib/jarvisPolicy';
import { toast } from 'sonner';
import { useState } from 'react';

type LogRow = {
  id: string;
  tool_name: string;
  success: boolean;
  entity_type: string | null;
  entity_id: string | null;
  link_hint: string | null;
  created_at: string;
  undone_at: string | null;
  reverse_payload: unknown;
  result_summary: Record<string, unknown> | null;
};

const LABELS: Record<string, string> = {
  apply_create_work_order: 'Ny arbetsorder',
  apply_create_project: 'Nytt projekt',
  apply_work_order_status: 'WO-status',
  apply_project_status: 'Projektstatus',
  apply_update_project: 'Projekt uppdaterat',
  apply_add_project_cost: 'Projektkostnad',
  apply_add_budget_item: 'Budgetrad',
  apply_complete_todo: 'Todo klar',
  apply_create_todo: 'Ny todo',
  apply_complete_checklist_item: 'Checklista',
  apply_create_component: 'Ny komponent',
  apply_log_service: 'Service',
  apply_create_contact: 'Kontakt',
  send_to_me: 'E-post till dig',
  undo_jarvis_action: 'Ångra',
  undo_last_action: 'Ångra senaste',
  batch_apply_actions: 'Batch',
};

/** C: last 20 Jarvis actions for the current user in active org */
export default function JarvisRecentActions() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const undo = useJarvisUndo();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['jarvis-action-log', orgId, user?.id],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jarvis_action_log')
        .select(
          'id, tool_name, success, entity_type, entity_id, link_hint, created_at, undone_at, reverse_payload, result_summary',
        )
        .eq('organization_id', orgId!)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data || []) as unknown as LogRow[];
    },
  });

  const handleUndo = async (id: string) => {
    setBusyId(id);
    try {
      const res = (await undo.mutateAsync({ action_log_id: id })) as {
        error?: string;
        summary?: string;
      };
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res?.summary || 'Ångrad');
      await refetch();
    } catch {
      toast.error('Kunde inte ångra');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Senaste Jarvis-åtgärder
        </CardTitle>
        <CardDescription className="text-xs">
          Spårbarhet för dina apply/send (org-scoped). Ångra inom 5 min om möjligt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Inga loggade åtgärder än. Skapa en WO via chatten så dyker den upp här.
          </p>
        ) : (
          rows.map((r) => {
            const summary =
              (r.result_summary?.summary as string) ||
              (r.result_summary?.error as string) ||
              null;
            const canUndo =
              r.success &&
              !r.undone_at &&
              r.reverse_payload != null &&
              r.tool_name.startsWith('apply_') &&
              isWithinJarvisUndoWindow(r.created_at);

            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {LABELS[r.tool_name] || r.tool_name}
                    </span>
                    {r.undone_at ? (
                      <Badge variant="outline" className="text-[10px]">
                        Ångrad
                      </Badge>
                    ) : r.success ? (
                      <Badge variant="secondary" className="text-[10px]">
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        Fel
                      </Badge>
                    )}
                  </div>
                  {summary && (
                    <p className="text-muted-foreground mt-0.5 truncate max-w-md">
                      {summary}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-0.5">
                    {format(new Date(r.created_at), 'yyyy-MM-dd HH:mm', {
                      locale: sv,
                    })}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {r.link_hint && (
                    <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                      <Link to={r.link_hint}>
                        Öppna
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  )}
                  {canUndo && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={busyId === r.id}
                      onClick={() => handleUndo(r.id)}
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Undo2 className="h-3 w-3 mr-1" />
                          Ångra
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
