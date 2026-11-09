import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";

export const DIRECTORY_PAGE_SIZE = 50;

export function useDirectoryPage<T>(path: string, token: string | null, query: string) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState({ query: "", page: 0 });
  const sequence = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setSearch({ query: query.trim(), page }), 250);
    return () => clearTimeout(id);
  }, [query, page]);

  const load = useCallback(async () => {
    if (!token) return;
    const request = ++sequence.current;
    setBusy(true);
    try {
      const separator = path.includes("?") ? "&" : "?";
      const data = await apiFetch<{ items: T[]; total: number }>(
        `${path}${separator}paginated=true&limit=${DIRECTORY_PAGE_SIZE}&offset=${search.page * DIRECTORY_PAGE_SIZE}&q=${encodeURIComponent(search.query)}`,
        token
      );
      if (request !== sequence.current) return;
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch (failure) {
      if (request !== sequence.current) return;
      setError(failure instanceof Error ? failure.message : "Unable to load the directory.");
    } finally {
      if (request === sequence.current) { setLoading(false); setBusy(false); }
    }
  }, [path, token, search]);

  useEffect(() => {
    void load();
    return () => { sequence.current += 1; };
  }, [load]);

  return { items, total, page, setPage, loading, busy, error, load };
}
