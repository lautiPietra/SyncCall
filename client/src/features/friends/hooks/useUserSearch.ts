import { useEffect, useState } from 'react';
import type { PublicUser } from '@synccall/shared';
import { useDebounce } from '../../../hooks/useDebounce';
import { ApiClientError } from '../../../lib/apiClient';
import { searchUsers } from '../api/friends.api';

export function useUserSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 350);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    searchUsers(trimmed)
      .then(({ users }) => {
        if (!cancelled) {
          setResults(users);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'No se pudo buscar');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  return { query, setQuery, results, loading, error };
}
