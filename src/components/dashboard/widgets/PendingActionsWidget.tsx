import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, ArrowRight, Loader2 } from 'lucide-react';
import { AIActionCard, type AIAction } from '@/components/ai-chat/AIActionCard';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export function PendingActionsWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pendingActions = [], isLoading } = useQuery({
    queryKey: ['pending-ai-actions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ai_suggested_actions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return (data || []) as AIAction[];
    },
    enabled: !!user,
  });

  const handleApprove = async (actionId: string) => {
    try {
      // First update status to approved
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'approved', 
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', actionId);

      // Then execute the action
      const { data, error } = await supabase.functions.invoke('execute-ai-action', {
        body: { actionId }
      });

      if (error) throw error;

      toast.success('Åtgärd utförd!');
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
    } catch (error) {
      console.error('Error executing action:', error);
      toast.error('Kunde inte utföra åtgärden');
    }
  };

  const handleReject = async (actionId: string, reason?: string) => {
    try {
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason || null
        })
        .eq('id', actionId);

      toast.success('Förslag avvisat');
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
    } catch (error) {
      console.error('Error rejecting action:', error);
      toast.error('Kunde inte avvisa förslaget');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-yellow-500" />
            AI-förslag
          </CardTitle>
          {pendingActions.length > 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/ai-chat" className="flex items-center gap-1">
                Visa alla
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          )}
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
            {pendingActions.map((action) => (
              <AIActionCard
                key={action.id}
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
                mini
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
