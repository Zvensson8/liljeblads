import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  AlertTriangle, 
  DollarSign, 
  Package,
  ChevronRight
} from "lucide-react";
import { 
  getTopCostComponents, 
  getCostTrend, 
  getSupplierAnalysis,
  getFlagEmoji,
  type ComponentCostSummary,
  type CostTrend,
  type SupplierAnalysis
} from "@/lib/costUtils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { useNavigate } from "react-router-dom";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function CostAnalysis() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [topComponents, setTopComponents] = useState<ComponentCostSummary[]>([]);
  const [costTrend, setCostTrend] = useState<CostTrend[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierAnalysis[]>([]);
  const [totalCost, setTotalCost] = useState(0);

  useEffect(() => {
    fetchCostData();
  }, []);

  const fetchCostData = async () => {
    setLoading(true);
    try {
      const [components, trend, supplierData] = await Promise.all([
        getTopCostComponents(10, 12),
        getCostTrend(12),
        getSupplierAnalysis()
      ]);

      setTopComponents(components);
      setCostTrend(trend);
      setSuppliers(supplierData.slice(0, 5));
      
      const total = trend.reduce((sum, item) => sum + item.cost, 0);
      setTotalCost(total);
    } catch (error) {
      console.error('Error fetching cost data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const highCostComponents = topComponents.filter(c => c.flag_type === 'red' || c.flag_type === 'black');
  const avgMonthlyCost = costTrend.length > 0 
    ? costTrend.reduce((sum, t) => sum + t.cost, 0) / costTrend.length 
    : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total kostnad (12 mån)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(totalCost).toLocaleString('sv-SE')} kr</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Genomsnitt/månad</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(avgMonthlyCost).toLocaleString('sv-SE')} kr</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Högkostnadskomponenter</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{highCostComponents.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unika komponenter</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topComponents.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {highCostComponents.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Du har {highCostComponents.length} komponent{highCostComponents.length > 1 ? 'er' : ''} med kritiskt höga kostnader. 
            Överväg utbyte eller fördjupad analys.
          </AlertDescription>
        </Alert>
      )}

      {/* Cost Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Kostnadstrend (12 månader)</CardTitle>
          <CardDescription>Månatlig underhållskostnad över tid</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={costTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tickFormatter={(value) => {
                  const [year, month] = value.split('-');
                  return `${month}/${year.slice(2)}`;
                }}
              />
              <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: number) => [`${Math.round(value).toLocaleString('sv-SE')} kr`, 'Kostnad']}
                labelFormatter={(label) => {
                  const [year, month] = label.split('-');
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
                  return `${monthNames[parseInt(month) - 1]} ${year}`;
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="cost" 
                name="Kostnad (kr)" 
                stroke="hsl(var(--chart-1))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-1))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top 10 Components */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Dyraste Komponenter</CardTitle>
            <CardDescription>Senaste 12 månaderna</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topComponents.map((component, index) => (
                <div 
                  key={component.component_id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => navigate('/components')}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{component.component_name}</span>
                        {component.flag_type && (
                          <span className="text-lg">{getFlagEmoji(component.flag_type)}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{component.flag_reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{Math.round(component.total_cost).toLocaleString('sv-SE')} kr</div>
                    <p className="text-xs text-muted-foreground">{component.maintenance_count} åtgärder</p>
                  </div>
                </div>
              ))}
              {topComponents.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Ingen kostnadsdata tillgänglig</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Supplier Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Leverantörsanalys</CardTitle>
            <CardDescription>Top 5 leverantörer efter total kostnad</CardDescription>
          </CardHeader>
          <CardContent>
            {suppliers.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={suppliers}
                      dataKey="total_cost"
                      nameKey="supplier"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry: { supplier: string }) => entry.supplier}
                    >
                      {suppliers.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `${Math.round(value).toLocaleString('sv-SE')} kr`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {suppliers.map((supplier, index) => (
                    <div key={supplier.supplier} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span>{supplier.supplier}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{Math.round(supplier.total_cost).toLocaleString('sv-SE')} kr</div>
                        <div className="text-xs text-muted-foreground">
                          ø {Math.round(supplier.avg_cost).toLocaleString('sv-SE')} kr/åtgärd
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">Ingen leverantörsdata tillgänglig</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
