/**
 * Generic Supabase CRUD service factory.
 *
 * Produces a typed object with `list`, `getById`, `create`, `update` and
 * `remove` methods backed by `supabase.from(table)`. Hooks consume these
 * services so query/mutation layers stay free of inline `supabase.from(...)`
 * calls and we get consistent error propagation.
 *
 * Generics:
 *   TRow     - shape returned by `select` (may include joined relations).
 *   TInsert  - payload accepted by `create`.
 *   TUpdate  - payload accepted by `update`.
 *
 * The factory is intentionally minimal — anything domain-specific
 * (joins, sub-queries, RPCs) lives in the per-entity service module that
 * wraps the generic instance.
 */
import { supabase } from '@/integrations/supabase/client';
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';

type SupabaseTable = Parameters<typeof supabase.from>[0];

export interface CrudServiceConfig<TRow> {
  /** Public table name (must match generated types). */
  table: SupabaseTable;
  /** Select clause, including joined relations. Defaults to '*'. */
  select?: string;
  /**
   * Default order applied to `list` queries unless overridden.
   * Tuple of column + ascending flag.
   */
  defaultOrder?: { column: string; ascending?: boolean; nullsFirst?: boolean };
  /**
   * Apply filters to a list query. Receives the running query builder and
   * the filter object passed by the caller. Must return the builder.
   */
  applyFilters?: <F>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: PostgrestFilterBuilder<any, any, TRow[], any, any>,
    filters: F,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => PostgrestFilterBuilder<any, any, TRow[], any, any>;
}

export interface CrudService<TRow, TInsert, TUpdate, TFilters = unknown> {
  table: SupabaseTable;
  list(filters?: TFilters): Promise<TRow[]>;
  getById(id: string): Promise<TRow | null>;
  create(input: TInsert): Promise<TRow>;
  update(id: string, patch: TUpdate): Promise<TRow>;
  remove(id: string): Promise<void>;
}

export function createCrudService<
  TRow,
  TInsert = Partial<TRow>,
  TUpdate = Partial<TRow>,
  TFilters = unknown,
>(config: CrudServiceConfig<TRow>): CrudService<TRow, TInsert, TUpdate, TFilters> {
  const select = config.select ?? '*';

  return {
    table: config.table,

    async list(filters?: TFilters) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase.from(config.table).select(select);

      if (config.defaultOrder) {
        const { column, ascending = false, nullsFirst } = config.defaultOrder;
        query = query.order(column, { ascending, nullsFirst });
      }

      if (config.applyFilters && filters) {
        query = config.applyFilters(query, filters);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TRow[];
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from(config.table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(select as any)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TRow | null;
    },

    async create(input: TInsert) {
      const { data, error } = await supabase
        .from(config.table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data as TRow;
    },

    async update(id: string, patch: TUpdate) {
      const { data, error } = await supabase
        .from(config.table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as TRow;
    },

    async remove(id: string) {
      const { error } = await supabase.from(config.table).delete().eq('id', id);
      if (error) throw error;
    },
  };
}
