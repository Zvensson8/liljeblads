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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [floorName, setFloorName] = useState('');
  const [floorLevel, setFloorLevel] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [todoText, setTodoText] = useState('');
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
    return todosData.filter((t) => !t.completed && t.due_date && t.due_date < now)
      .length;
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
  }, [property]);

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

    // Storage operations remain raw (no hook layer for storage).
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
    if (!confirm('Är du säker på att du vill ta bort denna våning? Alla komponenter på våningen kommer också att tas bort.')) {
      return;
    }
    deleteFloor.mutate(floorId);
  };

  const handleDeleteDrawing = async (floor: Floor) => {
    if (!confirm('Är du säker på att du vill ta bort ritningen? Komponenter på våningen kommer att behållas.')) {
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

  const handleExportProperty = async (format: 'excel' | 'pdf') => {
    if (!property) return;

    if (components.length === 0) {
      toast({
        title: 'Ingen data',
        description: 'Det finns inga komponenter att exportera för denna fastighet.',
        variant: 'destructive',
      });
      return;
    }

    // Build maintenance map from already-loaded data
    const maintenanceRecords: Record<string, typeof allMaintenance> = {};
    components.forEach((c) => (maintenanceRecords[c.id] = []));
    allMaintenance.forEach((row) => {
      if (!row.component_id || !maintenanceRecords[row.component_id]) return;
      maintenanceRecords[row.component_id].push(row);
    });
    Object.values(maintenanceRecords).forEach((arr) =>
      arr.sort((a, b) => (b.performed_date || '').localeCompare(a.performed_date || '')),
    );

    const floorMap = new Map(floors.map((f) => [f.id, f.name]));
    const formattedComponents = components.map((comp) => ({
      ...comp,
      floor_name: comp.floors?.name ?? (comp.floor_id ? floorMap.get(comp.floor_id) : undefined),
      property_name: property.name,
      property_address: property.address,
    })) as Parameters<typeof exportComponentsToExcel>[0];

    if (format === 'excel') {
      exportComponentsToExcel(
        formattedComponents,
        maintenanceRecords as Parameters<typeof exportComponentsToExcel>[1],
        `${property.name}-${new Date().toISOString().split('T')[0]}.xlsx`
      );
      toast({
        title: 'Export lyckades',
        description: `Komponenter för ${property.name} exporterade till Excel`,
      });
    } else {
      exportComponentsToPDF(
        formattedComponents as Parameters<typeof exportComponentsToPDF>[0],
        maintenanceRecords as Parameters<typeof exportComponentsToPDF>[1],
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
              <TabsTrigger value="drawings">Ritningar</TabsTrigger>
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
            <TabsContent value="drawings">
              <div className="space-y-6">
                {floors.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      <p className="mb-4">Inga våningar har skapats än.</p>
                      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                          <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Skapa våning
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Skapa ny våning</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={handleCreateFloor} className="space-y-4">
                            <div>
                              <Label htmlFor="floorName">Våningsnamn</Label>
                              <Input
                                id="floorName"
                                value={floorName}
                                onChange={(e) => setFloorName(e.target.value)}
                                placeholder="t.ex. Entréplan, Våning 2"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="floorLevel">Våningsnummer (valfritt)</Label>
                              <Input
                                id="floorLevel"
                                type="number"
                                value={floorLevel}
                                onChange={(e) => setFloorLevel(e.target.value)}
                                placeholder="t.ex. 1, 2, 3"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Avbryt
                              </Button>
                              <Button type="submit">Skapa våning</Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold">Ritningar</h2>
                      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                          <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Lägg till våning
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Skapa ny våning</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={handleCreateFloor} className="space-y-4">
                            <div>
                              <Label htmlFor="floorName">Våningsnamn</Label>
                              <Input
                                id="floorName"
                                value={floorName}
                                onChange={(e) => setFloorName(e.target.value)}
                                placeholder="t.ex. Entréplan, Våning 2"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="floorLevel">Våningsnummer (valfritt)</Label>
                              <Input
                                id="floorLevel"
                                type="number"
                                value={floorLevel}
                                onChange={(e) => setFloorLevel(e.target.value)}
                                placeholder="t.ex. 1, 2, 3"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Avbryt
                              </Button>
                              <Button type="submit">Skapa våning</Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {floors.map((floor) => (
                      <Card key={floor.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle>{floor.name}</CardTitle>
                              <CardDescription>
                                {floor.level !== null ? `Våning ${floor.level}` : 'Ingen nivå angiven'}
                              </CardDescription>
                            </div>
                            <div className="flex gap-2">
                              {floor.drawing_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteDrawing(floor)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Ta bort ritning
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteFloor(floor.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Ta bort våning
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {floor.drawing_url ? (
                            <div className="space-y-4">
                              <FloorCanvas
                                floorId={floor.id}
                                drawingUrl={floor.drawing_url}
                                onUpdate={fetchPropertyAndFloors}
                                onBack={() => setActiveTab('overview')}
                              />
                            </div>
                          ) : (
                            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                              <p className="text-muted-foreground mb-4">
                                Ingen ritning uppladdad för denna våning
                              </p>
                              <Label htmlFor={`upload-${floor.id}`}>
                                <Button
                                  variant="outline"
                                  disabled={uploadingFile}
                                  onClick={() => document.getElementById(`upload-${floor.id}`)?.click()}
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  {uploadingFile ? 'Laddar upp...' : 'Ladda upp ritning'}
                                </Button>
                              </Label>
                              <Input
                                id={`upload-${floor.id}`}
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(floor.id, file);
                                }}
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </>
                )}
              </div>
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
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4 md:px-6 py-4">
              <div className="flex items-center gap-4 mb-4">
                <SidebarTrigger className="hidden md:flex" />
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
                  <TabsTrigger value="drawings">Ritningar</TabsTrigger>
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
                <TabsContent value="drawings">
                  <div className="space-y-6">
                    {floors.length === 0 ? (
                      <Card>
                        <CardContent className="pt-6 text-center text-muted-foreground">
                          <p className="mb-4">Inga våningar har skapats än.</p>
                          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                              <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Skapa våning
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Skapa ny våning</DialogTitle>
                              </DialogHeader>
                              <form onSubmit={handleCreateFloor} className="space-y-4">
                                <div>
                                  <Label htmlFor="floorName">Våningsnamn</Label>
                                  <Input
                                    id="floorName"
                                    value={floorName}
                                    onChange={(e) => setFloorName(e.target.value)}
                                    placeholder="t.ex. Entréplan, Våning 2"
                                    required
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="floorLevel">Våningsnummer (valfritt)</Label>
                                  <Input
                                    id="floorLevel"
                                    type="number"
                                    value={floorLevel}
                                    onChange={(e) => setFloorLevel(e.target.value)}
                                    placeholder="t.ex. 1, 2, 3"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                    Avbryt
                                  </Button>
                                  <Button type="submit">Skapa våning</Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        <div className="flex justify-between items-center">
                          <h2 className="text-2xl font-bold">Ritningar</h2>
                          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                              <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Lägg till våning
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Skapa ny våning</DialogTitle>
                              </DialogHeader>
                              <form onSubmit={handleCreateFloor} className="space-y-4">
                                <div>
                                  <Label htmlFor="floorName">Våningsnamn</Label>
                                  <Input
                                    id="floorName"
                                    value={floorName}
                                    onChange={(e) => setFloorName(e.target.value)}
                                    placeholder="t.ex. Entréplan, Våning 2"
                                    required
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="floorLevel">Våningsnummer (valfritt)</Label>
                                  <Input
                                    id="floorLevel"
                                    type="number"
                                    value={floorLevel}
                                    onChange={(e) => setFloorLevel(e.target.value)}
                                    placeholder="t.ex. 1, 2, 3"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                    Avbryt
                                  </Button>
                                  <Button type="submit">Skapa våning</Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {floors.map((floor) => (
                          <Card key={floor.id}>
                            <CardHeader>
                              <div className="flex items-center justify-between">
                                <div>
                                  <CardTitle>{floor.name}</CardTitle>
                                  <CardDescription>
                                    {floor.level !== null ? `Våning ${floor.level}` : 'Ingen nivå angiven'}
                                  </CardDescription>
                                </div>
                                <div className="flex gap-2">
                                  {floor.drawing_url && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDeleteDrawing(floor)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Ta bort ritning
                                    </Button>
                                  )}
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDeleteFloor(floor.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Ta bort våning
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              {floor.drawing_url ? (
                                <div className="space-y-4">
                                  <FloorCanvas
                                    floorId={floor.id}
                                    drawingUrl={floor.drawing_url}
                                    onUpdate={fetchPropertyAndFloors}
                                    onBack={() => setActiveTab('overview')}
                                  />
                                </div>
                              ) : (
                                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                                  <p className="text-muted-foreground mb-4">
                                    Ingen ritning uppladdad för denna våning
                                  </p>
                                  <Label htmlFor={`upload-${floor.id}`}>
                                    <Button
                                      variant="outline"
                                      disabled={uploadingFile}
                                      onClick={() => document.getElementById(`upload-${floor.id}`)?.click()}
                                    >
                                      <Upload className="h-4 w-4 mr-2" />
                                      {uploadingFile ? 'Laddar upp...' : 'Ladda upp ritning'}
                                    </Button>
                                  </Label>
                                  <Input
                                    id={`upload-${floor.id}`}
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleFileUpload(floor.id, file);
                                    }}
                                  />
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </>
                    )}
                  </div>
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
          <main className="container mx-auto px-4 md:px-6 py-4 md:py-6 pb-20 md:pb-6">
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
