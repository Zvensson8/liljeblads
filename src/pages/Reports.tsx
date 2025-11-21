import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { BottomNavigation } from '@/components/BottomNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, TrendingUp, Building2, Wrench, Calendar, Download } from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportGeneratorDialog } from '@/components/reports/ReportGeneratorDialog';
import { ReportHistoryCard } from '@/components/reports/ReportHistoryCard';
import { ScheduledReportsManager } from '@/components/reports/ScheduledReportsManager';

export default function Reports() {
  const isMobile = useIsMobile();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<{ type: string; name: string } | null>(null);

  const reportCategories = [
    { id: 'all', name: 'Alla rapporter', icon: FileText },
    { id: 'economy', name: 'Ekonomi', icon: TrendingUp },
    { id: 'operations', name: 'Drift', icon: Wrench },
    { id: 'properties', name: 'Fastigheter', icon: Building2 },
    { id: 'scheduled', name: 'Schemalagda', icon: Calendar },
  ];

  const availableReports = [
    {
      id: 'budget-analysis',
      category: 'economy',
      name: 'Budget-analys',
      description: 'Jämför budget mot faktiska kostnader',
      icon: TrendingUp,
    },
    {
      id: 'maintenance-overview',
      category: 'operations',
      name: 'Underhållsöversikt',
      description: 'Sammanfattning av alla underhållsaktiviteter',
      icon: Wrench,
    },
    {
      id: 'property-status',
      category: 'properties',
      name: 'Fastighetsstatus',
      description: 'Status för alla fastigheter och komponenter',
      icon: Building2,
    },
    {
      id: 'cost-trends',
      category: 'economy',
      name: 'Kostnadstrender',
      description: 'Analys av kostnadsutveckling över tid',
      icon: TrendingUp,
    },
    {
      id: 'workorder-summary',
      category: 'operations',
      name: 'Arbetsorder-sammanfattning',
      description: 'Översikt av alla arbetsordrar',
      icon: Wrench,
    },
  ];

  const filteredReports =
    selectedCategory === 'all'
      ? availableReports
      : availableReports.filter((r) => r.category === selectedCategory);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        {!isMobile && <AppSidebar />}
        
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 space-y-6 pb-20 md:pb-6">
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-3xl font-bold">Rapporter</h1>
                <p className="text-muted-foreground">
                  Generera och hantera rapporter för din organisation
                </p>
              </div>

              <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                <TabsList className="w-full md:w-auto">
                  {reportCategories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <TabsTrigger key={cat.id} value={cat.id} className="gap-2">
                        <Icon className="h-4 w-4" />
                        {cat.name}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                <TabsContent value={selectedCategory} className="mt-6">
                  {selectedCategory === 'scheduled' ? (
                    <ScheduledReportsManager />
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {filteredReports.map((report) => {
                          const Icon = report.icon;
                          return (
                            <Card key={report.id} className="hover:shadow-lg transition-shadow">
                              <CardHeader>
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                      <Icon className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                      <CardTitle className="text-lg">{report.name}</CardTitle>
                                      <CardDescription className="mt-1">
                                        {report.description}
                                      </CardDescription>
                                    </div>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <Button 
                                  className="w-full" 
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedReport({ type: report.id, name: report.name });
                                    setGeneratorOpen(true);
                                  }}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Generera rapport
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>

                      {filteredReports.length === 0 && (
                        <div className="text-center py-12">
                          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                          <h3 className="text-lg font-semibold mb-2">Inga rapporter</h3>
                          <p className="text-muted-foreground">
                            Inga rapporter tillgängliga i denna kategori
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Recent Reports */}
            <ReportHistoryCard />
          </div>
        </main>

        {isMobile && <BottomNavigation />}
      </div>
      {selectedReport && (
        <ReportGeneratorDialog
          open={generatorOpen}
          onOpenChange={setGeneratorOpen}
          reportType={selectedReport.type}
          reportName={selectedReport.name}
        />
      )}
    </SidebarProvider>
  );
}
