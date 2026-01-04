import { useMemo } from 'react';
import type { RequestUsage } from '../../../../core/usage';

export type TimePeriod = 'daily' | 'weekly' | 'monthly';

interface TimeSeriesDataPoint {
    date: string;
    label: string;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    cost: number;
    requests: number;
}

interface DistributionDataPoint {
    name: string;
    value: number;
    color: string;
    [key: string]: string | number; // Index signature for Recharts compatibility
}

interface PeriodComparison {
    currentTotal: number;
    previousTotal: number;
    percentChange: number;
    isIncrease: boolean;
    label: string;
}

export interface UsageAnalyticsData {
    timeSeries: TimeSeriesDataPoint[];
    byModel: DistributionDataPoint[];
    byCharacter: DistributionDataPoint[];
    byType: DistributionDataPoint[];
    totals: {
        tokens: number;
        cost: number;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
    };
    comparisons: {
        tokens: PeriodComparison;
        cost: PeriodComparison;
        requests: PeriodComparison;
    };
}

const COLORS = [
    '#34d399', // emerald
    '#60a5fa', // blue
    '#a78bfa', // purple
    '#f472b6', // pink
    '#fbbf24', // amber
    '#22d3ee', // cyan
    '#fb7185', // rose
    '#4ade80', // green
];

const TYPE_COLORS: Record<string, string> = {
    chat: '#60a5fa',
    regenerate: '#a78bfa',
    continue: '#22d3ee',
    summary: '#fbbf24',
    memory_manager: '#34d399',
    ai_creator: '#f472b6',
    reply_helper: '#fb7185',
};

function getDateKey(date: Date, period: TimePeriod): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    switch (period) {
        case 'daily':
            return `${year}-${month}-${day}`;
        case 'weekly': {
            // Get the start of the week (Sunday)
            const startOfWeek = new Date(date);
            startOfWeek.setDate(date.getDate() - date.getDay());
            const wYear = startOfWeek.getFullYear();
            const wMonth = String(startOfWeek.getMonth() + 1).padStart(2, '0');
            const wDay = String(startOfWeek.getDate()).padStart(2, '0');
            return `${wYear}-${wMonth}-${wDay}`;
        }
        case 'monthly':
            return `${year}-${month}`;
    }
}

function formatDateLabel(key: string, period: TimePeriod): string {
    switch (period) {
        case 'daily': {
            const date = new Date(key);
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        case 'weekly': {
            const date = new Date(key);
            return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        }
        case 'monthly': {
            const [year, month] = key.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1, 1);
            return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        }
    }
}

function getPreviousPeriodRange(endDate: Date, period: TimePeriod): { start: Date; end: Date } {
    const start = new Date(endDate);
    const end = new Date(endDate);

    switch (period) {
        case 'daily':
            // Yesterday: Midnight to midnight
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            end.setDate(end.getDate() - 1);
            end.setHours(23, 59, 59, 999);
            break;
        case 'weekly':
            // Last week (7 to 14 days ago)
            start.setDate(start.getDate() - 14);
            end.setDate(end.getDate() - 7);
            break;
        case 'monthly':
            // Last month
            start.setMonth(start.getMonth() - 1);
            end.setDate(0); // Last day of previous month
            break;
    }

    return { start, end };
}

function getPeriodLabel(period: TimePeriod): string {
    switch (period) {
        case 'daily': return 'yesterday';
        case 'weekly': return 'last week';
        case 'monthly': return 'last month';
    }
}

function getCurrentPeriodRange(period: TimePeriod): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);

    switch (period) {
        case 'daily':
            start.setHours(0, 0, 0, 0);
            break;
        case 'weekly':
            // Start of current week (Sunday)
            start.setDate(now.getDate() - now.getDay());
            start.setHours(0, 0, 0, 0);
            break;
        case 'monthly':
            // Start of current month
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            break;
    }

    return { start, end: now };
}

function getChartContextRange(period: TimePeriod): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);

    switch (period) {
        case 'daily':
            start.setDate(now.getDate() - 7); // Show 7 days of history
            break;
        case 'weekly':
            start.setDate(now.getDate() - 56); // Show 8 weeks of history
            break;
        case 'monthly':
            start.setMonth(now.getMonth() - 12); // Show 12 months of history
            break;
    }

    start.setHours(0, 0, 0, 0);
    return { start, end: now };
}

