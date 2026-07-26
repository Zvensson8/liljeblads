import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { storageService } from '@/services/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Calendar, Download, FileText, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';

interface ServiceRecord {
  id: string;
  performed_date: string;
  action_type: string;
  supplier: string | null;
  category: string | null;
  cost: number | null;
}

interface ServiceDoc {
  id: string;
  maintenance_history_id: string;
  file_name: string;
  file_url: string;
}

interface Props {
  records: ServiceRecord[];
  onChanged: () => void;
  /** Minimal view: only date + delete. */
  compact?: boolean;
}

/**
 * Compact list of registered services for a component.
 * Shows date, supplier, protocols (download) and delete action.
 * Use `compact` to show only the date and a delete button.
 */
export function ServiceListTab({ records, onChanged, compact = false }: Props) {
  const queryClient = useQueryClient();
  const [docsByRecord, setDocsByRecord] = useState<Record<string, ServiceDoc[]>>({});
  const [pendingDelete, setPendingDelete] = useState<ServiceRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const ids = records.map((r) => r.id);
    if (ids.length === 0) {
      setDocsByRecord({});
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('maintenance_history_documents')
        .select('id, maintenance_history_id, file_name, file_url')
        .in('maintenance_history_id', ids);
      const grouped: Record<string, ServiceDoc[]> = {};
      (data ?? []).forEach((d) => {
        (grouped[d.maintenance_history_id] ??= []).push(d as ServiceDoc);
      });
      setDocsByRecord(grouped);
    })();
  }, [records]);

  const getPath = (fileUrl: string): string | null => {
    try {
      const parts = new URL(fileUrl).pathname.split('/').filter(Boolean);
      const i = parts.findIndex((p) => p === 'maintenance-documents');
      return i === -1 ? null : parts.slice(i + 1).join('/');
    } catch {
      return null;
    }
  };

  // Group records by date for compact view (one service = one date, may contain multiple åtgärder)
  const groupedByDate = records.reduce<Record<string, ServiceRecord[]>>((acc, r) => {
    const key = r.performed_date.slice(0, 10);
    (acc[key] ??= []).push(r);
    return acc;
  }, {});
  const dateKeys = Object.keys(groupedByDate).sort((a, b) => (a < b ? 1 : -1));

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      // In compact mode: delete all åtgärder for the same date. Otherwise just the single row.
      const idsToDelete = compact
        ? (groupedByDate[pendingDelete.performed_date.slice(0, 10)] ?? [pendingDelete]).map((r) => r.id)
        : [pendingDelete.id];

      const allDocs = idsToDelete.flatMap((rid) => docsByRecord[rid] ?? []);
      await Promise.allSettled(
        allDocs.map(async (d) => {
          const p = getPath(d.file_url);
          if (p) await storageService.remove('maintenance-documents', [p]);
        }),
      );
      await supabase
        .from('maintenance_history_documents')
        .delete()
        .in('maintenance_history_id', idsToDelete);

      const { error } = await supabase
        .from('maintenance_history')
        .delete()
        .in('id', idsToDelete);
      if (error) throw error;

      toast.success(
        compact && idsToDelete.length > 1
          ? `Service borttagen (${idsToDelete.length} åtgärder)`
          : 'Service borttagen',
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceHistory.all });
      setPendingDelete(null);
      onChanged();
    } catch (err: unknown) {
      toast.error('Kunde inte ta bort service', { description: getErrorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  if (records.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Ingen service registrerad</p>
      </div>
    );
  }

  if (compact) {
    return (
      <>
        <div className="space-y-2">
          {dateKeys.map((dateKey) => {
            const group = groupedByDate[dateKey];
            const rep = group[0];
            return (
              <Card key={dateKey}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">
                        {format(new Date(rep.performed_date), 'PPP', { locale: sv })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {group.length} {group.length === 1 ? 'åtgärd' : 'åtgärder'}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => setPendingDelete(rep)}
                      aria-label="Ta bort service"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {renderDeleteDialog()}
      </>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {records.map((r) => {
          const docs = docsByRecord[r.id] ?? [];
          return (
            <Card key={r.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium whitespace-nowrap">
                    {format(new Date(r.performed_date), 'PPP', { locale: sv })}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.category && (
                        <Badge variant="secondary" className="text-xs">
                          {r.category}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">{r.action_type}</span>
                      {r.supplier && <> · {r.supplier}</>}
                      {r.cost != null && <> · {r.cost.toLocaleString('sv-SE')} kr</>}
                    </div>
                    {docs.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {docs.map((d) => (
                          <a
                            key={d.id}
                            href={d.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline bg-muted/50 rounded px-2 py-1"
                          >
                            <FileText className="h-3 w-3" />
                            <span className="truncate max-w-[200px]">{d.file_name}</span>
                            <Download className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => setPendingDelete(r)}
                    aria-label="Ta bort åtgärd"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {renderDeleteDialog()}
    </>
  );

  function renderDeleteDialog() {
    const groupSize = pendingDelete
      ? (groupedByDate[pendingDelete.performed_date.slice(0, 10)]?.length ?? 1)
      : 0;
    return (

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort service?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Detta tar permanent bort {compact && groupSize > 1 ? `hela servicen (${groupSize} åtgärder)` : 'serviceposten'} från{' '}
                  <strong>
                    {format(new Date(pendingDelete.performed_date), 'PPP', { locale: sv })}
                  </strong>{' '}
                  och alla tillhörande protokoll.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Tar bort...
                </>
              ) : (
                'Ta bort'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
}

