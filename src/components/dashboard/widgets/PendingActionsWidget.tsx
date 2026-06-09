import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, ArrowRight, Loader2, Check, X, ListChecks } from 'lucide-react';
import { AIActionCard, type AIAction } from '@/components/ai-chat/AIActionCard';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useAISuggestedActions,
  useUpdateAISuggestedAction,
} from '@/hooks/useAISuggestedActions';
import { useExecuteAIAction } from '@/hooks/useEdgeFunctions';
import { queryKeys } from '@/lib/queryKeys';

export function PendingActionsWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const { data: actions = [], isLoading } = useAISuggestedActions({ status: 'pending' });
  const pendingActions = useMemo(() => actions.slice(0, 10) as AIAction[], [actions]);
  const updateAction = useUpdateAISuggestedAction();
  const executeAction = useExecuteAIAction();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.aiSuggestedActions.all });
    queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
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

      toast.success('Åtgärd utförd!');
      invalidate();
    } catch (error) {
      console.error('Error executing action:', error);
      toast.error('Kunde inte utföra åtgärden');
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
    } catch (error) {
      console.error('Error rejecting action:', error);
      toast.error('Kunde inte avvisa förslaget');
    }
  };

  const handleSelectChange = (actionId: string, selected: boolean) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (selected) next.add(actionId);
      else next.delete(actionId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedActions.size === pendingActions.length) {
      setSelectedActions(new Set());
    } else {
      setSelectedActions(new Set(pendingActions.map((a) => a.id)));
    }
  };

  const handleBatchApprove = async () => {
    if (selectedActions.size === 0) return;
    setIsBatchProcessing(true);
    const actionIds = Array.from(selectedActions);
    let successCount = 0;
    let errorCount = 0;

    for (const actionId of actionIds) {
      try {
        await updateAction.mutateAsync({
          id: actionId,
          patch: {
            status: 'approved',
            reviewed_by: user?.id,
            reviewed_at: new Date().toISOString(),
          },
        });
        await supabase.functions.invoke('execute-ai-action', { body: { actionId } });
        successCount++;
      } catch (error) {
        console.error('Error executing action:', actionId, error);
        errorCount++;
      }
    }

    setIsBatchProcessing(false);
    setSelectedActions(new Set());
    setIsBatchMode(false);

    if (successCount > 0) {
      toast.success(`${successCount} åtgärd${successCount > 1 ? 'er' : ''} utförd${successCount > 1 ? 'a' : ''}!`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} åtgärd${errorCount > 1 ? 'er' : ''} misslyckades`);
    }
    invalidate();
  };

  const handleBatchReject = async () => {
    if (selectedActions.size === 0) return;
    setIsBatchProcessing(true);
    const actionIds = Array.from(selectedActions);

    try {
      await Promise.all(
        actionIds.map((id) =>
          updateAction.mutateAsync({
            id,
            patch: {
              status: 'rejected',
              reviewed_by: user?.id,
              reviewed_at: new Date().toISOString(),
              rejection_reason: 'Batch-avvisad',
            },
          }),
        ),
      );
      toast.success(`${actionIds.length} förslag avvisade`);
    } catch (error) {
      console.error('Error batch rejecting:', error);
      toast.error('Kunde inte avvisa förslagen');
    }

    setIsBatchProcessing(false);
    setSelectedActions(new Set());
    setIsBatchMode(false);
    invalidate();
  };

  const allSelected = pendingActions.length > 0 && selectedActions.size === pendingActions.length;
  const someSelected = selectedActions.size > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-yellow-500" />
            AI-förslag
            {pendingActions.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                ({pendingActions.length})
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {pendingActions.length > 1 && (
              <Button
                variant={isBatchMode ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => {
                  setIsBatchMode(!isBatchMode);
                  if (isBatchMode) setSelectedActions(new Set());
                }}
              >
                <ListChecks className="h-3 w-3 mr-1" />
                {isBatchMode ? 'Avbryt' : 'Välj flera'}
              </Button>
            )}
            {pendingActions.length > 0 && !isBatchMode && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/ai-chat" className="flex items-center gap-1">
                  Visa alla
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : pendingActions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Inga väntande AI-förslag
          </p>
        ) : (
          <div className="space-y-2">
            {isBatchMode && (
              <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-lg mb-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    id="select-all"
                  />
                  <label htmlFor="select-all" className="text-sm cursor-pointer">
                    {allSelected ? 'Avmarkera alla' : 'Markera alla'}
                  </label>
                </div>
                {someSelected && (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={handleBatchApprove} disabled={isBatchProcessing}>
                      {isBatchProcessing ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      Godkänn ({selectedActions.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBatchReject}
                      disabled={isBatchProcessing}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Avvisa
                    </Button>
                  </div>
                )}
              </div>
            )}
            {pendingActions.map((action) => (
              <AIActionCard
                key={action.id}
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
                mini
                selectable={isBatchMode}
                selected={selectedActions.has(action.id)}
                onSelectChange={handleSelectChange}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
