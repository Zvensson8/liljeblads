import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useMaintenanceHistory } from '@/hooks/useMaintenanceHistory';

interface LastServiceBadgeProps {
  componentId: string;
  className?: string;
}

export const LastServiceBadge = ({ componentId, className }: LastServiceBadgeProps) => {
  const { data: history = [], isLoading } = useMaintenanceHistory({ componentId });
  const lastService = useMemo(() => {
    if (!history.length) return null;
    const sorted = [...history].sort(
      (a: any, b: any) =>
        new Date(b.performed_date).getTime() - new Date(a.performed_date).getTime(),
    );
    return { date: sorted[0].performed_date as string, actionType: sorted[0].action_type as string };
  }, [history]);

  if (isLoading) return null;

  if (!lastService) {
    return (
      <Badge variant="outline" className={`text-xs gap-1 ${className}`}>
        <AlertCircle className="h-3 w-3 text-yellow-500" />
        Ingen service
      </Badge>
    );
  }

  const daysSince = differenceInDays(new Date(), new Date(lastService.date));
  const isRecent = daysSince <= 90;

  return (
    <Badge
      variant="outline"
      className={`text-xs gap-1 ${isRecent ? 'border-green-500/50 text-green-600' : 'border-yellow-500/50 text-yellow-600'} ${className}`}
    >
      {isRecent ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Calendar className="h-3 w-3" />
      )}
      <span className="hidden sm:inline">Senast:</span>{' '}
      {format(new Date(lastService.date), 'd MMM yyyy', { locale: sv })}
    </Badge>
  );
};
