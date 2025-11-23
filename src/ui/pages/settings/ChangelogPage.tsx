import { motion } from "framer-motion";
import { cn, typography, spacing } from "../../design-tokens";
import { useState, useEffect } from "react";
import { BottomMenu } from "../../components";

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
        color: "text-emerald-300",
        bg: "bg-emerald-400/10",
        border: "border-emerald-400/30"
    },
    improvement: {
        label: "Improved",
        color: "text-blue-300",
        bg: "bg-blue-400/10",
        border: "border-blue-400/30"
    },
    bugfix: {
        label: "Fixed",
        color: "text-orange-300",
        bg: "bg-orange-400/10",
        border: "border-orange-400/30"
    },
    breaking: {
        label: "Breaking",
        color: "text-red-300",
        bg: "bg-red-400/10",
        border: "border-red-400/30"
    }
};

export function ChangelogPage() {
    const [selectedVersion, setSelectedVersion] = useState<string>(changelog[0].version);
    const [showVersionMenu, setShowVersionMenu] = useState(false);

    const selectedEntry = changelog.find(entry => entry.version === selectedVersion) || changelog[0];

    const sortedChanges = [...selectedEntry.changes].sort((a, b) => {
        const order = { breaking: 0, feature: 1, bugfix: 2, improvement: 3 };
        return order[a.type] - order[b.type];
    });

    useEffect(() => {
        const handleOpenVersionSelector = () => {
            setShowVersionMenu(true);
        };

        window.addEventListener("changelog:openVersionSelector", handleOpenVersionSelector);
        return () => {
            window.removeEventListener("changelog:openVersionSelector", handleOpenVersionSelector);
        };
    }, []);

    return (
        <div className="flex h-full flex-col pb-16 text-gray-200">
            <main className="flex-1 overflow-y-auto px-4 pt-4">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={spacing.section}
                >
                    {/* Version Header with Filter Button */}
                    <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-baseline gap-3">
                            <h2 className={cn(
                                typography.h1.size,
                                typography.h1.weight,
                                "text-white"
                            )}>
                                v{selectedEntry.version}
                            </h2>
                            <span className={cn(
                                typography.caption.size,
                                "text-white/40"
                            )}>
                                {new Date(selectedEntry.date).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </span>
                        </div>

                        {/* Filter button removed - now in TopNav */}
                    </div>

                    {/* Changes List */}
                    <div className="space-y-3">
                        {sortedChanges.map((change, changeIndex) => {
                            const config = typeConfig[change.type];
                            return (
                                <div
                                    key={changeIndex}
                                    className={cn(
                                        "relative overflow-hidden rounded-2xl border px-5 py-4",
                                        config.border,
                                        config.bg
                                    )}
                                >
                                    <div className="flex flex-col items-start gap-2">
                                        <span className={cn(
                                            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                                            config.color,
                                            "bg-black/20"
                                        )}>
                                            {config.label}
                                        </span>
                                        <p className={cn(
                                            typography.body.size,
                                            "text-white/90 leading-relaxed pt-0.5"
                                        )}>
                                            {change.description}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className={cn(
                        "mt-8 rounded-xl border border-white/10 bg-white/5 px-4 py-3",
                        "text-center"
                    )}>
                        <p className={cn(
                            typography.caption.size,
                            "text-white/50"
                        )}>
                            Follow development on{" "}
                            <a
                                href="https://github.com/LettuceAI/mobile-app"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 transition-colors underline"
                            >
                                GitHub
                            </a>
                        </p>
                    </div>
                </motion.div>
            </main>

            {/* Version Selector Bottom Menu */}
            <BottomMenu
                isOpen={showVersionMenu}
                onClose={() => setShowVersionMenu(false)}
                title="Version History"
            >
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {changelog.map((entry) => {
                        const isSelected = selectedVersion === entry.version;
                        const featureCount = entry.changes.filter(c => c.type === 'feature').length;
                        const improvementCount = entry.changes.filter(c => c.type === 'improvement').length;
                        const bugfixCount = entry.changes.filter(c => c.type === 'bugfix').length;

                        return (
                            <button
                                key={entry.version}
                                onClick={() => {
                                    setSelectedVersion(entry.version);
                                    setShowVersionMenu(false);
                                }}
                                className={cn(
                                    "group flex w-full flex-col rounded-xl border px-4 py-3 text-left transition",
                                    isSelected
                                        ? "border-emerald-400/40 bg-emerald-400/10"
                                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 active:scale-[0.99]"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-baseline gap-2">
                                        <span className={cn(
                                            typography.h3.size,
                                            typography.h3.weight,
                                            isSelected ? "text-emerald-200" : "text-white"
                                        )}>
                                            v{entry.version}
                                        </span>
                                        {isSelected && (
                                            <span className={cn(
                                                typography.caption.size,
                                                "px-1.5 py-0.5 rounded",
                                                "bg-emerald-400/20 text-emerald-300",
                                                "border border-emerald-400/30"
                                            )}>
                                                Current
                                            </span>
                                        )}
                                    </div>
                                    <span className={cn(
                                        typography.caption.size,
                                        isSelected ? "text-emerald-300/70" : "text-white/50"
                                    )}>
                                        {new Date(entry.date).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                    </span>
                                </div>

                                <p className={cn(
                                    typography.caption.size,
                                    isSelected ? "text-emerald-200/60" : "text-white/40"
                                )}>
                                    {featureCount > 0 && `${featureCount} new`}
                                    {featureCount > 0 && (improvementCount > 0 || bugfixCount > 0) && " · "}
                                    {improvementCount > 0 && `${improvementCount} improved`}
                                    {improvementCount > 0 && bugfixCount > 0 && " · "}
                                    {bugfixCount > 0 && `${bugfixCount} fixed`}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </BottomMenu>
        </div>
    );
}
