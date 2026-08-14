import { describe, expect, it } from 'vitest';
import {
  filterProperties,
  uniquePropertyTypes,
} from './propertiesListFilter';
import type { Property } from '@/types/domain/property';

const rows = [
  {
    id: '1',
    name: 'Hjulet 1 & 2',
    address: 'Ramgatan 4',
    description: null,
    area_sqm: 100,
    construction_year: 1980,
    property_type: 'Bostad',
    loa: '2000',
    property_number: 'Hjulet 1',
    invoice_address: null,
  },
  {
    id: '2',
    name: 'Nolhaga',
    address: 'Storgatan 1',
    description: 'Kontor',
    area_sqm: 50,
    construction_year: 1990,
    property_type: 'Kontor',
    loa: '800',
    property_number: null,
    invoice_address: null,
  },
] as Property[];

describe('propertiesListFilter', () => {
  it('filters by name and type', () => {
    expect(
      filterProperties(rows, { searchQuery: 'hjul', typeFilter: 'all' }).map(
        (p) => p.id,
      ),
    ).toEqual(['1']);
    expect(
      filterProperties(rows, { searchQuery: '', typeFilter: 'Kontor' }).map(
        (p) => p.id,
      ),
    ).toEqual(['2']);
  });

  it('lists unique types sorted in Swedish', () => {
    expect(uniquePropertyTypes(rows)).toEqual(['Bostad', 'Kontor']);
  });
});
