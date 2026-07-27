import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProperty } from '@/hooks/useProperties';
import { useFloors, useCreateFloor, useUpdateFloor, useDeleteFloor } from '@/hooks/useFloors';
import { useComponents } from '@/hooks/useComponents';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import { useTodos } from '@/hooks/useTodos';
import { useMaintenanceHistory } from '@/hooks/useMaintenanceHistory';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Edit, AlertCircle, Home } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { exportComponentsToExcel, exportComponentsToPDF } from '@/lib/exportUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PropertyEditDialog } from '@/components/PropertyEditDialog';
import { WorkOrderDialog } from '@/components/WorkOrderDialog';
import { PropertyNotes } from '@/components/property/PropertyNotes';
import { PropertyTodos } from '@/components/property/PropertyTodos';
import { PropertyContacts } from '@/components/property/PropertyContacts';
import { PropertyDocuments } from '@/components/property/PropertyDocuments';
import { PropertyOverview } from '@/components/property/PropertyOverview';
import { RiskMaintenancePlan } from '@/components/property/RiskMaintenancePlan';
import { PropertyDrawingsTab } from '@/components/property/PropertyDrawingsTab';
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
import { PropertyTechnicalInfo } from '@/components/property-info/PropertyTechnicalInfo';
import { PropertyInfoCategoryManager } from '@/components/property-info/PropertyInfoCategoryManager';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';

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

interface Floor {
  id: string;
  name: string;
  level: number | null;
  drawing_url: string | null;
}

const TAB_ITEMS = [
  { value: 'overview', label: 'Översikt' },
  { value: 'maintenance-plan', label: 'Underhållsplan' },
  { value: 'drawings', label: 'Ritningar' },
  { value: 'notes', label: 'Anteckningar' },
  { value: 'todos', label: 'Att göra' },
  { value: 'contacts', label: 'Kontakter' },
  { value: 'documents', label: 'Dokument' },
  { value: 'activity', label: 'Aktivitet' },
  { value: 'technical-info', label: 'Teknisk info' },
  { value: 'info-categories', label: 'Info-kategorier' },
] as const;

const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [floorName, setFloorName] = useState('');
  const [floorLevel, setFloorLevel] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [workOrderDialogOpen, setWorkOrderDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const { addRecentItem } = useRecentlyVisited();

  const {
    data: propertyData,
    isLoading: propertyLoading,
    error: propertyError,
  } = useProperty(id);
  const property = propertyData as Property | null;

  const { data: floorsData = [], isLoading: floorsLoading } = useFloors({ propertyId: id });
  const floors = floorsData as Floor[];

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

  const { data: allMaintenance = [] } = useMaintenanceHistory();

  const createFloor = useCreateFloor();
  const updateFloor = useUpdateFloor();
  const deleteFloor = useDeleteFloor();

  const loading = propertyLoading || floorsLoading;

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
        path: `/properties/${property.id}`,
      });
    }
  }, [property, addRecentItem]);

  const fetchPropertyAndFloors = () => {
    // react-query handles refetching via mutation invalidation + realtime.
  };

  const handleCreateFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await createFloor.mutateAsync({
        name: floorName,
        level: floorLevel ? parseInt(floorLevel) : null,
        property_id: id,
      });
      setDialogOpen(false);
      setFloorName('');
      setFloorLevel('');
    } catch {
      // toast handled by hook
    }
  };

  const handleFileUpload = async (floorId: string, file: File) => {
    setUploadingFile(true);
    const fileExt = file.name.split('.').pop();
    const filePath = `${user?.id}/${floorId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('floor-drawings')
      .upload(filePath, file);

    if (uploadError) {
      toast({
        title: 'Fel vid uppladdning',
        description: uploadError.message,
        variant: 'destructive',
      });
      setUploadingFile(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('floor-drawings').getPublicUrl(filePath);

    try {
      await updateFloor.mutateAsync({ id: floorId, patch: { drawing_url: publicUrl } });
      toast({
        title: 'Ritning uppladdad!',
        description: 'Du kan nu märka ut komponenter på ritningen.',
      });
    } catch {
      // toast handled by hook
    }
    setUploadingFile(false);
  };

  const handleDeleteFloor = async (floorId: string) => {
    if (
      !confirm(
        'Är du säker på att du vill ta bort denna våning? Alla komponenter på våningen kommer också att tas bort.',
      )
    ) {
      return;
    }
    deleteFloor.mutate(floorId);
  };

  const handleDeleteDrawing = async (floor: Floor) => {
    if (
      !confirm(
        'Är du säker på att du vill ta bort ritningen? Komponenter på våningen kommer att behållas.',
      )
    ) {
      return;
    }
    try {
      await updateFloor.mutateAsync({ id: floor.id, patch: { drawing_url: null } });
      toast({
        title: 'Ritning borttagen',
        description: 'Ritningen har tagits bort. Du kan ladda upp en ny.',
      });
    } catch {
      // toast handled by hook
    }
  };

  // keep export available for future header actions
  void allMaintenance;
  void exportComponentsToExcel;
  void exportComponentsToPDF;

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
          <Button className="gap-2 w-full sm:w-auto" onClick={() => setEditDialogOpen(true)}>
            <Edit className="h-4 w-4" />
            <span className="hidden sm:inline">Redigera Fastighet</span>
            <span className="sm:hidden">Redigera</span>
          </Button>
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
            floors={floors}
            overdueTodos={overdueTodos}
            urgentWorkOrders={urgentWorkOrders}
          />
        </TabsContent>
        <TabsContent value="maintenance-plan">
          <RiskMaintenancePlan propertyId={property.id} propertyName={property.name} />
        </TabsContent>
        <TabsContent value="drawings">
          <PropertyDrawingsTab
            floors={floors}
            dialogOpen={dialogOpen}
            onDialogOpenChange={setDialogOpen}
            floorName={floorName}
            floorLevel={floorLevel}
            onFloorNameChange={setFloorName}
            onFloorLevelChange={setFloorLevel}
            onCreateFloor={handleCreateFloor}
            onDeleteFloor={handleDeleteFloor}
            onDeleteDrawing={handleDeleteDrawing}
            onUploadDrawing={handleFileUpload}
            uploadingFile={uploadingFile}
            onCanvasUpdate={fetchPropertyAndFloors}
            onBackToOverview={() => setActiveTab('overview')}
          />
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
        <TabsContent value="technical-info">
          <PropertyTechnicalInfo propertyId={property.id} />
        </TabsContent>
        <TabsContent value="info-categories">
          <PropertyInfoCategoryManager />
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
          fetchPropertyAndFloors();
          setEditDialogOpen(false);
        }}
      />
      <WorkOrderDialog
        open={workOrderDialogOpen}
        onOpenChange={setWorkOrderDialogOpen}
        propertyId={id}
        onSuccess={() => {
          fetchPropertyAndFloors();
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
