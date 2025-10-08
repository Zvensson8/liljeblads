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
import { Building2, Plus, Compass, Sparkles, MapPin, Layers } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { z } from 'zod';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';

const propertySchema = z.object({
  name: z.string().trim().min(1, 'Namn är obligatoriskt').max(200, 'Namn får vara max 200 tecken'),
  address: z.string().max(500, 'Adress får vara max 500 tecken').optional().or(z.literal('')),
  description: z.string().max(2000, 'Beskrivning får vara max 2000 tecken').optional().or(z.literal('')),
});

interface Property {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  floors?: any[];
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
      .select(`
        *,
        floors (
          id,
          name,
          level
        )
      `)
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

    try {
      // Validate input data
      propertySchema.parse({
        name,
        address: address || '',
        description: description || '',
      });

      const { error } = await supabase
        .from('properties')
        .insert([{ 
          name: name.trim(), 
          address: address.trim() || null, 
          description: description.trim() || null, 
          owner_id: user?.id 
        }]);

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
    } catch (error: any) {
      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        toast({
          title: 'Valideringsfel',
          description: firstError.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Fel',
          description: error.message,
          variant: 'destructive',
        });
      }
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
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Modern Header */}
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center gap-4 px-6">
              <SidebarTrigger className="hover:bg-muted rounded-md p-2 transition-colors" />
              
              <div className="flex items-center gap-3 flex-1">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                  <Compass className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">NavRitning</h1>
                  <p className="text-xs text-muted-foreground">Professionell ritningshantering</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm">
                  <Sparkles className="h-4 w-4" />
                  <span className="font-medium">{properties.length} fastigheter</span>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <div className="container mx-auto px-6 py-8">
              {/* Stats Bar */}
              <div className="grid gap-4 md:grid-cols-3 mb-8 animate-fade-in">
                <Card className="border-border/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5 hover-scale">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Totalt fastigheter</p>
                        <p className="text-3xl font-bold">{properties.length}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-500/20">
                        <Building2 className="h-6 w-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-gradient-to-br from-green-500/10 to-green-600/5 hover-scale">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Med ritningar</p>
                        <p className="text-3xl font-bold">{properties.filter(p => p.floors && p.floors.length > 0).length}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-green-500/20">
                        <MapPin className="h-6 w-6 text-green-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 bg-gradient-to-br from-purple-500/10 to-purple-600/5 hover-scale">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Totalt våningar</p>
                        <p className="text-3xl font-bold">
                          {properties.reduce((acc, p) => acc + (p.floors?.length || 0), 0)}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-purple-500/20">
                        <Layers className="h-6 w-6 text-purple-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Page Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                <div className="space-y-1">
                  <h2 className="text-3xl font-bold tracking-tight">Mina fastigheter</h2>
                  <p className="text-muted-foreground">
                    Hantera och organisera alla dina fastigheter och ritningar
                  </p>
                </div>
                
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="gap-2">
                      <Plus className="h-5 w-5" />
                      Ny fastighet
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Skapa ny fastighet</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateProperty} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Namn <span className="text-destructive">*</span></Label>
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
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                          Avbryt
                        </Button>
                        <Button type="submit" className="flex-1">
                          Skapa fastighet
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Properties Grid */}
              {properties.length === 0 ? (
                <Card className="border-dashed animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Building2 className="h-10 w-10 text-primary" />
                    </div>
                    <CardTitle className="mb-2 text-2xl">Inga fastigheter än</CardTitle>
                    <CardDescription className="text-base mb-6 text-center max-w-md">
                      Kom igång genom att skapa din första fastighet och börja hantera dina ritningar
                    </CardDescription>
                    <Button onClick={() => setDialogOpen(true)} size="lg" className="gap-2">
                      <Plus className="h-5 w-5" />
                      Skapa din första fastighet
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  {properties.map((property, index) => (
                    <Card
                      key={property.id}
                      className="group cursor-pointer hover:shadow-[var(--shadow-elegant)] hover:border-primary/50 transition-all duration-300 hover-scale border-border/50"
                      onClick={() => navigate(`/property/${property.id}`)}
                      style={{ animationDelay: `${0.3 + index * 0.05}s` }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="group-hover:text-primary transition-colors truncate text-lg">
                              {property.name}
                            </CardTitle>
                            {property.address && (
                              <CardDescription className="mt-1.5 line-clamp-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {property.address}
                              </CardDescription>
                            )}
                          </div>
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                            <Building2 className="h-6 w-6 text-primary-foreground" />
                          </div>
                        </div>
                        {property.floors && property.floors.length > 0 && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <Layers className="h-4 w-4" />
                            <span>{property.floors.length} våning{property.floors.length !== 1 ? 'ar' : ''}</span>
                          </div>
                        )}
                      </CardHeader>
                      {property.description && (
                        <CardContent>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {property.description}
                          </p>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Properties;
