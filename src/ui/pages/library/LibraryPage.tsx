import { useEffect, useState, memo } from "react";
import { motion } from "framer-motion";
import {
  listCharacters,
  listPersonas,
  deleteCharacter,
  deletePersona,
  createSession,
  listLorebooks,
  deleteLorebook,
  saveLorebook,
} from "../../../core/storage/repo";
import type { Character, Persona, Lorebook } from "../../../core/storage/schemas";
import { typography, interactive, cn } from "../../design-tokens";
import { useAvatar } from "../../hooks/useAvatar";
import { useAvatarGradient } from "../../hooks/useAvatarGradient";
import { useNavigate } from "react-router-dom";
import { BottomMenu, CharacterExportMenu } from "../../components";
import {
  MessageCircle,
  Edit2,
  Trash2,
  Download,
  Check,
  BookOpen,
  Users,
  Pencil,
} from "lucide-react";
import {
  exportCharacterWithFormat,
  downloadJson,
  generateExportFilenameWithFormat,
  type CharacterFileFormat,
} from "../../../core/storage/characterTransfer";
import { exportPersona, generateExportFilename } from "../../../core/storage/personaTransfer";
import { listen } from "@tauri-apps/api/event";

type FilterOption = "All" | "Characters" | "Personas" | "Lorebooks";
type LibraryItem = (Character | Persona | Lorebook) & {
  itemType: "character" | "persona" | "lorebook";
};

function getItemName(item: LibraryItem): string {
  if (item.itemType === "character") return (item as Character).name;
  if (item.itemType === "persona") return (item as Persona).title;
  return (item as Lorebook).name;
}

function getItemDisableGradient(item: LibraryItem): boolean | undefined {
  return item.itemType === "character" ? (item as Character).disableAvatarGradient : undefined;
}

