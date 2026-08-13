import { useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';

/**
 * Fas 5 white-label light: apply org primary_color as CSS variable when set.
 */
export function OrgTheme() {
  const { organization } = useOrganization();

  useEffect(() => {
    const root = document.documentElement;
    const color = organization?.primary_color?.trim();
    if (color && /^#?[0-9a-fA-F]{3,8}$/.test(color.replace(/\s/g, ''))) {
      const hex = color.startsWith('#') ? color : `#${color}`;
      root.style.setProperty('--org-primary', hex);
      // Optional: map to shadcn primary if you use HSL elsewhere — keep as custom token
      root.dataset.orgThemed = '1';
    } else {
      root.style.removeProperty('--org-primary');
      delete root.dataset.orgThemed;
    }
  }, [organization?.primary_color, organization?.id]);

  return null;
}
