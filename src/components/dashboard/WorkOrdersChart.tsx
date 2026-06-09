import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useWorkOrders } from '@/hooks/useWorkOrders';

const statusLabels: Record<string, string> = {
  not_started: 'Ej påbörjad',
  awaiting_quote: 'Inväntar offert',
  ordered: 'Beställt',
  in_progress: 'Pågående',
  completed: 'Slutförd',
};

const statusColors: Record<string, string> = {
  not_started: 'hsl(var(--chart-1))',
  awaiting_quote: 'hsl(var(--chart-2))',
  ordered: 'hsl(var(--chart-3))',
  in_progress: 'hsl(var(--chart-4))',
  completed: 'hsl(var(--chart-5))',
};

export function WorkOrdersChart() {
  const { data: workOrders = [], isLoading } = useWorkOrders();

  const chartData = useMemo(() => {
    const counts = workOrders.reduce<Record<string, number>>((acc, wo: any) => {
      acc[wo.status] = (acc[wo.status] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([status, count]) => ({
      name: statusLabels[status] || status,
      value: count,
      color: statusColors[status] || 'hsl(var(--muted))',
    }));
  }, [workOrders]);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalOrders = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Arbetsordrar</CardTitle>
        <CardDescription>Fördelning per status ({totalOrders} st)</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
