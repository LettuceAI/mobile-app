import { useState, useCallback, useRef } from "react";
import { ArrowLeft, Loader2, X, Search } from "lucide-react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { radius, cn } from "../../design-tokens";
import { storageBridge } from "../../../core/storage/files";

interface SearchResult {
    messageId: string;
    content: string;
    createdAt: number;
    role: string;
}

export function SearchMessagesPage() {
    const navigate = useNavigate();
    const { characterId } = useParams<{ characterId: string }>();
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get("sessionId");

    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const searchTimeoutRef = useRef<number | null>(null);

    const handleSearch = useCallback(async (searchQuery: string) => {
        if (!sessionId || !searchQuery.trim()) {
            setResults([]);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await storageBridge.searchMessages(sessionId, searchQuery);
            setResults(data);
        } catch (err) {
            console.error("Search failed:", err);
            setError("Failed to search messages");
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newQuery = e.target.value;
        setQuery(newQuery);

        if (searchTimeoutRef.current) {
            window.clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = window.setTimeout(() => {
            handleSearch(newQuery);
        }, 300);
    };

    const highlightMatch = (text: string, highlight: string) => {
        if (!highlight.trim()) return text;
        const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === highlight.toLowerCase() ? (
                        <span key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5 font-medium">{part}</span>
                    ) : (
                        part
                    )
                )}
            </span>
        );
    };

    return (
        <div className="flex h-screen flex-col bg-[#050505] text-white">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/10 px-3 pb-3 pt-10 sticky top-0 bg-[#050505] z-10">
                <button
                    onClick={() => navigate(-1)}
                    className="flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 h-10 w-10 text-white transition hover:border-white/25"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                    <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={onQueryChange}
                        placeholder="Search conversation..."
                        className={cn(
                            "w-full bg-white/5 border border-white/10 text-white pl-10 pr-10 py-2.5",
                            radius.lg,
                            "focus:outline-none focus:border-white/20 focus:bg-white/10 placeholder:text-white/30"
                        )}
                    />
                    {query && (
                        <button
                            onClick={() => {
                                setQuery("");
                                setResults([]);
                                if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-3 py-4">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="animate-spin text-white/30" size={24} />
                    </div>
                ) : error ? (
                    <div className="text-center text-red-400 py-10">{error}</div>
                ) : results.length === 0 && query.trim() ? (
                    <div className="text-center text-white/30 py-10">No messages found</div>
                ) : (
                    <div className="space-y-4">
                        {results.map((result) => (
                            <button
                                key={result.messageId}
                                onClick={() => {
                                    navigate(`/chat/${characterId}?sessionId=${sessionId}&jumpToMessage=${result.messageId}`);
                                }}
                                className={cn(
                                    "w-full text-left p-4 space-y-2 border border-white/10 bg-white/5 hover:bg-white/10 transition",
                                    radius.lg
                                )}
                            >
                                <div className="flex justify-between items-center text-xs text-white/40 uppercase font-medium tracking-wider">
                                    <span>{result.role === 'user' ? 'You' : 'Character'}</span>
                                    <span>{new Date(result.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm text-white/80 line-clamp-3 leading-relaxed">
                                    {highlightMatch(result.content, query)}
                                </p>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
