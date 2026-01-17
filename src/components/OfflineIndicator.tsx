import { WifiOff, RefreshCw, Cloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const { isOnline, pendingCount, isSyncing } = useOfflineSync();

  // Don't show anything if online with no pending actions
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {!isOnline && (
        <Badge variant="secondary" className="gap-1.5 bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
          <WifiOff className="h-3 w-3" />
          <span>Offline</span>
        </Badge>
      )}
      
      {pendingCount > 0 && (
        <Badge 
          variant="secondary" 
          className={cn(
            "gap-1.5",
            isOnline 
              ? "bg-primary/20 text-primary border-primary/30" 
              : "bg-muted text-muted-foreground"
          )}
        >
          {isSyncing ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Cloud className="h-3 w-3" />
          )}
          <span>{pendingCount} väntande</span>
        </Badge>
      )}
    </div>
  );
}
