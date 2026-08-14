import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keep list filters in the URL. Missing or default values are omitted
 * so shared links stay short.
 */
export function useListSearchParams<T extends Record<string, string>>(
  defaults: T,
): [T, (key: keyof T, value: string) => void, (patch: Partial<T>) => void] {
  const defaultsRef = useRef(defaults);
  const [searchParams, setSearchParams] = useSearchParams();

  const values = { ...defaultsRef.current };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const raw = searchParams.get(String(key));
    if (raw !== null && raw !== '') {
      values[key] = raw as T[keyof T];
    }
  }

  const setParam = useCallback(
    (key: keyof T, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const name = String(key);
          if (!value || value === defaultsRef.current[key]) next.delete(name);
          else next.set(name, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setMany = useCallback(
    (patch: Partial<T>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            const fallback = defaultsRef.current[key as keyof T];
            if (!value || value === fallback) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [values, setParam, setMany];
}
