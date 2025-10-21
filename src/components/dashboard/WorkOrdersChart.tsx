import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

export function WorkOrdersChart() {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    fetchWorkOrderStats();
  }, []);

  const fetchWorkOrderStats = async () => {
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select("status");

      if (error) throw error;

      const statusCounts = data.reduce((acc: any, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});

      const statusLabels: Record<string, string> = {
        not_started: "Ej påbörjad",
        awaiting_quote: "Inväntar offert",
        ordered: "Beställt",
        in_progress: "Pågående",
        completed: "Slutförd"
      };

      const colors: Record<string, string> = {
        not_started: "hsl(var(--chart-1))",
        awaiting_quote: "hsl(var(--chart-2))",
        ordered: "hsl(var(--chart-3))",
        in_progress: "hsl(var(--chart-4))",
        completed: "hsl(var(--chart-5))"
      };

      const formatted = Object.entries(statusCounts).map(([status, count]) => ({
        name: statusLabels[status] || status,
        value: count as number,
        color: colors[status] || "hsl(var(--muted))"
      }));

      setChartData(formatted);
    } catch (error) {
      console.error("Error fetching work order stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
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
        <CardDescription>
          Fördelning per status ({totalOrders} st)
        </CardDescription>
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
