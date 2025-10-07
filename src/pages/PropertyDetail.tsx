import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { FloorCanvas } from '@/components/FloorCanvas';

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
                    {!floor.drawing_url && (
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
