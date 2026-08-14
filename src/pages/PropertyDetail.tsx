import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useProperty } from '@/hooks/useProperties';
import { useComponents } from '@/hooks/useComponents';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import { useTodos } from '@/hooks/useTodos';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Edit, AlertCircle, Home, Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PropertyEditDialog } from '@/components/PropertyEditDialog';
import { WorkOrderDialog } from '@/components/WorkOrderDialog';
import { PropertyNotes } from '@/components/property/PropertyNotes';
import { PropertyTodos } from '@/components/property/PropertyTodos';
import { PropertyContacts } from '@/components/property/PropertyContacts';
import { PropertyDocuments } from '@/components/property/PropertyDocuments';
import { PropertyOverview } from '@/components/property/PropertyOverview';
import { RiskMaintenancePlan } from '@/components/property/RiskMaintenancePlan';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useRecentlyVisited } from '@/hooks/useRecentlyVisited';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { exportComponentsToExcel, exportWorkOrdersToExcel } from '@/lib/exportUtils';
import { toast as sonnerToast } from 'sonner';

interface Property {
  id: string;
  name: string;
  address: string | null;
  area_sqm: number | null;
  construction_year: number | null;
  property_type: string | null;
  loa: string | null;
  property_number: string | null;
  invoice_address: string | null;
}

const TAB_ITEMS: Array<{ value: string; label: string }> = [
  { value: 'overview', label: 'Översikt' },
  { value: 'maintenance-plan', label: 'Underhållsplan' },
  { value: 'notes', label: 'Anteckningar' },
  { value: 'todos', label: 'Att göra' },
  { value: 'contacts', label: 'Kontakter' },
  { value: 'documents', label: 'Dokument' },
  { value: 'activity', label: 'Aktivitet' },
];

