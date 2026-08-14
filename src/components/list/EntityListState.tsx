import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function EntityListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="entity-list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EntityListError({
  message = 'Kunde inte hämta listan.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
      <p className="text-sm text-destructive mb-3">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Försök igen
        </Button>
      ) : null}
    </div>
  );
}

export function EntityListEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border px-4 py-12 text-center text-muted-foreground">
      <p className="text-base font-medium text-foreground mb-1">{title}</p>
      {description ? <p className="text-sm mb-3">{description}</p> : null}
      {action}
    </div>
  );
}
