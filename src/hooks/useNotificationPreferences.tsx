import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { UserNotificationPreferences } from '@/types/notifications';
import { toast } from 'sonner';

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching notification preferences:', error);
        toast.error('Kunde inte hämta notifikationsinställningar');
        return;
      }

      if (data) {
        setPreferences(data as UserNotificationPreferences);
      } else {
        // Create default preferences if none exist
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          toast.error('Kunde inte hämta användarinformation');
          return;
        }

        const { data: newPrefs, error: insertError } = await supabase
          .from('user_notification_preferences')
          .insert({
            user_id: user.id,
            organization_id: profile?.organization_id || null,
            monthly_project_summary: false,
            monthly_workorder_summary: false,
            maintenance_reminders: false,
            maintenance_history_annual: false,
            preferred_day: 'monday',
            notification_email: null,
            project_summary_previewed: false,
            workorder_summary_previewed: false,
            maintenance_reminders_previewed: false,
            maintenance_history_previewed: false,
            project_summary_frequency: 'monthly',
            project_summary_time: '08:00',
            workorder_summary_frequency: 'monthly',
            workorder_summary_time: '08:00',
            maintenance_reminders_frequency: 'weekly',
            maintenance_reminders_time: '08:00',
            maintenance_history_frequency: 'yearly',
            maintenance_history_time: '08:00'
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating notification preferences:', insertError);
          throw insertError;
        }

        setPreferences(newPrefs as UserNotificationPreferences);
      }
    } catch (error) {
      console.error('Error in fetchPreferences:', error);
      toast.error('Kunde inte hämta notifikationsinställningar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, [user]);

  const updatePreference = async (field: string, value: any) => {
    if (!user || !preferences) return;

    try {
      const { error } = await supabase
        .from('user_notification_preferences')
        .update({ [field]: value })
        .eq('user_id', user.id);

      if (error) throw error;

      setPreferences({ ...preferences, [field]: value });
      toast.success('Inställningar uppdaterade');
    } catch (error) {
      console.error('Error updating preference:', error);
      toast.error('Kunde inte uppdatera inställningar');
    }
  };

  const markAsPreviewed = async (reportType: string) => {
    if (!user || !preferences) return;

    const previewField = `${reportType}_previewed`;
    await updatePreference(previewField, true);
  };

  return {
    preferences,
    loading,
    updatePreference,
    markAsPreviewed,
    refetch: fetchPreferences
  };
}
