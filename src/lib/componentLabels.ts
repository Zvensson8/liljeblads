export function componentStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Aktiv';
    case 'maintenance':
      return 'Underhåll';
    case 'inactive':
      return 'Inaktiv';
    case 'decommissioned':
      return 'Avställd';
    default:
      return status;
  }
}

export function componentStatusClassName(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-500/10 text-green-500 hover:bg-green-500/20';
    case 'maintenance':
      return 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20';
    case 'inactive':
      return 'bg-red-500/10 text-red-500 hover:bg-red-500/20';
    case 'decommissioned':
      return 'bg-muted text-muted-foreground hover:bg-muted';
    default:
      return 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20';
  }
}
