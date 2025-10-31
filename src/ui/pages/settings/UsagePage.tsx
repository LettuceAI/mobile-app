import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { useUsageTracking, RequestUsage, UsageStats, UsageFilter } from '../../../core/usage';
import { ChevronDown, Download, CheckCircle2, Check } from 'lucide-react';
import { BottomMenu } from '../../components';

/**
 * Format currency with smart decimals (show more decimals for small values)
 * Uses decimal notation instead of exponential for readability
 */
function formatCurrency(value: number): string {
  if (value === 0) return '$0';

  if (value < 0.00001) {
    return `$${value.toFixed(10).replace(/\.?0+$/, '')}`;
  }
  if (value < 0.0001) return `$${value.toFixed(7)}`;
  if (value < 0.001) return `$${value.toFixed(6)}`;
  if (value < 0.01) return `$${value.toFixed(5)}`;
  if (value < 0.1) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * Format large numbers with K/M suffix
 */
function formatNumber(value: number): string {
  if (value === 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

/**
 * Mobile-friendly date picker component
 */
function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: {
  startDate: Date;
  endDate: Date;
  onStartChange: (date: Date) => void;
  onEndChange: (date: Date) => void;
}) {
  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">From</label>
        <input
          type="date"
          value={formatDate(startDate)}
          onChange={(e) => onStartChange(new Date(e.target.value + 'T00:00:00Z'))}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none transition"
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">To</label>
        <input
          type="date"
          value={formatDate(endDate)}
          onChange={(e) => onEndChange(new Date(e.target.value + 'T23:59:59Z'))}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none transition"
        />
      </div>
    </div>
  );
}

/**
 * Simple stat display component
 */
function StatRow({ label, value, secondary }: { label: string; value: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-white/50">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-white">{value}</span>
        {secondary && <span className="ml-2 text-xs text-white/40">{secondary}</span>}
      </div>
    </div>
  );
}

function AnimatedNumber({ value, formatter, duration = 0.4 }: { value: number; formatter: (n: number) => string; duration?: number }) {
  const [display, setDisplay] = useState<number>(value);
  const prev = useRef<number>(value);

  useEffect(() => {
    const from = prev.current;
    const controls = animate(from, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplay(latest as number),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return <>{formatter(display)}</>;
}

/**
 * Request detail row - minimal design
 */
function RequestRow({ request, alt }: { request: RequestUsage; alt?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border border-white/10 ${alt ? 'bg-white/[0.065]' : 'bg-white/5'} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.08] transition active:scale-[0.99]"
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium text-white truncate">{request.characterName}</p>
            {/* Provider/Model badge next to title */}
            {(request.providerLabel || request.modelName) && (
              <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
                {request.providerLabel || request.modelName}
              </span>
            )}
            {!request.success && (
              <span className="text-[10px] text-red-400">Failed</span>
            )}
          </div>
          <p className="text-xs text-white/40 mt-0.5">
            {request.totalTokens ? `${formatNumber(request.totalTokens)} tokens` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {request.cost && (
            <span className="text-sm font-medium text-emerald-400">
              {formatCurrency(request.cost.totalCost)}
            </span>
          )}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-white/30" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/10 bg-black/20"
          >
            <div className="px-4 py-3 space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Time</span>
                <span className="text-white/60">
                  {new Date(request.timestamp).toLocaleString(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>

              {request.promptTokens !== undefined && (
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Input</span>
                  <span className="text-white/60">{request.promptTokens.toLocaleString()} tokens</span>
                </div>
              )}

              {request.completionTokens !== undefined && (
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Output</span>
                  <span className="text-white/60">{request.completionTokens.toLocaleString()} tokens</span>
                </div>
              )}

              {request.cost && (
                <>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Input Cost</span>
                    <span className="text-white/60">{formatCurrency(request.cost.promptCost)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Output Cost</span>
                    <span className="text-white/60">{formatCurrency(request.cost.completionCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-white/70">Total</span>
                    <span className="text-emerald-400">{formatCurrency(request.cost.totalCost)}</span>
                  </div>
                </>
              )}

              {request.errorMessage && (
                <>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="text-xs">
                    <span className="text-red-400 block mb-1">Error</span>
                    <span className="text-white/50">{request.errorMessage}</span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Provider/Model breakdown section - Mobile optimized with display names
 */
/* Removed BreakdownSection in favor of lightweight filter chips above Recent */

/**
 * Usage Analytics Page
 */
export function UsagePage() {
  const { queryRecords, getStats, exportCSV, saveCSV } = useUsageTracking();

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Last 30 days
    return date;
  });

  const [endDate, setEndDate] = useState(new Date());
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [records, setRecords] = useState<RequestUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [successOnly, setSuccessOnly] = useState(false);
  // Deprecated pagination (replaced by Load more)
  const RECORDS_PER_PAGE = 10;

  // Filters for recent requests
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [showModelFilter, setShowModelFilter] = useState(false);
  const [showCharacterFilter, setShowCharacterFilter] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(RECORDS_PER_PAGE);

  const loadData = async () => {
    setLoading(true);
    const filter: UsageFilter = {
      startTimestamp: startDate.getTime(),
      endTimestamp: endDate.getTime(),
      successOnly: successOnly || undefined,
    };

    const [newStats, newRecords] = await Promise.all([
      getStats(filter),
      queryRecords(filter),
    ]);

    if (newStats) setStats(newStats);
    if (newRecords) setRecords(newRecords);
    setVisibleCount(RECORDS_PER_PAGE);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate, successOnly]);

  useEffect(() => {
    (window as any).__openUsageFilters = () => setShowFilters(true);
    const listener = () => setShowFilters(true);
    window.addEventListener("usage:filters", listener);
    return () => {
      if ((window as any).__openUsageFilters) delete (window as any).__openUsageFilters;
      window.removeEventListener("usage:filters", listener);
    };
  }, []);

  const handleExportCSV = async () => {
    setExporting(true);
    setExportSuccess(null);
    try {
      const filter: UsageFilter = {
        startTimestamp: startDate.getTime(),
        endTimestamp: endDate.getTime(),
        successOnly: successOnly || undefined,
      };

      const csv = await exportCSV(filter);
      if (csv && csv.length > 0) {
        const fileName = `usage-${new Date().toISOString().split('T')[0]}.csv`;

        const filePath = await saveCSV(csv, fileName);

        if (filePath) {
          setExportSuccess(filePath);
          setTimeout(() => setExportSuccess(null), 4000);
        }
      } else {
        console.error('No CSV data generated');
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(RECORDS_PER_PAGE);
  }, [selectedModelId, selectedCharacterId]);

  // Derived lists for filters
  const modelOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (r.modelId && r.modelName && !map.has(r.modelId)) map.set(r.modelId, r.modelName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [records]);

  const characterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (r.characterId && r.characterName && !map.has(r.characterId)) map.set(r.characterId, r.characterName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [records]);

  const filteredRecords = useMemo(() => {
    let list = records.slice();
    if (selectedModelId) list = list.filter(r => r.modelId === selectedModelId);
    if (selectedCharacterId) list = list.filter(r => r.characterId === selectedCharacterId);
    return list;
  }, [records, selectedModelId, selectedCharacterId]);

  // Derived stats based on current filter (All / By Model / By Character)
  const displayStats = useMemo(() => {
    const totals = filteredRecords.reduce(
      (acc, r) => {
        const totalTokens = (r.totalTokens ?? 0) || ((r.promptTokens ?? 0) + (r.completionTokens ?? 0));
        const promptCost = r.cost?.promptCost ?? 0;
        const completionCost = r.cost?.completionCost ?? 0;
        const totalCost = r.cost?.totalCost ?? (promptCost + completionCost);
        acc.totalRequests += 1;
        acc.successfulRequests += r.success ? 1 : 0;
        acc.totalTokens += totalTokens;
        acc.promptCost += promptCost;
        acc.completionCost += completionCost;
        acc.totalCost += totalCost;
        return acc;
      },
      { totalRequests: 0, successfulRequests: 0, totalTokens: 0, promptCost: 0, completionCost: 0, totalCost: 0 }
    );
    const averageCostPerRequest = totals.totalRequests > 0 ? totals.totalCost / totals.totalRequests : 0;
    const successRate = totals.totalRequests > 0 ? (totals.successfulRequests / totals.totalRequests) * 100 : 0;
    return { ...totals, averageCostPerRequest, successRate };
  }, [filteredRecords]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="min-h-screen bg-[#050505] pb-20"
    >
      {/* Filters BottomMenu */}
      <BottomMenu
        isOpen={showFilters}
        includeExitIcon={false}
        onClose={() => setShowFilters(false)}
        title="Filters"
      >
        <div className="space-y-4 pb-4">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />

          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3 hover:bg-white/10 transition cursor-pointer">
            <span className="text-sm text-white">Show successful requests only</span>
            <div className="flex items-center flex-shrink-0">
              <input
                id="show-only-successful"
                type="checkbox"
                checked={successOnly}
                onChange={(e) => setSuccessOnly(e.target.checked)}
                className="peer sr-only"
              />
              <label
                htmlFor="show-only-successful"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${successOnly
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                  : 'bg-white/20'
                  }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${successOnly ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </label>
            </div>
          </label>

          <button
            onClick={handleExportCSV}
            disabled={exporting || records.length === 0}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2.5 text-sm font-medium text-emerald-100 hover:border-emerald-500/60 hover:bg-emerald-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </BottomMenu>

  {/* Content */}
      <div className="space-y-4 px-4 py-4">
        {/* Export Success Toast */}
        <AnimatePresence>
          {exportSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-emerald-100">CSV exported successfully</p>
                <p className="text-[10px] text-emerald-200/70 truncate">{exportSuccess}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && !stats ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : stats ? (
          <>
            {/* Overview Card (filtered) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2.5"
            >
              <h2 className="text-lg font-semibold text-white mb-3">Overview</h2>
              <StatRow
                label="Total Cost"
                value={<AnimatedNumber value={displayStats.totalCost} formatter={formatCurrency} />}
              />
              <StatRow
                label="Total Requests"
                value={<AnimatedNumber value={displayStats.totalRequests} formatter={(v) => formatNumber(Math.round(v))} />}
                secondary={<><AnimatedNumber value={displayStats.successfulRequests} formatter={(v) => formatNumber(Math.round(v))} />{' '}successful</>}
              />
              <StatRow
                label="Total Tokens"
                value={<AnimatedNumber value={displayStats.totalTokens} formatter={(v) => formatNumber(Math.round(v))} />}
                secondary={<><AnimatedNumber value={displayStats.totalTokens / Math.max(displayStats.totalRequests, 1)} formatter={(v) => formatNumber(Math.round(v))} />{' '}avg</>}
              />
              <StatRow
                label="Average Cost"
                value={<AnimatedNumber value={displayStats.averageCostPerRequest} formatter={formatCurrency} />}
              />
              <StatRow
                label="Success Rate"
                value={<><AnimatedNumber value={displayStats.successRate} formatter={(v) => v.toFixed(1)} />%</>}
              />
            </motion.div>

            {/* Cost Breakdown (filtered) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3"
            >
              <h3 className="text-sm font-medium text-white">Cost Split</h3>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Input Tokens</span>
                  <span className="text-white/80">
                    <AnimatedNumber value={displayStats.promptCost} formatter={formatCurrency} />
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Output Tokens</span>
                  <span className="text-white/80">
                    <AnimatedNumber value={displayStats.completionCost} formatter={formatCurrency} />
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <motion.button
                onClick={() => { setSelectedModelId(null); setSelectedCharacterId(null); }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition ${!selectedModelId && !selectedCharacterId ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10'}`}
                whileTap={{ scale: 0.98 }}
              >
                All
              </motion.button>
              <motion.button
                onClick={() => setShowModelFilter((v) => !v)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition ${selectedModelId ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10'}`}
                whileTap={{ scale: 0.98 }}
              >
                {selectedModelId ? (modelOptions.find(m => m.id === selectedModelId)?.name || 'Model') : 'By Model'}
              </motion.button>
              <motion.button
                onClick={() => setShowCharacterFilter((v) => !v)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition ${selectedCharacterId ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10'}`}
                whileTap={{ scale: 0.98 }}
              >
                {selectedCharacterId ? (characterOptions.find(c => c.id === selectedCharacterId)?.name || 'Character') : 'By Character'}
              </motion.button>
            </div>

            {/* Model Filter Inline Menu (visual improvements) */}
            <AnimatePresence>
              {showModelFilter && modelOptions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c12]/95 backdrop-blur-sm shadow-xl p-2"
                >
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {modelOptions.map(opt => {
                      const selected = selectedModelId === opt.id;
                      return (
                        <motion.button
                          key={opt.id}
                          onClick={() => { setSelectedModelId(opt.id); setShowModelFilter(false); }}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs transition border ${selected ? 'bg-emerald-500/15 text-emerald-100 border-emerald-400/30' : 'text-white/80 hover:bg-white/10/60 border-transparent'}`}
                          whileTap={{ scale: 0.98 }}
                        >
                          <span className="truncate pr-2">{opt.name}</span>
                          {selected && <Check className="h-4 w-4 text-emerald-400" />}
                        </motion.button>
                      );
                    })}
                  </div>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex justify-end">
                    <motion.button
                      onClick={() => { setSelectedModelId(null); setShowModelFilter(false); }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
                      whileTap={{ scale: 0.98 }}
                    >
                      Clear
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Character Filter Inline Menu (visual improvements) */}
            <AnimatePresence>
              {showCharacterFilter && characterOptions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0c12]/95 backdrop-blur-sm shadow-xl p-2"
                >
                  {/* Top gradient highlight */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/10 to-transparent" />
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {characterOptions.map(opt => {
                      const selected = selectedCharacterId === opt.id;
                      return (
                        <motion.button
                          key={opt.id}
                          onClick={() => { setSelectedCharacterId(opt.id); setShowCharacterFilter(false); }}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs transition border ${selected ? 'bg-emerald-500/15 text-emerald-100 border-emerald-400/30' : 'text-white/80 hover:bg-white/10/60 border-transparent'}`}
                          whileTap={{ scale: 0.98 }}
                        >
                          <span className="truncate pr-2">{opt.name}</span>
                          {selected && <Check className="h-4 w-4 text-emerald-400" />}
                        </motion.button>
                      );
                    })}
                  </div>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex justify-end">
                    <motion.button
                      onClick={() => { setSelectedCharacterId(null); setShowCharacterFilter(false); }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
                      whileTap={{ scale: 0.98 }}
                    >
                      Clear
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recent Requests */}
            {filteredRecords.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-sm font-medium text-white/70">
                  Recent Requests ({filteredRecords.length})
                </h3>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                  {filteredRecords
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, visibleCount)
                    .map((request, idx) => (
                      <motion.div
                        key={request.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        layout
                      >
                        <RequestRow request={request} alt={idx % 2 === 1} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {visibleCount < filteredRecords.length && (
                  <div className="pt-2">
                    <motion.button
                      onClick={() => setVisibleCount((v) => v + RECORDS_PER_PAGE)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:border-white/20 hover:bg-white/10 transition active:scale-[0.99]"
                      whileTap={{ scale: 0.98 }}
                    >
                      Load more
                    </motion.button>
                  </div>
                )}
              </div>
            )}

            {filteredRecords.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center"
              >
                <p className="text-sm text-white/50">No usage data available for this period</p>
              </motion.div>
            )}
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center"
          >
            <p className="text-sm text-white/50">Failed to load usage data</p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
