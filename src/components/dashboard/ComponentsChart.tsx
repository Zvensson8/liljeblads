import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useComponents } from '@/hooks/useComponents';

interface ComponentData {
  type: string;
  active: number;
  maintenance: number;
  inactive: number;
}

export function ComponentsChart() {
  const { data: components = [], isLoading } = useComponents();

  const data = useMemo<ComponentData[]>(() => {
    type StatusKey = 'active' | 'maintenance' | 'inactive';
    const grouped = components.reduce<Record<string, { active: number; maintenance: number; inactive: number }>>(
      (acc, comp) => {
        if (!acc[comp.type]) {
          acc[comp.type] = { active: 0, maintenance: 0, inactive: 0 };
        }
        const status = comp.status as StatusKey;
        if (status in acc[comp.type]) {
          acc[comp.type][status]++;
        }
        return acc;
      },
      {},
    );
    return Object.entries(grouped).map(([type, counts]) => ({ type, ...counts }));
  }, [components]);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Komponentöversikt</CardTitle>
          <CardDescription>Status per komponenttyp</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartConfig = {
    active: { label: 'Aktiva', color: 'hsl(var(--chart-1))' },
    maintenance: { label: 'Underhåll', color: 'hsl(var(--chart-2))' },
    inactive: { label: 'Inaktiva', color: 'hsl(var(--chart-3))' },
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Komponentöversikt</CardTitle>
        <CardDescription>Status per komponenttyp</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Ingen data tillgänglig
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="type" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="active" fill="var(--color-active)" name="Aktiva" radius={[4, 4, 0, 0]} />
                <Bar dataKey="maintenance" fill="var(--color-maintenance)" name="Underhåll" radius={[4, 4, 0, 0]} />
                <Bar dataKey="inactive" fill="var(--color-inactive)" name="Inaktiva" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
