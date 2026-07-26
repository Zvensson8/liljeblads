import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, User, Mail, Phone, Building, Lock, Shield } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PropertyContactsProps {
  propertyId: string;
}

export function PropertyContacts({ propertyId }: PropertyContactsProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    phone: "",
    email: "",
    company: "",
  });

  // Kolla om användaren har admin-behörighet
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      
      try {
        // Hämta fastigheten för att få organization_id
        const { data: property } = await supabase
          .from("properties")
          .select("organization_id")
          .eq("id", propertyId)
          .single();

        if (!property?.organization_id) {
          setIsAdmin(true); // Om ingen org, anta property owner har åtkomst
          setLoading(false);
          return;
        }

        // Kolla användarens roll i organisationen
        const { data: memberData } = await supabase
          .from("organization_members")
          .select("role")
          .eq("user_id", user.id)
          .eq("organization_id", property.organization_id)
          .single();

        // Endast owners och admins har åtkomst
        const hasAccess = memberData?.role === "owner" || memberData?.role === "admin";
        setIsAdmin(hasAccess);
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, propertyId]);

  const { data: contacts, refetch } = useQuery({
    queryKey: ["property-contacts", propertyId],
    queryFn: async () => {
      // Query kommer automatiskt att respektera RLS-policies
      const { data, error } = await supabase
        .from("property_contacts")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (error) {
        // Om användaren inte har åtkomst, returnera tom array istället för error
        if (error.code === "42501" || error.code === "PGRST301") {
          return [];
        }
        throw error;
      }
      return data;
    },
    enabled: isAdmin && !loading, // Endast hämta om användaren är admin
  });

  const handleAddContact = async () => {
    if (!isAdmin) {
      toast.error("Endast org owners och admins kan hantera kontakter");
      return;
    }

    if (!formData.name.trim()) {
      toast.error("Namn krävs");
      return;
    }

    const { error } = await supabase
      .from("property_contacts")
      .insert([{ 
        property_id: propertyId,
        ...formData
      }]);

    if (error) {
      toast.error("Kunde inte lägga till kontakt");
    } else {
      toast.success("Kontakt tillagd");
      setFormData({ name: "", role: "", phone: "", email: "", company: "" });
      setDialogOpen(false);
      refetch();
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!isAdmin) {
      toast.error("Endast org owners och admins kan ta bort kontakter");
      return;
    }

    const { error } = await supabase
      .from("property_contacts")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Kunde inte ta bort kontakt");
    } else {
      toast.success("Kontakt borttagen");
      refetch();
    }
  };

  // Visa laddningsindikator
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Kontrollerar behörigheter...</p>
      </div>
    );
  }

  // Om användaren inte har admin-behörighet, visa meddelande
  if (!isAdmin) {
    return (
      <Alert>
        <Lock className="h-4 w-4" />
        <AlertTitle>Begränsad Åtkomst</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Endast org owners och admins har åtkomst till kontaktuppgifter för att skydda känslig information
            som telefonnummer och e-postadresser.
          </p>
          <p className="text-sm text-muted-foreground">
            Om du behöver kontakta någon angående denna fastighet, vänd dig till din organisations administratör.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till Kontakt
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny Kontakt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Namn *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Namn"
              />
            </div>
            <div>
              <Label>Roll</Label>
              <Input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="t.ex. VD, Kontaktperson"
              />
            </div>
            <div>
              <Label>Företag</Label>
              <Input
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Företagsnamn"
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="070-123 45 67"
              />
            </div>
            <div>
              <Label>E-post</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="namn@exempel.se"
              />
            </div>
            <Button onClick={handleAddContact} className="w-full">
              Lägg till Kontakt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4">
        {contacts && contacts.length > 0 ? (
          contacts.map((contact) => (
            <Card key={contact.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-muted-foreground" />
                    {contact.name}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteContact(contact.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {contact.role && (
                  <p className="text-muted-foreground">{contact.role}</p>
                )}
                {contact.company && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    {contact.company}
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${contact.phone}`} className="hover:underline">
                      {contact.phone}
                    </a>
                  </div>
                )}
                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${contact.email}`} className="hover:underline">
                      {contact.email}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga kontakter ännu
          </div>
        )}
      </div>
    </div>
  );
}
