import { motion, AnimatePresence } from "framer-motion";
import { cn, typography } from "../../design-tokens";
import { useState, useEffect, useMemo } from "react";
import { BottomMenu } from "../../components";
import { Sparkles, Zap, Bug, AlertTriangle, ChevronRight, Calendar, Hash, ArrowRight } from "lucide-react";

interface ChangelogEntry {
    version: string;
    date: string;
    changes: {
        type: 'feature' | 'improvement' | 'bugfix' | 'breaking';
        description: string;
    }[];
}


const changelog: ChangelogEntry[] = [
    {
        version: "1.0-beta_5",
        date: "2025-12-08",
        changes: [
            {
                type: "feature",
                description: "Added gradient overwrite customization. users can now define up to 3 custom colors for avatar gradients"
            },
            {
                type: "feature",
                description: "Introduced multimodel support, allowing users to mix different LLMs within the same environment"
            },
            {
                type: "feature",
                description: "Users can now generate images for avatars directly through supported image models"
            },
            {
                type: "feature",
                description: "Users can now send images in chat when using models that support image input"
            },
            {
                type: "feature",
                description: "Added session-level message search for quickly locating past messages"
            },
            {
                type: "feature",
                description: "Users can now reposition and resize their character/persona avatars, and also crop/adjust chat background images"
            },
            {
                type: "feature",
                description: "Encrypted backup system added. users can now export and restore their data securely"
            },
            {
                type: "feature",
                description: "Added empty-state UI to the Library page for better feedback when no content exists"
            },
            {
                type: "feature",
                description: "Chat branching added. users can create alternate timeline conversations and branches with different characters"
            },
            {
                type: "improvement",
                description: "Added new template placeholders {{context_summary}} and {{key_memories}} to improve prompt customization"
            },
            {
                type: "improvement",
                description: "Redesigned the Chat Character Card layout for clarity and better hierarchy"
            },
            {
                type: "improvement",
                description: "Redesigned the Edit Character page using a tabbed layout for more structured navigation"
            },
            {
                type: "improvement",
                description: "Revamped the Character/Persona Avatar editor for more intuitive customization"
            },
            {
                type: "improvement",
                description: "Persona creation page redesigned to match the Create Character page’s visual language"
            },
            {
                type: "improvement",
                description: "Dynamic memory system is now significantly more responsive and less prone to stalling"
            },
            {
                type: "improvement",
                description: "Navigation state handling rewritten — now more predictable, stable, and resistant to edge-case desyncs"
            },
            {
                type: "improvement",
                description: "Large internal performance pass: reduced unnecessary re-renders, optimized SQLite queries, minimized prop-drilling overhead, and improved store subscription batching"
            },
            {
                type: "bugfix",
                description: "Fixed a bug where skipping the welcome page could cause a database panic during initialization"
            },
            {
                type: "bugfix",
                description: "Summaries are now correctly included in API requests as intended"
            },
            {
                type: "bugfix",
                description: "Chat branches now generate proper unique IDs"
            }
        ]
    },
    {
        version: "1.0-beta_4",
        date: "2025-11-23",
        changes: [
            {
                type: "improvement",
                description: "Completely redesigned the top navigation bar to feel more modern and aligned with common mobile UI patterns"
            },
            {
                type: "improvement",
                description: "Moved Settings from the bottom navigation to the top navigation for a more predictable app layout"
            },
            {
                type: "feature",
                description: "Replaced the Settings slot in the bottom navigation with a new Library section"
            },
            {
                type: "feature",
                description: "Added a Library page that displays Characters and Personas as cards with avatar-based backgrounds for a more visual browsing experience"
            },
            {
                type: "improvement",
                description: "Removed Character and Persona management tabs from Settings and fully migrated them into the Library page"
            },
            {
                type: "feature",
                description: "Developed a lightweight in-house embedding model (lettuce-emb) to power dynamic memory and semantic recall"
            },
            {
                type: "feature",
                description: "Introduced Manual Memory, letting users pin important information without limiting context length (with the caveat that large memories can increase token usage on paid models)"
            },
            {
                type: "feature",
                description: "Introduced Dynamic Memory with a sliding window of the last N messages that are periodically summarised into long-term memories in the background"
            },
            {
                type: "feature",
                description: "Dynamic Memory now uses embeddings to retrieve the most relevant memories for each message, and users can choose which model powers both the summariser and memory manager"
            },
            {
                type: "feature",
                description: "Added Character and Persona import/export via .json files for easier backup and sharing"
            },
            {
                type: "breaking",
                description: "Migrated all app storage from .bin/.json files to a SQLite .db backend for more reliable, scalable data handling"
            },
            {
                type: "improvement",
                description: "Improved UI consistency across multiple screens, tightening spacing, typography and component alignment"
            },
            {
                type: "improvement",
                description: "Added required-variable validation to the prompt editor to prevent saving prompts with missing placeholders"
            },
            {
                type: "improvement",
                description: "Extended usage tracking with typed events for chat, regenerate, continue, summarisation tool calls and memory management tool calls"
            },
            {
                type: "feature",
                description: "Made pinned messages fully functional and integrated with the new memory features"
            },
            {
                type: "improvement",
                description: "Optimised ChatHistory and Edit Character/Persona pages for smoother scrolling and lower resource usage"
            },
            {
                type: "improvement",
                description: "Redesigned bottom popup animations to be smoother and stutter-free"
            }
        ]
    },
    {
        version: "1.0-beta_3.2",
        date: "2025-11-08",
        changes: [
            {
                type: "feature",
                description: "Added full support for persona avatars with proper persistence across sessions"
            },
            {
                type: "feature",
                description: "Introduced dynamic gradient backgrounds for character cards derived from avatar colors"
            },
            {
                type: "improvement",
                description: "Added a toggle in Settings to enable or disable dynamic gradient character cards"
            },
            {
                type: "feature",
                description: "Added advanced model parameter controls including frequency penalty, presence penalty and top-K sampling"
            },
            {
                type: "improvement",
                description: "Introduced API Parameter Support List modal to show which parameters are supported by the current model"
            },
            {
                type: "bugfix",
                description: "Fixed avatars not being saved correctly"
            },
            {
                type: "improvement",
                description: "Improved spacing and layout in chat header, history and settings"
            },
            {
                type: "improvement",
                description: "Improved persona loading behaviour across app restarts"
            },
            {
                type: "improvement",
                description: "Updated Custom Response Styles menu to the new UI design"
            },
            {
                type: "feature",
                description: "Added ability to cancel message regenerations from the UI"
            }
        ]
    },
    {
        version: "1.0-beta_3.1",
        date: "2025-11-05",
        changes: [
            {
                type: "breaking",
                description: "Reworked system prompt architecture from multiple scopes (app, model, character) into a single simplified prompt flow"
            },
            {
                type: "feature",
                description: "Introduced a new default system prompt for more stable tone, deeper conversations and stronger pseudo-memory behaviour"
            },
            {
                type: "improvement",
                description: "Improved predictability and ease-of-use of the System Prompts manager"
            },
            {
                type: "feature",
                description: "Added Character & Persona Search page to quickly filter characters and personas"
            },
            {
                type: "feature",
                description: "Added early Message Pinning feature for chats as a visual precursor to Manual Memory"
            },
            {
                type: "improvement",
                description: "General UI clarity improvements across multiple views"
            },
            {
                type: "improvement",
                description: "Cleaned up legacy prompt and scene-handling code"
            },
            {
                type: "improvement",
                description: "Improved request/cancel flow during message sends"
            },
            {
                type: "improvement",
                description: "Logging updates and internal stability improvements"
            }
        ]
    },
    {
        version: "1.0-beta_3",
        date: "2025-10-31",
        changes: [
            {
                type: "feature",
                description: "Added direct Mistral AI API integration"
            },
            {
                type: "feature",
                description: "Added direct Groq API integration"
            },
            {
                type: "feature",
                description: "Added multi-scope custom system prompts (app-wide, model-specific, character-specific)"
            },
            {
                type: "feature",
                description: "Added swipe-to-go-back and swipe-to-quit gestures for smoother navigation on Android"
            },
            {
                type: "improvement",
                description: "Implemented a new Android process plugin and back-handler to reduce crashes when switching activities"
            },
            {
                type: "improvement",
                description: "Performed ~75% backend refactor focused on performance, resource optimisation and clearer provider-adapter architecture"
            },
            {
                type: "improvement",
                description: "Centralised API endpoint management and improved streaming/error handling"
            },
            {
                type: "improvement",
                description: "Redesigned UsagePage, ChatSettings and BottomMenu for better UI/UX consistency"
            },
            {
                type: "improvement",
                description: "Unified button, icon and avatar design language across the app"
            },
            {
                type: "improvement",
                description: "Added animated usage counters and improved usage filters"
            },
            {
                type: "improvement",
                description: "Improved animations for smoother, more optimised transitions"
            },
            {
                type: "bugfix",
                description: "Fixed overly bright button visuals in light mode"
            },
            {
                type: "bugfix",
                description: "Fixed oversized filter checkbox on the Usage page"
            },
            {
                type: "bugfix",
                description: "Improved dark-mode input and button consistency across screens"
            },
            {
                type: "bugfix",
                description: "Fixed inconsistencies in chat continuation and roleplay instruction handling"
            },
            {
                type: "bugfix",
                description: "Corrected minor style and layout misalignments throughout the app"
            },
            {
                type: "feature",
                description: "Added support for {{char}} and {{persona}} placeholders in character descriptions"
            },
            {
                type: "breaking",
                description: "Switched project license to GNU AGPL v3 and updated README badges and issue templates"
            }
        ]
    },
    {
        version: "1.0-beta_2.1",
        date: "2025-10-19",
        changes: [
            {
                type: "bugfix",
                description: "Fixed an issue preventing users from accessing the Persona Edit page"
            },
            {
                type: "bugfix",
                description: "Resolved inconsistent or broken styling for switch buttons"
            },
            {
                type: "bugfix",
                description: "Fixed message bottom menu being triggered accidentally while scrolling"
            },
            {
                type: "improvement",
                description: "Improved slider styling and label consistency in model settings"
            },
            {
                type: "feature",
                description: "Added 'Max Tokens' input field with validation and suggestions in Edit Model page"
            },
            {
                type: "improvement",
                description: "Enhanced EditModelPage and PersonasPage with better default toggles and UI elements"
            }
        ]
    },
    {
        version: "1.0-beta_2",
        date: "2025-10-19",
        changes: [
            {
                type: "feature",
                description: "Added support for chat background images with automatic text colour adjustment for readability"
            },
            {
                type: "feature",
                description: "Introduced token usage analytics per chat, model and provider"
            },
            {
                type: "feature",
                description: "Added estimated cost tracking for OpenRouter endpoints (processed locally on-device)"
            },
            {
                type: "bugfix",
                description: "Fixed several rare crashes and general stability issues"
            },
            {
                type: "bugfix",
                description: "Resolved an issue where chat history failed to properly initialise sessions"
            },
            {
                type: "bugfix",
                description: "Fixed message stream package mix-ups affecting certain models"
            },
            {
                type: "improvement",
                description: "Improved overall performance and responsiveness of the app"
            },
            {
                type: "improvement",
                description: "Improved Continue feature so it correctly resumes from the last point"
            }
        ]
    },
    {
        version: "1.0-beta-1",
        date: "2025-10-13",
        changes: [
            {
                type: "feature",
                description: "First public beta release of LettuceAI focused on privacy-first AI role-play"
            },
            {
                type: "feature",
                description: "Local-only storage for chats and configuration, with user-owned API keys"
            },
            {
                type: "feature",
                description: "Cross-platform architecture with Android as the initial supported target"
            },
            {
                type: "improvement",
                description: "Initial onboarding and provider/model setup flow (with some known beta limitations)"
            },
            {
                type: "improvement",
                description: "Base chat experience including roleplay sessions powered by external AI providers"
            },
            {
                type: "improvement",
                description: "Documented known issues such as animation stutters, occasional onboarding failures and non-persistent model switching"
            }
        ]
    }
];

