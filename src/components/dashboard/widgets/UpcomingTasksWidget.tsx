import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckSquare, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface Task {
  id: string;
  title: string;
  due_date: string;
  properties: { name: string };
}

export const UpcomingTasksWidget = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('property_todos')
        .select('id, title, due_date, properties(name)')
        .eq('completed', false)
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })
        .limit(5);

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="h-full border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-primary" />
          <CardTitle>Kommande uppgifter</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laddar...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Inga uppgifter med deadline
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <p className="text-sm font-medium truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(task.due_date), 'PPP', { locale: sv })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {task.properties?.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
