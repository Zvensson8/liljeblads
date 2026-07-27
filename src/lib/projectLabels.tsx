import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';

type ProjectStatus = Database['public']['Enums']['project_status'];
type ProjectType = Database['public']['Enums']['project_type'];

export function projectStatusBadge(status: ProjectStatus | string) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    forslag: { label: 'Förslag', className: 'bg-yellow-500' },
    planerat: { label: 'Planerat', className: 'bg-gray-500' },
    invantar_offert: { label: 'Inväntar offert', className: 'bg-yellow-500' },
    offert_finns: { label: 'Offert finns', className: 'bg-blue-500' },
    pagaende: { label: 'Pågående', className: 'bg-green-500' },
    pausat: { label: 'Pausat', className: 'bg-orange-500' },
    avslutat: { label: 'Avslutat', className: 'bg-gray-700' },
  };
  const config = statusConfig[status] || statusConfig.planerat;
  return <Badge className={config.className}>{config.label}</Badge>;
}

export function projectTypeBadge(type: ProjectType | string) {
  const typeConfig: Record<string, { label: string; className: string }> = {
    investering: { label: 'Investering', className: 'bg-purple-500' },
    underhall: { label: 'Underhåll', className: 'bg-blue-500' },
    energi: { label: 'Energi', className: 'bg-green-500' },
    annat: { label: 'Annat', className: 'bg-gray-500' },
  };
  const config = typeConfig[type] || typeConfig.annat;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
