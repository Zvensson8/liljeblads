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
 *   TFilters - shape of `applyFilters`'s second argument.
 *
 * The Supabase generated `from(table)` union type is intentionally relaxed
 * to `string` here — strict table typing leads to excessively deep type
 * instantiation when combined with custom select strings, and the runtime
 * cost is identical.
 */
import { supabase } from '@/integrations/supabase/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CrudServiceConfig<TFilters = unknown> {
  table: string;
  /** Select clause, including joined relations. Defaults to '*'. */
  select?: string;
  /** Default order applied to `list` queries unless overridden. */
  defaultOrder?: { column: string; ascending?: boolean; nullsFirst?: boolean };
  /**
   * Apply filters to a list query. Receives the running query builder and
   * the filter object passed by the caller. Must return the builder.
   */
  applyFilters?: (query: any, filters: TFilters) => any;
}

export interface CrudService<TRow, TInsert, TUpdate, TFilters = unknown> {
  table: string;
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
>(config: CrudServiceConfig<TFilters>): CrudService<TRow, TInsert, TUpdate, TFilters> {
  const select = config.select ?? '*';
  const from = (): any => (supabase as any).from(config.table);

  return {
    table: config.table,

    async list(filters?: TFilters) {
      let query: any = from().select(select);

      if (config.defaultOrder) {
        const { column, ascending = false, nullsFirst } = config.defaultOrder;
        query = query.order(column, { ascending, nullsFirst });
      }

      if (config.applyFilters && filters !== undefined) {
        query = config.applyFilters(query, filters);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TRow[];
    },

    async getById(id: string) {
      const { data, error } = await from().select(select).eq('id', id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as TRow | null;
    },

    async create(input: TInsert) {
      const { data, error } = await from().insert(input).select().single();
      if (error) throw error;
      return data as TRow;
    },

    async update(id: string, patch: TUpdate) {
      const { data, error } = await from()
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as TRow;
    },

    async remove(id: string) {
      const { error } = await from().delete().eq('id', id);
      if (error) throw error;
    },
  };
}
