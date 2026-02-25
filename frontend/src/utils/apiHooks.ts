/**
 * React Hooks for API with Optimistic Updates
 * 
 * Features:
 * - Optimistic updates for instant UI feedback
 * - Automatic rollback on error
 * - Loading states
 * - Error handling
 * - Request deduplication
 * - Cache invalidation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, type ApiResponse, type ClassifiedError } from './apiClient';

// ========================================
// Hook Types
// ========================================

export interface UseApiOptions<T> {
  immediate?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: ClassifiedError) => void;
  cacheKey?: string;
  cacheTime?: number; // milliseconds
  params?: Record<string, string | number | boolean>;
}

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: ClassifiedError | null;
  execute: (...args: unknown[]) => Promise<T | null>;
  reset: () => void;
}

export interface UseMutationOptions<T, V = unknown> {
  onSuccess?: (data: T) => void;
  onError?: (error: ClassifiedError) => void;
  optimisticUpdate?: (variables: V) => T;
  rollbackOnError?: boolean;
}

export interface UseMutationState<T, V = unknown> {
  data: T | null;
  loading: boolean;
  error: ClassifiedError | null;
  mutate: (variables: V) => Promise<T | null>;
  reset: () => void;
}

// ========================================
// Simple Cache
// ========================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();

  get<T>(key: string, maxAge: number = 60000): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const cache = new SimpleCache();

// ========================================
// useApi - Generic API Hook
// ========================================

export function useApi<T = unknown>(
  apiFunction: (...args: unknown[]) => Promise<ApiResponse<T>>,
  options: UseApiOptions<T> = {}
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(options.immediate || false);
  const [error, setError] = useState<ClassifiedError | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: unknown[]) => {
      // Check cache first
      if (options.cacheKey) {
        const cached = cache.get<T>(options.cacheKey, options.cacheTime);
        if (cached) {
          setData(cached);
          return cached;
        }
      }

      setLoading(true);
      setError(null);

      try {
        const response = await apiFunction(...args);
        
        if (!isMounted.current) return null;

        const responseData = response.data!;
        setData(responseData);

        // Cache the result
        if (options.cacheKey) {
          cache.set(options.cacheKey, responseData);
        }

        options.onSuccess?.(responseData);
        return responseData;
      } catch (err: unknown) {
        if (!isMounted.current) return null;

        const classifiedError = err as ClassifiedError;
        setError(classifiedError);
        options.onError?.(classifiedError);
        return null;
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    },
    [apiFunction, options]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (options.immediate) {
      execute();
    }
  }, [options.immediate, execute]);

  return { data, loading, error, execute, reset };
}

// ========================================
// useMutation - For Create/Update/Delete with Optimistic Updates
// ========================================

export function useMutation<T = unknown, V = unknown>(
  mutationFunction: (variables: V) => Promise<ApiResponse<T>>,
  options: UseMutationOptions<T, V> = {}
): UseMutationState<T, V> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClassifiedError | null>(null);
  const previousDataRef = useRef<T | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (variables: V) => {
      // Optimistic update
      if (options.optimisticUpdate) {
        previousDataRef.current = data;
        const optimisticData = options.optimisticUpdate(variables);
        setData(optimisticData);
      }

      setLoading(true);
      setError(null);

      try {
        const response = await mutationFunction(variables);
        
        if (!isMounted.current) return null;

        const responseData = response.data!;
        setData(responseData);
        options.onSuccess?.(responseData);
        return responseData;
      } catch (err: unknown) {
        if (!isMounted.current) return null;

        const classifiedError = err as ClassifiedError;
        setError(classifiedError);

        // Rollback optimistic update on error
        if (options.rollbackOnError !== false && previousDataRef.current !== null) {
          setData(previousDataRef.current);
        }

        options.onError?.(classifiedError);
        return null;
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    },
    [mutationFunction, options, data]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, mutate, reset };
}

// ========================================
// Specialized Hooks
// ========================================

/**
 * Fetch data with automatic loading/error handling
 */