export function LibraryPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
  const [filter, setFilter] = useState<FilterOption>("All");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<LibraryItem | null>(null);

  // Rename state
  const [renameItem, setRenameItem] = useState<LibraryItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [chars, pers, lbs] = await Promise.all([
        listCharacters(),
        listPersonas(),
        listLorebooks(),
      ]);
      setCharacters(chars);
      setPersonas(pers);
      setLorebooks(lbs);
    } catch (error) {
      console.error("Failed to load library data:", error);
    }
  };

  useEffect(() => {
    loadData();
    const unlisten = listen("database-reloaded", () => {
      console.log("Database reloaded, refreshing library data...");
      loadData();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const handleOpenFilter = () => setShowFilterMenu(true);
    window.addEventListener("library:openFilter", handleOpenFilter);
    return () => window.removeEventListener("library:openFilter", handleOpenFilter);
  }, []);

  const handleRenameConfirm = async () => {
    if (!renameItem || !renameName.trim()) return;

    try {
      setRenaming(true);
      // Only lorebooks can be renamed this way for now
      if (renameItem.itemType === "lorebook") {
        await saveLorebook({ id: renameItem.id, name: renameName.trim() });
      }
      setRenameItem(null);
      setRenameName("");
      await loadData(); // Reload
    } catch (error) {
      console.error("Failed to rename:", error);
    } finally {
      setRenaming(false);
    }
  };

  const handleSelect = (item: LibraryItem) => {
    setSelectedItem(item);
  };

  const handleStartChat = async () => {
    if (selectedItem && selectedItem.itemType === "character") {
      const sceneId =
        (selectedItem as Character).defaultSceneId || (selectedItem as Character).scenes?.[0]?.id;
      const session = await createSession(
        selectedItem.id,
        `Chat with ${getItemName(selectedItem)}`,
        sceneId,
      );

      navigate(`/chat/${selectedItem.id}?sessionId=${session.id}`);
      setSelectedItem(null);
    }
  };

  const handleEdit = () => {
    if (selectedItem) {
      if (selectedItem.itemType === "character") {
        navigate(`/settings/characters/${selectedItem.id}/edit`);
      } else if (selectedItem.itemType === "persona") {
        navigate(`/settings/personas/${selectedItem.id}/edit`);
      } else {
        navigate(`/library/lorebooks/${selectedItem.id}`);
      }
      setSelectedItem(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    try {
      setDeleting(true);
      if (selectedItem.itemType === "character") {
        await deleteCharacter(selectedItem.id);
        const list = await listCharacters();
        setCharacters(list);
      } else if (selectedItem.itemType === "persona") {
        await deletePersona(selectedItem.id);
        const list = await listPersonas();
        setPersonas(list);
      } else {
        await deleteLorebook(selectedItem.id);
        const list = await listLorebooks();
        setLorebooks(list);
      }
      setShowDeleteConfirm(false);
      setSelectedItem(null);
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    if (!selectedItem || selectedItem.itemType !== "character") return;
    setExportTarget(selectedItem);
    setSelectedItem(null);
    setExportMenuOpen(true);
  };

  const handlePersonaExport = async () => {
    if (!selectedItem || selectedItem.itemType !== "persona") return;
    try {
      setExporting(true);
      const exportJson = await exportPersona(selectedItem.id);
      const filename = generateExportFilename(getItemName(selectedItem));
      await downloadJson(exportJson, filename);
      setSelectedItem(null);
    } catch (err) {
      console.error("Failed to export persona:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleExportFormat = async (format: CharacterFileFormat) => {
    if (!exportTarget || exportTarget.itemType !== "character") return;
    try {
      setExporting(true);
      const exportJson = await exportCharacterWithFormat(exportTarget.id, format);
      const filename = generateExportFilenameWithFormat(getItemName(exportTarget), format);
      await downloadJson(exportJson, filename);
    } catch (err) {
      console.error("Failed to export character:", err);
    } finally {
      setExporting(false);
      setExportMenuOpen(false);
      setExportTarget(null);
    }
  };

  const allItems: LibraryItem[] = [
    ...characters.map((c) => ({ ...c, itemType: "character" as const })),
    ...personas.map((p) => ({ ...p, itemType: "persona" as const })),
    ...lorebooks.map((l) => ({ ...l, itemType: "lorebook" as const })),
  ];

  const filteredItems = allItems.filter((item) => {
    if (filter === "All") return true;
    if (filter === "Characters") return item.itemType === "character";
    if (filter === "Personas") return item.itemType === "persona";
    if (filter === "Lorebooks") return item.itemType === "lorebook";
    return false;
  });

  return (
    <div className="flex h-full flex-col pb-6 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        {filteredItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-1 flex-col items-center justify-center px-6 py-20"
          >
            <div className="relative mb-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <BookOpen className="h-10 w-10 text-white/30" />
              </div>
            </div>
            <h3
              className={cn(
                typography.heading.size,
                typography.heading.weight,
                typography.heading.lineHeight,
                "mb-2 text-center text-white/80",
              )}
            >
              {filter === "All"
                ? "Your library is empty"
                : filter === "Characters"
                  ? "No characters yet"
                  : filter === "Personas"
                    ? "No personas yet"
                    : "No lorebooks yet"}
            </h3>
            <p className="mb-6 max-w-70 text-center text-sm text-white/50">
              {filter === "All"
                ? "Create characters, personas, and lorebooks to see them here"
                : filter === "Characters"
                  ? "Create your first character to start chatting"
                  : filter === "Personas"
                    ? "Create a persona to customize your chat identity"
                    : "Lorebooks are created from within a character's settings"}
            </p>
            {filter !== "Lorebooks" && (
              <button
                onClick={() =>
                  navigate(filter === "Personas" ? "/personas/create" : "/characters/create")
                }
                className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/20 px-5 py-2.5 text-sm font-medium text-emerald-100 transition active:scale-95 active:bg-emerald-400/30"
              >
                <Users className="h-4 w-4" />
                {filter === "Personas" ? "Create Persona" : "Create Character"}
              </button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-24">
            {filteredItems.map((item) => (
              <LibraryCard
                key={`${item.itemType}-${item.id}`}
                item={item}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </main>

      {/* Filter Menu */}
      <BottomMenu
        isOpen={showFilterMenu}
        onClose={() => setShowFilterMenu(false)}
        title="Filter Library"
      >
        <div className="space-y-2">
          {(["All", "Characters", "Personas", "Lorebooks"] as FilterOption[]).map((option) => (
            <button
              key={option}
              onClick={() => {
                setFilter(option);
                setShowFilterMenu(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition",
                filter === option
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <span className="text-sm font-medium">{option}</span>
              {filter === option && <Check className="h-4 w-4 text-emerald-400" />}
            </button>
          ))}
        </div>
      </BottomMenu>

      {/* Item Actions Menu */}
      <BottomMenu
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? getItemName(selectedItem) : ""}
      >
        {selectedItem && (
          <div className="space-y-2">
            {selectedItem.itemType === "character" && (
              <button
                onClick={handleStartChat}
                className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/20"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/20">
                  <MessageCircle className="h-4 w-4 text-emerald-400" />
                </div>
                <span className="text-sm font-medium text-emerald-100">Start Chat</span>
              </button>
            )}

            <button
              onClick={handleEdit}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10">
                <Edit2 className="h-4 w-4 text-white/70" />
              </div>
              <span className="text-sm font-medium text-white">
                {selectedItem.itemType === "character"
                  ? "Edit Character"
                  : selectedItem.itemType === "persona"
                    ? "Edit Persona"
                    : "Edit Lorebook"}
              </span>
            </button>

            {selectedItem.itemType === "lorebook" && (
              <button
                onClick={() => {
                  setRenameItem(selectedItem);
                  setRenameName(getItemName(selectedItem));
                  setSelectedItem(null); // Close main menu
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10">
                  <Pencil className="h-4 w-4 text-white/70" />
                </div>
                <span className="text-sm font-medium text-white">Rename Lorebook</span>
              </button>
            )}

            {selectedItem.itemType === "character" && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex w-full items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-3 text-left transition hover:border-blue-400/50 hover:bg-blue-400/20 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/30 bg-blue-400/20">
                  <Download className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium text-blue-300">
                  {exporting ? "Exporting..." : "Export Character"}
                </span>
              </button>
            )}

            {selectedItem.itemType === "persona" && (
              <button
                onClick={handlePersonaExport}
                disabled={exporting}
                className="flex w-full items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-400/10 px-4 py-3 text-left transition hover:border-blue-400/50 hover:bg-blue-400/20 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/30 bg-blue-400/20">
                  <Download className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium text-blue-300">
                  {exporting ? "Exporting..." : "Export Persona"}
                </span>
              </button>
            )}

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left transition hover:border-red-500/50 hover:bg-red-500/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-red-500/30 bg-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-300">
                {selectedItem.itemType === "character"
                  ? "Delete Character"
                  : selectedItem.itemType === "persona"
                    ? "Delete Persona"
                    : "Delete Lorebook"}
              </span>
            </button>
          </div>
        )}
      </BottomMenu>

      <CharacterExportMenu
        isOpen={exportMenuOpen}
        onClose={() => {
          setExportMenuOpen(false);
          setExportTarget(null);
        }}
        onSelect={handleExportFormat}
        exporting={exporting}
      />

      {/* Delete Confirmation */}
      <BottomMenu
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={`Delete ${selectedItem?.itemType === "character" ? "Character" : selectedItem?.itemType === "persona" ? "Persona" : "Lorebook"}?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Are you sure you want to delete \"{selectedItem ? getItemName(selectedItem) : ""}\"?
            {selectedItem?.itemType === "character" &&
              " This will also delete all chat sessions with this character."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </BottomMenu>
      {/* Rename Menu */}
      <BottomMenu
        isOpen={Boolean(renameItem)}
        onClose={() => setRenameItem(null)}
        title="Rename Lorebook"
      >
        <div className="space-y-4">
          <input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="Enter new name..."
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-base text-white placeholder-white/40 transition focus:border-white/25 focus:outline-none"
            autoFocus
          />
          <div className="flex gap-3">
            <button
              onClick={() => setRenameItem(null)}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handleRenameConfirm}
              disabled={renaming || !renameName.trim()}
              className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/20 py-3 text-sm font-medium text-emerald-100 transition hover:border-emerald-500/50 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {renaming ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </BottomMenu>
    </div>
  );
}

function isImageLike(s?: string) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return (
    lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image")
  );
}

function getItemAvatarPath(item: LibraryItem): string | undefined {
  if (item.itemType === "lorebook") return undefined;
  return (item as Character | Persona).avatarPath;
}

function getItemDescription(item: LibraryItem): string {
  if (item.itemType === "lorebook") return "Lorebook";
  if (item.itemType === "character") {
    const character = item as Character;
    return (character.description || character.definition || "").trim() || "No description yet";
  }
  const persona = item as Persona;
  return persona.description.trim() || "No description yet";
}

const ItemAvatar = memo(({ item, className }: { item: LibraryItem; className?: string }) => {
  if (item.itemType === "lorebook") {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-linear-to-br from-amber-500/20 to-orange-600/30",
          className,
        )}
      >
        <BookOpen className="h-12 w-12 text-amber-300/80" />
      </div>
    );
  }

  const avatarPath = getItemAvatarPath(item);
  const avatarUrl = useAvatar(item.itemType as "character" | "persona", item.id, avatarPath);

  if (avatarUrl && isImageLike(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt={`${getItemName(item)} avatar`}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  const initials = getItemName(item).slice(0, 2).toUpperCase();
  return (
    <span
      className={cn("flex h-full w-full items-center justify-center text-4xl font-bold", className)}
    >
      {initials}
    </span>
  );
});

ItemAvatar.displayName = "ItemAvatar";

const LibraryCard = memo(
  ({ item, onSelect }: { item: LibraryItem; onSelect: (item: LibraryItem) => void }) => {
    const descriptionPreview = getItemDescription(item);
    const avatarPath = getItemAvatarPath(item);

    // Only use gradient for non-lorebook items
    const { gradientCss, hasGradient } = useAvatarGradient(
      item.itemType === "lorebook" ? "character" : (item.itemType as "character" | "persona"),
      item.id,
      avatarPath,
      getItemDisableGradient(item),
    );

    const badge =
      item.itemType === "character"
        ? { label: "Character", dotClass: "bg-sky-300" }
        : item.itemType === "persona"
          ? { label: "Persona", dotClass: "bg-violet-300" }
          : { label: "Lorebook", dotClass: "bg-amber-300" };

    return (
      <motion.button
        layoutId={`library-${item.itemType}-${item.id}`}
        onClick={() => onSelect(item)}
        className={cn(
          "group relative flex aspect-3/4 w-full flex-col justify-end overflow-hidden rounded-2xl text-left",
          "border border-white/10",
          interactive.active.scale,
        )}
        style={hasGradient && item.itemType !== "lorebook" ? { background: gradientCss } : {}}
      >
        {/* Background Image / Avatar */}
        <div className="absolute inset-0 z-0">
          <ItemAvatar
            item={item}
            className="transition-transform duration-500 group-hover:scale-110"
          />
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 z-10 bg-linear-to-t from-black/90 via-black/40 to-transparent" />

        {/* Type Badge */}
        <div className="absolute left-2 top-2 z-20">
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80 backdrop-blur-md shadow-sm shadow-black/30">
            <span className={cn("h-2 w-2 rounded-full", badge.dotClass)} />
            {badge.label}
          </span>
        </div>

        {/* Glass Content Area */}
        <div className="relative z-20 flex w-full flex-col gap-1 p-3">
          <h3 className={cn(typography.body.size, "font-bold text-white truncate leading-tight")}>
            {getItemName(item)}
          </h3>
          <p
            className={cn(
              typography.bodySmall.size,
              "text-white/70 line-clamp-2 text-xs leading-relaxed",
            )}
          >
            {descriptionPreview}
          </p>
        </div>

        {/* Hover Highlight */}
        <div className="absolute inset-0 z-30 bg-white/0 transition-colors group-hover:bg-white/5" />
      </motion.button>
    );
  },
);

LibraryCard.displayName = "LibraryCard";
