import { describe, expect, it } from 'vitest';
import { componentPath, maintenancePath, projectPath, propertyPath } from './entityPaths';

describe('entityPaths', () => {
  it('uses /property/:id not /properties/:id', () => {
    expect(propertyPath('abc')).toBe('/property/abc');
    expect(propertyPath('abc', { tab: 'todos' })).toBe('/property/abc?tab=todos');
    expect(propertyPath('abc')).not.toContain('/properties/');
  });

  it('builds project and component detail paths', () => {
    expect(projectPath('p1')).toBe('/projects/p1');
    expect(componentPath('c1')).toBe('/components/c1');
    expect(maintenancePath()).toBe('/maintenance');
    expect(maintenancePath({ property: 'p1' })).toBe('/maintenance?property=p1');
  });
});
