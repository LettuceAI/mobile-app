import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { useUsageTracking, RequestUsage, UsageFilter } from "../../../core/usage";
import {
  Download,
  TrendingUp,
  TrendingDown,
  Zap,
  DollarSign,
  Activity,
  Clock,
  Filter,
  X,
  ChevronRight,
  Calendar,
  GitCompare,
  ArrowRight,
} from "lucide-react";
import { BottomMenu } from "../../components";

// ============================================================================
// Utilities
// ============================================================================

function formatCurrency(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getOperationColor(type: string): string {
  const colors: Record<string, string> = {
    chat: "#60a5fa",
    regenerate: "#a78bfa",
    continue: "#22d3ee",
    summary: "#fbbf24",
    memory_manager: "#34d399",
  };
  return colors[type.toLowerCase()] || "#94a3b8";
}

function getOperationLabel(type: string): string {
  const labels: Record<string, string> = {
    chat: "Chat",
    regenerate: "Regen",
    continue: "Continue",
    summary: "Summary",
    memory_manager: "Memory",
  };
  return labels[type.toLowerCase()] || type;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateForInput(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ============================================================================
// Date Range Presets
// ============================================================================

type DatePreset = "today" | "week" | "month" | "all" | "custom";

function getDateRange(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today":
      break;
    case "week":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setDate(start.getDate() - 30);
      break;
    case "all":
      start.setFullYear(start.getFullYear() - 10);
      break;
    case "custom":
      // Custom range will be handled separately
      break;
  }

  return { start, end };
}

// ============================================================================
// Chart Tooltip
// ============================================================================

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-white/20 bg-[#0a0b0f]/95 backdrop-blur-md px-3 py-2 shadow-xl">
      <p className="text-[11px] font-medium text-white/70 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-white/60">{p.name}:</span>
          <span className="text-white font-medium">{formatNumber(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// Stat Card
// ============================================================================

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  highlight,
}: {
  icon: any;
  label: string;
  value: string;
  subValue?: string;
  trend?: { value: number; isUp: boolean } | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight
          ? "border-emerald-500/30 bg-linear-to-br from-emerald-500/20 via-emerald-500/10 to-transparent"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${highlight ? "bg-emerald-500/20" : "bg-white/5"}`}>
          <Icon className={`h-3.5 w-3.5 ${highlight ? "text-emerald-400" : "text-white/50"}`} />
        </div>
        <span className="text-[11px] font-medium text-white/50 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className={`text-2xl font-bold ${highlight ? "text-emerald-100" : "text-white"}`}>
            {value}
          </p>
          {subValue && <p className="text-[11px] text-white/40 mt-0.5">{subValue}</p>}
        </div>
        {trend && trend.value > 0 && (
          <div
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              trend.isUp ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}
          >
            {trend.isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value.toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Activity Item
// ============================================================================

function ActivityItem({ request }: { request: RequestUsage }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${getOperationColor(request.operationType)}20` }}
      >
        <Zap className="h-3.5 w-3.5" style={{ color: getOperationColor(request.operationType) }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">
            {request.characterName || "Unknown"}
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: `${getOperationColor(request.operationType)}20`,
              color: getOperationColor(request.operationType),
            }}
          >
            {getOperationLabel(request.operationType)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/40">
          <span>{formatCompactNumber(request.totalTokens || 0)} tokens</span>
          <span>·</span>
          <span>{getRelativeTime(request.timestamp)}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-medium text-emerald-400">
          {formatCurrency(request.cost?.totalCost || 0)}
        </p>
        <p className="text-[10px] text-white/30">{request.modelName}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Comparison Stat
// ============================================================================

function ComparisonStat({
  label,
  period1Value,
  period2Value,
  formatter,
  period1Label,
  period2Label,
}: {
  label: string;
  period1Value: number;
  period2Value: number;
  formatter: (v: number) => string;
  period1Label: string;
  period2Label: string;
}) {
  const diff = period2Value - period1Value;
  const percentChange = period1Value > 0 ? (diff / period1Value) * 100 : period2Value > 0 ? 100 : 0;
  const isIncrease = diff > 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-[11px] font-medium text-white/50 uppercase tracking-wide mb-3">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-[10px] text-white/40 mb-1">{period1Label}</p>
          <p className="text-lg font-bold text-white">{formatter(period1Value)}</p>
        </div>
        <div className="flex flex-col items-center">
          <ArrowRight className="h-4 w-4 text-white/20" />
          {diff !== 0 && (
            <span
              className={`text-[10px] font-medium mt-1 ${
                isIncrease ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {isIncrease ? "+" : ""}
              {percentChange.toFixed(0)}%
            </span>
          )}
        </div>
        <div className="flex-1 text-right">
          <p className="text-[10px] text-white/40 mb-1">{period2Label}</p>
          <p className="text-lg font-bold text-white">{formatter(period2Value)}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function UsagePage() {
  const { queryRecords, exportCSV, saveCSV } = useUsageTracking();

  // View mode
  const [viewMode, setViewMode] = useState<"dashboard" | "compare">("dashboard");

  // Dashboard state
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [records, setRecords] = useState<RequestUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Custom date range
  const [customStartDate, setCustomStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [customEndDate, setCustomEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Filters
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

  // Comparison state
  const [period1Start, setPeriod1Start] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [period1End, setPeriod1End] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [period2Start, setPeriod2Start] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [period2End, setPeriod2End] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [compareRecords1, setCompareRecords1] = useState<RequestUsage[]>([]);
  const [compareRecords2, setCompareRecords2] = useState<RequestUsage[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // Load dashboard data
  const loadDashboardData = async () => {
    setLoading(true);
    let start: Date, end: Date;

    if (datePreset === "custom") {
      start = customStartDate;
      end = customEndDate;
    } else {
      const range = getDateRange(datePreset);
      start = range.start;
      end = range.end;
    }

    const filter: UsageFilter = {
      startTimestamp: start.getTime(),
      endTimestamp: end.getTime(),
    };
    const newRecords = await queryRecords(filter);
    if (newRecords) setRecords(newRecords);
    setLoading(false);
  };

  // Load comparison data
  const loadComparisonData = async () => {
    setCompareLoading(true);
    const [r1, r2] = await Promise.all([
      queryRecords({
        startTimestamp: period1Start.getTime(),
        endTimestamp: period1End.getTime(),
      }),
      queryRecords({
        startTimestamp: period2Start.getTime(),
        endTimestamp: period2End.getTime(),
      }),
    ]);
    if (r1) setCompareRecords1(r1);
    if (r2) setCompareRecords2(r2);
    setCompareLoading(false);
  };

  useEffect(() => {
    if (viewMode === "dashboard") {
      loadDashboardData();
    }
  }, [datePreset, viewMode, customStartDate, customEndDate]);

  useEffect(() => {
    if (viewMode === "compare") {
      loadComparisonData();
    }
  }, [viewMode, period1Start, period1End, period2Start, period2End]);

  // Filtered records for dashboard
  const filteredRecords = useMemo(() => {
    let list = records;
    if (selectedModel) list = list.filter((r) => r.modelId === selectedModel);
    if (selectedCharacter) list = list.filter((r) => r.characterId === selectedCharacter);
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [records, selectedModel, selectedCharacter]);

  // Dashboard derived data
  const { modelOptions, characterOptions, chartData, topModels } = useMemo(() => {
    const modelMap = new Map<string, { name: string; tokens: number; cost: number }>();
    const charMap = new Map<string, { name: string; tokens: number; cost: number }>();
    const dailyMap = new Map<string, { input: number; output: number; cost: number; date: Date }>();

    for (const r of filteredRecords) {
      if (r.modelId && r.modelName) {
        const existing = modelMap.get(r.modelId) || { name: r.modelName, tokens: 0, cost: 0 };
        existing.tokens += r.totalTokens || 0;
        existing.cost += r.cost?.totalCost || 0;
        modelMap.set(r.modelId, existing);
      }
      if (r.characterId && r.characterName) {
        const existing = charMap.get(r.characterId) || {
          name: r.characterName,
          tokens: 0,
          cost: 0,
        };
        existing.tokens += r.totalTokens || 0;
        existing.cost += r.cost?.totalCost || 0;
        charMap.set(r.characterId, existing);
      }
      const recordDate = new Date(r.timestamp);
      // Use date string as key (YYYY-MM-DD format ensures uniqueness)
      const dateKey = recordDate.toISOString().split("T")[0];
      const dayData = dailyMap.get(dateKey) || { input: 0, output: 0, cost: 0, date: recordDate };
      dayData.input += r.promptTokens || 0;
      dayData.output += r.completionTokens || 0;
      dayData.cost += r.cost?.totalCost || 0;
      dailyMap.set(dateKey, dayData);
    }

    const modelOptions = Array.from(modelMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.tokens - a.tokens);

    const characterOptions = Array.from(charMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.tokens - a.tokens);

    // Determine how many days to show based on the date preset
    const daysToShow =
      datePreset === "today"
        ? 1
        : datePreset === "week"
          ? 7
          : datePreset === "month"
            ? 30
            : datePreset === "all"
              ? undefined // Show all data
              : datePreset === "custom"
                ? undefined // Show all data for custom range
                : 14; // Default fallback

    const sortedEntries = Array.from(dailyMap.entries()).sort(
      (a, b) => a[1].date.getTime() - b[1].date.getTime(),
    );

    const chartData = (
      daysToShow !== undefined ? sortedEntries.slice(-daysToShow) : sortedEntries
    ).map(([, data]) => ({
      label: data.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      input: data.input,
      output: data.output,
      cost: data.cost,
    }));

    const topModels = modelOptions.slice(0, 5);

    return { modelOptions, characterOptions, chartData, topModels };
  }, [filteredRecords, datePreset]);

  // Dashboard stats
  const displayStats = useMemo(() => {
    const totals = filteredRecords.reduce(
      (acc, r) => {
        acc.tokens += r.totalTokens || 0;
        acc.cost += r.cost?.totalCost || 0;
        acc.requests += 1;
        return acc;
      },
      { tokens: 0, cost: 0, requests: 0 },
    );
    return {
      ...totals,
      avgPerRequest: totals.requests > 0 ? totals.tokens / totals.requests : 0,
    };
  }, [filteredRecords]);

  // Comparison stats
  const compareStats1 = useMemo(() => {
    return compareRecords1.reduce(
      (acc, r) => {
        acc.tokens += r.totalTokens || 0;
        acc.cost += r.cost?.totalCost || 0;
        acc.requests += 1;
        return acc;
      },
      { tokens: 0, cost: 0, requests: 0 },
    );
  }, [compareRecords1]);

  const compareStats2 = useMemo(() => {
    return compareRecords2.reduce(
      (acc, r) => {
        acc.tokens += r.totalTokens || 0;
        acc.cost += r.cost?.totalCost || 0;
        acc.requests += 1;
        return acc;
      },
      { tokens: 0, cost: 0, requests: 0 },
    );
  }, [compareRecords2]);

  // Export handler
  const handleExport = async () => {
    setExporting(true);
    try {
      const { start, end } = getDateRange(datePreset);
      const csv = await exportCSV({
        startTimestamp: start.getTime(),
        endTimestamp: end.getTime(),
      });
      if (csv) {
        const fileName = `usage-${datePreset}-${new Date().toISOString().split("T")[0]}.csv`;
        const path = await saveCSV(csv, fileName);
        if (path) alert(`Exported to: ${path}`);
      }
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const COLORS = ["#34d399", "#60a5fa", "#a78bfa", "#f472b6", "#fbbf24"];
  const activeFilterCount = [selectedModel, selectedCharacter].filter(Boolean).length;

  const period1Label = `${formatDateShort(period1Start)} - ${formatDateShort(period1End)}`;
  const period2Label = `${formatDateShort(period2Start)} - ${formatDateShort(period2End)}`;

  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      {/* Filters Bottom Sheet */}
      <BottomMenu
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
        includeExitIcon={false}
      >
        <div className="space-y-4 pb-4">
          <div>
            <label className="text-xs font-medium text-white/60 uppercase tracking-wide mb-2 block">
              Model
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {modelOptions.slice(0, 8).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(selectedModel === m.id ? null : m.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition ${
                    selectedModel === m.id
                      ? "bg-emerald-500/20 text-emerald-100"
                      : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  <span className="text-xs text-white/40">{formatCompactNumber(m.tokens)}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-white/60 uppercase tracking-wide mb-2 block">
              Character
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {characterOptions.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCharacter(selectedCharacter === c.id ? null : c.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition ${
                    selectedCharacter === c.id
                      ? "bg-emerald-500/20 text-emerald-100"
                      : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs text-white/40">{formatCompactNumber(c.tokens)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                setSelectedModel(null);
                setSelectedCharacter(null);
              }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 transition"
            >
              Clear All
            </button>
            <button
              onClick={() => setShowFilters(false)}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 text-sm font-medium hover:bg-emerald-500/30 transition"
            >
              Apply
            </button>
          </div>
        </div>
      </BottomMenu>

      {/* All Activity Bottom Sheet */}
      <BottomMenu
        isOpen={showAllActivity}
        onClose={() => setShowAllActivity(false)}
        title="Recent Activity"
        includeExitIcon={false}
      >
        <div className="space-y-1 pb-4 max-h-[60vh] overflow-y-auto">
          {filteredRecords.slice(0, 50).map((r) => (
            <ActivityItem key={r.id} request={r} />
          ))}
          {filteredRecords.length === 0 && (
            <p className="text-center text-white/40 py-8 text-sm">No activity in this period</p>
          )}
        </div>
      </BottomMenu>

      {/* Custom Date Range Bottom Sheet */}
      <BottomMenu
        isOpen={showCustomDatePicker}
        onClose={() => setShowCustomDatePicker(false)}
        title="Custom Date Range"
        includeExitIcon={false}
      >
        <div className="space-y-4 pb-4">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-2">Start Date</label>
            <input
              type="date"
              value={customStartDate.toISOString().split("T")[0]}
              onChange={(e) => {
                const newDate = new Date(e.target.value);
                newDate.setHours(0, 0, 0, 0);
                setCustomStartDate(newDate);
              }}
              max={customEndDate.toISOString().split("T")[0]}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-2">End Date</label>
            <input
              type="date"
              value={customEndDate.toISOString().split("T")[0]}
              onChange={(e) => {
                const newDate = new Date(e.target.value);
                newDate.setHours(23, 59, 59, 999);
                setCustomEndDate(newDate);
              }}
              min={customStartDate.toISOString().split("T")[0]}
              max={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowCustomDatePicker(false)}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setDatePreset("custom");
                setShowCustomDatePicker(false);
              }}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 text-sm font-medium hover:bg-emerald-500/30 transition"
            >
              Apply
            </button>
          </div>
        </div>
      </BottomMenu>

      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
            <button
              onClick={() => setViewMode("dashboard")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                viewMode === "dashboard"
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Dashboard
            </button>
            <button
              onClick={() => setViewMode("compare")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                viewMode === "compare"
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare
            </button>
          </div>
        </div>

        {/* ================================================================== */}
        {/* DASHBOARD VIEW */}
        {/* ================================================================== */}
        {viewMode === "dashboard" && (
          <>
            {/* Header Row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                {[
                  { key: "today", label: "Today" },
                  { key: "week", label: "7 Days" },
                  { key: "month", label: "30 Days" },
                  { key: "all", label: "All" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDatePreset(key as DatePreset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      datePreset === key
                        ? "bg-white/10 text-white"
                        : "text-white/50 hover:text-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setShowCustomDatePicker(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    datePreset === "custom"
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:text-white/70"
                  }`}
                >
                  Custom
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    activeFilterCount > 0
                      ? "bg-emerald-500/20 text-emerald-100 border border-emerald-500/30"
                      : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {activeFilterCount > 0 ? `${activeFilterCount}` : "Filter"}
                </button>
                <button
                  onClick={handleExport}
                  disabled={exporting || records.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs font-medium hover:bg-white/10 transition disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Active Filters */}
            <AnimatePresence>
              {activeFilterCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 mb-4 overflow-hidden"
                >
                  {selectedModel && (
                    <button
                      onClick={() => setSelectedModel(null)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-100 text-xs"
                    >
                      {modelOptions.find((m) => m.id === selectedModel)?.name}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {selectedCharacter && (
                    <button
                      onClick={() => setSelectedCharacter(null)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-100 text-xs"
                    >
                      {characterOptions.find((c) => c.id === selectedCharacter)?.name}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Stats Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard
                    icon={DollarSign}
                    label="Total Cost"
                    value={formatCurrency(displayStats.cost)}
                    highlight
                  />
                  <StatCard
                    icon={Zap}
                    label="Tokens"
                    value={formatNumber(displayStats.tokens)}
                    subValue={`${formatNumber(Math.round(displayStats.avgPerRequest))} avg`}
                  />
                  <StatCard
                    icon={Activity}
                    label="Requests"
                    value={displayStats.requests.toLocaleString()}
                  />
                  <StatCard
                    icon={Clock}
                    label="Period"
                    value={
                      datePreset === "today"
                        ? "Today"
                        : datePreset === "week"
                          ? "7 Days"
                          : datePreset === "month"
                            ? "30 Days"
                            : datePreset === "custom"
                              ? `${customStartDate.toLocaleDateString()} - ${customEndDate.toLocaleDateString()}`
                              : "All Time"
                    }
                    subValue={`${filteredRecords.length} records`}
                  />
                </div>

                {/* Chart */}
                {chartData.length > 1 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white">Usage Trend</h3>
                      <div className="flex items-center gap-3 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-blue-400" />
                          <span className="text-white/50">Input</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-white/50">Output</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData}
                          margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="inputGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="outputGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={formatCompactNumber}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="input"
                            name="Input"
                            stroke="#60a5fa"
                            fill="url(#inputGrad)"
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="output"
                            name="Output"
                            stroke="#34d399"
                            fill="url(#outputGrad)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {topModels.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 }}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <h3 className="text-sm font-semibold text-white mb-4">By Model</h3>
                      <div className="flex gap-4">
                        <div className="w-28 h-28 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={topModels}
                                dataKey="tokens"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={25}
                                outerRadius={45}
                                paddingAngle={2}
                              >
                                {topModels.map((_, i) => (
                                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-2">
                          {topModels.slice(0, 4).map((m, i) => (
                            <div key={m.id} className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: COLORS[i % COLORS.length] }}
                              />
                              <span className="text-xs text-white/70 truncate flex-1">
                                {m.name}
                              </span>
                              <span className="text-xs text-white/40">
                                {formatCompactNumber(m.tokens)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {characterOptions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <h3 className="text-sm font-semibold text-white mb-4">By Character</h3>
                      <div className="flex gap-4">
                        <div className="w-28 h-28 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={characterOptions.slice(0, 5)}
                                dataKey="tokens"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={25}
                                outerRadius={45}
                                paddingAngle={2}
                              >
                                {characterOptions.slice(0, 5).map((_, i) => (
                                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-2">
                          {characterOptions.slice(0, 4).map((c, i) => (
                            <div key={c.id} className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: COLORS[i % COLORS.length] }}
                              />
                              <span className="text-xs text-white/70 truncate flex-1">
                                {c.name}
                              </span>
                              <span className="text-xs text-white/40">
                                {formatCompactNumber(c.tokens)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Recent Activity */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
                    {filteredRecords.length > 5 && (
                      <button
                        onClick={() => setShowAllActivity(true)}
                        className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition"
                      >
                        View all
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-white/5">
                    {filteredRecords.slice(0, 5).map((r) => (
                      <ActivityItem key={r.id} request={r} />
                    ))}
                    {filteredRecords.length === 0 && (
                      <div className="py-12 text-center">
                        <Calendar className="h-8 w-8 text-white/20 mx-auto mb-2" />
                        <p className="text-sm text-white/50">No activity yet</p>
                        <p className="text-xs text-white/30 mt-1">
                          Start chatting to see usage data
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </>
        )}

        {/* ================================================================== */}
        {/* COMPARE VIEW */}
        {/* ================================================================== */}
        {viewMode === "compare" && (
          <div className="space-y-4">
            {/* Period Selection */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Period 1 */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-3 w-3 rounded-full bg-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Period 1</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-white/50 uppercase tracking-wide block mb-1.5">
                      From
                    </label>
                    <input
                      type="date"
                      value={formatDateForInput(period1Start)}
                      onChange={(e) => {
                        const d = new Date(e.target.value);
                        d.setHours(0, 0, 0, 0);
                        setPeriod1Start(d);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-white/50 uppercase tracking-wide block mb-1.5">
                      To
                    </label>
                    <input
                      type="date"
                      value={formatDateForInput(period1End)}
                      onChange={(e) => {
                        const d = new Date(e.target.value);
                        d.setHours(23, 59, 59, 999);
                        setPeriod1End(d);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>
              </div>

              {/* Period 2 */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Period 2</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-white/50 uppercase tracking-wide block mb-1.5">
                      From
                    </label>
                    <input
                      type="date"
                      value={formatDateForInput(period2Start)}
                      onChange={(e) => {
                        const d = new Date(e.target.value);
                        d.setHours(0, 0, 0, 0);
                        setPeriod2Start(d);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-white/50 uppercase tracking-wide block mb-1.5">
                      To
                    </label>
                    <input
                      type="date"
                      value={formatDateForInput(period2End)}
                      onChange={(e) => {
                        const d = new Date(e.target.value);
                        d.setHours(23, 59, 59, 999);
                        setPeriod2End(d);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>
              </div>
            </div>

            {compareLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
              </div>
            ) : (
              <>
                {/* Comparison Stats */}
                <div className="space-y-3">
                  <ComparisonStat
                    label="Total Cost"
                    period1Value={compareStats1.cost}
                    period2Value={compareStats2.cost}
                    formatter={formatCurrency}
                    period1Label={period1Label}
                    period2Label={period2Label}
                  />
                  <ComparisonStat
                    label="Total Tokens"
                    period1Value={compareStats1.tokens}
                    period2Value={compareStats2.tokens}
                    formatter={formatNumber}
                    period1Label={period1Label}
                    period2Label={period2Label}
                  />
                  <ComparisonStat
                    label="Requests"
                    period1Value={compareStats1.requests}
                    period2Value={compareStats2.requests}
                    formatter={(v) => v.toLocaleString()}
                    period1Label={period1Label}
                    period2Label={period2Label}
                  />
                </div>

                {/* Comparison Bar Chart */}
                {(compareStats1.tokens > 0 || compareStats2.tokens > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white">Visual Comparison</h3>
                      <div className="flex items-center gap-3 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-blue-400" />
                          <span className="text-white/50">{period1Label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-white/50">{period2Label}</span>
                        </div>
                      </div>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            {
                              name: "Cost ($)",
                              period1: compareStats1.cost,
                              period2: compareStats2.cost,
                            },
                            {
                              name: "Tokens (K)",
                              period1: compareStats1.tokens / 1000,
                              period2: compareStats2.tokens / 1000,
                            },
                            {
                              name: "Requests",
                              period1: compareStats1.requests,
                              period2: compareStats2.requests,
                            },
                          ]}
                          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                        >
                          <XAxis
                            dataKey="name"
                            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
                            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar
                            dataKey="period1"
                            name={period1Label}
                            fill="#60a5fa"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="period2"
                            name={period2Label}
                            fill="#34d399"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}

                {/* Summary */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Summary</h3>
                  <div className="space-y-2 text-sm">
                    {compareStats1.cost !== compareStats2.cost && (
                      <p className="text-white/70">
                        {compareStats2.cost > compareStats1.cost ? (
                          <>
                            Cost <span className="text-red-400">increased</span> by{" "}
                            <span className="font-medium text-white">
                              {formatCurrency(compareStats2.cost - compareStats1.cost)}
                            </span>{" "}
                            (
                            {(
                              ((compareStats2.cost - compareStats1.cost) /
                                Math.max(compareStats1.cost, 0.01)) *
                              100
                            ).toFixed(0)}
                            %)
                          </>
                        ) : (
                          <>
                            Cost <span className="text-emerald-400">decreased</span> by{" "}
                            <span className="font-medium text-white">
                              {formatCurrency(compareStats1.cost - compareStats2.cost)}
                            </span>{" "}
                            (
                            {(
                              ((compareStats1.cost - compareStats2.cost) /
                                Math.max(compareStats1.cost, 0.01)) *
                              100
                            ).toFixed(0)}
                            %)
                          </>
                        )}
                      </p>
                    )}
                    {compareStats1.tokens !== compareStats2.tokens && (
                      <p className="text-white/70">
                        Token usage{" "}
                        {compareStats2.tokens > compareStats1.tokens ? (
                          <>
                            <span className="text-amber-400">increased</span> by{" "}
                            <span className="font-medium text-white">
                              {formatNumber(compareStats2.tokens - compareStats1.tokens)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-emerald-400">decreased</span> by{" "}
                            <span className="font-medium text-white">
                              {formatNumber(compareStats1.tokens - compareStats2.tokens)}
                            </span>
                          </>
                        )}
                      </p>
                    )}
                    {compareStats1.requests === 0 && compareStats2.requests === 0 && (
                      <p className="text-white/50">No data available for the selected periods</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
