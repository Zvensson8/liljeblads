export interface WorkOrderListItem {
  action?: string | null;
  property_id?: string | null;
  contractor?: string | null;
  status?: string | null;
  properties?: { name?: string | null } | null;
}

export interface WorkOrdersListFilters {
  searchQuery: string;
  propertyId: string;
  contractor: string;
  status: string;
}

export function filterWorkOrders<T extends WorkOrderListItem>(
  orders: T[],
  filters: WorkOrdersListFilters,
): T[] {
  const q = filters.searchQuery.trim().toLowerCase();
  return orders.filter((wo) => {
    const matchesSearch =
      !q ||
      (wo.action ?? '').toLowerCase().includes(q) ||
      (wo.properties?.name ?? '').toLowerCase().includes(q) ||
      (wo.contractor ?? '').toLowerCase().includes(q);

    const matchesProperty =
      !filters.propertyId ||
      filters.propertyId === 'all' ||
      wo.property_id === filters.propertyId;

    const matchesContractor =
      !filters.contractor ||
      filters.contractor === 'all' ||
      wo.contractor === filters.contractor;

    const matchesStatus =
      !filters.status ||
      filters.status === 'all' ||
      wo.status === filters.status;

    return matchesSearch && matchesProperty && matchesContractor && matchesStatus;
  });
}

export function uniqueContractors(orders: WorkOrderListItem[]): string[] {
  const set = new Set<string>();
  for (const wo of orders) {
    const c = wo.contractor?.trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'sv'));
}
