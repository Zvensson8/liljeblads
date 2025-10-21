import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PropertyEconomyProps {
  propertyId: string;
}

export function PropertyEconomy({ propertyId }: PropertyEconomyProps) {
  const [loading, setLoading] = useState(true);
  const [costData, setCostData] = useState<any[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [avgMonthlyCost, setAvgMonthlyCost] = useState(0);
  const [categoryData, setCategoryData] = useState<any[]>([]);

  useEffect(() => {
    fetchEconomyData();
  }, [propertyId]);

  const fetchEconomyData = async () => {
    try {
      // Fetch components
      const result: any = await (supabase as any)
        .from("components")
        .select("id, type")
        .eq("property_id", propertyId);
      
      const { data: componentsData, error: compError } = result;

      if (compError || !componentsData || componentsData.length === 0) {
        setLoading(false);
        return;
      }

      const componentIds = componentsData.map(c => c.id);

      // Fetch maintenance history
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const { data: maintenanceData } = await supabase
        .from("maintenance_history")
        .select("performed_date, cost, component_id")
        .in("component_id", componentIds)
        .gte("performed_date", oneYearAgo)
        .order("performed_date", { ascending: true });

      if (!maintenanceData) {
        setLoading(false);
        return;
      }

      // Group by month
      const monthlyData: Record<string, any> = {};
      maintenanceData.forEach(item => {
        const month = new Date(item.performed_date).toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' });
        if (!monthlyData[month]) {
          monthlyData[month] = { month, cost: 0 };
        }
        monthlyData[month].cost += item.cost || 0;
      });

      setCostData(Object.values(monthlyData));

      const total = maintenanceData.reduce((sum, item) => sum + (item.cost || 0), 0);
      setTotalCost(total);
      setAvgMonthlyCost(total / 12);

      // Group by category using componentsData
      const categoryStats: Record<string, any> = {};
      maintenanceData.forEach(item => {
        const comp = componentsData.find(c => c.id === item.component_id);
        const category = comp?.type || "Övrigt";
        if (!categoryStats[category]) {
          categoryStats[category] = { category, cost: 0, count: 0 };
        }
        categoryStats[category].cost += item.cost || 0;
        categoryStats[category].count += 1;
      });

      const sortedCategories = Object.values(categoryStats).sort((a: any, b: any) => b.cost - a.cost);
      setCategoryData(sortedCategories);
    } catch (error) {
      console.error("Error fetching economy data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const costChange = costData.length >= 2 
    ? ((costData[costData.length - 1].cost - costData[costData.length - 2].cost) / costData[costData.length - 2].cost * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total kostnad (12 mån)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCost.toLocaleString('sv-SE')} kr</div>
            <p className="text-xs text-muted-foreground mt-1">
              Totalt för senaste året
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Genomsnitt/månad</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgMonthlyCost.toLocaleString('sv-SE')} kr</div>
            <p className="text-xs text-muted-foreground mt-1">
              Månadskostnad i snitt
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Förändring</CardTitle>
            {costChange > 0 ? (
              <TrendingUp className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${costChange > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {costChange > 0 ? '+' : ''}{costChange.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Senaste månaden
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alert if high costs */}
      {avgMonthlyCost > 50000 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Högre kostnader än normalt. Överväg att granska underhållsplanen.
          </AlertDescription>
        </Alert>
      )}

      {/* Cost Trend Chart */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Kostnadsutveckling</CardTitle>
          <CardDescription>Månadskostnader senaste 12 månaderna</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="cost" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                name="Kostnad (kr)"
                dot={{ fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Kostnader per kategori</CardTitle>
          <CardDescription>Fördelning av underhållskostnader</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
              />
              <Legend />
              <Bar dataKey="cost" fill="hsl(var(--chart-1))" name="Kostnad (kr)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
