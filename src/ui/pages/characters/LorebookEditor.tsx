import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, useLocation } from "react-router-dom";
import { BookOpen, Trash2, ChevronRight, Star, Edit2, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Lorebook, LorebookEntry } from "../../../core/storage/schemas";
import {
  deleteLorebook,
  createBlankLorebookEntry,
  deleteLorebookEntry,
  listCharacterLorebooks,
  listLorebooks,
  listLorebookEntries,
  saveLorebook,
  saveLorebookEntry,
  setCharacterLorebooks,
} from "../../../core/storage/repo";
import { BottomMenu, MenuButton } from "../../components";
import { TopNav } from "../../components/App";


function LorebookListView({
  lorebooks,
  assignedLorebookIds,
  loading,
  onSelectLorebook,
  onToggleAssignment,
  onCreateLorebook,
}: {
  lorebooks: Lorebook[];
  assignedLorebookIds: Set<string>;
  loading: boolean;
  onSelectLorebook: (id: string) => void;
  onToggleAssignment: (id: string, enabled: boolean) => void;
  onCreateLorebook: (name: string) => void;
}) {
  const [selectedLorebook, setSelectedLorebook] = useState<Lorebook | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [newName, setNewName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Listen for add event from TopNav
  useEffect(() => {
    const handleAdd = () => setShowCreateMenu(true);
    window.addEventListener("lorebook:add", handleAdd);
    return () => window.removeEventListener("lorebook:add", handleAdd);
  }, []);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateLorebook(newName.trim());
    setNewName("");
    setShowCreateMenu(false);
  };

  const filteredLorebooks = useMemo(() => {
    if (!searchQuery.trim()) return lorebooks;
    const query = searchQuery.toLowerCase();
    return lorebooks.filter(l => l.name.toLowerCase().includes(query));
  }, [lorebooks, searchQuery]);

  // Empty state
  const EmptyState = () => (
    <div className="flex h-64 flex-col items-center justify-center">
      <BookOpen className="mb-3 h-12 w-12 text-white/20" />
      <h3 className="mb-1 text-lg font-medium text-white">No lorebooks yet</h3>
      <p className="mb-4 text-center text-sm text-white/50">
        Create a lorebook to add world lore for this character
      </p>
      <button
        onClick={() => setShowCreateMenu(true)}
        className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/30"
      >
        Create Lorebook
      </button>
    </div>
  );

  // Skeleton
  const Skeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-[#0b0c12]/90 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      {/* Search Bar */}
      {lorebooks.length > 0 && (
        <div className="px-4 pb-2 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search lorebooks..."
              className="w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-4 py-2 text-sm text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 pt-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-4"
        >
          {/* Lorebook List */}
          {loading ? (
            <Skeleton />
          ) : lorebooks.length === 0 ? (
            <EmptyState />
          ) : filteredLorebooks.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-white/50">
              <p>No matching lorebooks found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Assigned Indicator - Only show if not filtering or if filtered list contains assigned ones */}
              {!searchQuery && Array.from(assignedLorebookIds).length > 0 && (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 fill-emerald-400 text-emerald-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-emerald-200">Active Lorebooks</div>
                      <div className="text-xs text-emerald-300/70">
                        {assignedLorebookIds.size} enabled for this character
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Lorebook Items */}
              <AnimatePresence>
                {filteredLorebooks.map((lorebook) => {
                  const isAssigned = assignedLorebookIds.has(lorebook.id);
                  return (
                    <motion.button
                      key={lorebook.id}
                      onClick={() => setSelectedLorebook(lorebook)}
                      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.995] ${isAssigned
                        ? "border-emerald-400/40 bg-emerald-400/10 hover:border-emerald-400/60 hover:bg-emerald-400/15"
                        : "border-white/10 bg-[#0b0c12]/90 hover:border-white/25 hover:bg-[#0c0d13]/95"
                        }`}
                    >
                      {/* Icon */}
                      <div
                        className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${isAssigned
                          ? "border-emerald-400/40 bg-emerald-400/20"
                          : "border-white/15 bg-white/8"
                          }`}
                      >
                        <BookOpen
                          className={`h-5 w-5 ${isAssigned ? "text-emerald-200" : "text-white/70"
                            }`}
                        />
                      </div>

                      {/* Content */}
                      <div className="relative min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {lorebook.name}
                          </h3>
                          {isAssigned && (
                            <Star className="h-3 w-3 shrink-0 fill-emerald-400 text-emerald-400" />
                          )}
                        </div>
                        <p className="line-clamp-1 text-xs text-gray-400">
                          {isAssigned ? "Enabled for this character" : "Tap to view entries"}
                        </p>
                      </div>

                      {/* Chevron */}
                      <span
                        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${isAssigned
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 group-hover:border-emerald-400/50"
                          : "border-white/10 bg-white/5 text-white/70 group-hover:border-white/25 group-hover:text-white"
                          }`}
                      >
                        <ChevronRight size={16} />
                      </span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </main>

      {/* Create Lorebook Menu */}
      <BottomMenu
        isOpen={showCreateMenu}
        onClose={() => {
          setShowCreateMenu(false);
          setNewName("");
        }}
        title="New Lorebook"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">NAME</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Enter lorebook name..."
              autoFocus
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">
              Lorebooks contain lore entries that are injected into prompts when keywords match.
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="w-full rounded-xl border border-emerald-400/40 bg-emerald-400/20 px-4 py-3.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Lorebook
          </button>
        </div>
      </BottomMenu>

      {/* Lorebook Actions Menu */}
      <BottomMenu
        isOpen={Boolean(selectedLorebook)}
        onClose={() => setSelectedLorebook(null)}
        title={selectedLorebook?.name || ""}
      >
        {selectedLorebook && (
          <div className="space-y-2">
            <MenuButton
              icon={Edit2}
              title="View Entries"
              description="Edit lorebook entries"
              color="from-blue-500 to-blue-600"
              onClick={() => {
                onSelectLorebook(selectedLorebook.id);
                setSelectedLorebook(null);
              }}
            />

            <MenuButton
              icon={Star}
              title={assignedLorebookIds.has(selectedLorebook.id) ? "Disable for Character" : "Enable for Character"}
              description={
                assignedLorebookIds.has(selectedLorebook.id)
                  ? "Remove from this character's active lorebooks"
                  : "Add to this character's active lorebooks"
              }
              color="from-emerald-500 to-emerald-600"
              onClick={() => {
                const isAssigned = assignedLorebookIds.has(selectedLorebook.id);
                onToggleAssignment(selectedLorebook.id, !isAssigned);
                setSelectedLorebook(null);
              }}
            />

            <button
              onClick={() => {
                if (confirm("Delete this lorebook? All entries will be lost.")) {
                  deleteLorebook(selectedLorebook.id).then(() => {
                    window.location.reload();
                  });
                }
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left transition hover:border-red-500/50 hover:bg-red-500/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-300">Delete Lorebook</span>
            </button>
          </div>
        )}
      </BottomMenu>
    </div>
  );
}

// ============================================================================
// ENTRY LIST VIEW
// ============================================================================

function EntryListView({
  entries,
  loading,
  onCreateEntry,
  onEditEntry,
  onToggleEntry,
}: {
  entries: LorebookEntry[];
  loading: boolean;
  onCreateEntry: () => void;
  onEditEntry: (entry: LorebookEntry) => void;
  onToggleEntry: (entry: LorebookEntry, enabled: boolean) => void;
}) {
  const [selectedEntry, setSelectedEntry] = useState<LorebookEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Listen for add event from TopNav
  useEffect(() => {
    const handleAdd = () => onCreateEntry(); // Direct creation since we don't have a menu
    window.addEventListener("lorebook:add", handleAdd);
    return () => window.removeEventListener("lorebook:add", handleAdd);
  }, [onCreateEntry]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const query = searchQuery.toLowerCase();
    return entries.filter(e => {
      const title = e.title?.toLowerCase() || "";
      const content = e.content?.toLowerCase() || "";
      const keywords = e.keywords.map(k => k.toLowerCase()).join(" ");
      return title.includes(query) || content.includes(query) || keywords.includes(query);
    });
  }, [entries, searchQuery]);

  // Empty state
  const EmptyState = () => (
    <div className="flex h-64 flex-col items-center justify-center">
      <BookOpen className="mb-3 h-12 w-12 text-white/20" />
      <h3 className="mb-1 text-lg font-medium text-white">No entries yet</h3>
      <p className="mb-4 text-center text-sm text-white/50">
        Add entries to inject lore into your chats
      </p>
      <button
        onClick={onCreateEntry}
        className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/30"
      >
        Create Entry
      </button>
    </div>
  );

  // Skeleton
  const Skeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-[#0b0c12]/90 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-48 animate-pulse rounded bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      {/* Header Actions - Replaced by TopNav for navigation + Create button */}
      {/* We keep Search bar here */}
      {entries.length > 0 && (
        <div className="px-4 pb-2 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entries..."
              className="w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-4 py-2 text-sm text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 pt-2">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="space-y-4"
        >
          {/* Entry List */}
          {loading ? (
            <Skeleton />
          ) : entries.length === 0 ? (
            <EmptyState />
          ) : filteredEntries.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-white/50">
              <p>No matching entries found</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredEntries.map((entry) => {
                  const displayTitle = entry.title?.trim() || entry.keywords[0] || "Untitled Entry";
                  const displaySubtitle = entry.alwaysActive
                    ? "Always active"
                    : entry.keywords.length > 0
                      ? entry.keywords.slice(0, 3).join(", ") + (entry.keywords.length > 3 ? "..." : "")
                      : "No keywords";

                  return (
                    <motion.button
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.995] ${entry.enabled
                        ? "border-white/10 bg-[#0b0c12]/90 hover:border-white/25 hover:bg-[#0c0d13]/95"
                        : "border-white/10 bg-[#0b0c12]/60 opacity-60 hover:opacity-80"
                        }`}
                    >
                      {/* Enable indicator */}
                      <div
                        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${entry.enabled
                          ? entry.alwaysActive
                            ? "border-blue-400/40 bg-blue-400/20"
                            : "border-emerald-400/40 bg-emerald-400/20"
                          : "border-white/10 bg-white/5"
                          }`}
                      >
                        <BookOpen
                          className={`h-5 w-5 ${entry.enabled
                            ? entry.alwaysActive
                              ? "text-blue-200"
                              : "text-emerald-200"
                            : "text-white/40"
                            }`}
                        />
                      </div>

                      {/* Content */}
                      <div className="relative min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-white">{displayTitle}</h3>
                          {!entry.enabled && (
                            <span className="text-[10px] uppercase tracking-wide text-white/40">
                              Disabled
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-1 text-xs text-gray-400">{displaySubtitle}</p>
                      </div>

                      {/* Chevron */}
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 group-hover:border-white/25 group-hover:text-white transition">
                        <ChevronRight size={16} />
                      </span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </main>

      {/* Entry Actions Menu */}
      <BottomMenu
        isOpen={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={selectedEntry?.title || selectedEntry?.keywords[0] || "Entry"}
      >
        {selectedEntry && (
          <div className="space-y-2">
            <MenuButton
              icon={Edit2}
              title="Edit Entry"
              description="Modify title, keywords, and content"
              color="from-blue-500 to-blue-600"
              onClick={() => {
                onEditEntry(selectedEntry);
                setSelectedEntry(null);
              }}
            />

            <MenuButton
              icon={Star}
              title={selectedEntry.enabled ? "Disable Entry" : "Enable Entry"}
              description={selectedEntry.enabled ? "Entry won't be injected into prompts" : "Entry will be injected when keywords match"}
              color="from-emerald-500 to-emerald-600"
              onClick={() => {
                onToggleEntry(selectedEntry, !selectedEntry.enabled);
                setSelectedEntry(null);
              }}
            />

            <button
              onClick={() => {
                if (confirm("Delete this entry?")) {
                  deleteLorebookEntry(selectedEntry.id).then(() => {
                    window.location.reload();
                  });
                }
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left transition hover:border-red-500/50 hover:bg-red-500/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-300">Delete Entry</span>
            </button>
          </div>
        )}
      </BottomMenu>
    </div>
  );
}

// ============================================================================
// ENTRY EDITOR (Bottom Menu)
// ============================================================================

function EntryEditorMenu({
  entry,
  isOpen,
  onClose,
  onSave,
}: {
  entry: LorebookEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: LorebookEntry) => void;
}) {
  const [draft, setDraft] = useState<LorebookEntry | null>(null);

  useEffect(() => {
    if (entry) {
      setDraft({ ...entry });
    }
  }, [entry]);

  if (!draft) return null;

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <BottomMenu isOpen={isOpen} onClose={onClose} title="Edit Entry">
      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-white/70">TITLE</label>
          <input
            value={draft.title || ""}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Name this entry..."
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
          />
        </div>

        {/* Toggles */}
        <div className="flex gap-3">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#0b0c12]/90 p-3 flex-1">
            <div>
              <label className="block text-sm font-semibold text-white">Enabled</label>
              <p className="mt-0.5 text-xs text-gray-400">Include in prompts</p>
            </div>
            <label
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ${draft.enabled ? "bg-emerald-500 shadow-lg shadow-emerald-500/30" : "bg-white/20"
                }`}
            >
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="sr-only"
              />
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${draft.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
              />
            </label>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#0b0c12]/90 p-3 flex-1">
            <div>
              <label className="block text-sm font-semibold text-white">Always On</label>
              <p className="mt-0.5 text-xs text-gray-400">No keywords needed</p>
            </div>
            <label
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ${draft.alwaysActive ? "bg-blue-500 shadow-lg shadow-blue-500/30" : "bg-white/20"
                }`}
            >
              <input
                type="checkbox"
                checked={draft.alwaysActive}
                onChange={(e) => setDraft({ ...draft, alwaysActive: e.target.checked })}
                className="sr-only"
              />
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${draft.alwaysActive ? "translate-x-5" : "translate-x-0"
                  }`}
              />
            </label>
          </div>
        </div>

        {/* Keywords */}
        {!draft.alwaysActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-white/70">KEYWORDS</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">Case sensitive</span>
                <label
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ${draft.caseSensitive ? "bg-emerald-500" : "bg-white/20"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={draft.caseSensitive}
                    onChange={(e) => setDraft({ ...draft, caseSensitive: e.target.checked })}
                    className="sr-only"
                  />
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${draft.caseSensitive ? "translate-x-4" : "translate-x-0"
                      }`}
                  />
                </label>
              </div>
            </div>
            <input
              value={draft.keywords.join(", ")}
              onChange={(e) => {
                const keywords = e.target.value.split(",").map((k) => k.trim()).filter(Boolean);
                setDraft({ ...draft, keywords });
              }}
              placeholder="dragon, castle, magic sword"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/50">Comma separated. Content injected when any keyword appears.</p>
          </div>
        )}

        {/* Content */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-white/70">CONTENT</label>
          <textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            placeholder="Write the lore context here..."
            rows={8}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 transition focus:border-white/30 focus:outline-none"
          />
        </div>

        {/* Priority */}
        <div className="space-y-2 w-32">
          <label className="text-[11px] font-medium text-white/70">PRIORITY</label>
          <input
            type="number"
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value) || 0 })}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white transition focus:border-white/30 focus:outline-none"
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={!draft.title?.trim() && !draft.content?.trim()}
          className="w-full rounded-xl border border-emerald-400/40 bg-emerald-400/20 px-4 py-3.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Entry
        </button>
      </div>
    </BottomMenu>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LorebookEditor() {
  const { characterId: characterIdParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const characterId = characterIdParam ?? searchParams.get("characterId");

  // View state via URL
  const activeLorebookId = searchParams.get("lorebookId");

  const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
  const [assignedLorebookIds, setAssignedLorebookIds] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<LorebookEntry[]>([]);

  const [isLorebooksLoading, setIsLorebooksLoading] = useState(true);
  const [isEntriesLoading, setIsEntriesLoading] = useState(false);

  // Entry editor state
  const [editingEntry, setEditingEntry] = useState<LorebookEntry | null>(null);

  const activeLorebook = useMemo(
    () => lorebooks.find((l) => l.id === activeLorebookId) ?? null,
    [lorebooks, activeLorebookId]
  );

  // Determine page title
  const pageTitle = activeLorebook ? `Lorebook - ${activeLorebook.name}` : undefined;

  // Load lorebooks
  useEffect(() => {
    if (!characterId) return;
    loadLorebooks();
  }, [characterId]);

  // Load entries when viewing a lorebook
  useEffect(() => {
    if (!activeLorebookId) {
      setEntries([]);
      return;
    }
    loadEntries(activeLorebookId);
  }, [activeLorebookId]);

  const loadLorebooks = async () => {
    if (!characterId) return;
    try {
      setIsLorebooksLoading(true);
      const [allLorebooks, characterLorebooks] = await Promise.all([
        listLorebooks(),
        listCharacterLorebooks(characterId),
      ]);
      setLorebooks(allLorebooks);
      setAssignedLorebookIds(new Set(characterLorebooks.map((l) => l.id)));
    } catch (error) {
      console.error("Failed to load lorebooks:", error);
    } finally {
      setIsLorebooksLoading(false);
    }
  };

  const loadEntries = async (lorebookId: string) => {
    try {
      setIsEntriesLoading(true);
      const data = await listLorebookEntries(lorebookId);
      setEntries(data);
    } catch (error) {
      console.error("Failed to load entries:", error);
    } finally {
      setIsEntriesLoading(false);
    }
  };

  const handleCreateLorebook = async (name: string) => {
    if (!characterId) return;
    try {
      const created = await saveLorebook({ name });
      setLorebooks((prev) => [created, ...prev]);
      // Auto-assign
      const next = new Set(assignedLorebookIds);
      next.add(created.id);
      setAssignedLorebookIds(next);
      await setCharacterLorebooks(characterId, Array.from(next));
      // Navigate to it
      setSearchParams({ lorebookId: created.id });
    } catch (error) {
      console.error("Failed to create lorebook:", error);
    }
  };

  const handleToggleAssignment = async (lorebookId: string, enabled: boolean) => {
    if (!characterId) return;
    const next = new Set(assignedLorebookIds);
    if (enabled) next.add(lorebookId);
    else next.delete(lorebookId);
    setAssignedLorebookIds(next);
    await setCharacterLorebooks(characterId, Array.from(next));
  };

  const handleSelectLorebook = (lorebookId: string) => {
    setSearchParams({ lorebookId });
  };

  const handleCreateEntry = async () => {
    if (!activeLorebookId) return;
    try {
      const newEntry = await createBlankLorebookEntry(activeLorebookId);
      setEntries((prev) => [...prev, newEntry]);
      setEditingEntry(newEntry);
    } catch (error) {
      console.error("Failed to create entry:", error);
    }
  };

  const handleSaveEntry = async (entry: LorebookEntry) => {
    try {
      const saved = await saveLorebookEntry(entry);
      setEntries((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
    } catch (error) {
      console.error("Failed to save entry:", error);
    }
  };

  const handleToggleEntry = async (entry: LorebookEntry, enabled: boolean) => {
    try {
      const updated = { ...entry, enabled };
      await saveLorebookEntry(updated);
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, enabled } : e)));
    } catch (error) {
      console.error("Failed to toggle entry:", error);
    }
  };



  if (!characterId) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        No character ID provided
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black">
      <TopNav
        currentPath={location.pathname + location.search}
        titleOverride={pageTitle}
      />
      <div className="flex-1 overflow-hidden">
        {activeLorebookId && activeLorebook ? (
          <>
            <EntryListView
              entries={entries}
              loading={isEntriesLoading}
              onCreateEntry={handleCreateEntry}
              onEditEntry={setEditingEntry}
              onToggleEntry={handleToggleEntry}
            />
            <EntryEditorMenu
              entry={editingEntry}
              isOpen={Boolean(editingEntry)}
              onClose={() => setEditingEntry(null)}
              onSave={handleSaveEntry}
            />
          </>
        ) : (
          <LorebookListView
            lorebooks={lorebooks}
            assignedLorebookIds={assignedLorebookIds}
            loading={isLorebooksLoading}
            onSelectLorebook={handleSelectLorebook}
            onToggleAssignment={handleToggleAssignment}
            onCreateLorebook={handleCreateLorebook}
          />
        )}
      </div>
    </div>
  );
}
