import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useIsFounder } from '@/hooks/useUserRoles';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
  XCircle,
  Bot,
} from 'lucide-react';
import { useAgentPolicy } from '@/hooks/useAgentPolicy';
import { AIActionCard, type AIAction } from '@/components/ai-chat/AIActionCard';
import { useUpdateAISuggestedAction } from '@/hooks/useAISuggestedActions';
import { useExecuteAIAction } from '@/hooks/useEdgeFunctions';
import { maybeTuneRiskPolicyFromFeedback } from '@/lib/riskPolicyTuning';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';

type ActionRow = {
  id: string;
  action_type: string;
  status: string;
  confidence_score: number | null;
  reasoning: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  executed_at: string | null;
  reviewed_at: string | null;
  rejection_reason?: string | null;
  execution_result?: Record<string, unknown> | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Väntar',
  approved: 'Godkänd',
  rejected: 'Avvisad',
  executed: 'Utförd',
  failed: 'Misslyckad',
};

function statusVariant(
  s: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'executed') return 'default';
  if (s === 'pending') return 'secondary';
  if (s === 'rejected' || s === 'failed') return 'destructive';
  return 'outline';
}

export default function AgentActivity({ embedded = false }: { embedded?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const { isFounder } = useIsFounder();
  const orgId = organization?.id;
  const { data: policy } = useAgentPolicy(orgId);
  const updateAction = useUpdateAISuggestedAction();
  const executeAction = useExecuteAIAction();

  const since = useMemo(() => subDays(new Date(), 30).toISOString(), []);

  const { data: actions = [], isLoading, refetch } = useQuery({
    queryKey: ['agent-activity', orgId, since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_suggested_actions')
        .select(
          'id, action_type, status, confidence_score, reasoning, payload, created_at, executed_at, reviewed_at, rejection_reason, execution_result',
        )
        .eq('organization_id', orgId!)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ActionRow[];
    },
    enabled: !!user && !!orgId,
  });

  const invalidate = () => {
    void refetch();
    queryClient.invalidateQueries({ queryKey: queryKeys.aiSuggestedActions.all });
  };

  const tunePolicyQuietly = async () => {
    if (!orgId) return;
    try {
      await maybeTuneRiskPolicyFromFeedback(orgId);
    } catch {
      /* ignore */
    }
  };

  const handleApprove = async (actionId: string) => {
    try {
      await updateAction.mutateAsync({
        id: actionId,
        patch: {
          status: 'approved',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        },
      });
      await executeAction.mutateAsync({ actionId });
      toast.success('Åtgärd godkänd och utförd');
      invalidate();
      void tunePolicyQuietly();
    } catch (e: unknown) {
      console.error(e);
      toast.error(getErrorMessage(e) || 'Kunde inte godkänna åtgärden');
    }
  };

  const handleReject = async (actionId: string, reason?: string) => {
    try {
      await updateAction.mutateAsync({
        id: actionId,
        patch: {
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason || null,
        },
      });
      toast.success('Förslag avvisat');
      invalidate();
      void tunePolicyQuietly();
    } catch (e: unknown) {
      console.error(e);
      toast.error(getErrorMessage(e) || 'Kunde inte avvisa förslaget');
    }
  };

  if (!authLoading && !user) {
    navigate('/auth');
  }

  const pendingActions = useMemo(
    () =>
      actions
        .filter((a) => a.status === 'pending')
        .map(
          (a) =>
            ({
              id: a.id,
              action_type: a.action_type,
              status: a.status as AIAction['status'],
              confidence_score: a.confidence_score ?? 0,
              reasoning: a.reasoning || '',
              payload: (a.payload || {}) as Record<string, unknown>,
              created_at: a.created_at,
            }) as AIAction,
        ),
    [actions],
  );

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let weibull = 0;
    let chat = 0;
    for (const a of actions) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      const src = (a.payload as { source?: string } | null)?.source;
      if (src === 'weibull_risk') weibull += 1;
      else chat += 1;
    }
    const proposed = (byStatus.pending || 0) + (byStatus.approved || 0);
    const done = byStatus.executed || 0;
    const rejected = byStatus.rejected || 0;
    const conversion =
      proposed + done + rejected > 0
        ? Math.round((done / (proposed + done + rejected)) * 100)
        : 0;
    return { byStatus, weibull, chat, proposed, done, rejected, conversion };
  }, [actions]);

  const recent = actions.slice(0, 40);

  const body = (
            <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-muted-foreground text-sm">
                  Jarvis-förslag senaste 30 dagarna: föreslaget → godkänt → utfört
                </p>
                <div className="flex gap-2">
                  {!embedded && (
                    <Button variant="outline" size="sm" onClick={() => navigate('/jarvis?tab=chat')}>
                      <Bot className="h-4 w-4 mr-1" />
                      Jarvis-chat
                    </Button>
                  )}
                  {isFounder && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/organization/settings')}
                    >
                      Policy
                    </Button>
                  )}
                </div>
              </div>

              {policy && (
                <Card className="border-dashed">
                  <CardContent className="py-3 text-sm flex flex-wrap gap-3 items-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>
                      Riskförslag:{' '}
                      <strong>
                        {policy.risk_suggest_enabled ? 'på' : 'av'}
                      </strong>
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      min nivå <strong>{policy.min_risk_level}</strong>
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      konfidens <strong>{policy.min_confidence}</strong>
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      max <strong>{policy.max_suggestions_per_run}</strong>/körning
                    </span>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Väntar / godkänd
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{stats.proposed}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      pending {stats.byStatus.pending || 0} · approved{' '}
                      {stats.byStatus.approved || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Utförda
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{stats.done}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      inkl. stängda via slutförd WO
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      Avvisade
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{stats.rejected}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Genomförandegrad
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{stats.conversion}%</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      utförda / (öppna+utförda+avvisade)
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Källa</CardTitle>
                    <CardDescription>Weibull-risk vs övrig AI</CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-6 text-sm">
                    <div>
                      <p className="text-2xl font-semibold">{stats.weibull}</p>
                      <p className="text-muted-foreground">Prediktiv risk</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{stats.chat}</p>
                      <p className="text-muted-foreground">Chat / protokoll / annat</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Statusfördelning</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {Object.entries(stats.byStatus).map(([k, v]) => (
                      <Badge key={k} variant={statusVariant(k)}>
                        {STATUS_LABEL[k] || k}: {v}
                      </Badge>
                    ))}
                    {Object.keys(stats.byStatus).length === 0 && (
                      <span className="text-sm text-muted-foreground">Ingen data</span>
                    )}
                  </CardContent>
                </Card>
              </div>

              {pendingActions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Väntar på dig ({pendingActions.length})
                    </CardTitle>
                    <CardDescription>
                      Godkänn skapar arbetsorder / utför åtgärden. Avvisa stänger förslaget.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pendingActions.map((action) => (
                      <AIActionCard
                        key={action.id}
                        action={action}
                        onApprove={handleApprove}
                        onReject={handleReject}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Senaste förslag</CardTitle>
                  <CardDescription>Senaste 40 av 200 hämtade (historik)</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading && (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!isLoading && recent.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Inga agentförslag senaste 30 dagarna
                    </p>
                  )}
                  <div className="space-y-2">
                    {recent.map((a) => {
                      const p = a.payload || {};
                      const title =
                        (p.action as string) ||
                        (p.title as string) ||
                        a.action_type;
                      const src =
                        (p.source as string) === 'weibull_risk'
                          ? 'Risk'
                          : 'AI';
                      return (
                        <div
                          key={a.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border rounded-lg p-3 text-sm"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{title}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {src}
                              </Badge>
                              <Badge variant={statusVariant(a.status)}>
                                {STATUS_LABEL[a.status] || a.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {a.reasoning || '—'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(a.created_at), 'yyyy-MM-dd HH:mm', {
                                locale: sv,
                              })}
                              {typeof p.component_name === 'string' &&
                                ` · ${p.component_name}`}
                              {typeof p.property_name === 'string' &&
                                ` · ${p.property_name}`}
                            </p>
                          </div>
                          {a.confidence_score != null && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              conf {(a.confidence_score * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
  );

  if (embedded) {
    return <div className="h-full overflow-y-auto bg-background">{body}</div>;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Jarvis-förslag</h1>
            </div>
          </header>
          <main className="flex-1 pb-20 md:pb-6">{body}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
