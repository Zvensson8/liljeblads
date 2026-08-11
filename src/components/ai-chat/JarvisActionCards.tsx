import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Mail, Undo2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useJarvisUndo } from '@/hooks/useEdgeFunctions';
import { toast } from 'sonner';

export type JarvisAppliedAction = {
  tool: string;
  success: boolean;
  summary?: string;
  link?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  sent?: boolean;
  action_log_id?: string | null;
  undoable?: boolean;
  undo_until?: string | null;
  batch?: boolean;
  results?: JarvisAppliedAction[];
};

const toolLabels: Record<string, string> = {
  apply_work_order_status: 'Arbetsorder status',
  apply_project_status: 'Projekt status',
  apply_update_invoice_address: 'Fakturaadress',
  apply_create_work_order: 'Ny arbetsorder',
  apply_create_project: 'Nytt projekt',
  apply_property_note: 'Anteckning',
  apply_create_property: 'Ny fastighet',
  apply_update_property: 'Uppdaterad fastighet',
  apply_create_component: 'Ny komponent',
  apply_update_component: 'Uppdaterad komponent',
  apply_log_service: 'Service loggad',
  apply_create_contact: 'Ny kontakt',
  apply_update_contact: 'Uppdaterad kontakt',
  apply_create_todo: 'Ny todo',
  apply_complete_todo: 'Todo klar',
  apply_add_project_cost: 'Projektkostnad',
  apply_add_budget_item: 'Budgetrad',
  apply_complete_checklist_item: 'Checklista',
  batch_apply_actions: 'Batch-åtgärder',
  undo_last_action: 'Ångrad',
  undo_jarvis_action: 'Ångrad',
  send_to_me: 'Skickat till dig',
};

/** Tools we never offer undo for */
function isNonUndoableTool(tool: string): boolean {
  return (
    tool === 'send_to_me' ||
    tool.startsWith('undo_') ||
    tool.startsWith('suggest_') ||
    tool === 'batch_apply_actions'
  );
}

function defaultLink(a: JarvisAppliedAction): string | null {
  if (a.link) return a.link;
  if (a.entity_type === 'work_order') return '/work-orders';
  if (a.entity_type === 'project' && a.entity_id) return `/projects/${a.entity_id}`;
  if (a.entity_type === 'property' && a.entity_id) return `/property/${a.entity_id}`;
  if (a.entity_type === 'component' && a.entity_id) return `/components/${a.entity_id}`;
  return null;
}

function canShowUndo(a: JarvisAppliedAction, undone: boolean): boolean {
  if (undone || !a.success) return false;
  if (a.sent || isNonUndoableTool(a.tool)) return false;
  // Explicit flag from API, or any successful apply_*
  if (a.undoable === true) return true;
  if (a.tool.startsWith('apply_')) return true;
  return false;
}

function ActionCardRow({
  a,
  undoingId,
  undoneIds,
  onUndo,
}: {
  a: JarvisAppliedAction;
  undoingId: string | null;
  undoneIds: Set<string>;
  onUndo: (actionLogId: string | null) => void;
}) {
  const href = defaultLink(a);
  const label = toolLabels[a.tool] || a.tool;
  const isMail = a.tool === 'send_to_me' || a.sent;
  const logId = a.action_log_id || '';
  const rowKey = logId || `${a.tool}-${a.entity_id || a.summary || ''}`;
  const undone = undoneIds.has(rowKey) || (logId ? undoneIds.has(logId) : false);
  const showUndo = canShowUndo(a, undone);
  const isPending = undoingId !== null && (undoingId === logId || undoingId === rowKey);

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-xs flex flex-col gap-2',
        undone
          ? 'border-muted bg-muted/40 opacity-70'
          : a.success
            ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground'
            : 'border-destructive/40 bg-destructive/10',
      )}
    >
      <div className="flex items-start gap-2">
        {isMail ? (
          <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
        ) : (
          <CheckCircle2
            className={cn(
              'h-3.5 w-3.5 mt-0.5 shrink-0',
              a.success && !undone ? 'text-emerald-600' : 'text-muted-foreground',
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {label}
            {undone ? ' (ångrad)' : ''}
          </p>
          {a.summary && (
            <p className="text-muted-foreground mt-0.5 break-words">{a.summary}</p>
          )}
          {showUndo && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {a.undo_until
                ? `Kan ångras till ${new Date(a.undo_until).toLocaleTimeString('sv-SE')}`
                : 'Kan ångras inom 5 minuter'}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {href && a.success && !undone && (
          <Button asChild variant="secondary" size="sm" className="h-7 text-xs">
            <Link to={href}>
              Öppna
              <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        )}
        {showUndo && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={Boolean(undoingId)}
            onClick={() => onUndo(logId || null)}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Undo2 className="h-3 w-3 mr-1" />
            )}
            Ångra
          </Button>
        )}
      </div>
      {a.results && a.results.length > 0 && (
        <div className="pl-2 border-l space-y-1.5 mt-1">
          {a.results.map((child, j) => (
            <ActionCardRow
              key={`${child.tool}-${child.action_log_id || j}`}
              a={child}
              undoingId={undoingId}
              undoneIds={undoneIds}
              onUndo={onUndo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Confirmation cards after Jarvis apply_* / send_to_me / batch */
export default function JarvisActionCards({
  actions,
  className,
}: {
  actions: JarvisAppliedAction[];
  className?: string;
}) {
  const undo = useJarvisUndo();
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoneIds, setUndoneIds] = useState<Set<string>>(() => new Set());

  if (!actions?.length) return null;

  const handleUndo = async (actionLogId: string | null) => {
    const trackingKey = actionLogId || '__last__';
    setUndoingId(trackingKey);
    try {
      // With id: undo that row. Without: undo latest undoable action (5 min).
      const data = (await undo.mutateAsync(
        actionLogId ? { action_log_id: actionLogId } : {},
      )) as { error?: string; undone?: boolean; summary?: string };
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setUndoneIds((prev) => {
        const next = new Set(prev);
        if (actionLogId) next.add(actionLogId);
        next.add(trackingKey);
        // Mark all current actions as undone for last-undo case
        if (!actionLogId) {
          for (const a of actions) {
            if (a.action_log_id) next.add(a.action_log_id);
            next.add(`${a.tool}-${a.entity_id || a.summary || ''}`);
          }
        }
        return next;
      });
      toast.success(data?.summary || 'Åtgärden ångrades');
    } catch (e) {
      console.error(e);
      toast.error(
        'Kunde inte ångra. Har du deployat jarvis-undo och kört P2-migreringen?',
      );
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div className={cn('mt-2 space-y-2 w-full max-w-full', className)}>
      {actions.map((a, i) => (
        <ActionCardRow
          key={`${a.tool}-${a.action_log_id || a.entity_id || i}`}
          a={a}
          undoingId={undoingId}
          undoneIds={undoneIds}
          onUndo={handleUndo}
        />
      ))}
    </div>
  );
}
