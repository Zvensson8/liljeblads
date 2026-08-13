import { useMemo } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useIsFounder } from '@/hooks/useUserRoles';
import {
  canOrgAdmin,
  canOrgWrite,
  isOrgViewer,
  orgRoleLabel,
} from '@/lib/orgRoles';

/** Fas 5: current membership role + capability flags */
export function useOrgRole() {
  const { memberRole, organization, loading } = useOrganization();
  const { isFounder, isLoading: founderLoading } = useIsFounder();

  return useMemo(() => {
    const role = memberRole;
    return {
      role,
      roleLabel: orgRoleLabel(role),
      organizationId: organization?.id ?? null,
      canWrite: isFounder || canOrgWrite(role),
      canAdminOrg: isFounder || canOrgAdmin(role),
      isViewer: !isFounder && isOrgViewer(role),
      isFounder: !!isFounder,
      loading: loading || founderLoading,
    };
  }, [memberRole, organization?.id, isFounder, loading, founderLoading]);
}