export function useFetch<T = unknown>(
  url: string,
  options: UseApiOptions<T> & { params?: Record<string, string | number | boolean> } = {}
): UseApiState<T> {
  const { params, ...apiOptions } = options;

  const fetchFunction = useCallback(async () => {
    const queryString = params ? '?' + new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, String(value)])
      )
    ).toString() : '';
    return apiClient.get<T>(`${url}${queryString}`);
  }, [url, params]);

  return useApi<T>(fetchFunction, {
    ...apiOptions,
    cacheKey: options.cacheKey || url,
  });
}

/**
 * Create resource with optimistic updates
 */
export function useCreate<T = unknown, V = unknown>(
  url: string,
  options: UseMutationOptions<T, V> = {}
): UseMutationState<T, V> {
  const createFunction = useCallback(
    async (variables: V) => {
      return apiClient.post<T>(url, variables);
    },
    [url]
  );

  return useMutation<T, V>(createFunction, options);
}

/**
 * Update resource with optimistic updates
 */
export function useUpdate<T = unknown, V = unknown>(
  url: string,
  options: UseMutationOptions<T, V> = {}
): UseMutationState<T, V> {
  const updateFunction = useCallback(
    async (variables: V) => {
      return apiClient.put<T>(url, variables);
    },
    [url]
  );

  return useMutation<T, V>(updateFunction, options);
}

/**
 * Delete resource with optimistic updates
 */
export function useDelete<T = unknown>(
  url: string,
  options: UseMutationOptions<T> = {}
): UseMutationState<T, void> {
  const deleteFunction = useCallback(async () => {
    return apiClient.delete<T>(url);
  }, [url]);

  return useMutation<T, void>(deleteFunction, options);
}

// ========================================
// Pagination Hook
// ========================================

interface PaginationResponse<T> {
  items: T[];
  page: number;
  total: number;
  total_pages: number;
}

export interface UsePaginationState<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  loading: boolean;
  error: ClassifiedError | null;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
  refresh: () => void;
}

export function usePagination<T = unknown>(
  fetchFunction: (page: number, perPage: number) => Promise<ApiResponse<PaginationResponse<T>>>,
  initialPerPage: number = 20
): UsePaginationState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [perPage] = useState(initialPerPage);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClassifiedError | null>(null);

  const loadPage = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchFunction(pageNum, perPage);
        const data = response.data!;

        setItems(data.items);
        setPage(data.page);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      } catch (err: unknown) {
        setError(err as ClassifiedError);
      } finally {
        setLoading(false);
      }
    },
    [fetchFunction, perPage]
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const nextPage = useCallback(() => {
    if (page < totalPages) {
      loadPage(page + 1);
    }
  }, [page, totalPages, loadPage]);

  const prevPage = useCallback(() => {
    if (page > 1) {
      loadPage(page - 1);
    }
  }, [page, loadPage]);

  const goToPage = useCallback(
    (pageNum: number) => {
      if (pageNum >= 1 && pageNum <= totalPages) {
        loadPage(pageNum);
      }
    },
    [totalPages, loadPage]
  );

  const refresh = useCallback(() => {
    loadPage(page);
  }, [page, loadPage]);

  return {
    items,
    page,
    perPage,
    total,
    totalPages,
    loading,
    error,
    nextPage,
    prevPage,
    goToPage,
    refresh,
  };
}

// ========================================
// Polling Hook
// ========================================

export interface UsePollingOptions<T> extends UseApiOptions<T> {
  interval?: number;
  enabled?: boolean;
}

export function usePolling<T = unknown>(
  apiFunction: () => Promise<ApiResponse<T>>,
  options: UsePollingOptions<T> = {}
): UseApiState<T> {
  const { interval = 5000, enabled = true, ...apiOptions } = options;
  const { data, loading, error, execute, reset } = useApi<T>(apiFunction, {
    ...apiOptions,
    immediate: true,
  });

  useEffect(() => {
    if (!enabled) return;

    const intervalId = setInterval(() => {
      execute();
    }, interval);

    return () => clearInterval(intervalId);
  }, [enabled, interval, execute]);

  return { data, loading, error, execute, reset };
}