const typeConfig = {
    feature: {
        label: "New",
        icon: Sparkles,
        color: "text-emerald-300",
        iconColor: "text-emerald-400",
        bg: "bg-emerald-500/10",
        glow: "shadow-[0_0_20px_-5px_rgba(52,211,153,0.3)]",
        gradient: "from-emerald-500/20 to-emerald-500/5"
    },
    improvement: {
        label: "Improved",
        icon: Zap,
        color: "text-blue-300",
        iconColor: "text-blue-400",
        bg: "bg-blue-500/10",
        glow: "shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]",
        gradient: "from-blue-500/20 to-blue-500/5"
    },
    bugfix: {
        label: "Fixed",
        icon: Bug,
        color: "text-amber-300",
        iconColor: "text-amber-400",
        bg: "bg-amber-500/10",
        glow: "shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]",
        gradient: "from-amber-500/20 to-amber-500/5"
    },
    breaking: {
        label: "Breaking",
        icon: AlertTriangle,
        color: "text-red-300",
        iconColor: "text-red-400",
        bg: "bg-red-500/10",
        glow: "shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]",
        gradient: "from-red-500/20 to-red-500/5"
    }
};

interface ChangeGroupProps {
    type: 'feature' | 'improvement' | 'bugfix' | 'breaking';
    changes: { type: string; description: string }[];
    defaultExpanded?: boolean;
}