const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [workOrderDialogOpen, setWorkOrderDialogOpen] = useState(false);
  const tabFromUrl = searchParams.get('tab') || 'overview';
  const activeTab = TAB_ITEMS.some((t) => t.value === tabFromUrl)
    ? tabFromUrl
    : 'overview';
  const setActiveTab = (tab: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!tab || tab === 'overview') next.delete('tab');
        else next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  };
  const { addRecentItem } = useRecentlyVisited();

  const {
    data: propertyData,
    isLoading: propertyLoading,
    error: propertyError,
  } = useProperty(id);
  const property = propertyData as Property | null;

  const { data: componentsViaProperty = [] } = useComponents({ propertyId: id });
  const components = componentsViaProperty;

  const { data: workOrdersData = [] } = useWorkOrders({ propertyId: id });
  const workOrders = useMemo(
    () => workOrdersData.filter((wo) => wo.status !== 'archived'),
    [workOrdersData],
  );

  const { data: todosData = [] } = useTodos({ propertyId: id });
  const overdueTodos = useMemo(() => {
    const now = new Date().toISOString();
    return todosData.filter((t) => !t.completed && t.due_date && t.due_date < now).length;
  }, [todosData]);
  const urgentWorkOrders = useMemo(
    () => workOrders.filter((wo) => wo.priority === 'high').length,
    [workOrders],
  );

  const loading = propertyLoading;

  useEffect(() => {
    if (propertyError) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hitta fastigheten',
        variant: 'destructive',
      });
      navigate('/properties');
    }
  }, [propertyError, navigate, toast]);

  useEffect(() => {
    if (property) {
      addRecentItem({
        id: property.id,
        type: 'property',
        title: property.name,
        path: `/property/${property.id}`,
      });
    }
  }, [property, addRecentItem]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['drawings', 'technical-info', 'info-categories'].includes(tab)) {
      setActiveTab('overview');
    }
  }, [searchParams]);

  const [exporting, setExporting] = useState(false);

  const handleExportPropertyData = async () => {
    if (!property) return;
    setExporting(true);
    try {
      const safeName = property.name.replace(/[^\w\-åäöÅÄÖ]+/gi, '_').slice(0, 40);
      const stamp = new Date().toISOString().split('T')[0];

      if (components.length > 0) {
        const exportRows = components.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          manufacturer: c.manufacturer,
          model: c.model,
          serial_number: c.serial_number,
          room_zone: c.room_zone,
          installation_year: c.installation_year,
          registration_number: c.registration_number,
          refrigerant_code: c.refrigerant_code,
          refrigerant_amount_kg: c.refrigerant_amount_kg,
          refrigerant_type: c.refrigerant_type,
          property_name: property.name,
          property_address: property.address,
        }));
        await exportComponentsToExcel(
          exportRows,
          {},
          `${safeName}_komponenter_${stamp}.xlsx`,
        );
      }

      const activeWOs = workOrders.filter((wo) => wo.status !== 'archived');
      if (activeWOs.length > 0) {
        await exportWorkOrdersToExcel(
          activeWOs.map((wo) => ({
            action: wo.action,
            status: wo.status,
            priority: wo.priority,
            contractor: wo.contractor,
            price: wo.price,
            due_date: wo.due_date,
            quarter: wo.quarter,
            comments: wo.comments,
            property_name: property.name,
            component_name: wo.components?.name ?? null,
            created_at: wo.created_at,
          })),
          `${safeName}_arbetsordrar_${stamp}.xlsx`,
        );
      }

      if (components.length === 0 && activeWOs.length === 0) {
        sonnerToast.error('Inga komponenter eller arbetsordrar att exportera');
        return;
      }

      sonnerToast.success(
        `Exporterat: ${components.length} komponenter, ${activeWOs.length} arbetsordrar`,
      );
    } catch {
      sonnerToast.error('Kunde inte exportera fastighetsdata');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    );
  }

  if (!property) {
    return null;
  }

  const header = (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          {!isMobile && <SidebarTrigger className="hidden md:flex" />}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/" className="flex items-center gap-1">
                  <Home className="h-3 w-3" />
                  Dashboard
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/properties">Fastigheter</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{property.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
            <Button variant="ghost" size="sm" onClick={() => navigate('/properties')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka
            </Button>
            <div className="h-8 w-px bg-border hidden sm:block" />
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">{property.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {property.property_number || property.id.substring(0, 5).toUpperCase()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {urgentWorkOrders > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {urgentWorkOrders} brådskande
                  </Badge>
                )}
                {overdueTodos > 0 && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-orange-500 text-orange-500"
                  >
                    <AlertCircle className="h-3 w-3" />
                    {overdueTodos} överfälliga
                  </Badge>
                )}
                {urgentWorkOrders === 0 && overdueTodos === 0 && (
                  <Badge variant="outline" className="gap-1 border-green-500 text-green-500">
                    ✓ Allt OK
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto"
              onClick={() => void handleExportPropertyData()}
              disabled={exporting}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">
                {exporting ? 'Exporterar...' : 'Exportera XLSX'}
              </span>
              <span className="sm:hidden">{exporting ? '...' : 'Export'}</span>
            </Button>
            <Button className="gap-2 w-full sm:w-auto" onClick={() => setEditDialogOpen(true)}>
              <Edit className="h-4 w-4" />
              <span className="hidden sm:inline">Redigera Fastighet</span>
              <span className="sm:hidden">Redigera</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );

  const tabsBody = (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div
        className={`sticky z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${
          isMobile ? 'top-[73px]' : 'top-0'
        }`}
      >
        <div className="container mx-auto px-4 md:px-6">
          <TabsList className="h-12 w-full justify-start rounded-none border-0 bg-transparent p-0 overflow-x-auto">
            {TAB_ITEMS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>

      <main className="container mx-auto px-4 md:px-6 py-4 md:py-6 pb-20 md:pb-6">
        <TabsContent value="overview">
          <PropertyOverview
            property={property}
            components={components}
            workOrders={workOrders}
            overdueTodos={overdueTodos}
            urgentWorkOrders={urgentWorkOrders}
          />
        </TabsContent>
        <TabsContent value="maintenance-plan">
          <RiskMaintenancePlan propertyId={property.id} propertyName={property.name} />
        </TabsContent>
        <TabsContent value="notes">
          <PropertyNotes propertyId={property.id} />
        </TabsContent>
        <TabsContent value="todos">
          <PropertyTodos propertyId={property.id} />
        </TabsContent>
        <TabsContent value="contacts">
          <PropertyContacts propertyId={property.id} />
        </TabsContent>
        <TabsContent value="documents">
          <PropertyDocuments propertyId={property.id} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTimeline propertyId={property.id} />
        </TabsContent>
      </main>
    </Tabs>
  );

  const dialogs = (
    <>
      <PropertyEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        property={property}
        onSuccess={() => {
          setEditDialogOpen(false);
        }}
      />
      <WorkOrderDialog
        open={workOrderDialogOpen}
        onOpenChange={setWorkOrderDialogOpen}
        propertyId={id}
        onSuccess={() => {
          setWorkOrderDialogOpen(false);
        }}
      />
    </>
  );

  if (isMobile) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-background pb-16">
        {header}
        {tabsBody}
        {dialogs}
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          {header}
          {tabsBody}
          {dialogs}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default PropertyDetail;