export function useUsageAnalytics(
    records: RequestUsage[],
    period: TimePeriod,
    filters?: {
        modelId?: string | null;
        characterId?: string | null;
        operationType?: string | null;
    }
): UsageAnalyticsData {
    return useMemo(() => {
        // Get date ranges
        const { start: contextStart, end: contextEnd } = getChartContextRange(period);
        const { start: currentStart, end: currentEnd } = getCurrentPeriodRange(period);

        // Filter records for context (charts)
        let contextRecords = records.filter(r => {
            const recordDate = new Date(r.timestamp);
            return recordDate >= contextStart && recordDate <= contextEnd;
        });

        if (filters?.modelId) {
            contextRecords = contextRecords.filter(r => r.modelId === filters.modelId);
        }
        if (filters?.characterId) {
            contextRecords = contextRecords.filter(r => r.characterId === filters.characterId);
        }
        if (filters?.operationType) {
            contextRecords = contextRecords.filter(r => r.operationType === filters.operationType);
        }

        // Totals and distributions are derived from records in the current period only
        const currentRecords = contextRecords.filter(r => {
            const date = new Date(r.timestamp);
            return date >= currentStart && date <= currentEnd;
        });

        // Time series aggregation (uses contextRecords)
        const timeMap = new Map<string, TimeSeriesDataPoint>();

        // Distribution maps (use currentRecords)
        const modelMap = new Map<string, number>();
        const characterMap = new Map<string, number>();
        const typeMap = new Map<string, number>();

        let totalTokens = 0;
        let totalCost = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalReasoningTokens = 0;

        // Process context records for the time series chart
        for (const record of contextRecords) {
            const date = new Date(record.timestamp);
            const key = getDateKey(date, period);

            const input = record.promptTokens ?? 0;
            const output = record.completionTokens ?? 0;
            const reasoning = record.reasoningTokens ?? 0;
            const total = record.totalTokens ?? (input + output);
            const cost = record.cost?.totalCost ?? 0;

            // Time series (aggregating all history in context)
            const existing = timeMap.get(key) || {
                date: key,
                label: formatDateLabel(key, period),
                inputTokens: 0,
                outputTokens: 0,
                reasoningTokens: 0,
                totalTokens: 0,
                cost: 0,
                requests: 0,
            };
            existing.inputTokens += input;
            existing.outputTokens += output;
            existing.reasoningTokens += reasoning;
            existing.totalTokens += total;
            existing.cost += cost;
            existing.requests += 1;
            timeMap.set(key, existing);
        }

        // Process current records for totals and distributions
        for (const record of currentRecords) {
            const input = record.promptTokens ?? 0;
            const output = record.completionTokens ?? 0;
            const reasoning = record.reasoningTokens ?? 0;
            const total = record.totalTokens ?? (input + output);
            const cost = record.cost?.totalCost ?? 0;

            // Model distribution
            if (record.modelName) {
                const modelTotal = modelMap.get(record.modelName) ?? 0;
                modelMap.set(record.modelName, modelTotal + total);
            }

            // Character distribution
            if (record.characterName) {
                const charTotal = characterMap.get(record.characterName) ?? 0;
                characterMap.set(record.characterName, charTotal + total);
            }

            // Type distribution
            if (record.operationType) {
                const typeTotal = typeMap.get(record.operationType) ?? 0;
                typeMap.set(record.operationType, typeTotal + total);
            }

            totalTokens += total;
            totalCost += cost;
            totalInputTokens += input;
            totalOutputTokens += output;
            totalReasoningTokens += reasoning;
        }

        // Sort time series by date
        const timeSeries = Array.from(timeMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        // Build distribution arrays
        const byModel = Array.from(modelMap.entries())
            .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }))
            .sort((a, b) => b.value - a.value);

        const byCharacter = Array.from(characterMap.entries())
            .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }))
            .sort((a, b) => b.value - a.value);

        const byType = Array.from(typeMap.entries())
            .map(([name, value]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
                value,
                color: TYPE_COLORS[name.toLowerCase()] || '#94a3b8',
            }))
            .sort((a, b) => b.value - a.value);

        // Period-over-period comparison
        const now = new Date();
        const { start: prevStart, end: prevEnd } = getPreviousPeriodRange(now, period);

        let previousTokens = 0;
        let previousCost = 0;
        let previousRequests = 0;

        for (const record of records) { // Check ALL records for previous period
            const recordDate = new Date(record.timestamp);
            if (recordDate >= prevStart && recordDate <= prevEnd) {
                // Apply filters (except date) to previous period too for fair comparison
                if (filters?.modelId && record.modelId !== filters.modelId) continue;
                if (filters?.characterId && record.characterId !== filters.characterId) continue;
                if (filters?.operationType && record.operationType !== filters.operationType) continue;

                previousTokens += record.totalTokens ?? (record.promptTokens ?? 0) + (record.completionTokens ?? 0);
                previousCost += record.cost?.totalCost ?? 0;
                previousRequests += 1;
            }
        }

        const getComparison = (current: number, previous: number): PeriodComparison => {
            const percentChange = previous > 0
                ? ((current - previous) / previous) * 100
                : current > 0 ? 100 : 0;
            return {
                currentTotal: current,
                previousTotal: previous,
                percentChange: Math.abs(percentChange),
                isIncrease: percentChange >= 0,
                label: getPeriodLabel(period),
            };
        };

        const comparisons = {
            tokens: getComparison(totalTokens, previousTokens),
            cost: getComparison(totalCost, previousCost),
            requests: getComparison(currentRecords.length, previousRequests),
        };

        return {
            timeSeries,
            byModel,
            byCharacter,
            byType,
            totals: {
                tokens: totalTokens,
                cost: totalCost,
                requests: currentRecords.length,
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                reasoningTokens: totalReasoningTokens,
            },
            comparisons,
        };
    }, [records, period, filters?.modelId, filters?.characterId, filters?.operationType]);
}
