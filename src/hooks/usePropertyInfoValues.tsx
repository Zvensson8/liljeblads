import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PropertyInfoValue } from "@/types/propertyInfo";
import { toast } from "sonner";
import { useCallback } from "react";
import { debounce } from "lodash-es";

export function usePropertyInfoValues(propertyId: string) {
  const queryClient = useQueryClient();

  const { data: values, isLoading } = useQuery({
    queryKey: ['property-info-values', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_info_values')
        .select('*')
        .eq('property_id', propertyId);

      if (error) throw error;
      return data as PropertyInfoValue[];
    },
  });

  const upsertValue = useMutation({
    mutationFn: async ({ fieldId, value }: { fieldId: string; value: string }) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('property_info_values')
        .upsert({
          property_id: propertyId,
          field_id: fieldId,
          value,
          updated_by: user.user?.id,
        }, {
          onConflict: 'property_id,field_id'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ fieldId, value }) => {
      await queryClient.cancelQueries({ queryKey: ['property-info-values', propertyId] });

      const previousValues = queryClient.getQueryData<PropertyInfoValue[]>(['property-info-values', propertyId]);

      queryClient.setQueryData<PropertyInfoValue[]>(
        ['property-info-values', propertyId],
        (old = []) => {
          const existing = old.find(v => v.field_id === fieldId);
          if (existing) {
            return old.map(v => v.field_id === fieldId ? { ...v, value } : v);
          }
          return [...old, {
            id: 'temp-' + Date.now(),
            property_id: propertyId,
            field_id: fieldId,
            value,
            updated_at: new Date().toISOString(),
            updated_by: null,
          }];
        }
      );

      return { previousValues };
    },
    onError: (err, variables, context) => {
      if (context?.previousValues) {
        queryClient.setQueryData(['property-info-values', propertyId], context.previousValues);
      }
      toast.error("Kunde inte spara värde");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-info-values', propertyId] });
    },
  });

  const debouncedUpsert = useCallback(
    debounce((fieldId: string, value: string) => {
      upsertValue.mutate({ fieldId, value });
    }, 500),
    [propertyId]
  );

  return {
    values: values || [],
    isLoading,
    upsertValue: debouncedUpsert,
  };
}
