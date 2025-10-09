import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Upload, Trash2, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { FloorCanvas } from '@/components/FloorCanvas';
import { exportComponentsToExcel, exportComponentsToPDF } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ComponentImportDialog } from '@/components/ComponentImportDialog';

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
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate('/properties')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka till fastigheter
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{property.name}</h1>
          {property.address && (
            <p className="text-muted-foreground">{property.address}</p>
          )}
          {property.description && (
            <p className="text-muted-foreground mt-2">{property.description}</p>
          )}
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Våningsplan</h2>
          <div className="flex gap-2">
            {floors.length > 0 && (
              <>
                <ComponentImportDialog
                  propertyId={property.id}
                  propertyName={property.name}
                  onSuccess={fetchPropertyAndFloors}
                />
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
              </>
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
      </main>
    </div>
  );
};

export default PropertyDetail;
