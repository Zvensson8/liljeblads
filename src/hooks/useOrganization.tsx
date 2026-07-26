import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

export function useOrganization() {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchOrganization();
    } else {
      setOrganization(null);
      setLoading(false);
    }
  }, [user]);

  const fetchOrganization = async () => {
    try {
      setLoading(true);

      // Hämta användarens organisation via organization_members
      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single();

      if (memberError || !memberData) {
        console.error('Error fetching organization membership:', memberError);
        setOrganization(null);
        return;
      }

      // Hämta organisationsdata via säker vy (exkluderar faktureringsinfo)
      const { data: orgData, error: orgError } = await supabase
        .from('organizations_public')
        .select('id, name, logo_url, primary_color')
        .eq('id', memberData.organization_id)
        .single();

      if (orgError) {
        console.error('Error fetching organization:', orgError);
        setOrganization(null);
        return;
      }

      setOrganization(orgData);
    } catch (error) {
      console.error('Error in fetchOrganization:', error);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    organization,
    loading,
    refetch: fetchOrganization,
  };
}
