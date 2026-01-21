import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Check, X, FileText, Wrench, CheckSquare, FolderKanban } from 'lucide-react';
import { AIActionCard, type AIAction } from '@/components/ai-chat/AIActionCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface ProtocolAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentName: string;
  componentId: string;
}

type AnalysisState = 'idle' | 'analyzing' | 'complete' | 'error';

export function ProtocolAnalysisDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  componentId
}: ProtocolAnalysisDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AnalysisState>('idle');
  const [suggestions, setSuggestions] = useState<AIAction[]>([]);
  const [summary, setSummary] = useState<{ work_orders: number; todos: number; project_proposals: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  const startAnalysis = async () => {
    setState('analyzing');
    setError(null);
    setSuggestions([]);
    setSummary(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-protocol', {
        body: {
          documentId,
          documentType: 'component_documents',
          componentId
        }
      });

      if (fnError) throw fnError;

      if (data.error) {
        throw new Error(data.error);
      }

      setSuggestions(data.suggestions || []);
      setSummary(data.summary);
      
      // Auto-select all high-confidence suggestions
      const highConfidence = (data.suggestions || [])
        .filter((s: AIAction) => s.confidence_score >= 0.7)
        .map((s: AIAction) => s.id);
      setSelectedActions(new Set(highConfidence));
      
      setState('complete');

      if (data.suggestions?.length > 0) {
        toast.success(`${data.suggestions.length} åtgärdsförslag genererade`);
      } else {
        toast.info('Inga åtgärdsförslag kunde genereras');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analys misslyckades');
      setState('error');
      toast.error('Kunde inte analysera protokollet');
    }
  };

  const handleSelectChange = (actionId: string, selected: boolean) => {
    setSelectedActions(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(actionId);
      } else {
        next.delete(actionId);
      }
      return next;
    });
  };

  const handleApproveSelected = async () => {
    if (selectedActions.size === 0) return;
    
    setProcessing(true);
    const actionIds = Array.from(selectedActions);
    let successCount = 0;

    for (const actionId of actionIds) {
      try {
        await (supabase as any)
          .from('ai_suggested_actions')
          .update({ 
            status: 'approved', 
            reviewed_by: user?.id,
            reviewed_at: new Date().toISOString()
          })
          .eq('id', actionId);

        await supabase.functions.invoke('execute-ai-action', {
          body: { actionId }
        });

        successCount++;
      } catch (error) {
        console.error('Error executing action:', actionId, error);
      }
    }

    setProcessing(false);
    
    if (successCount > 0) {
      toast.success(`${successCount} åtgärd${successCount > 1 ? 'er' : ''} skapad${successCount > 1 ? 'e' : ''}!`);
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['property-todos'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }

    onOpenChange(false);
  };

  const handleRejectAll = async () => {
    setProcessing(true);
    const actionIds = suggestions.map(s => s.id);

    try {
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .in('id', actionIds);

      toast.success('Alla förslag avvisade');
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
    } catch (error) {
      console.error('Error rejecting:', error);
    }

    setProcessing(false);
    onOpenChange(false);
  };

  const handleApprove = async (actionId: string) => {
    try {
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'approved', 
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', actionId);

      await supabase.functions.invoke('execute-ai-action', {
        body: { actionId }
      });

      toast.success('Åtgärd utförd!');
      setSuggestions(prev => prev.map(s => 
        s.id === actionId ? { ...s, status: 'executed' as const } : s
      ));
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
    } catch (error) {
      toast.error('Kunde inte utföra åtgärden');
    }
  };

  const handleReject = async (actionId: string) => {
    try {
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', actionId);

      toast.success('Förslag avvisat');
      setSuggestions(prev => prev.map(s => 
        s.id === actionId ? { ...s, status: 'rejected' as const } : s
      ));
    } catch (error) {
      toast.error('Kunde inte avvisa förslaget');
    }
  };

  const getActionTypeIcon = (type: string) => {
    switch (type) {
      case 'create_work_order': return <Wrench className="h-4 w-4" />;
      case 'create_todo': return <CheckSquare className="h-4 w-4" />;
      case 'create_project': return <FolderKanban className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            AI-analys av protokoll
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {documentName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {state === 'idle' && (
            <div className="text-center py-8 space-y-4">
              <p className="text-muted-foreground">
                Vill du att AI analyserar detta serviceprotokoll och föreslår åtgärder?
              </p>
              <div className="flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Wrench className="h-4 w-4 text-blue-500" />
                  <span>Arbetsordrar</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckSquare className="h-4 w-4 text-green-500" />
                  <span>Att göra</span>
                </div>
                <div className="flex items-center gap-1">
                  <FolderKanban className="h-4 w-4 text-purple-500" />
                  <span>Projektförslag</span>
                </div>
              </div>
              <Button onClick={startAnalysis} size="lg">
                <Sparkles className="h-4 w-4 mr-2" />
                Starta analys
              </Button>
            </div>
          )}

          {state === 'analyzing' && (
            <div className="text-center py-12 space-y-4">
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground">Analyserar protokollet...</p>
              <p className="text-xs text-muted-foreground">Detta kan ta upp till 30 sekunder</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <X className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-destructive">{error}</p>
              <Button onClick={startAnalysis} variant="outline">
                Försök igen
              </Button>
            </div>
          )}

          {state === 'complete' && (
            <div className="space-y-4">
              {/* Summary */}
              {summary && (
                <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    {summary.work_orders} arbetsordrar
                  </Badge>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <CheckSquare className="h-3 w-3" />
                    {summary.todos} uppgifter
                  </Badge>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <FolderKanban className="h-3 w-3" />
                    {summary.project_proposals} projektförslag
                  </Badge>
                </div>
              )}

              {/* Batch selection header */}
              {pendingSuggestions.length > 1 && (
                <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedActions.size === pendingSuggestions.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedActions(new Set(pendingSuggestions.map(s => s.id)));
                        } else {
                          setSelectedActions(new Set());
                        }
                      }}
                    />
                    <span className="text-sm">
                      {selectedActions.size > 0 
                        ? `${selectedActions.size} valda`
                        : 'Markera alla'}
                    </span>
                  </div>
                  {selectedActions.size > 0 && (
                    <Button 
                      size="sm" 
                      onClick={handleApproveSelected}
                      disabled={processing}
                    >
                      {processing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Check className="h-4 w-4 mr-1" />
                      )}
                      Godkänn valda ({selectedActions.size})
                    </Button>
                  )}
                </div>
              )}

              {/* Suggestions list */}
              {suggestions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Inga åtgärdsförslag kunde genereras från protokollet.</p>
                  <p className="text-sm mt-2">Protokollet innehåller inga uppenbara avvikelser eller rekommendationer.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {suggestions.map((action) => (
                    <div key={action.id} className="flex items-start gap-2">
                      {pendingSuggestions.length > 1 && action.status === 'pending' && (
                        <Checkbox
                          checked={selectedActions.has(action.id)}
                          onCheckedChange={(checked) => handleSelectChange(action.id, !!checked)}
                          className="mt-4"
                        />
                      )}
                      <div className="flex-1">
                        <AIActionCard
                          action={action}
                          onApprove={handleApprove}
                          onReject={handleReject}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {state === 'complete' && suggestions.length > 0 && (
          <div className="flex justify-between pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={handleRejectAll}
              disabled={processing || pendingSuggestions.length === 0}
            >
              <X className="h-4 w-4 mr-1" />
              Avvisa alla
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
            >
              Stäng
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
