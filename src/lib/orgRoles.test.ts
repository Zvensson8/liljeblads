import { describe, expect, it } from 'vitest';
import {
  canOrgAdmin,
  canOrgWrite,
  isOrgViewer,
  orgRoleLabel,
} from './orgRoles';

describe('orgRoles Fas 5', () => {
  it('labels Swedish roles', () => {
    expect(orgRoleLabel('member')).toBe('Förvaltare');
    expect(orgRoleLabel('viewer')).toBe('Läsare');
    expect(orgRoleLabel('owner')).toBe('Ägare');
  });

  it('viewer cannot write', () => {
    expect(canOrgWrite('viewer')).toBe(false);
    expect(canOrgWrite('reader')).toBe(false);
    expect(canOrgWrite('member')).toBe(true);
    expect(canOrgWrite('admin')).toBe(true);
  });

  it('owner/admin can admin org', () => {
    expect(canOrgAdmin('owner')).toBe(true);
    expect(canOrgAdmin('admin')).toBe(true);
    expect(canOrgAdmin('member')).toBe(false);
    expect(isOrgViewer('viewer')).toBe(true);
  });
});
