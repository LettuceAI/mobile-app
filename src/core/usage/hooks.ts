import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RequestUsage, UsageStats, UsageFilter } from './types';

export interface UseUsageTrackingOptions {
  onError?: (error: string) => void;
}

export function useUsageTracking(options?: UseUsageTrackingOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryRecords = useCallback(
    async (filter: UsageFilter): Promise<RequestUsage[]> => {
      setLoading(true);
      setError(null);
      try {
        const records = await invoke<RequestUsage[]>('usage_query_records', {
          filter,
        });
        return records;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        options?.onError?.(message);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const getStats = useCallback(
    async (filter: UsageFilter): Promise<UsageStats | null> => {
      setLoading(true);
      setError(null);
      try {
        const stats = await invoke<UsageStats>('usage_get_stats', { filter });
        return stats;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        options?.onError?.(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const exportCSV = useCallback(
    async (filter: UsageFilter): Promise<string | null> => {
      setLoading(true);
      setError(null);
      try {
        const csv = await invoke<string>('usage_export_csv', { filter });
        return csv;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        options?.onError?.(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const saveCSV = useCallback(
    async (csvData: string, filename: string): Promise<string | null> => {
      setLoading(true);
      setError(null);
      try {
        const filePath = await invoke<string>('usage_save_csv', { 
          csv_data: csvData,
          filename 
        });
        return filePath;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        options?.onError?.(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const clearBefore = useCallback(
    async (timestamp: number): Promise<number> => {
      setLoading(true);
      setError(null);
      try {
        const deleted = await invoke<number>('usage_clear_before', { timestamp });
        return deleted;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        options?.onError?.(message);
        return 0;
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  return {
    queryRecords,
    getStats,
    exportCSV,
    saveCSV,
    clearBefore,
    loading,
    error,
  };
}
