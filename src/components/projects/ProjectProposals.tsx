import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useExecuteAIAction } from '@/hooks/useEdgeFunctions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Check, X, FolderKanban, ArrowRight, Lightbulb, Plus, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { ManualProposalDialog } from './ManualProposalDialog';

interface ProjectProposal {
  id: string;
  action_type: string;
  payload: {
    name: string;
    description?: string;
    type: 'investering' | 'underhall' | 'energi' | 'annat';
    budget?: number;
    property_id?: string;
    status?: string;
  };
  confidence_score: number;
  reasoning: string;
  status: string;
  created_at: string;
  source_document_id?: string;
}

export function ProjectProposals() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const executeAction = useExecuteAIAction();
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['project-proposals', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const { data, error } = await (supabase as any)
        .from('ai_suggested_actions')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('action_type', 'create_project')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as ProjectProposal[];
    },
    enabled: !!organization?.id,
  });

  const handleSelectChange = (id: string, selected: boolean) => {
    setSelectedProposals(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedProposals.size === proposals.length) {
      setSelectedProposals(new Set());
    } else {
      setSelectedProposals(new Set(proposals.map(p => p.id)));
    }
  };

  const handleApprove = async (proposalId: string) => {
    try {
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'approved', 
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      const data = await executeAction.mutateAsync({ actionId: proposalId }) as { result?: { project_id?: string } };

      toast.success('Projekt skapat!');
      queryClient.invalidateQueries({ queryKey: ['project-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });

      // Navigate to the new project
      if (data?.result?.project_id) {
        navigate(`/projects/${data.result.project_id}`);
      }
    } catch (error) {
      console.error('Error approving proposal:', error);
      toast.error('Kunde inte skapa projektet');
    }
  };

  const handleReject = async (proposalId: string) => {
    try {
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      toast.success('Förslag avvisat');
      queryClient.invalidateQueries({ queryKey: ['project-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
    } catch (error) {
      toast.error('Kunde inte avvisa förslaget');
    }
  };

  const handleBatchApprove = async () => {
    if (selectedProposals.size === 0) return;
    
    setProcessing(true);
    const ids = Array.from(selectedProposals);
    let successCount = 0;

    for (const id of ids) {
      try {
        await (supabase as any)
          .from('ai_suggested_actions')
          .update({ 
            status: 'approved', 
            reviewed_by: user?.id,
            reviewed_at: new Date().toISOString()
          })
          .eq('id', id);

        await supabase.functions.invoke('execute-ai-action', {
          body: { actionId: id }
        });

        successCount++;
      } catch (error) {
        console.error('Error approving:', id, error);
      }
    }

    setProcessing(false);
    setSelectedProposals(new Set());

    if (successCount > 0) {
      toast.success(`${successCount} projekt skapad${successCount > 1 ? 'e' : ''}!`);
      queryClient.invalidateQueries({ queryKey: ['project-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
    }
  };

  const handleBatchReject = async () => {
    if (selectedProposals.size === 0) return;
    
    setProcessing(true);
    const ids = Array.from(selectedProposals);

    try {
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .in('id', ids);

      toast.success(`${ids.length} förslag avvisade`);
      queryClient.invalidateQueries({ queryKey: ['project-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
    } catch (error) {
      toast.error('Kunde inte avvisa förslagen');
    }

    setProcessing(false);
    setSelectedProposals(new Set());
  };

  const getTypeBadge = (type: string) => {
    const config: Record<string, { label: string; className: string }> = {
      investering: { label: 'Investering', className: 'bg-purple-500' },
      underhall: { label: 'Underhåll', className: 'bg-blue-500' },
      energi: { label: 'Energi', className: 'bg-green-500' },
      annat: { label: 'Annat', className: 'bg-gray-500' },
    };
    const c = config[type] || config.annat;
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('sv-SE', { 
      style: 'currency', 
      currency: 'SEK',
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="py-12 text-center">
            <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Inga projektförslag</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
              När du laddar upp serviceprotokoll och AI:n identifierar behov av större investeringar
              eller underhållsprojekt kommer de att visas här som förslag.
            </p>
            <Button onClick={() => setShowManualDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Lägg till projektförslag manuellt
            </Button>
          </CardContent>
        </Card>
        <ManualProposalDialog
          open={showManualDialog}
          onOpenChange={setShowManualDialog}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['project-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
          }}
        />
      </>
    );
  }

  const allSelected = proposals.length > 0 && selectedProposals.size === proposals.length;

  return (
    <div className="space-y-4">
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {proposals.length} projektförslag att granska
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowManualDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Lägg till manuellt
        </Button>
      </div>

      {/* Batch actions header */}
      {proposals.length > 1 && (
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleSelectAll}
            />
            <span className="text-sm">
              {selectedProposals.size > 0 
                ? `${selectedProposals.size} valda`
                : 'Markera alla'}
            </span>
          </div>
          {selectedProposals.size > 0 && (
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={handleBatchApprove}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Skapa projekt ({selectedProposals.size})
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleBatchReject}
                disabled={processing}
              >
                <X className="h-4 w-4 mr-1" />
                Avvisa
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Proposals list */}
      <div className="space-y-3">
        {proposals.map((proposal) => {
          const isManual = !proposal.source_document_id && proposal.confidence_score === 1;
          return (
            <Card key={proposal.id} className={`border-l-4 ${isManual ? 'border-l-blue-500' : 'border-l-purple-500'}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  {proposals.length > 1 && (
                    <Checkbox
                      checked={selectedProposals.has(proposal.id)}
                      onCheckedChange={(checked) => handleSelectChange(proposal.id, !!checked)}
                      className="mt-1"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isManual ? (
                        <User className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-yellow-500" />
                      )}
                      <CardTitle className="text-base">{proposal.payload.name}</CardTitle>
                      {getTypeBadge(proposal.payload.type)}
                      {!isManual && (
                        <Badge variant="outline" className="text-xs">
                          {Math.round(proposal.confidence_score * 100)}% säker
                        </Badge>
                      )}
                      {isManual && (
                        <Badge variant="secondary" className="text-xs">
                          Manuellt
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      {format(new Date(proposal.created_at), 'PPP', { locale: sv })}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {proposal.payload.description && (
                  <p className="text-sm">{proposal.payload.description}</p>
                )}
                
                <div className="flex flex-wrap gap-4 text-sm">
                  {proposal.payload.budget && (
                    <div>
                      <span className="text-muted-foreground">Uppskattat budget: </span>
                      <span className="font-medium">{formatCurrency(proposal.payload.budget)}</span>
                    </div>
                  )}
                </div>

                {proposal.reasoning && (
                  <p className="text-xs text-muted-foreground italic bg-muted/50 rounded p-2">
                    💡 {proposal.reasoning}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => handleApprove(proposal.id)}>
                    <Check className="h-4 w-4 mr-1" />
                    Skapa projekt
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReject(proposal.id)}>
                    <X className="h-4 w-4 mr-1" />
                    Avvisa
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ManualProposalDialog
        open={showManualDialog}
        onOpenChange={setShowManualDialog}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['project-proposals'] });
          queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
        }}
      />
    </div>
  );
}
