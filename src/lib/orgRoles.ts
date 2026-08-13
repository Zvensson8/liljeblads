/**
 * Fas 5: organization membership roles (distinct from platform app_role).
 */

export type OrgMemberRole = 'owner' | 'admin' | 'member' | 'viewer' | string;

export const ORG_ROLE_LABELS: Record<string, string> = {
  owner: 'Ägare',
  admin: 'Admin',
  member: 'Förvaltare',
  viewer: 'Läsare',
  reader: 'Läsare',
};

export function orgRoleLabel(role: string | null | undefined): string {
  if (!role) return 'Medlem';
  return ORG_ROLE_LABELS[role] || role;
}

/** Write / apply capabilities in product + Jarvis */
export function canOrgWrite(role: string | null | undefined): boolean {
  if (!role) return true; // fail-open if unknown (legacy rows)
  const r = role.toLowerCase();
  if (r === 'viewer' || r === 'reader') return false;
  return true;
}

/** Invite / org settings (non-founder product admins) */
export function canOrgAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r === 'owner' || r === 'admin';
}

export function isOrgViewer(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r === 'viewer' || r === 'reader';
}
