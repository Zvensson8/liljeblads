import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import { useTodos } from '@/hooks/useTodos';

interface AttentionItem {
  id: string;
  type: 'work_order' | 'todo' | 'component';
  title: string;
  subtitle: string;
  severity: 'high' | 'medium';
  path: string;
}

interface AttentionRequiredSectionProps {
  propertyId?: string;
}

export function AttentionRequiredSection({ propertyId }: AttentionRequiredSectionProps) {
  const navigate = useNavigate();
  const { data: workOrders = [], isLoading: loadingWO } = useWorkOrders(
    propertyId ? { propertyId } : {},
  );
  const { data: todos = [], isLoading: loadingTodos } = useTodos(
    propertyId ? { propertyId, completed: false } : { completed: false },
  );

  const loading = loadingWO || loadingTodos;

  const items = useMemo<AttentionItem[]>(() => {
    const attention: AttentionItem[] = [];

    type WorkOrderLike = { id: string; priority?: string | null; action: string; properties?: { name?: string | null } | null };
    type TodoLike = { id: string; title: string; due_date?: string | null; property_id?: string | null; properties?: { name?: string | null } | null };

    (workOrders as WorkOrderLike[])
      .filter((wo) => wo.priority === 'high')
      .slice(0, 5)
      .forEach((wo) =>
        attention.push({
          id: wo.id,
          type: 'work_order',
          title: wo.action,
          subtitle: `${wo.properties?.name || ''} - Brådskande`,
          severity: 'high',
          path: `/work-orders?id=${wo.id}`,
        }),
      );

    const now = Date.now();
    (todos as TodoLike[])
      .filter((t) => !!t.due_date && new Date(t.due_date).getTime() < now)
      .slice(0, 5)
      .forEach((t) =>
        attention.push({
          id: t.id,
          type: 'todo',
          title: t.title,
          subtitle: `${t.properties?.name || ''} - Förfallen ${format(new Date(t.due_date!), 'PPP', { locale: sv })}`,
          severity: 'medium',
          path: `/properties/${propertyId || t.property_id}?tab=todos`,
        }),
      );

    attention.sort((a, b) => {
      if (a.severity === 'high' && b.severity !== 'high') return -1;
      if (a.severity !== 'high' && b.severity === 'high') return 1;
      return 0;
    });

    return attention.slice(0, 8);
  }, [workOrders, todos, propertyId]);

  if (loading || items.length === 0) return null;

  return (
    <Card className="border-orange-500/20 bg-orange-500/5 hover:shadow-[var(--shadow-elegant)] transition-all">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Kräver uppmärksamhet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="flex items-start justify-between gap-4 p-3 rounded-lg bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => navigate(item.path)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {item.severity === 'high' && (
                    <Badge variant="destructive" className="h-5 text-xs">
                      Brådskande
                    </Badge>
                  )}
                  {item.severity === 'medium' && (
                    <Badge variant="outline" className="h-5 text-xs border-orange-500 text-orange-500">
                      Förfallen
                    </Badge>
                  )}
                </div>
                <p className="font-medium text-sm truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
