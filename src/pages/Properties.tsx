import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Property {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
}

const Properties = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const { toast } = useToast();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Fel vid hämtning',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setProperties(data || []);
    }
    setLoading(false);
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from('properties')
      .insert([{ name, address, description, owner_id: user?.id }]);

    if (error) {
      toast({
        title: 'Fel vid skapande',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Fastighet skapad!',
        description: `${name} har lagts till.`,
      });
      setDialogOpen(false);
      setName('');
      setAddress('');
      setDescription('');
      fetchProperties();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Blueprint Mapper</h1>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Logga ut
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold">Mina fastigheter</h2>
            <p className="text-muted-foreground">Hantera dina fastigheter och ritningar</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Ny fastighet
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Skapa ny fastighet</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateProperty} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Namn</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="T.ex. Storgatan 1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adress</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="T.ex. Storgatan 1, 123 45 Stockholm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Beskrivning</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Valfri beskrivning..."
                  />
                </div>
                <Button type="submit" className="w-full">
                  Skapa fastighet
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {properties.length === 0 ? (
          <Card className="text-center py-16 border-dashed">
            <CardContent>
              <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <CardTitle className="mb-2 text-2xl">Inga fastigheter än</CardTitle>
              <CardDescription className="text-base">Kom igång genom att skapa din första fastighet</CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <Card
                key={property.id}
                className="cursor-pointer hover:shadow-[var(--shadow-elegant)] hover:border-primary transition-all duration-300 group"
                onClick={() => navigate(`/property/${property.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="group-hover:text-primary transition-colors">
                        {property.name}
                      </CardTitle>
                      {property.address && (
                        <CardDescription className="mt-1.5">{property.address}</CardDescription>
                      )}
                    </div>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                  </div>
                </CardHeader>
                {property.description && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">{property.description}</p>
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

export default Properties;
