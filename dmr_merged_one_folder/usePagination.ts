import { useState, useMemo, useCallback } from 'react';

export function usePagination<T>(items: T[], pageSize: number = 20) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const goTo = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  }, [totalPages]);

  const next = useCallback(() => goTo(currentPage + 1), [currentPage, goTo]);
  const prev = useCallback(() => goTo(currentPage - 1), [currentPage, goTo]);

  return { paginated, currentPage, totalPages, goTo, next, prev };
}