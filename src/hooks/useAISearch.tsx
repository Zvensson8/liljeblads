import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';

export interface AISearchResult {
  id: string;
  source_table: string;
  source_id: string;
  content: string;
  similarity: number;
  details?: {
    id: string;
    name?: string;
    title?: string;
    action?: string;
    status?: string;
    type?: string;
    category?: string;
    priority?: string;
    completed?: boolean;
    due_date?: string;
    property?: {
      id: string;
      name: string;
    };
    component?: {
      id: string;
      name: string;
      property?: {
        id: string;
        name: string;
      };
    };
  };
}

export interface AISearchResponse {
  query: string;
  totalResults: number;
  results: AISearchResult[];
  grouped: {
    components: AISearchResult[];
    work_orders: AISearchResult[];
    projects: AISearchResult[];
    property_todos: AISearchResult[];
  };
}

export function useAISearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<AISearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { organization } = useOrganization();

  const search = useCallback(async (
    query: string,
    options?: {
      filterTables?: string[];
      matchThreshold?: number;
      matchCount?: number;
    }
  ) => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-search', {
        body: {
          query,
          organizationId: organization?.id,
          filterTables: options?.filterTables,
          matchThreshold: options?.matchThreshold ?? 0.3,
          matchCount: options?.matchCount ?? 20
        }
      });

      if (fnError) {
        throw fnError;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setResults(data as AISearchResponse);
    } catch (err) {
      console.error('AI search error:', err);
      setError(err instanceof Error ? err.message : 'Sökfel uppstod');
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [organization?.id]);

  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return {
    search,
    isSearching,
    results,
    error,
    clearResults
  };
}
