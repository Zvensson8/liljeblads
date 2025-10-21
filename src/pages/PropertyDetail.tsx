import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Upload, Trash2, Download, MapPin, Building2, Settings, Wrench, TrendingUp, FileText, CheckSquare, Users, File, Edit, Phone, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { FloorCanvas } from '@/components/FloorCanvas';
import { exportComponentsToExcel, exportComponentsToPDF } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ComponentImportDialog } from '@/components/ComponentImportDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface Property {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
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

  useEffect(() => {
    if (id) {
      fetchPropertyAndFloors();
    }
  }, [id]);

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/properties')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Tillbaka
              </Button>
              <div className="h-8 w-px bg-border" />
              <div>
                <h1 className="text-2xl font-bold">{property.name}</h1>
                <p className="text-sm text-muted-foreground">#{property.id.substring(0, 5).toUpperCase()}</p>
              </div>
            </div>
            <Button className="gap-2">
              <Edit className="h-4 w-4" />
              Redigera Fastighet
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="grid gap-6 mb-8">
          {/* Top Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Property Information */}
            <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Fastighetsinformation</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{property.address || 'Ingen adress'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">📅</span>
                  <span className="text-muted-foreground">Byggår: -</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Typ: </span>
                  <span className="text-foreground">-</span>
                </div>
                <div>
                  <span className="text-muted-foreground">LOA: </span>
                  <span className="text-foreground">- m²</span>
                </div>
              </CardContent>
            </Card>

            {/* Components */}
            <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Komponenter</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold mb-1">{components.length}</div>
                <p className="text-sm text-muted-foreground">Totalt antal komponenter</p>
              </CardContent>
            </Card>

            {/* Work Orders */}
            <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Arbetsordrar</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold mb-1">{workOrders.length}</div>
                <p className="text-sm text-muted-foreground">Aktiva arbetsordrar</p>
              </CardContent>
            </Card>
          </div>

          {/* Economic Overview */}
          <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle>Ekonomisk översikt</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Månadskostnad</p>
                  <p className="text-2xl font-bold">- kr</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Årskostnad</p>
                  <p className="text-2xl font-bold">- kr</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Antal konton</p>
                  <p className="text-2xl font-bold">-</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different sections */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="overview">Översikt</TabsTrigger>
            <TabsTrigger value="components">Komponenter</TabsTrigger>
            <TabsTrigger value="drawings">Ritningar</TabsTrigger>
            <TabsTrigger value="workorders">Arbetsordrar</TabsTrigger>
            <TabsTrigger value="invoice">Faktura</TabsTrigger>
            <TabsTrigger value="contacts">Kontakter</TabsTrigger>
            <TabsTrigger value="documents">Dokument</TabsTrigger>
            <TabsTrigger value="notes">Anteckningar</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Notes */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle>Anteckningar</CardTitle>
                  </div>
                  <Button size="sm" variant="outline">
                    Redigera
                  </Button>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic">Inga anteckningar ännu</p>
                </CardContent>
              </Card>

              {/* To-do List */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-primary" />
                    <CardTitle>Att-göra lista</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Lägg till ny uppgift..." 
                      value={todoText}
                      onChange={(e) => setTodoText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && todoText.trim()) {
                          toast({ title: 'Uppgift tillagd!' });
                          setTodoText('');
                        }
                      }}
                    />
                    <Button 
                      size="icon"
                      onClick={() => {
                        if (todoText.trim()) {
                          toast({ title: 'Uppgift tillagd!' });
                          setTodoText('');
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground italic">Inga uppgifter ännu</p>
                </CardContent>
              </Card>
            </div>
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

          {/* Work Orders Tab */}
          <TabsContent value="workorders">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  <CardTitle>Arbetsordrar (0)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Inga arbetsordrar registrerade</p>
                  <p className="text-sm text-muted-foreground">Denna funktion kräver backend-implementation</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoice Tab */}
          <TabsContent value="invoice">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>Fakturainformation</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Fakturaadress & Kontakt
                  </Button>
                  <Button size="sm">Redigera</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border rounded-lg p-4 space-y-2">
                  <p className="font-medium">Trophi Nora HB</p>
                  <p className="text-sm text-muted-foreground">Org.nr: 969750-5601</p>
                  <p className="text-sm text-muted-foreground">Adress:</p>
                  <p className="text-sm text-muted-foreground">Box 239</p>
                  <p className="text-sm text-muted-foreground">721 06 Västerås</p>
                </div>
                <p className="text-xs text-muted-foreground">Exempeldata - redigera via backend</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle>Kontakter (1)</CardTitle>
                </div>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Ny kontakt
                </Button>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">Axel Eriksson</p>
                      <span className="inline-block px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full mt-1">
                        Driftansvarig
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">0766686261</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Axel.eriksson@fastighetsnabben.se</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Fastighetsnabben</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">Exempeldata - funktion kräver backend-implementation</p>
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
                <p className="text-sm text-muted-foreground mt-2">
                  Hantera dokument som är kopplade till denna fastighet
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-6">
                  <Button className="flex-1">
                    <File className="h-4 w-4 mr-2" />
                    Dokument
                  </Button>
                  <Button variant="secondary" className="flex-1">
                    <Upload className="h-4 w-4 mr-2" />
                    Ladda upp
                  </Button>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Input placeholder="Sök dokument..." />
                    <Button variant="outline">
                      Alla filtyper
                    </Button>
                  </div>
                  <div className="text-center py-12">
                    <File className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">Inga dokument hittades</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">Funktion kräver backend-implementation för filuppladdning och lagring</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>Anteckningar</CardTitle>
                </div>
                <Button size="sm">
                  Redigera
                </Button>
              </CardHeader>
              <CardContent>
                <Textarea 
                  placeholder="Skriv dina anteckningar här..." 
                  rows={10}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground mt-4">Anteckningar sparas automatiskt</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default PropertyDetail;
