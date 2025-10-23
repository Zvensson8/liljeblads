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
import { PropertyMaintenancePlan } from '@/components/property/PropertyMaintenancePlan';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { useRecentlyVisited } from '@/hooks/useRecentlyVisited';

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

    // Fetch components for this property
    const { data: componentsData } = await supabase
      .from('components')
      .select(`
        *,
        floors!inner(property_id, name)
      `)
      .eq('floors.property_id', id);
    
    setComponents(componentsData || []);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-4">
          <Breadcrumb className="mb-4">
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
                    {property.property_number ? `#${property.property_number}` : `#${property.id.substring(0, 5).toUpperCase()}`}
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
      <div className="sticky top-[73px] z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-12 w-full justify-start rounded-none border-0 bg-transparent p-0">
              <TabsTrigger value="overview" className="gap-2">
                <Home className="h-4 w-4" />
                Översikt
              </TabsTrigger>
              <TabsTrigger value="components" className="gap-2">
                <Settings className="h-4 w-4" />
                Komponenter
              </TabsTrigger>
              <TabsTrigger value="drawings" className="gap-2">
                <MapPin className="h-4 w-4" />
                Ritningar
              </TabsTrigger>
              <TabsTrigger value="workorders" className="gap-2">
                <Wrench className="h-4 w-4" />
                Arbetsordrar
              </TabsTrigger>
              <TabsTrigger value="maintenance" className="gap-2">
                <Settings className="h-4 w-4" />
                Underhållsplan
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-2">
                <FileText className="h-4 w-4" />
                Anteckningar
              </TabsTrigger>
              <TabsTrigger value="contacts" className="gap-2">
                <Users className="h-4 w-4" />
                Kontakter
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-2">
                <File className="h-4 w-4" />
                Dokument
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <main className="container mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Overview Tab */}
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

          {/* Components Tab */}
          <TabsContent value="components">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <CardTitle>Komponenter ({components.length})</CardTitle>
                  </div>
                  <ComponentImportDialog
                    propertyId={property.id}
                    propertyName={property.name}
                    onSuccess={fetchPropertyAndFloors}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {components.length === 0 ? (
                  <div className="text-center py-8">
                    <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">Inga komponenter registrerade</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {components.map((component: any) => (
                      <Card key={component.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-semibold">{component.name}</CardTitle>
                          <CardDescription className="text-xs">{component.type}</CardDescription>
                        </CardHeader>
                        <CardContent className="text-xs space-y-1">
                          <div>
                            <span className="text-muted-foreground">Installationsår: </span>
                            <span>{component.installation_year || '-'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Tillverkare: </span>
                            <span>{component.manufacturer || '-'}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Drawings Tab */}
          <TabsContent value="drawings">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold">Våningsplan</h2>
                </div>
                <div className="flex gap-2">
                  {floors.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                          <Download className="h-4 w-4 mr-2" />
                          Exportera fastighet
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleExportProperty('excel')}>
                          Exportera till Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportProperty('pdf')}>
                          Exportera till PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Ny våning
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Skapa ny våning</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateFloor} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="floorName">Namn</Label>
                          <Input
                            id="floorName"
                            value={floorName}
                            onChange={(e) => setFloorName(e.target.value)}
                            placeholder="T.ex. Bottenvåning"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="floorLevel">Våningsnummer (valfritt)</Label>
                          <Input
                            id="floorLevel"
                            type="number"
                            value={floorLevel}
                            onChange={(e) => setFloorLevel(e.target.value)}
                            placeholder="T.ex. 1"
                          />
                        </div>
                        <Button type="submit" className="w-full">
                          Skapa våning
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {floors.length === 0 ? (
                <Card className="text-center py-16 border-dashed">
                  <CardContent>
                    <div className="inline-flex p-4 rounded-full bg-primary/10 text-primary mb-4">
                      <Plus className="h-8 w-8" />
                    </div>
                    <CardTitle className="mb-2 text-xl">Inga våningar än</CardTitle>
                    <CardDescription className="text-base">Skapa din första våning och ladda upp en ritning</CardDescription>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-8">
                  {floors.map((floor) => (
                    <Card key={floor.id} className="overflow-hidden shadow-[var(--shadow-card)]">
                      <CardHeader className="bg-gradient-to-r from-card to-secondary/30">
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle className="text-xl">{floor.name}</CardTitle>
                            {floor.level !== null && (
                              <CardDescription className="text-base mt-1">Våning {floor.level}</CardDescription>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {floor.drawing_url ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteDrawing(floor)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Ta bort ritning
                                </Button>
                                <Input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(floor.id, file);
                                  }}
                                  disabled={uploadingFile}
                                  className="hidden"
                                  id={`file-${floor.id}`}
                                />
                                <Label htmlFor={`file-${floor.id}`} className="cursor-pointer">
                                  <Button asChild disabled={uploadingFile} size="sm" variant="outline">
                                    <span>
                                      <Upload className="h-4 w-4 mr-2" />
                                      Byt ritning
                                    </span>
                                  </Button>
                                </Label>
                              </>
                            ) : (
                              <div>
                                <Input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(floor.id, file);
                                  }}
                                  disabled={uploadingFile}
                                  className="hidden"
                                  id={`file-${floor.id}`}
                                />
                                <Label htmlFor={`file-${floor.id}`} className="cursor-pointer">
                                  <Button asChild disabled={uploadingFile} size="lg">
                                    <span>
                                      <Upload className="h-4 w-4 mr-2" />
                                      {uploadingFile ? 'Laddar upp...' : 'Ladda upp ritning'}
                                    </span>
                                  </Button>
                                </Label>
                              </div>
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
                      {floor.drawing_url && (
                        <CardContent className="p-6">
                          <FloorCanvas
                            floorId={floor.id}
                            drawingUrl={floor.drawing_url}
                            onUpdate={fetchPropertyAndFloors}
                          />
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Maintenance Plan Tab */}
          <TabsContent value="maintenance">
            <PropertyMaintenancePlan propertyId={property.id} />
          </TabsContent>

          {/* Work Orders Tab */}
          <TabsContent value="workorders">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-primary" />
                    <CardTitle>Arbetsordrar ({workOrders.length})</CardTitle>
                  </div>
                  <Button onClick={() => setWorkOrderDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ny Arbetsorder
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {workOrders.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">Inga arbetsordrar registrerade</p>
                    <Button onClick={() => setWorkOrderDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Skapa Första Arbetsordern
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-sm text-muted-foreground">
                          <th className="text-left py-3 px-2 font-medium">Åtgärd</th>
                          <th className="text-left py-3 px-2 font-medium">Status</th>
                          <th className="text-left py-3 px-2 font-medium">Prioritet</th>
                          <th className="text-left py-3 px-2 font-medium">Entreprenör</th>
                          <th className="text-left py-3 px-2 font-medium">Pris</th>
                          <th className="text-left py-3 px-2 font-medium">Datum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workOrders.map((order) => (
                          <tr key={order.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-2 font-medium">{order.action}</td>
                            <td className="py-3 px-2">
                              <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">
                                {order.status === 'not_started' && 'Ej påbörjad'}
                                {order.status === 'awaiting_quote' && 'Inväntar offert'}
                                {order.status === 'ordered' && 'Beställt'}
                                {order.status === 'completed' && 'Slutförd'}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs ${
                                order.priority === 'high' ? 'bg-red-500/10 text-red-500' :
                                order.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-500' :
                                'bg-green-500/10 text-green-500'
                              }`}>
                                {order.priority === 'high' && 'Hög'}
                                {order.priority === 'medium' && 'Medel'}
                                {order.priority === 'low' && 'Låg'}
                              </span>
                            </td>
                            <td className="py-3 px-2">{order.contractor || '-'}</td>
                            <td className="py-3 px-2">
                              {order.price ? `${Number(order.price).toLocaleString('sv-SE')} kr` : '-'}
                            </td>
                            <td className="py-3 px-2">{order.due_date || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle>Kontakter</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <PropertyContacts propertyId={property.id} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <File className="h-5 w-5 text-primary" />
                  <CardTitle>Dokument</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <PropertyDocuments propertyId={property.id} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>Anteckningar</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <PropertyNotes propertyId={property.id} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
    </div>
  );
};

export default PropertyDetail;
