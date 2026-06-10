import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PropertyInfoCategory, PropertyInfoField } from "@/types/propertyInfo";
import { toast } from "sonner";

export function usePropertyInfoCategories(organizationId: string | null) {
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery({
    queryKey: ['property-info-categories', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data: cats, error: catsError } = await supabase
        .from('property_info_categories')
        .select('*')
        .eq('organization_id', organizationId)
        .order('display_order');

      if (catsError) throw catsError;

      const { data: fields, error: fieldsError } = await supabase
        .from('property_info_fields')
        .select('*')
        .in('category_id', cats.map(c => c.id))
        .order('display_order');

      if (fieldsError) throw fieldsError;

      return cats.map(cat => ({
        ...cat,
        fields: fields.filter(f => f.category_id === cat.id)
      })) as PropertyInfoCategory[];
    },
    enabled: !!organizationId,
  });

  const createCategory = useMutation({
    mutationFn: async (category: { organization_id: string; name: string; description?: string; icon?: string; display_order?: number }) => {
      const { data, error } = await supabase
        .from('property_info_categories')
        .insert([category])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-info-categories'] });
      toast.success("Kategori skapad");
    },
    onError: (error) => {
      toast.error("Kunde inte skapa kategori: " + error.message);
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PropertyInfoCategory> & { id: string }) => {
      const { data, error } = await supabase
        .from('property_info_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-info-categories'] });
      toast.success("Kategori uppdaterad");
    },
    onError: (error) => {
      toast.error("Kunde inte uppdatera kategori: " + error.message);
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('property_info_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-info-categories'] });
      toast.success("Kategori borttagen");
    },
    onError: (error) => {
      toast.error("Kunde inte ta bort kategori: " + error.message);
    },
  });

  const createField = useMutation({
    mutationFn: async (field: { category_id: string; field_name: string; field_type: string; options?: unknown; unit?: string; placeholder?: string; help_text?: string; display_order?: number; required?: boolean }) => {
      const { data, error } = await supabase
        .from('property_info_fields')
        .insert([field])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-info-categories'] });
      toast.success("Fält skapat");
    },
    onError: (error) => {
      toast.error("Kunde inte skapa fält: " + error.message);
    },
  });

  const updateField = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PropertyInfoField> & { id: string }) => {
      const { data, error } = await supabase
        .from('property_info_fields')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-info-categories'] });
      toast.success("Fält uppdaterat");
    },
    onError: (error) => {
      toast.error("Kunde inte uppdatera fält: " + error.message);
    },
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('property_info_fields')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-info-categories'] });
      toast.success("Fält borttaget");
    },
    onError: (error) => {
      toast.error("Kunde inte ta bort fält: " + error.message);
    },
  });

  return {
    categories,
    isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    createField,
    updateField,
    deleteField,
  };
}