function ChangeGroup({ type, changes, defaultExpanded = true }: ChangeGroupProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const config = typeConfig[type];
    const Icon = config.icon;

    if (changes.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden"
        >
            {/* Group Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl",
                    "bg-white/3 border border-white/6",
                    "hover:bg-white/5 transition-all duration-200",
                    "group"
                )}
            >
                <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg",
                    config.bg,
                )}>
                    <Icon className={cn("w-4 h-4", config.iconColor)} />
                </div>
                <div className="flex-1 flex items-center gap-2">
                    <span className={cn(typography.h3.size, typography.h3.weight, "text-white")}>
                        {config.label}
                    </span>
                    <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        config.bg, config.color
                    )}>
                        {changes.length}
                    </span>
                </div>
                <motion.div
                    animate={{ rotate: expanded ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-white/60 transition-colors" />
                </motion.div>
            </button>

            {/* Changes List */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="pt-2 pl-4 space-y-2">
                            {changes.map((change, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.03 }}
                                    className={cn(
                                        "relative flex gap-3 pl-4 pr-4 py-3",
                                        "rounded-xl",
                                        "bg-linear-to-r", config.gradient,
                                        "group/item"
                                    )}
                                >
                                    {/* Accent line */}
                                    <div className={cn(
                                        "absolute left-0 top-3 bottom-3 w-0.5 rounded-full",
                                        config.bg.replace("/10", "/40")
                                    )} />
                                    <p className={cn(
                                        typography.body.size,
                                        "text-white/80 leading-relaxed"
                                    )}>
                                        {change.description}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export function ChangelogPage() {
    const [selectedVersion, setSelectedVersion] = useState<string>(changelog[0].version);
    const [showVersionMenu, setShowVersionMenu] = useState(false);

    const selectedEntry = changelog.find(entry => entry.version === selectedVersion) || changelog[0];
    const currentIndex = changelog.findIndex(e => e.version === selectedVersion);
    const isLatest = currentIndex === 0;

    const groupedChanges = useMemo(() => {
        const groups = {
            breaking: selectedEntry.changes.filter(c => c.type === 'breaking'),
            feature: selectedEntry.changes.filter(c => c.type === 'feature'),
            improvement: selectedEntry.changes.filter(c => c.type === 'improvement'),
            bugfix: selectedEntry.changes.filter(c => c.type === 'bugfix'),
        };
        return groups;
    }, [selectedEntry]);

    useEffect(() => {
        const handleOpenVersionSelector = () => {
            setShowVersionMenu(true);
        };

        window.addEventListener("changelog:openVersionSelector", handleOpenVersionSelector);
        return () => {
            window.removeEventListener("changelog:openVersionSelector", handleOpenVersionSelector);
        };
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    return (
        <div className="flex h-full flex-col pb-16 text-gray-200">
            <main className="flex-1 overflow-y-auto">
                {/* Hero Header */}
                <div className="relative px-4 pt-4 pb-6">
                    {/* Background gradient */}
                    <div className="absolute inset-0 pointer-events-none" />

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="relative"
                    >
                        {/* Version Badge */}


                        {/* Version Number */}
                        <div className="flex items-baseline gap-1 mb-3">
                            <span className="text-white/30 text-2xl font-bold">v</span>
                            <h1 className="text-4xl font-black text-white tracking-tight">
                                {selectedEntry.version}
                                {isLatest && (
                                    <motion.span
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className={cn(
                                            "inline-flex items-center ml-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                            "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        )}
                                    >
                                        Latest
                                    </motion.span>
                                )}
                            </h1>
                        </div>

                        {/* Meta info */}
                        <div className="flex flex-wrap items-center gap-4 text-white/40">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">
                                    {formatDate(selectedEntry.date)}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Hash className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">
                                    {selectedEntry.changes.length} changes
                                </span>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="flex gap-2 mt-5">
                            {groupedChanges.feature.length > 0 && (
                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                                    "bg-emerald-500/10 border border-emerald-500/20"
                                )}>
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-xs font-semibold text-emerald-300">
                                        {groupedChanges.feature.length} new
                                    </span>
                                </div>
                            )}
                            {groupedChanges.improvement.length > 0 && (
                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                                    "bg-blue-500/10 border border-blue-500/20"
                                )}>
                                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                                    <span className="text-xs font-semibold text-blue-300">
                                        {groupedChanges.improvement.length} improved
                                    </span>
                                </div>
                            )}
                            {groupedChanges.bugfix.length > 0 && (
                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                                    "bg-amber-500/10 border border-amber-500/20"
                                )}>
                                    <Bug className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-xs font-semibold text-amber-300">
                                        {groupedChanges.bugfix.length} fixed
                                    </span>
                                </div>
                            )}
                            {groupedChanges.breaking.length > 0 && (
                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
                                    "bg-red-500/10 border border-red-500/20"
                                )}>
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                    <span className="text-xs font-semibold text-red-300">
                                        {groupedChanges.breaking.length} breaking
                                    </span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Changes Content */}
                <div className="px-4 space-y-3">
                    <ChangeGroup type="breaking" changes={groupedChanges.breaking} />
                    <ChangeGroup type="feature" changes={groupedChanges.feature} />
                    <ChangeGroup type="improvement" changes={groupedChanges.improvement} />
                    <ChangeGroup type="bugfix" changes={groupedChanges.bugfix} />
                </div>

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="px-4 pt-8 pb-4"
                >
                    <a
                        href="https://github.com/LettuceAI/mobile-app"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            "flex items-center justify-center gap-2 w-full py-3 rounded-xl",
                            "bg-white/3 border border-white/6",
                            "hover:bg-white/6 hover:border-white/10",
                            "transition-all duration-200 group"
                        )}
                    >
                        <span className="text-sm text-white/50 group-hover:text-white/70 transition-colors">
                            Follow development on GitHub
                        </span>
                        <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
                    </a>
                </motion.div>
            </main>

            {/* Version Selector Bottom Menu */}
            <BottomMenu
                isOpen={showVersionMenu}
                onClose={() => setShowVersionMenu(false)}
                title="Version History"
            >
                <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
                    {changelog.map((entry, idx) => {
                        const isSelected = selectedVersion === entry.version;
                        const featureCount = entry.changes.filter(c => c.type === 'feature').length;
                        const improvementCount = entry.changes.filter(c => c.type === 'improvement').length;
                        const bugfixCount = entry.changes.filter(c => c.type === 'bugfix').length;
                        const breakingCount = entry.changes.filter(c => c.type === 'breaking').length;

                        return (
                            <button
                                key={entry.version}
                                onClick={() => {
                                    setSelectedVersion(entry.version);
                                    setShowVersionMenu(false);
                                }}
                                className={cn(
                                    "group relative flex w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200",
                                    isSelected
                                        ? "bg-emerald-500/10 border border-emerald-500/30"
                                        : "bg-white/2 border border-white/4 hover:bg-white/5 hover:border-white/8"
                                )}
                            >
                                {/* Timeline dot */}
                                <div className="flex flex-col items-center pt-1.5">
                                    <div className={cn(
                                        "w-2.5 h-2.5 rounded-full",
                                        isSelected ? "bg-emerald-400" : "bg-white/20"
                                    )} />
                                    {idx < changelog.length - 1 && (
                                        <div className={cn(
                                            "w-px flex-1 mt-2 min-h-5",
                                            "bg-linear-to-b",
                                            isSelected ? "from-emerald-400/40 to-transparent" : "from-white/10 to-transparent"
                                        )} />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={cn(
                                            "text-base font-bold",
                                            isSelected ? "text-emerald-200" : "text-white"
                                        )}>
                                            v{entry.version}
                                        </span>
                                        {idx === 0 && (
                                            <span className={cn(
                                                "px-1.5 rounded text-[9px] font-bold uppercase",
                                                "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                            )}>
                                                Latest
                                            </span>
                                        )}
                                    </div>

                                    <div className={cn(
                                        "text-[11px] mb-2",
                                        isSelected ? "text-emerald-300/60" : "text-white/40"
                                    )}>
                                        {formatDate(entry.date)}
                                    </div>

                                    {/* Mini stats */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {featureCount > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] text-emerald-300/70">
                                                <Sparkles className="w-3 h-3" />{featureCount}
                                            </span>
                                        )}
                                        {improvementCount > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] text-blue-300/70">
                                                <Zap className="w-3 h-3" />{improvementCount}
                                            </span>
                                        )}
                                        {bugfixCount > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] text-amber-300/70">
                                                <Bug className="w-3 h-3" />{bugfixCount}
                                            </span>
                                        )}
                                        {breakingCount > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] text-red-300/70">
                                                <AlertTriangle className="w-3 h-3" />{breakingCount}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {isSelected && (
                                    <div className="pt-1">
                                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                        </div>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </BottomMenu>
        </div>
    );
}
