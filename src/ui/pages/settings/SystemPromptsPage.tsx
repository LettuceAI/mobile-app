import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Pencil,
  Trash2,
  Lock,
  Search,
  Copy,
  Star,
  FileText,
  Sparkles,
  Brain,
  MessageSquare,
  Users,
  Plus,
  X,
} from "lucide-react";
import { cn, typography, radius, interactive } from "../../design-tokens";
import {
  listPromptTemplates,
  deletePromptTemplate,
  createPromptTemplate,
} from "../../../core/prompts/service";
import type { SystemPromptTemplate } from "../../../core/storage/schemas";
import { listCharacters, readSettings, setPromptTemplate } from "../../../core/storage/repo";
import {
  APP_DEFAULT_TEMPLATE_ID,
  APP_DYNAMIC_SUMMARY_TEMPLATE_ID,
  APP_DYNAMIC_MEMORY_TEMPLATE_ID,
  APP_HELP_ME_REPLY_TEMPLATE_ID,
  APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID,
  APP_GROUP_CHAT_TEMPLATE_ID,
  APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID,
  isProtectedPromptTemplate,
  isSystemPromptTemplate,
  getPromptTypeLabel,
} from "../../../core/prompts/constants";
import { BottomMenu } from "../../components";

type TemplateUsage = {
  models: number;
  characters: number;
};

type FilterTag = "all" | "system" | "internal" | "custom";

const FILTER_TAGS: { key: FilterTag; label: string }[] = [
  { key: "all", label: "All" },
  { key: "system", label: "System" },
  { key: "internal", label: "Internal" },
  { key: "custom", label: "Custom" },
];

function getTemplateIcon(templateId: string) {
  switch (templateId) {
    case APP_DEFAULT_TEMPLATE_ID:
      return Sparkles;
    case APP_DYNAMIC_SUMMARY_TEMPLATE_ID:
    case APP_DYNAMIC_MEMORY_TEMPLATE_ID:
      return Brain;
    case APP_HELP_ME_REPLY_TEMPLATE_ID:
    case APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID:
      return MessageSquare;
    case APP_GROUP_CHAT_TEMPLATE_ID:
    case APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID:
      return Users;
    default:
      return FileText;
  }
}

function PromptCardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-full animate-pulse rounded bg-white/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/5 mb-4">
        <FileText className="h-7 w-7 text-white/30" />
      </div>
      <h3 className={cn(typography.h2.size, typography.h2.weight, "text-white mb-2")}>
        No custom prompts yet
      </h3>
      <p className={cn(typography.body.size, "text-white/50 text-center max-w-xs mb-6")}>
        Create custom system prompts to personalize your AI conversations
      </p>
      <button
        onClick={onCreate}
        className={cn(
          "flex items-center gap-2 px-5 py-2.5",
          radius.lg,
          "border border-emerald-400/40 bg-emerald-500/20",
          "text-sm font-medium text-emerald-100",
          interactive.transition.default,
          "hover:bg-emerald-500/30",
          "active:scale-[0.98]",
        )}
      >
        <Plus className="h-4 w-4" />
        Create Prompt
      </button>
    </div>
  );
}

