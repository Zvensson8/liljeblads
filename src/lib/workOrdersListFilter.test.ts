import { describe, expect, it } from 'vitest';
import { filterWorkOrders, uniqueContractors } from './workOrdersListFilter';

const rows = [
  {
    action: 'Byte värmepump',
    property_id: 'a',
    contractor: 'Axcell',
    status: 'ordered',
    properties: { name: 'Hjulet 1' },
  },
  {
    action: 'Service ventilation',
    property_id: 'b',
    contractor: 'LEA',
    status: 'not_started',
    properties: { name: 'Nolhaga' },
  },
];

const empty = {
  searchQuery: '',
  propertyId: 'all',
  contractor: 'all',
  status: 'all',
};

describe('filterWorkOrders', () => {
  it('filters by search, property and status', () => {
    expect(
      filterWorkOrders(rows, {
        ...empty,
        searchQuery: 'värme',
      }).map((r) => r.action),
    ).toEqual(['Byte värmepump']);

    expect(
      filterWorkOrders(rows, {
        ...empty,
        propertyId: 'b',
        status: 'not_started',
      }).map((r) => r.property_id),
    ).toEqual(['b']);
  });

  it('filters by contractor and ignores empty search', () => {
    expect(
      filterWorkOrders(rows, { ...empty, contractor: 'LEA' }).map((r) => r.action),
    ).toEqual(['Service ventilation']);
    expect(filterWorkOrders(rows, empty)).toHaveLength(2);
  });

  it('lists unique contractors sorted in Swedish', () => {
    expect(uniqueContractors(rows)).toEqual(['Axcell', 'LEA']);
    expect(uniqueContractors([{ contractor: '  ' }, { contractor: null }])).toEqual(
      [],
    );
  });
});
