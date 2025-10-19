import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUsageTracking, RequestUsage, UsageStats, UsageFilter } from '../../../core/usage';
import { ChevronDown, Download, CheckCircle2 } from 'lucide-react';
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
function StatRow({ label, value, secondary }: { label: string; value: string; secondary?: string }) {
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

/**
 * Request detail row - minimal design
 */
function RequestRow({ request }: { request: RequestUsage }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.08] transition active:scale-[0.99]"
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{request.characterName}</p>
            {!request.success && (
              <span className="text-[10px] text-red-400">Failed</span>
            )}
          </div>
          <p className="text-xs text-white/40 mt-0.5">
            {request.modelName}
            {request.totalTokens && ` • ${formatNumber(request.totalTokens)} tokens`}
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
function BreakdownSection({
  title,
  items,
  records,
  keyType,
}: {
  title: string;
  items: Record<
    string,
    {
      totalRequests: number;
      totalTokens: number;
      totalCost: number;
      successfulRequests: number;
    }
  >;
  records: RequestUsage[];
  keyType: 'provider' | 'model' | 'character';
}) {
  const [expanded, setExpanded] = useState(false);

  const nameMap = new Map<string, string>();
  records.forEach((record) => {
    if (keyType === 'provider' && record.providerId) {
      nameMap.set(record.providerId, record.providerLabel);
    } else if (keyType === 'model' && record.modelId) {
      nameMap.set(record.modelId, record.modelName);
    } else if (keyType === 'character' && record.characterId) {
      nameMap.set(record.characterId, record.characterName);
    }
  });

  const sortedItems = Object.entries(items).sort((a, b) => b[1].totalCost - a[1].totalCost);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-white/10 bg-white/5"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-3 flex items-center justify-between hover:bg-white/[0.08] transition"
      >
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-white/40" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/10"
          >
            <div className="space-y-2 px-3 py-3">
              {sortedItems.map(([id, stats]) => (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{nameMap.get(id) || id}</p>
                    <p className="text-xs text-white/50">
                      {stats.successfulRequests}/{stats.totalRequests} • {formatNumber(stats.totalTokens)} tokens
                    </p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="text-xs font-semibold text-emerald-400">
                      {formatCurrency(stats.totalCost)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

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
  const [currentPage, setCurrentPage] = useState(1);
  const RECORDS_PER_PAGE = 10;

  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

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
    setCurrentPage(1);
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

          <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3 hover:bg-white/10 transition cursor-pointer">
            <input
              type="checkbox"
              checked={successOnly}
              onChange={(e) => setSuccessOnly(e.target.checked)}
              className="rounded border-white/20 checked:bg-emerald-500 cursor-pointer"
            />
            <span className="text-sm text-white">Show successful requests only</span>
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
            {/* Overview Card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2.5"
            >
              <h2 className="text-lg font-semibold text-white mb-3">Overview</h2>
              <StatRow 
                label="Total Cost" 
                value={formatCurrency(stats.totalCost)}
              />
              <StatRow 
                label="Total Requests" 
                value={formatNumber(stats.totalRequests)}
                secondary={`${stats.successfulRequests} successful`}
              />
              <StatRow 
                label="Total Tokens" 
                value={formatNumber(stats.totalTokens)}
                secondary={`${formatNumber(stats.totalTokens / Math.max(stats.totalRequests, 1))} avg`}
              />
              <StatRow 
                label="Average Cost" 
                value={formatCurrency(stats.averageCostPerRequest)}
              />
              <StatRow 
                label="Success Rate" 
                value={`${stats.totalRequests > 0 ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1) : 0}%`}
              />
            </motion.div>

            {/* Cost Breakdown */}
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
                    {formatCurrency(records.reduce((sum, r) => sum + (r.cost?.promptCost || 0), 0))}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Output Tokens</span>
                  <span className="text-white/80">
                    {formatCurrency(records.reduce((sum, r) => sum + (r.cost?.completionCost || 0), 0))}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Breakdowns */}
            {Object.keys(stats.byProvider).length > 0 && (
              <BreakdownSection title="By Provider" items={stats.byProvider} records={records} keyType="provider" />
            )}

            {Object.keys(stats.byModel).length > 0 && (
              <BreakdownSection title="By Model" items={stats.byModel} records={records} keyType="model" />
            )}

            {Object.keys(stats.byCharacter).length > 0 && (
              <BreakdownSection title="By Character" items={stats.byCharacter} records={records} keyType="character" />
            )}

            {/* Recent Requests */}
            {records.length > 0 && (
              <div className="space-y-2">
                <h3 className="px-1 text-sm font-medium text-white/70">
                  Recent ({records.length})
                </h3>
                <div className="space-y-2">
                  {records
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice((currentPage - 1) * RECORDS_PER_PAGE, currentPage * RECORDS_PER_PAGE)
                    .map((request) => (
                      <RequestRow key={request.id} request={request} />
                    ))}
                </div>

                {/* Pagination */}
                {Math.ceil(records.length / RECORDS_PER_PAGE) > 1 && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:border-white/20 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-[0.99]"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-white/50 px-2">
                      {currentPage} / {Math.ceil(records.length / RECORDS_PER_PAGE)}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(Math.ceil(records.length / RECORDS_PER_PAGE), currentPage + 1))}
                      disabled={currentPage === Math.ceil(records.length / RECORDS_PER_PAGE)}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:border-white/20 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-[0.99]"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            {records.length === 0 && (
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
