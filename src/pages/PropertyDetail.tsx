import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Upload, Trash2, Download, MapPin, Building2, Settings, Wrench, TrendingUp, FileText, CheckSquare, Users, File, Edit, Phone, Mail, AlertCircle, Home } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { FloorCanvas } from '@/components/FloorCanvas';
import { exportComponentsToExcel, exportComponentsToPDF } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ComponentImportDialog } from '@/components/ComponentImportDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PropertyEditDialog } from '@/components/PropertyEditDialog';
import { WorkOrderDialog } from '@/components/WorkOrderDialog';
import { PropertyNotes } from '@/components/property/PropertyNotes';
import { PropertyTodos } from '@/components/property/PropertyTodos';
import { PropertyContacts } from '@/components/property/PropertyContacts';
import { PropertyDocuments } from '@/components/property/PropertyDocuments';
import { PropertyOverview } from '@/components/property/PropertyOverview';
import { PropertyEconomy } from '@/components/property/PropertyEconomy';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
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

const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [property, setProperty] = useState<Property | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [floorName, setFloorName] = useState('');
  const [floorLevel, setFloorLevel] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [components, setComponents] = useState<any[]>([]);
  const [todoText, setTodoText] = useState('');
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [workOrderDialogOpen, setWorkOrderDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const [overdueTodos, setOverdueTodos] = useState(0);
  const [urgentWorkOrders, setUrgentWorkOrders] = useState(0);
  const { addRecentItem } = useRecentlyVisited();

  useEffect(() => {
    if (id) {
      fetchPropertyAndFloors();
    }
  }, [id]);

  useEffect(() => {
    if (property) {
      addRecentItem({
        id: property.id,
        type: "property",
        title: property.name,
        path: `/properties/${property.id}`,
      });
    }
  }, [property]);

  const fetchPropertyAndFloors = async () => {
    if (!id) return;

    const { data: propertyData, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single();

    if (propertyError) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hitta fastigheten',
        variant: 'destructive',
      });
      navigate('/properties');
      return;
    }

    setProperty(propertyData);

    const { data: floorsData, error: floorsError } = await supabase
      .from('floors')
      .select('*')
      .eq('property_id', id)
      .order('level', { ascending: true });

    if (floorsError) {
      toast({
        title: 'Fel',
        description: floorsError.message,
        variant: 'destructive',
      });
    } else {
      setFloors(floorsData || []);
    }

    // Fetch components for this property (either via floor or direct property link)
    const { data: componentsViaProperty } = await supabase
      .from('components')
      .select('*')
      .eq('property_id', id);
    
    const { data: componentsViaFloor } = await supabase
      .from('components')
      .select(`
        *,
        floors!inner(id, name, property_id)
      `)
      .eq('floors.property_id', id);
    
    // Combine both results and remove duplicates
    const allComponents = [
      ...(componentsViaProperty || []),
      ...(componentsViaFloor || [])
    ];
    const uniqueComponents = Array.from(
      new Map(allComponents.map(c => [c.id, c])).values()
    );
    
    setComponents(uniqueComponents);

    // Fetch work orders for this property
    const { data: workOrdersData } = await supabase
      .from('work_orders')
      .select('*')
      .eq('property_id', id)
      .neq('status', 'archived');
    
    setWorkOrders(workOrdersData || []);

    // Count urgent work orders
    const urgent = (workOrdersData || []).filter((wo: any) => wo.priority === 'high').length;
    setUrgentWorkOrders(urgent);

    // Count overdue todos
    const { data: todosData } = await supabase
      .from('property_todos')
      .select('*')
      .eq('property_id', id)
      .eq('completed', false)
      .lt('due_date', new Date().toISOString());
    
    setOverdueTodos((todosData || []).length);

    setLoading(false);
  };

  const handleCreateFloor = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from('floors')
      .insert([{
        name: floorName,
        level: floorLevel ? parseInt(floorLevel) : null,
        property_id: id,
      }]);

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Våning skapad!',
        description: `${floorName} har lagts till.`,
      });
      setDialogOpen(false);
      setFloorName('');
      setFloorLevel('');
      fetchPropertyAndFloors();
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

    const { data: { publicUrl } } = supabase.storage
      .from('floor-drawings')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('floors')
      .update({ drawing_url: publicUrl })
      .eq('id', floorId);

    if (updateError) {
      toast({
        title: 'Fel',
        description: updateError.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Ritning uppladdad!',
        description: 'Du kan nu märka ut komponenter på ritningen.',
      });
      fetchPropertyAndFloors();
    }

    setUploadingFile(false);
  };

  const handleDeleteFloor = async (floorId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna våning? Alla komponenter på våningen kommer också att tas bort.')) {
      return;
    }

    const { error } = await supabase
      .from('floors')
      .delete()
      .eq('id', floorId);

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Våning borttagen',
        description: 'Våningen har tagits bort.',
      });
      fetchPropertyAndFloors();
    }
  };

  const handleDeleteDrawing = async (floor: Floor) => {
    if (!confirm('Är du säker på att du vill ta bort ritningen? Komponenter på våningen kommer att behållas.')) {
      return;
    }

    const { error } = await supabase
      .from('floors')
      .update({ drawing_url: null })
      .eq('id', floor.id);

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Ritning borttagen',
        description: 'Ritningen har tagits bort. Du kan ladda upp en ny.',
      });
      fetchPropertyAndFloors();
    }
  };

  const handleExportProperty = async (format: 'excel' | 'pdf') => {
    if (!property) return;

    // Fetch all components for this property
    const { data: componentsData } = await supabase
      .from('components')
      .select(`
        *,
        floors!inner(
          property_id,
          name
        )
      `)
      .eq('floors.property_id', property.id);

    if (!componentsData || componentsData.length === 0) {
      toast({
        title: 'Ingen data',
        description: 'Det finns inga komponenter att exportera för denna fastighet.',
        variant: 'destructive',
      });
      return;
    }

    // Fetch maintenance records for all components
    const maintenanceRecords: Record<string, any[]> = {};
    
    for (const component of componentsData) {
      const { data } = await supabase
        .from('maintenance_history')
        .select('*')
        .eq('component_id', component.id)
        .order('performed_date', { ascending: false });
      
      maintenanceRecords[component.id] = data || [];
    }

    const formattedComponents = componentsData.map((comp: any) => ({
      ...comp,
      floor_name: comp.floors?.name,
      property_name: property.name,
      property_address: property.address,
    }));

    if (format === 'excel') {
      exportComponentsToExcel(
        formattedComponents,
        maintenanceRecords,
        `${property.name}-${new Date().toISOString().split('T')[0]}.xlsx`
      );
      toast({
        title: 'Export lyckades',
        description: `Komponenter för ${property.name} exporterade till Excel`,
      });
    } else {
      exportComponentsToPDF(
        formattedComponents,
        maintenanceRecords,
        `Komponentregister - ${property.name}`,
        `${property.name}-${new Date().toISOString().split('T')[0]}.pdf`
      );
      toast({
        title: 'Export lyckades',
        description: `Komponenter för ${property.name} exporterade till PDF`,
      });
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    );
  }

  // Render null if no property
  if (!property) {
    return null;
  }

  // Render mobile layout
  if (isMobile) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-background pb-16">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center gap-4 mb-4">
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
                      <Badge variant="outline" className="gap-1 border-orange-500 text-orange-500">
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tabs Navigation - Sticky under header */}
          <div className="sticky top-[73px] z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-6">
              <TabsList className="h-12 w-full justify-start rounded-none border-0 bg-transparent p-0 overflow-x-auto">
                <TabsTrigger value="overview">Översikt</TabsTrigger>
                <TabsTrigger value="notes">Anteckningar</TabsTrigger>
                <TabsTrigger value="todos">Att göra</TabsTrigger>
                <TabsTrigger value="contacts">Kontakter</TabsTrigger>
                <TabsTrigger value="documents">Dokument</TabsTrigger>
                <TabsTrigger value="activity">Aktivitet</TabsTrigger>
                <TabsTrigger value="technical-info">Teknisk info</TabsTrigger>
                <TabsTrigger value="info-categories">Info-kategorier</TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Main Content */}
          <main className="container mx-auto px-6 py-6">
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

        {/* Dialogs */}
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
      </div>
    );
  }

  // Desktop layout - with sidebar
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-6 py-4">
              <div className="flex items-center gap-4 mb-4">
                <SidebarTrigger className="md:hidden" />
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
                        <Badge variant="outline" className="gap-1 border-orange-500 text-orange-500">
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

          {/* Tabs Navigation - Sticky under header */}
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-12 w-full justify-start rounded-none border-0 bg-transparent p-0 overflow-x-auto">
                  <TabsTrigger value="overview">Översikt</TabsTrigger>
                  <TabsTrigger value="notes">Anteckningar</TabsTrigger>
                  <TabsTrigger value="todos">Att göra</TabsTrigger>
                  <TabsTrigger value="contacts">Kontakter</TabsTrigger>
                  <TabsTrigger value="documents">Dokument</TabsTrigger>
                  <TabsTrigger value="activity">Aktivitet</TabsTrigger>
                  <TabsTrigger value="technical-info">Teknisk info</TabsTrigger>
                  <TabsTrigger value="info-categories">Info-kategorier</TabsTrigger>
                </TabsList>
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
              </Tabs>
            </div>
          </div>

          {/* Main Content */}
          <main className="container mx-auto px-6 py-6">
          </main>

          {/* Dialogs */}
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
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default PropertyDetail;
