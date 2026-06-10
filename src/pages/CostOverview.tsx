import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Package,
  Calendar,
  PieChart,
  ArrowRight,
  BarChart3,
  Filter
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { 
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from "recharts";
import { 
  getTopCostComponents, 
  getCostTrend, 
  getSupplierAnalysis,
  getFlagEmoji,
  type ComponentCostSummary,
  type CostTrend,
  type SupplierAnalysis,
} from "@/lib/costUtils";
import { CostBudgetDialog } from "@/components/cost/CostBudgetDialog";
import { supabase } from "@/integrations/supabase/client";

type TimeRangePreset = '3' | '6' | '12' | '24' | 'custom';

export default function CostOverview() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  
  // Time filter state
  const [timeRange, setTimeRange] = useState<TimeRangePreset>('12');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 12),
    to: new Date()
  });
  
  // Data state
  const [totalCost, setTotalCost] = useState(0);
  const [avgMonthlyCost, setAvgMonthlyCost] = useState(0);
  const [costChange, setCostChange] = useState(0);
  const [criticalComponents, setCriticalComponents] = useState(0);
  const [topComponents, setTopComponents] = useState<Array<Record<string, unknown>>>([]);
  const [topSuppliers, setTopSuppliers] = useState<Array<Record<string, unknown>>>([]);
  const [costTrendData, setCostTrendData] = useState<Array<Record<string, unknown>>>([]);
  const [monthlyDistribution, setMonthlyDistribution] = useState<Array<Record<string, unknown>>>([]);
  
  // Budget tracking state
  const [budgets, setBudgets] = useState<Array<Record<string, unknown>>>([]);
  const [budgetProgress, setBudgetProgress] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchOverviewData();
    }
  }, [user, authLoading, navigate, dateRange]);

  useEffect(() => {
    if (timeRange !== 'custom') {
      const months = parseInt(timeRange);
      setDateRange({
        from: subMonths(new Date(), months),
        to: new Date()
      });
    }
  }, [timeRange]);

  const fetchOverviewData = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    
    setLoading(true);
    try {
      const monthsDiff = Math.round(
        (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );

      const [components, trend, suppliers, budgetData] = await Promise.all([
        getTopCostComponents(5, monthsDiff || 12),
        getCostTrend(monthsDiff || 12),
        getSupplierAnalysis(),
        fetchBudgets()
      ]);

      // Calculate totals
      const total = trend.reduce((sum, t) => sum + t.cost, 0);
      const avgMonthly = trend.length > 0 ? total / trend.length : 0;

      // Calculate cost change
      const halfPoint = Math.floor(trend.length / 2);
      const firstHalf = trend.slice(0, halfPoint).reduce((sum, t) => sum + t.cost, 0);
      const secondHalf = trend.slice(halfPoint).reduce((sum, t) => sum + t.cost, 0);
      const change = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

      const critical = components.filter(c => 
        c.flag_type === 'red' || c.flag_type === 'black'
      ).length;

      // Process trend data for charts
      const trendWithFormatted = trend.map(t => ({
        ...t,
        monthLabel: formatMonthLabel(t.month)
      }));

      // Group by month for distribution
      const monthlyDist = trend.map(t => ({
        month: formatMonthLabel(t.month),
        cost: t.cost
      }));

      setTotalCost(total);
      setAvgMonthlyCost(avgMonthly);
      setCostChange(change);
      setCriticalComponents(critical);
      setTopComponents(components);
      setTopSuppliers(suppliers.slice(0, 3));
      setCostTrendData(trendWithFormatted);
      setMonthlyDistribution(monthlyDist);
      setBudgets(budgetData);

      // Calculate budget progress
      if (budgetData.length > 0) {
        const yearlyBudget = budgetData.find(b => b.quarter === 'YEAR');
        if (yearlyBudget) {
          const progress = (total / yearlyBudget.budgeted_amount) * 100;
          setBudgetProgress(progress);
        }
      }

    } catch (error) {
      console.error('Error fetching overview data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBudgets = async () => {
    const currentYear = new Date().getFullYear();
    const { data, error } = await supabase
      .from('cost_budgets')
      .select('*')
      .eq('year', currentYear)
      .is('property_id', null)
      .is('component_id', null);

    if (error) {
      console.error('Error fetching budgets:', error);
      return [];
    }
    return data || [];
  };

  const formatMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
  };

  const handleTimeRangeChange = (value: TimeRangePreset) => {
    setTimeRange(value);
  };

  if (authLoading || loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset className="flex-1">
            <div className="p-6 space-y-6">
              <Skeleton className="h-[200px]" />
              <Skeleton className="h-[400px]" />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  const hasWarnings = criticalComponents > 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Kostnadsöversikt</h1>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Welcome and Quick Summary */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-2">Ekonomisk översikt</h2>
                  <p className="text-muted-foreground">
                    Fullständig översikt av underhållskostnader
                  </p>
                </div>
                <Button onClick={() => setBudgetDialogOpen(true)} className="w-full sm:w-auto">
                  <Calendar className="mr-2 h-4 w-4" />
                  Skapa budget
                </Button>
              </div>

              {/* Critical Alerts */}
              {hasWarnings && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Kritiska kostnadsvarningar</AlertTitle>
                  <AlertDescription>
                    Du har {criticalComponents} komponent{criticalComponents > 1 ? 'er' : ''} med 
                    kritiskt höga kostnader som kräver uppmärksamhet.
                  </AlertDescription>
                </Alert>
              )}

              {/* Time Filter Section */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Tidsperiod</CardTitle>
                      <CardDescription>Välj period för kostnadsanalys</CardDescription>
                    </div>
                    <Filter className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4">
                  <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Välj period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">Senaste 3 månaderna</SelectItem>
                      <SelectItem value="6">Senaste 6 månaderna</SelectItem>
                      <SelectItem value="12">Senaste 12 månaderna</SelectItem>
                      <SelectItem value="24">Senaste 24 månaderna</SelectItem>
                      <SelectItem value="custom">Anpassat datum</SelectItem>
                    </SelectContent>
                  </Select>

                  {timeRange === 'custom' && (
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "justify-start text-left font-normal",
                            !dateRange && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {dateRange?.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "PPP")} -{" "}
                                {format(dateRange.to, "PPP")}
                              </>
                            ) : (
                              format(dateRange.from, "PPP")
                            )
                          ) : (
                            <span>Välj datumintervall</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[200]" align="start">
                        <CalendarComponent
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange?.from}
                          selected={dateRange}
                          onSelect={setDateRange}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                </CardContent>
              </Card>

              {/* Budget Tracking */}
              {budgets.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Budgetuppföljning</CardTitle>
                    <CardDescription>Aktuell budget vs faktiska kostnader</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {budgets.map((budget) => {
                      const budgetForPeriod = budget.budgeted_amount;
                      const progress = (totalCost / budgetForPeriod) * 100;
                      const remaining = budgetForPeriod - totalCost;
                      const isOverBudget = progress > 100;
                      const isNearLimit = progress > 75 && progress <= 100;

                      return (
                        <div key={budget.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {budget.quarter === 'YEAR' ? 'Årsbudget' : `Kvartal ${budget.quarter}`} {budget.year}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {Math.round(totalCost).toLocaleString('sv-SE')} kr av {Math.round(budgetForPeriod).toLocaleString('sv-SE')} kr
                              </p>
                            </div>
                            <Badge variant={isOverBudget ? "destructive" : isNearLimit ? "secondary" : "default"}>
                              {progress.toFixed(1)}%
                            </Badge>
                          </div>
                          
                          <Progress 
                            value={Math.min(progress, 100)} 
                            className={cn(
                              "h-3",
                              isOverBudget && "[&>div]:bg-destructive",
                              isNearLimit && "[&>div]:bg-yellow-500"
                            )}
                          />
                          
                          <div className="flex items-center justify-between text-sm">
                            {!isOverBudget ? (
                              <span className="text-muted-foreground">
                                Återstår: {Math.round(remaining).toLocaleString('sv-SE')} kr
                              </span>
                            ) : (
                              <span className="text-destructive">
                                Överskriden med: {Math.round(Math.abs(remaining)).toLocaleString('sv-SE')} kr
                              </span>
                            )}
                          </div>

                          {isNearLimit && !isOverBudget && (
                            <Alert>
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription>
                                Du har använt {progress.toFixed(0)}% av budgeten
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Visual Charts Section */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Cost Trend Line Chart */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Kostnadstrend</CardTitle>
                        <CardDescription>Utveckling över tid</CardDescription>
                      </div>
                      <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {costTrendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={costTrendData}>
                          <defs>
                            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis 
                            dataKey="monthLabel" 
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis 
                            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip 
                            formatter={(value: number) => [`${Math.round(value).toLocaleString('sv-SE')} kr`, 'Kostnad']}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--background))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px'
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="cost" 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            fill="url(#colorCost)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        Ingen data tillgänglig
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Monthly Distribution Bar Chart */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Månatlig fördelning</CardTitle>
                        <CardDescription>Kostnad per månad</CardDescription>
                      </div>
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {monthlyDistribution.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyDistribution}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis 
                            dataKey="month" 
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis 
                            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip 
                            formatter={(value: number) => [`${Math.round(value).toLocaleString('sv-SE')} kr`, 'Kostnad']}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--background))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px'
                            }}
                          />
                          <Bar 
                            dataKey="cost" 
                            fill="hsl(var(--primary))"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        Ingen data tillgänglig
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Main KPI Cards */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total kostnad (12 mån)</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {Math.round(totalCost).toLocaleString('sv-SE')} kr
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Alla underhållskostnader
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Genomsnitt per månad</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {Math.round(avgMonthlyCost).toLocaleString('sv-SE')} kr
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {costChange > 0 ? (
                        <>
                          <TrendingUp className="h-3 w-3 text-red-500" />
                          <span className="text-xs text-red-500">+{costChange.toFixed(1)}% vs förra halvåret</span>
                        </>
                      ) : costChange < 0 ? (
                        <>
                          <TrendingDown className="h-3 w-3 text-green-500" />
                          <span className="text-xs text-green-500">{costChange.toFixed(1)}% vs förra halvåret</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ingen förändring</span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Kritiska komponenter</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{criticalComponents}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Behöver åtgärd eller utbyte
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Högkostnadskomponenter</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{topComponents.length}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Med registrerade kostnader
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Top Cost Components */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Top 5 Dyraste Komponenter</CardTitle>
                        <CardDescription>Senaste 12 månaderna</CardDescription>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => navigate('/')}
                      >
                        Se alla
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {topComponents.length > 0 ? (
                      <div className="space-y-4">
                        {topComponents.map((component, index) => (
                          <div key={component.component_id} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{getFlagEmoji(component.flag_type)}</span>
                                <div>
                                  <p className="font-medium">{component.component_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {component.component_type}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold">
                                  {Math.round(component.total_cost).toLocaleString('sv-SE')} kr
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {component.maintenance_count} åtgärder
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground pl-11">
                              {component.flag_reason}
                            </p>
                            {index < topComponents.length - 1 && (
                              <div className="border-b border-border mt-2" />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        Ingen kostnadsdata tillgänglig
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Top Suppliers */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Top 3 Leverantörer</CardTitle>
                        <CardDescription>Efter total kostnad</CardDescription>
                      </div>
                      <PieChart className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {topSuppliers.length > 0 ? (
                      <div className="space-y-6">
                        {topSuppliers.map((supplier, index) => {
                          const percentage = totalCost > 0 
                            ? (supplier.total_cost / totalCost) * 100 
                            : 0;
                          
                          return (
                            <div key={supplier.supplier} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{supplier.supplier}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {supplier.action_count} åtgärder
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold">
                                    {Math.round(supplier.total_cost).toLocaleString('sv-SE')} kr
                                  </p>
                                  <Badge variant="secondary">
                                    {percentage.toFixed(1)}% av total
                                  </Badge>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Progress value={percentage} className="h-2" />
                                <p className="text-xs text-muted-foreground">
                                  Genomsnitt: {Math.round(supplier.avg_cost).toLocaleString('sv-SE')} kr/åtgärd
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        Ingen leverantörsdata tillgänglig
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Rekommenderade åtgärder</CardTitle>
                  <CardDescription>Vad du kan göra härnäst</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {criticalComponents > 0 && (
                    <Button 
                      variant="destructive" 
                      className="w-full justify-start"
                      onClick={() => navigate('/components')}
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Granska {criticalComponents} kritisk{criticalComponents > 1 ? 'a' : ''} komponent{criticalComponents > 1 ? 'er' : ''}
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => setBudgetDialogOpen(true)}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Sätt årsbudget för kostnader
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => navigate('/')}
                  >
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Se detaljerad kostnadsanalys
                  </Button>
                </CardContent>
              </Card>
            </div>
          </main>
        </SidebarInset>
      </div>

      <CostBudgetDialog 
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
        onSuccess={fetchOverviewData}
      />
    </SidebarProvider>
  );
}
