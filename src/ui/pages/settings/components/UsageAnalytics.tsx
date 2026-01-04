import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, ChevronDown, Check } from 'lucide-react';
import { useUsageAnalytics, type TimePeriod } from '../hooks/useUsageAnalytics';
import type { RequestUsage } from '../../../../core/usage';

interface UsageAnalyticsProps {
    records: RequestUsage[];
    modelOptions: { id: string; name: string }[];
    characterOptions: { id: string; name: string }[];
    operationTypeOptions: { id: string; label: string; color: string }[];
}

function formatNumber(value: number): string {
    if (value === 0) return '0';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
}

function formatCurrency(value: number): string {
    if (value === 0) return '$0';
    if (value < 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(2)}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-xl border border-white/15 bg-[#0a0b0f]/95 backdrop-blur-md p-3 shadow-xl">
            <p className="text-xs font-medium text-white/90 mb-2">{label}</p>
            <div className="space-y-1">
                {payload.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-white/60">{p.name}:</span>
                        <span className="text-white font-medium">{formatNumber(p.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0];

    return (
        <div className="rounded-xl border border-white/15 bg-[#0a0b0f]/95 backdrop-blur-md p-3 shadow-xl">
            <div className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: data.payload.color }} />
                <span className="text-white/90 font-medium">{data.name}</span>
            </div>
            <p className="text-white text-sm font-semibold mt-1">{formatNumber(data.value)} tokens</p>
        </div>
    );
};

const StatTrend = ({ comparison }: { comparison: any }) => {
    if (comparison.previousTotal === 0 && comparison.currentTotal === 0) return null;

    return (
        <div className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${comparison.isIncrease
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-rose-500/10 text-rose-400'
            }`}>
            {comparison.isIncrease ? (
                <TrendingUp className="h-3 w-3" />
            ) : comparison.percentChange === 0 ? (
                <Minus className="h-3 w-3" />
            ) : (
                <TrendingDown className="h-3 w-3" />
            )}
            <span>{comparison.percentChange.toFixed(1)}%</span>
        </div>
    );
};

export function UsageAnalytics({
    records,
    modelOptions,
    characterOptions,
    operationTypeOptions,
}: UsageAnalyticsProps) {
    const [period, setPeriod] = useState<TimePeriod>('daily');
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [selectedOperationType, setSelectedOperationType] = useState<string | null>(null);
    const [showFilterMenu, setShowFilterMenu] = useState<'model' | 'character' | 'type' | null>(null);

    const analytics = useUsageAnalytics(records, period, {
        modelId: selectedModelId,
        characterId: selectedCharacterId,
        operationType: selectedOperationType,
    });

    const activeFilterCount = [selectedModelId, selectedCharacterId, selectedOperationType].filter(Boolean).length;

    return (
        <div className="space-y-3">
            {/* Period Selector */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                <div className="flex items-center gap-1.5 rounded-lg bg-black/30 p-1">
                    {(['daily', 'weekly', 'monthly'] as TimePeriod[]).map((p) => (
                        <motion.button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-all ${period === p
                                ? 'bg-linear-to-b from-emerald-400/20 to-emerald-500/15 text-emerald-100 shadow-sm shadow-emerald-500/20'
                                : 'text-white/50 hover:text-white/70 hover:bg-white/5'
                                }`}
                            whileTap={{ scale: 0.97 }}
                        >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <motion.button
                    onClick={() => { setSelectedModelId(null); setSelectedCharacterId(null); setSelectedOperationType(null); }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition ${activeFilterCount === 0
                        ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100'
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                        }`}
                    whileTap={{ scale: 0.97 }}
                >
                    All
                </motion.button>
                <motion.button
                    onClick={() => setShowFilterMenu(showFilterMenu === 'model' ? null : 'model')}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition flex items-center gap-1 ${selectedModelId
                        ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100'
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                        }`}
                    whileTap={{ scale: 0.97 }}
                >
                    {selectedModelId ? modelOptions.find(m => m.id === selectedModelId)?.name || 'Model' : 'Model'}
                    <ChevronDown className="h-3 w-3" />
                </motion.button>
                <motion.button
                    onClick={() => setShowFilterMenu(showFilterMenu === 'character' ? null : 'character')}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition flex items-center gap-1 ${selectedCharacterId
                        ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100'
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                        }`}
                    whileTap={{ scale: 0.97 }}
                >
                    {selectedCharacterId ? characterOptions.find(c => c.id === selectedCharacterId)?.name || 'Character' : 'Character'}
                    <ChevronDown className="h-3 w-3" />
                </motion.button>
                <motion.button
                    onClick={() => setShowFilterMenu(showFilterMenu === 'type' ? null : 'type')}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition flex items-center gap-1 ${selectedOperationType
                        ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100'
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                        }`}
                    whileTap={{ scale: 0.97 }}
                >
                    {selectedOperationType ? operationTypeOptions.find(o => o.id === selectedOperationType)?.label || 'Type' : 'Type'}
                    <ChevronDown className="h-3 w-3" />
                </motion.button>
            </div>

            {/* Filter Dropdown Menus */}
            {showFilterMenu === 'model' && modelOptions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-white/10 bg-[#0a0b0f]/98 backdrop-blur-md p-2 space-y-0.5"
                >
                    {modelOptions.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => { setSelectedModelId(opt.id); setShowFilterMenu(null); }}
                            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs transition ${selectedModelId === opt.id ? 'bg-emerald-500/15 text-emerald-100' : 'text-white/70 hover:bg-white/8'
                                }`}
                        >
                            <span className="truncate">{opt.name}</span>
                            {selectedModelId === opt.id && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                        </button>
                    ))}
                    <button
                        onClick={() => { setSelectedModelId(null); setShowFilterMenu(null); }}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 mt-2"
                    >
                        Clear
                    </button>
                </motion.div>
            )}

            {showFilterMenu === 'character' && characterOptions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-white/10 bg-[#0a0b0f]/98 backdrop-blur-md p-2 space-y-0.5"
                >
                    {characterOptions.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => { setSelectedCharacterId(opt.id); setShowFilterMenu(null); }}
                            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs transition ${selectedCharacterId === opt.id ? 'bg-emerald-500/15 text-emerald-100' : 'text-white/70 hover:bg-white/8'
                                }`}
                        >
                            <span className="truncate">{opt.name}</span>
                            {selectedCharacterId === opt.id && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                        </button>
                    ))}
                    <button
                        onClick={() => { setSelectedCharacterId(null); setShowFilterMenu(null); }}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 mt-2"
                    >
                        Clear
                    </button>
                </motion.div>
            )}

            {showFilterMenu === 'type' && operationTypeOptions.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-white/10 bg-[#0a0b0f]/98 backdrop-blur-md p-2 space-y-0.5"
                >
                    {operationTypeOptions.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => { setSelectedOperationType(opt.id); setShowFilterMenu(null); }}
                            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs transition ${selectedOperationType === opt.id ? 'bg-emerald-500/15 text-emerald-100' : 'text-white/70 hover:bg-white/8'
                                }`}
                        >
                            <span className="truncate">{opt.label}</span>
                            {selectedOperationType === opt.id && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                        </button>
                    ))}
                    <button
                        onClick={() => { setSelectedOperationType(null); setShowFilterMenu(null); }}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 mt-2"
                    >
                        Clear
                    </button>
                </motion.div>
            )}

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <p className="text-[12px] text-white/40 uppercase tracking-wide">Total Tokens</p>
                        <div className="flex items-center gap-2">
                            <p className="text-2xl font-bold text-white">{formatNumber(analytics.totals.tokens)}</p>
                            <StatTrend comparison={analytics.comparisons.tokens} />
                        </div>
                    </div>
                    <div className="text-[10px] text-white/30 font-medium bg-white/5 rounded-md px-2 py-1">
                        vs {analytics.comparisons.tokens.label}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-black/20 p-2.5">
                        <p className="text-[12px] text-white/40 uppercase">Requests</p>
                        <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                            <p className="text-lg font-semibold text-white truncate">{analytics.totals.requests}</p>
                            <StatTrend comparison={analytics.comparisons.requests} />
                        </div>
                    </div>
                    <div className="rounded-lg bg-black/20 p-2.5">
                        <p className="text-[12px] text-white/40 uppercase">Cost</p>
                        <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                            <p className="text-lg font-semibold text-emerald-400 truncate">{formatCurrency(analytics.totals.cost)}</p>
                            <StatTrend comparison={analytics.comparisons.cost} />
                        </div>
                    </div>
                    <div className="rounded-lg bg-black/20 p-2.5">
                        <p className="text-[12px] text-white/40 uppercase">Avg/Req</p>
                        <p className="text-lg font-semibold text-white mt-0.5">
                            {analytics.totals.requests > 0 ? formatNumber(Math.round(analytics.totals.tokens / analytics.totals.requests)) : '0'}
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Token Usage Over Time (Stacked Bar Chart) */}
            {analytics.timeSeries.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                    <h3 className="text-xs font-medium text-white/70 mb-2">Token Usage Over Time</h3>
                    <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analytics.timeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <XAxis
                                    dataKey="label"
                                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={formatNumber}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Bar dataKey="inputTokens" name="Input" stackId="tokens" fill="#60a5fa" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="outputTokens" name="Output" stackId="tokens" fill="#34d399" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="reasoningTokens" name="Reasoning" stackId="tokens" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-2">
                        <div className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-sm bg-blue-400" />
                            <span className="text-[12px] text-white/70">Input</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-sm bg-emerald-400" />
                            <span className="text-[12px] text-white/70">Output</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-sm bg-purple-400" />
                            <span className="text-[12px] text-white/70">Reasoning</span>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Distribution Charts - Compact 2-Column Grid */}
            <div className="grid grid-cols-2 gap-2">
                {/* By Model */}
                {analytics.byModel.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="rounded-xl border border-white/10 bg-white/5 p-3"
                    >
                        <h3 className="text-xs font-medium text-white/70 mb-2">By Model</h3>
                        <div className="h-28">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.byModel}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={25}
                                        outerRadius={45}
                                        paddingAngle={2}
                                    >
                                        {analytics.byModel.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomPieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {analytics.byModel.slice(0, 3).map((item, i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-[12px] text-white/60 truncate max-w-16">{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* By Character */}
                {analytics.byCharacter.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="rounded-xl border border-white/10 bg-white/5 p-3"
                    >
                        <h3 className="text-xs font-medium text-white/70 mb-2">By Character</h3>
                        <div className="h-28">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.byCharacter}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={25}
                                        outerRadius={45}
                                        paddingAngle={2}
                                    >
                                        {analytics.byCharacter.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomPieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {analytics.byCharacter.slice(0, 3).map((item, i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-[12px] text-white/60 truncate max-w-16">{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* By Type - Full width if alone, otherwise in grid */}
                {analytics.byType.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className={`rounded-xl border border-white/10 bg-white/5 p-3 ${analytics.byModel.length === 0 || analytics.byCharacter.length === 0 ? '' : 'col-span-2'
                            }`}
                    >
                        <h3 className="text-xs font-medium text-white/70 mb-2">By Type</h3>
                        <div className="h-28">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.byType}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={25}
                                        outerRadius={45}
                                        paddingAngle={2}
                                    >
                                        {analytics.byType.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomPieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 justify-center">
                            {analytics.byType.map((item, i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-[12px] text-white/60">{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Empty State */}
            {records.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                    <p className="text-sm text-white/50">No usage data available</p>
                    <p className="text-xs text-white/30 mt-1">Start chatting to see analytics</p>
                </div>
            )}
        </div>
    );
}
