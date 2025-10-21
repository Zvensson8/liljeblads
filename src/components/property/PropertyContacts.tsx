import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Trash2, User, Mail, Phone, Building } from "lucide-react";
import { toast } from "sonner";

interface PropertyContactsProps {
  propertyId: string;
}

export function PropertyContacts({ propertyId }: PropertyContactsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    phone: "",
    email: "",
    company: "",
  });

  const { data: contacts, refetch } = useQuery({
    queryKey: ["property-contacts", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_contacts")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleAddContact = async () => {
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