function PromptCard({
  template,
  isActiveDefault,
  usage,
  onEdit,
  onDelete,
  onDuplicate,
  onSetDefault,
}: {
  template: SystemPromptTemplate;
  isActiveDefault: boolean;
  usage: TemplateUsage;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
}) {
  const isProtected = isProtectedPromptTemplate(template.id);
  const isSystem = isSystemPromptTemplate(template.id);
  const typeLabel = getPromptTypeLabel(template.id);
  const Icon = getTemplateIcon(template.id);

  return (
    <div
      className={cn(
        "group relative",
        radius.lg,
        "border border-white/10 bg-white/5",
        "hover:border-white/20 hover:bg-white/[0.07]",
        interactive.transition.fast,
      )}
    >
      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center",
              radius.lg,
              isActiveDefault ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/50",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>

          {/* Title + Type */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white truncate">{template.name}</h3>
              {isActiveDefault && (
                <Star className="h-3.5 w-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
              )}
              {isProtected && <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
            </div>
            <p className="text-xs text-white/40 mt-0.5">{typeLabel}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className={cn(
                "p-1.5",
                radius.md,
                "text-white/40 hover:text-white hover:bg-white/10",
                interactive.transition.fast,
              )}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={onDuplicate}
              className={cn(
                "p-1.5",
                radius.md,
                "text-white/40 hover:text-white hover:bg-white/10",
                interactive.transition.fast,
              )}
              title="Duplicate"
            >
              <Copy className="h-4 w-4" />
            </button>
            {!isProtected && (
              <button
                onClick={onDelete}
                className={cn(
                  "p-1.5",
                  radius.md,
                  "text-white/40 hover:text-red-400 hover:bg-red-500/10",
                  interactive.transition.fast,
                )}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content Preview */}
        <p className="text-xs text-white/40 line-clamp-2 mt-3 leading-relaxed">
          {template.content}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <div className="text-[11px] text-white/30">
            {isSystem ? (
              <>
                {usage.models} model{usage.models !== 1 && "s"} · {usage.characters} char
                {usage.characters !== 1 && "s"}
              </>
            ) : (
              "Internal feature"
            )}
          </div>

          {isSystem && !isActiveDefault && (
            <button
              onClick={onSetDefault}
              className={cn(
                "flex items-center gap-1 px-2 py-1",
                radius.md,
                "text-[11px] font-medium text-emerald-400",
                "hover:bg-emerald-500/10",
                interactive.transition.fast,
              )}
            >
              <Star className="h-3 w-3" />
              Set Default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SystemPromptsPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SystemPromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDefaultId, setActiveDefaultId] = useState<string>(APP_DEFAULT_TEMPLATE_ID);
  const [usageById, setUsageById] = useState<Record<string, TemplateUsage>>({});
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<FilterTag>("all");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<SystemPromptTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();

    const globalWindow = window as any;
    globalWindow.__openAddPromptTemplate = () => {
      navigate("/settings/prompts/new");
    };

    const handleAdd = () => navigate("/settings/prompts/new");
    window.addEventListener("prompts:add", handleAdd);

    return () => {
      delete globalWindow.__openAddPromptTemplate;
      window.removeEventListener("prompts:add", handleAdd);
    };
  }, [navigate]);

  async function loadData() {
    try {
      const [data, settings, characters] = await Promise.all([
        listPromptTemplates(),
        readSettings(),
        listCharacters(),
      ]);

      const usage: Record<string, TemplateUsage> = {};
      const bump = (id: string | null | undefined, key: keyof TemplateUsage) => {
        if (!id) return;
        if (!usage[id]) {
          usage[id] = { models: 0, characters: 0 };
        }
        usage[id][key] += 1;
      };

      settings.models.forEach((model) => bump(model.promptTemplateId ?? null, "models"));
      characters.forEach((character) => bump(character.promptTemplateId ?? null, "characters"));

      const activeDefault = settings.promptTemplateId ?? APP_DEFAULT_TEMPLATE_ID;

      const sorted = data.sort((a, b) => {
        if (a.id === activeDefault) return -1;
        if (b.id === activeDefault) return 1;
        if (a.id === APP_DEFAULT_TEMPLATE_ID) return -1;
        if (b.id === APP_DEFAULT_TEMPLATE_ID) return 1;
        return b.createdAt - a.createdAt;
      });

      setTemplates(sorted);
      setActiveDefaultId(activeDefault);
      setUsageById(usage);
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!templateToDelete) return;
    if (isProtectedPromptTemplate(templateToDelete.id)) {
      alert("Protected templates cannot be deleted.");
      return;
    }

    setDeleting(true);
    try {
      await deletePromptTemplate(templateToDelete.id);
      setTemplates((prev) => prev.filter((t) => t.id !== templateToDelete.id));
      setShowDeleteConfirm(false);
      setTemplateToDelete(null);
    } catch (error) {
      console.error("Failed to delete template:", error);
      alert("Failed to delete template. " + String(error));
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicate(template: SystemPromptTemplate) {
    try {
      const name = `${template.name} (Copy)`;
      await createPromptTemplate(name, "appWide", [], template.content);
      await loadData();
    } catch (error) {
      console.error("Failed to duplicate template:", error);
      alert("Failed to duplicate template. " + String(error));
    }
  }

  async function handleSetDefault(templateId: string) {
    try {
      const next = templateId === APP_DEFAULT_TEMPLATE_ID ? null : templateId;
      await setPromptTemplate(next);
      await loadData();
    } catch (error) {
      console.error("Failed to set default template:", error);
      alert("Failed to set default template. " + String(error));
    }
  }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const isProtected = isProtectedPromptTemplate(t.id);
      const isSystem = isSystemPromptTemplate(t.id);

      if (activeTag === "system" && !isSystem) return false;
      if (activeTag === "internal" && isSystem) return false;
      if (activeTag === "custom" && isProtected) return false;

      const q = search.trim().toLowerCase();
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q);
    });
  }, [templates, activeTag, search]);

  return (
    <div className="flex h-full flex-col pb-16">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts..."
                className={cn(
                  "w-full pl-10 pr-10 py-2.5",
                  radius.lg,
                  "border border-white/10 bg-white/5",
                  "text-sm text-white placeholder-white/30",
                  interactive.transition.fast,
                  "focus:border-white/20 focus:bg-white/10 focus:outline-none",
                )}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter Tags */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {FILTER_TAGS.map((tag) => {
                const isActive = activeTag === tag.key;
                return (
                  <button
                    key={tag.key}
                    onClick={() => setActiveTag(tag.key)}
                    className={cn(
                      "px-3 py-1.5 shrink-0",
                      radius.md,
                      "text-xs font-medium",
                      interactive.transition.fast,
                      isActive
                        ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                        : "border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70",
                    )}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Templates Grid */}
          {loading ? (
            <PromptCardSkeleton />
          ) : filtered.length === 0 ? (
            search || activeTag !== "all" ? (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <p className="text-sm text-white/50 mb-1">No matching prompts</p>
                <p className="text-xs text-white/30">Try adjusting your search or filters</p>
              </div>
            ) : (
              <EmptyState onCreate={() => navigate("/settings/prompts/new")} />
            )
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtered.map((template) => (
                <PromptCard
                  key={template.id}
                  template={template}
                  isActiveDefault={template.id === activeDefaultId}
                  usage={usageById[template.id] || { models: 0, characters: 0 }}
                  onEdit={() => navigate(`/settings/prompts/${template.id}`)}
                  onDelete={() => {
                    setTemplateToDelete(template);
                    setShowDeleteConfirm(true);
                  }}
                  onDuplicate={() => handleDuplicate(template)}
                  onSetDefault={() => handleSetDefault(template.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation */}
      <BottomMenu
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setTemplateToDelete(null);
        }}
        title="Delete Prompt?"
      >
        <div className="space-y-4">
          <div className={cn(radius.lg, "border border-white/10 bg-white/5 p-3")}>
            <p className="text-sm font-medium text-white">{templateToDelete?.name}</p>
            <p className="text-xs text-white/50 mt-1 line-clamp-2">{templateToDelete?.content}</p>
          </div>

          <p className="text-sm text-white/60">
            This action cannot be undone. Any models or characters using this prompt will fall back
            to the default.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                setTemplateToDelete(null);
              }}
              disabled={deleting}
              className={cn(
                "flex-1 py-3",
                radius.lg,
                "border border-white/10 bg-white/5",
                "text-sm font-medium text-white",
                interactive.transition.fast,
                "hover:bg-white/10",
                "disabled:opacity-50",
              )}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                "flex-1 py-3",
                radius.lg,
                "border border-red-500/30 bg-red-500/15",
                "text-sm font-medium text-red-300",
                interactive.transition.fast,
                "hover:bg-red-500/25",
                "disabled:opacity-50",
              )}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </BottomMenu>
    </div>
  );
}
