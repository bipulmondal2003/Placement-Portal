'use client';
import useSWR, { type SWRConfiguration } from 'swr';
import { api } from './api';

/** GET helper with caching/revalidation. Pass null to skip the request. */
export function useApi<T>(url: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(url, (u: string) => api.get<T>(u), { revalidateOnFocus: false, shouldRetryOnError: false, ...config });
}
