import { useState } from 'react';
import { Check, X, Loader2, Wrench, CheckSquare, Calendar, Bell, Settings, FolderKanban } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

export interface AIAction {
  id: string;
  action_type: string;
  payload: Record<string, any>;
  confidence_score: number;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  execution_result?: Record<string, any>;
  rejection_reason?: string;
  created_at?: string;
}

interface AIActionCardProps {
  action: AIAction;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  mini?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (id: string, selected: boolean) => void;
}

const actionConfig: Record<string, { icon: typeof Wrench; label: string; colorClass: string }> = {
  create_work_order: { 
    icon: Wrench, 
    label: 'Skapa arbetsorder', 
    colorClass: 'border-l-blue-500' 
  },
  create_todo: { 
    icon: CheckSquare, 
    label: 'Skapa uppgift', 
    colorClass: 'border-l-green-500' 
  },
  schedule_maintenance: { 
    icon: Calendar, 
    label: 'Schemalägg underhåll', 
    colorClass: 'border-l-orange-500' 
  },
  send_reminder: { 
    icon: Bell, 
    label: 'Skicka påminnelse', 
    colorClass: 'border-l-purple-500' 
  },
  update_component_status: { 
    icon: Settings, 
    label: 'Uppdatera komponent', 
    colorClass: 'border-l-yellow-500' 
  },
  create_project: { 
    icon: FolderKanban, 
    label: 'Skapa projekt', 
    colorClass: 'border-l-pink-500' 
  },
};

export function AIActionCard({ 
  action, 
  onApprove, 
  onReject, 
  mini = false,
  selectable = false,
  selected = false,
  onSelectChange
}: AIActionCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const config = actionConfig[action.action_type] || {
    icon: Settings,
    label: action.action_type,
    colorClass: 'border-l-gray-500'
  };

  const Icon = config.icon;
  const confidencePercent = Math.round((action.confidence_score || 0) * 100);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove(action.id);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject(action.id, rejectReason || undefined);
    } finally {
      setIsRejecting(false);
      setShowRejectInput(false);
      setRejectReason('');
    }
  };

  // Mini version for dashboard widget
  if (mini) {
    return (
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-lg border-l-4 bg-muted/50",
        config.colorClass
      )}>
        {selectable && action.status === 'pending' && (
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelectChange?.(action.id, !!checked)}
            className="flex-shrink-0"
          />
        )}
        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {action.payload.action || action.payload.title || config.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {confidencePercent}% säker
          </p>
        </div>
        {action.status === 'pending' && !selectable && (
          <div className="flex gap-1">
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7"
              onClick={handleApprove}
              disabled={isApproving}
            >
              {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </Button>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onReject(action.id)}
              disabled={isRejecting}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("border-l-4 transition-all", config.colorClass)}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="font-medium text-sm">{config.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {confidencePercent}% säker
            </Badge>
            {action.status === 'executed' && (
              <Badge variant="default" className="text-xs bg-green-600">
                <Check className="h-3 w-3 mr-1" />
                Utförd
              </Badge>
            )}
            {action.status === 'rejected' && (
              <Badge variant="destructive" className="text-xs">
                Avvisad
              </Badge>
            )}
            {action.status === 'failed' && (
              <Badge variant="destructive" className="text-xs">
                Misslyckades
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 px-4 pb-4">
        {/* Action details based on type */}
        {action.payload.action && (
          <p className="text-sm font-medium">{action.payload.action}</p>
        )}
        {action.payload.title && (
          <p className="text-sm font-medium">{action.payload.title}</p>
        )}
        
        {/* Show additional payload details */}
        <div className="text-xs text-muted-foreground space-y-1">
          {action.payload.priority && (
            <p>Prioritet: <span className="font-medium capitalize">{action.payload.priority}</span></p>
          )}
          {action.payload.due_date && (
            <p>Deadline: <span className="font-medium">{action.payload.due_date}</span></p>
          )}
          {action.payload.suggested_date && (
            <p>Föreslagen datum: <span className="font-medium">{action.payload.suggested_date}</span></p>
          )}
          {action.payload.maintenance_type && (
            <p>Underhållstyp: <span className="font-medium">{action.payload.maintenance_type}</span></p>
          )}
        </div>
        
        {/* AI reasoning */}
        {action.reasoning && (
          <p className="text-xs text-muted-foreground italic bg-muted/50 rounded p-2">
            💡 {action.reasoning}
          </p>
        )}
        
        {/* Rejection reason */}
        {action.status === 'rejected' && action.rejection_reason && (
          <p className="text-xs text-destructive">
            Anledning: {action.rejection_reason}
          </p>
        )}
        
        {/* Execution result */}
        {action.status === 'executed' && action.execution_result && (
          <p className="text-xs text-green-600">
            ✓ Skapad med ID: {action.execution_result.work_order_id || action.execution_result.todo_id || action.execution_result.project_id}
          </p>
        )}
        
        {/* Action buttons */}
        {action.status === 'pending' && (
          <div className="pt-2">
            {showRejectInput ? (
              <div className="space-y-2">
                <Textarea
                  placeholder="Anledning till avvisning (valfritt)..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="text-sm min-h-[60px]"
                />
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={handleReject}
                    disabled={isRejecting}
                  >
                    {isRejecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <X className="h-4 w-4 mr-1" />}
                    Bekräfta avvisning
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => { setShowRejectInput(false); setRejectReason(''); }}
                  >
                    Avbryt
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="flex-1"
                >
                  {isApproving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Godkänn & utför
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowRejectInput(true)}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-1" />
                  Avvisa
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
