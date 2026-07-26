import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckSquare, Wrench, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTodos } from '@/hooks/useTodos';
import { useWorkOrders } from '@/hooks/useWorkOrders';

/**
 * "Mina uppgifter idag" — aggregates the current user's open todos
 * (due today or earlier) and active work orders assigned to them,
 * across every property they can see.
 */
export function MyTasksTodayWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: myTodos = [], isLoading: todosLoading } = useTodos({
    userId: user?.id,
    completed: false,
  });
  const { data: workOrders = [], isLoading: woLoading } = useWorkOrders({});

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const dueTodos = useMemo(
    () =>
      myTodos
        .filter((t) => t.due_date && new Date(t.due_date) <= today)
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
        .slice(0, 5),
    [myTodos, today],
  );

  const myOrders = useMemo(
    () =>
      (workOrders as Array<{ id: string; action: string; status: string; assigned_to?: string | null; properties?: { name?: string } | null }>)
        .filter((wo) => wo.assigned_to === user?.id)
        .slice(0, 5),
    [workOrders, user?.id],
  );

  const loading = todosLoading || woLoading;
  const total = dueTodos.length + myOrders.length;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Mina uppgifter idag</CardTitle>
          </div>
          <Badge variant="secondary">{total}</Badge>
        </div>
        <CardDescription>
          Öppna todos och arbetsordrar tilldelade dig, tvärs alla fastigheter
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : total === 0 ? (
          <p className="text-center py-6 text-sm text-muted-foreground">
            Ingenting brådskande — bra jobbat! 🎉
          </p>
        ) : (
          <div className="space-y-4">
            {dueTodos.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <CheckSquare className="h-3.5 w-3.5" />
                  Todos ({dueTodos.length})
                </div>
                {dueTodos.map((t) => (
                  <button
                    key={t.id}
                    onClick={() =>
                      navigate(
                        t.property_id ? `/property/${t.property_id}?tab=todos` : '/dashboard',
                      )
                    }
                    className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{t.title}</div>
                      {t.due_date && (
                        <div className="text-xs text-muted-foreground">
                          {new Date(t.due_date).toLocaleDateString('sv-SE')}
                        </div>
                      )}
                    </div>
                    {t.priority === 'high' && (
                      <Badge variant="destructive" className="ml-2 shrink-0">Hög</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            {myOrders.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Wrench className="h-3.5 w-3.5" />
                  Arbetsordrar ({myOrders.length})
                </div>
                {myOrders.map((wo) => (
                  <button
                    key={wo.id}
                    onClick={() => navigate('/work-orders')}
                    className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{wo.action}</div>
                      {wo.properties?.name && (
                        <div className="text-xs text-muted-foreground truncate">
                          {wo.properties.name}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => navigate('/work-orders')}
            >
              Visa alla
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MyTasksTodayWidget;
