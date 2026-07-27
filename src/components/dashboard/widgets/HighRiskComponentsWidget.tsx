import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useComponentRiskList } from '@/hooks/useComponentRisk';
import { ComponentRiskBadge } from '@/components/ComponentRiskBadge';
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';

/**
 * Dashboard widget: top high/critical risk components (Weibull).
 */
export function HighRiskComponentsWidget() {
  const navigate = useNavigate();
  const { data: risks = [], isLoading } = useComponentRiskList({
    limit: 10,
    minLevel: 'high',
    minConfidence: 'medium',
  });

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 drag-handle cursor-move">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <CardTitle className="text-base">Högriskkomponenter</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Prediktiv risk (Weibull) — high/critical med minst medel konfidens
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto pt-0 space-y-2">
        {isLoading && (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!isLoading && risks.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Inga högriskkomponenter just nu
          </p>
        )}
        {!isLoading &&
          risks.map((r) => (
            <button
              key={r.componentId}
              type="button"
              className="w-full text-left flex items-start gap-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/components/${r.componentId}`)}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">
                    {r.name || r.componentId.slice(0, 8)}
                  </span>
                  <ComponentRiskBadge risk={r} compact showScore />
                </div>
                {r.propertyName && (
                  <p className="text-xs text-muted-foreground truncate">{r.propertyName}</p>
                )}
                <p className="text-xs text-muted-foreground line-clamp-2">{r.recommendation}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground mt-1" />
            </button>
          ))}
        {risks.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-1"
            onClick={() => navigate('/components')}
          >
            Visa alla komponenter
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
