import { useState, useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Property {
  id: string;
  name: string;
}

interface AccountCode {
  id: string;
  code: string;
  description: string;
}

interface RecurringCostFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cost?: any;
  onSuccess: () => void;
}

export function RecurringCostForm({ open, onOpenChange, cost, onSuccess }: RecurringCostFormProps) {
  const { organization } = useOrganization();
  const [properties, setProperties] = useState<Property[]>([]);
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    property_id: "",
    description: "",
    account_code_id: "",
    contractor_name: "",
    contact_person: "",
    amount: 0,
    base_interval_months: 12,
    interval_variation_months: 0,
    last_payment_date: "",
    user_selected_date: "",
  });

  const [calculatedQuarter, setCalculatedQuarter] = useState("");

  useEffect(() => {
    if (organization) {
      fetchProperties();
      fetchAccountCodes();
    }
  }, [organization]);

  useEffect(() => {
    if (cost) {
      setFormData({
        property_id: cost.property_id || "",
        description: cost.description || "",
        account_code_id: cost.account_code_id || "",
        contractor_name: cost.contractor_name || "",
        contact_person: cost.contact_person || "",
        amount: cost.amount || 0,
        base_interval_months: cost.base_interval_months || 12,
        interval_variation_months: cost.interval_variation_months || 0,
        last_payment_date: cost.last_payment_date || "",
        user_selected_date: cost.user_selected_date || "",
      });
    } else {
      setFormData({
        property_id: "",
        description: "",
        account_code_id: "",
        contractor_name: "",
        contact_person: "",
        amount: 0,
        base_interval_months: 12,
        interval_variation_months: 0,
        last_payment_date: "",
        user_selected_date: "",
      });
    }
  }, [cost]);

  useEffect(() => {
    if (formData.last_payment_date && formData.base_interval_months) {
      calculateQuarter();
    }
  }, [formData.last_payment_date, formData.base_interval_months, formData.interval_variation_months]);

  const fetchProperties = async () => {
    if (!organization) return;

    try {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", organization.id)
        .order("name");

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error("Error fetching properties:", error);
    }
  };

  const fetchAccountCodes = async () => {
    if (!organization) return;

    try {
      const { data, error } = await supabase
        .from("account_codes")
        .select("*")
        .eq("organization_id", organization.id)
        .order("code");

      if (error) throw error;
      setAccountCodes(data || []);
    } catch (error) {
      console.error("Error fetching account codes:", error);
    }
  };

  const calculateQuarter = () => {
    const lastDate = new Date(formData.last_payment_date);
    const nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + formData.base_interval_months);

    const startDate = new Date(nextDate);
    startDate.setMonth(startDate.getMonth() - (formData.interval_variation_months || 0));
    
    const endDate = new Date(nextDate);
    endDate.setMonth(endDate.getMonth() + (formData.interval_variation_months || 0));

    const getQuarter = (date: Date) => {
      const month = date.getMonth();
      const quarter = Math.floor(month / 3) + 1;
      return `Q${quarter} ${date.getFullYear()}`;
    };

    const startQ = getQuarter(startDate);
    const endQ = getQuarter(endDate);

    if (startQ === endQ) {
      setCalculatedQuarter(startQ);
    } else {
      setCalculatedQuarter(`${startQ} - ${endQ}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = {
        ...formData,
        calculated_quarter_start: calculatedQuarter.split(" - ")[0] || calculatedQuarter,
        calculated_quarter_end: calculatedQuarter.split(" - ")[1] || calculatedQuarter,
      };

      if (cost) {
        const { error } = await supabase
          .from("property_recurring_costs")
          .update(payload)
          .eq("id", cost.id);

        if (error) throw error;
        toast.success("Återkommande kostnad uppdaterad");
      } else {
        const { error } = await supabase
          .from("property_recurring_costs")
          .insert([payload]);

        if (error) throw error;
        toast.success("Återkommande kostnad skapad");
      }

      onSuccess();
    } catch (error) {
      console.error("Error saving recurring cost:", error);
      toast.error("Kunde inte spara återkommande kostnad");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {cost ? "Redigera återkommande kostnad" : "Ny återkommande kostnad"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="property_id">Fastighet *</Label>
            <Select
              value={formData.property_id}
              onValueChange={(value) => setFormData({ ...formData, property_id: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Välj fastighet" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Beskrivning *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="account_code_id">Konto *</Label>
            <Select
              value={formData.account_code_id}
              onValueChange={(value) => setFormData({ ...formData, account_code_id: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Välj kontokod" />
              </SelectTrigger>
              <SelectContent>
                {accountCodes.map((code) => (
                  <SelectItem key={code.id} value={code.id}>
                    {code.code} - {code.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contractor_name">Avtalspart</Label>
              <Input
                id="contractor_name"
                value={formData.contractor_name}
                onChange={(e) => setFormData({ ...formData, contractor_name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="contact_person">Kontaktperson</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="amount">Belopp (kr) *</Label>
            <Input
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="base_interval_months">Basintervall (månader) *</Label>
              <Input
                id="base_interval_months"
                type="number"
                min="1"
                max="120"
                value={formData.base_interval_months}
                onChange={(e) => setFormData({ ...formData, base_interval_months: Number(e.target.value) })}
                required
              />
            </div>

            <div>
              <Label htmlFor="interval_variation_months">Variation (±månader)</Label>
              <Input
                id="interval_variation_months"
                type="number"
                min="0"
                max="12"
                value={formData.interval_variation_months}
                onChange={(e) => setFormData({ ...formData, interval_variation_months: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="last_payment_date">Senaste betalning *</Label>
            <Input
              id="last_payment_date"
              type="date"
              value={formData.last_payment_date}
              onChange={(e) => setFormData({ ...formData, last_payment_date: e.target.value })}
              required
            />
          </div>

          {calculatedQuarter && (
            <div className="bg-muted p-4 rounded-lg">
              <Label>Beräknat kvartalsintervall</Label>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-lg">
                  {calculatedQuarter}
                </Badge>
                {formData.interval_variation_months > 0 && (
                  <span className="text-sm text-muted-foreground">
                    ±{formData.interval_variation_months} mån variation
                  </span>
                )}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="user_selected_date">Valt datum (valfritt)</Label>
            <Input
              id="user_selected_date"
              type="date"
              value={formData.user_selected_date}
              onChange={(e) => setFormData({ ...formData, user_selected_date: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Välj ett specifikt datum inom kvartalsintervallet
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Sparar..." : cost ? "Uppdatera" : "Skapa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
