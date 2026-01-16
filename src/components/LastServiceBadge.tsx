import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { sv } from 'date-fns/locale';

interface LastServiceBadgeProps {
  componentId: string;
  className?: string;
}

export const LastServiceBadge = ({ componentId, className }: LastServiceBadgeProps) => {
  const [lastService, setLastService] = useState<{ date: string; actionType: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLastService();
  }, [componentId]);

  const fetchLastService = async () => {
    const { data, error } = await supabase
      .from('maintenance_history')
      .select('performed_date, action_type')
      .eq('component_id', componentId)
      .order('performed_date', { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      setLastService({ date: data.performed_date, actionType: data.action_type });
    }
    setLoading(false);
  };

  if (loading) {
    return null;
  }

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
