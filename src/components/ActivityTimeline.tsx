import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useTodos } from '@/hooks/useTodos';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import { usePropertyNotes } from '@/hooks/usePropertyNotes';
import { usePropertyContacts } from '@/hooks/usePropertyContacts';
import { usePropertyDocuments } from '@/hooks/usePropertyDocuments';

interface ActivityTimelineProps {
  propertyId: string;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  icon: string;
}

export const ActivityTimeline = ({ propertyId }: ActivityTimelineProps) => {
  const { data: notes = [], isLoading: l1 } = usePropertyNotes({ propertyId });
  const { data: todos = [], isLoading: l2 } = useTodos({ propertyId });
  const { data: workOrders = [], isLoading: l3 } = useWorkOrders({ propertyId });
  const { data: contacts = [], isLoading: l4 } = usePropertyContacts({ propertyId });
  const { data: documents = [], isLoading: l5 } = usePropertyDocuments({ propertyId });

  const loading = l1 || l2 || l3 || l4 || l5;

  const activities = useMemo<Activity[]>(() => {
    const all: Activity[] = [];

    type NoteLike = { id: string; content: string; created_at: string };
    type TodoLike = { id: string; title: string; completed?: boolean | null; updated_at: string };
    type WorkOrderLike = { id: string; action: string; created_at: string };
    type ContactLike = { id: string; name: string; created_at: string };
    type DocumentLike = { id: string; name: string; created_at: string };

    (notes as NoteLike[]).slice(0, 5).forEach((n) =>
      all.push({
        id: n.id,
        type: 'note',
        description: `Anteckning skapad: ${n.content.substring(0, 50)}${n.content.length > 50 ? '...' : ''}`,
        timestamp: n.created_at,
        icon: '📝',
      }),
    );

    (todos as TodoLike[]).slice(0, 5).forEach((t) =>
      all.push({
        id: t.id,
        type: 'todo',
        description: `Att-göra ${t.completed ? 'slutförd' : 'skapad'}: ${t.title}`,
        timestamp: t.updated_at,
        icon: t.completed ? '✅' : '☑️',
      }),
    );

    (workOrders as WorkOrderLike[]).slice(0, 5).forEach((wo) =>
      all.push({
        id: wo.id,
        type: 'work_order',
        description: `Arbetsorder: ${wo.action}`,
        timestamp: wo.created_at,
        icon: '🔧',
      }),
    );

    (contacts as ContactLike[]).slice(0, 5).forEach((c) =>
      all.push({
        id: c.id,
        type: 'contact',
        description: `Kontakt tillagd: ${c.name}`,
        timestamp: c.created_at,
        icon: '👤',
      }),
    );

    (documents as DocumentLike[]).slice(0, 5).forEach((d) =>
      all.push({
        id: d.id,
        type: 'document',
        description: `Dokument uppladdat: ${d.name}`,
        timestamp: d.created_at,
        icon: '📄',
      }),
    );

    all.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return all.slice(0, 10);
  }, [notes, todos, workOrders, contacts, documents]);

  if (loading) {
    return (
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📊</span>
            Aktivitetsflöde
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Laddar aktiviteter...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>📊</span>
          Aktivitetsflöde
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Ingen aktivitet ännu</p>
            <p className="text-xs mt-2">Aktiviteter kommer att visas här när du lägger till data</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity, index) => (
              <div
                key={`${activity.type}-${activity.id}`}
                className="flex gap-3 animate-slide-in-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary shrink-0">
                    <span className="text-sm">{activity.icon}</span>
                  </div>
                  {index < activities.length - 1 && (
                    <div className="w-px h-full bg-border mt-2" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <p className="text-sm font-medium">{activity.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(activity.timestamp), {
                      addSuffix: true,
                      locale: sv,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
