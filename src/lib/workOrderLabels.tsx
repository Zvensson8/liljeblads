import { Badge } from '@/components/ui/badge';

export function workOrderPriorityBadge(priority: string) {
  const colors: Record<string, string> = {
    low: 'bg-green-500/10 text-green-500 border-green-500/20',
    medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    high: 'bg-red-500/10 text-red-500 border-red-500/20',
  };
  const labels: Record<string, string> = {
    low: 'Låg',
    medium: 'Medel',
    high: 'Hög',
  };
  return <Badge className={colors[priority]}>{labels[priority] || priority}</Badge>;
}

export function workOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    not_started: 'Ej påbörjad',
    awaiting_quote: 'Inväntar offert',
    ordered: 'Beställt',
    completed: 'Slutförd',
    archived: 'Arkiverad',
  };
  return labels[status] || status;
}
