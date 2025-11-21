import { supabase } from '@/integrations/supabase/client';

interface AuditLogParams {
  action: string;
  table_name?: string;
  record_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
}

export const useAuditLog = () => {
  const logAction = async ({
    action,
    table_name,
    record_id,
    old_values,
    new_values,
  }: AuditLogParams) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address: null, // Will be populated by trigger if needed
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  };

  return { logAction };
};
