import { useState, useEffect, useRef } from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import {
  RotateCcw,
  Eye,
  Code2,
  Check,
  AlertTriangle,
  Sparkles,
  Copy,
  Lock,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { cn, radius, interactive } from "../../design-tokens";
import { BottomMenu } from "../../components";
import {
  createPromptTemplate,
  updatePromptTemplate,
  getPromptTemplate,
  getAppDefaultTemplateId,
  resetAppDefaultTemplate,
  resetDynamicSummaryTemplate,
  resetDynamicMemoryTemplate,
  getDefaultSystemPromptTemplate,
  renderPromptPreview,
  getRequiredTemplateVariables,
} from "../../../core/prompts/service";
import { listCharacters, listPersonas } from "../../../core/storage";
import type { Character, Persona, SystemPromptEntry } from "../../../core/storage/schemas";
import {
  APP_DYNAMIC_SUMMARY_TEMPLATE_ID,
  APP_DYNAMIC_MEMORY_TEMPLATE_ID,
  APP_HELP_ME_REPLY_TEMPLATE_ID,
  APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID,
  APP_GROUP_CHAT_TEMPLATE_ID,
  APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID,
  isProtectedPromptTemplate,
} from "../../../core/prompts/constants";

type PromptType =
  | "system"
  | "summary"
  | "memory"
  | "reply"
  | "group_chat"
  | "group_chat_roleplay"
  | null;

type Variable = {
  var: string;
  label: string;
  desc: string;
};

const VARIABLES_BY_TYPE: Record<string, Variable[]> = {
  system: [
    { var: "{{char.name}}", label: "Character Name", desc: "The character's display name" },
    { var: "{{char.desc}}", label: "Character Definition", desc: "Full character definition" },
    { var: "{{scene}}", label: "Scene", desc: "Starting scene or scenario" },
    { var: "{{rules}}", label: "Rules", desc: "Character behavioral rules" },
    { var: "{{persona.name}}", label: "User Name", desc: "The user's persona name" },
    { var: "{{persona.desc}}", label: "User Description", desc: "User persona description" },
    { var: "{{context_summary}}", label: "Context Summary", desc: "Dynamic conversation summary" },
    { var: "{{key_memories}}", label: "Key Memories", desc: "List of relevant memories" },
  ],
  summary: [
    { var: "{{prev_summary}}", label: "Previous Summary", desc: "The cumulative summary" },
    { var: "{{character}}", label: "Character", desc: "Character placeholder" },
    { var: "{{persona}}", label: "Persona", desc: "Persona placeholder" },
  ],
  memory: [
    { var: "{{max_entries}}", label: "Max Entries", desc: "Maximum memory entries allowed" },
  ],
  reply: [
    { var: "{{char.name}}", label: "Character Name", desc: "The character's display name" },
    { var: "{{char.desc}}", label: "Character Definition", desc: "Full character definition" },
    { var: "{{persona.name}}", label: "User Name", desc: "The user's persona name" },
    { var: "{{persona.desc}}", label: "User Description", desc: "User persona description" },
    { var: "{{current_draft}}", label: "Current Draft", desc: "Content user started writing" },
  ],
  group_chat: [
    { var: "{{char.name}}", label: "Character Name", desc: "The character's display name" },
    { var: "{{char.desc}}", label: "Character Definition", desc: "Full character definition" },
    { var: "{{persona.name}}", label: "User Name", desc: "The user's persona name" },
    { var: "{{persona.desc}}", label: "User Description", desc: "User persona description" },
    { var: "{{group_characters}}", label: "Group Characters", desc: "List of group characters" },
  ],
  group_chat_roleplay: [
    { var: "{{scene}}", label: "Scene", desc: "Starting scene or scenario" },
    { var: "{{scene_direction}}", label: "Scene Direction", desc: "Optional scene direction" },
    { var: "{{char.name}}", label: "Character Name", desc: "The character's display name" },
    { var: "{{char.desc}}", label: "Character Definition", desc: "Full character definition" },
    { var: "{{persona.name}}", label: "User Name", desc: "The user's persona name" },
    { var: "{{persona.desc}}", label: "User Description", desc: "User persona description" },
    { var: "{{group_characters}}", label: "Group Characters", desc: "List of group characters" },
    { var: "{{context_summary}}", label: "Context Summary", desc: "Dynamic conversation summary" },
    { var: "{{key_memories}}", label: "Key Memories", desc: "List of relevant memories" },
  ],
  default: [
    { var: "{{char.name}}", label: "Character Name", desc: "The character's display name" },
    { var: "{{char.desc}}", label: "Character Definition", desc: "Full character definition" },
    { var: "{{scene}}", label: "Scene", desc: "Starting scene or scenario" },
    { var: "{{rules}}", label: "Rules", desc: "Character behavioral rules" },
    { var: "{{persona.name}}", label: "User Name", desc: "The user's persona name" },
    { var: "{{persona.desc}}", label: "User Description", desc: "User persona description" },
    { var: "{{context_summary}}", label: "Context Summary", desc: "Dynamic conversation summary" },
    { var: "{{key_memories}}", label: "Key Memories", desc: "List of relevant memories" },
  ],
};

const ENTRY_ROLE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
] as const;

const ENTRY_POSITION_OPTIONS = [
  { value: "relative", label: "Relative" },
  { value: "inChat", label: "In Chat" },
] as const;

const createEntryId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const DEFAULT_ENTRY_ROLE: SystemPromptEntry["role"] = "system";
const DEFAULT_ENTRY_POSITION: SystemPromptEntry["injectionPosition"] = "relative";

const createDefaultEntry = (
  content: string,
  overrides?: Partial<SystemPromptEntry>,
): SystemPromptEntry => ({
  id: createEntryId(),
  name: "System Prompt",
  role: DEFAULT_ENTRY_ROLE,
  content,
  enabled: true,
  injectionPosition: DEFAULT_ENTRY_POSITION,
  injectionDepth: 0,
  systemPrompt: true,
  ...overrides,
});

const createExtraEntry = (overrides?: Partial<SystemPromptEntry>) =>
  createDefaultEntry("", { name: "Prompt Entry", systemPrompt: false, ...overrides });

const entriesToContent = (entries: SystemPromptEntry[]) =>
  entries
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");

const ensureSystemEntry = (entries: SystemPromptEntry[]) => {
  if (entries.length === 0) return [createDefaultEntry("")];
  if (entries.some((entry) => entry.systemPrompt)) return entries;
  return [{ ...entries[0], systemPrompt: true, enabled: true }, ...entries.slice(1)];
};

function PromptEntryCard({
  entry,
  onUpdate,
  onDelete,
  onToggle,
  onToggleCollapse,
  collapsed,
}: {
  entry: SystemPromptEntry;
  onUpdate: (id: string, updates: Partial<SystemPromptEntry>) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  collapsed: boolean;
}) {
  const controls = useDragControls();
  const toggleId = `prompt-entry-${entry.id}`;

  return (
    <Reorder.Item
      value={entry}
      dragListener={false}
      dragControls={controls}
      layout
      className={cn("rounded-xl border border-white/10 bg-white/5 p-4", "space-y-3")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          onPointerDown={(event) => controls.start(event)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            "border border-white/10 bg-white/5 text-white/40",
          )}
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          onClick={() => onToggleCollapse(entry.id)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            "border border-white/10 bg-white/5 text-white/40",
          )}
          title={collapsed ? "Expand entry" : "Collapse entry"}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        <input
          value={entry.name}
          onChange={(event) => onUpdate(entry.id, { name: event.target.value })}
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          placeholder="Entry name"
        />

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3">
            <input
              id={toggleId}
              type="checkbox"
              checked={entry.enabled || entry.systemPrompt}
              onChange={() => onToggle(entry.id)}
              onClick={(event) => event.stopPropagation()}
              disabled={entry.systemPrompt}
              className="peer sr-only"
            />
            <label
              htmlFor={toggleId}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full",
                "border-2 border-transparent transition-all duration-200 ease-in-out",
                "focus:outline-none focus:ring-2 focus:ring-white/20",
                entry.enabled || entry.systemPrompt ? "bg-emerald-500" : "bg-white/20",
                entry.systemPrompt && "cursor-not-allowed opacity-60",
              )}
              title={entry.systemPrompt ? "System prompt entries are always enabled" : "Toggle"}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm",
                  "ring-0 transition duration-200 ease-in-out",
                  entry.enabled || entry.systemPrompt ? "translate-x-4" : "translate-x-0",
                )}
              />
            </label>
            <span className="text-xs text-white/50">
              {entry.systemPrompt ? "Required" : entry.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          {!entry.systemPrompt && (
            <button
              onClick={() => onDelete(entry.id)}
              className={cn(
                "rounded-lg border border-white/10 p-2 text-white/40",
                "hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300",
              )}
              title="Delete entry"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-3 overflow-hidden"
          >
            <div className="grid gap-2 md:grid-cols-3">
              <select
                value={entry.role}
                onChange={(event) => onUpdate(entry.id, { role: event.target.value as any })}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                {ENTRY_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={entry.injectionPosition}
                onChange={(event) =>
                  onUpdate(entry.id, { injectionPosition: event.target.value as any })
                }
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                {ENTRY_POSITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {entry.injectionPosition === "inChat" && (
                <input
                  type="number"
                  min={0}
                  value={entry.injectionDepth}
                  onChange={(event) =>
                    onUpdate(entry.id, { injectionDepth: Number(event.target.value) })
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                  placeholder="Depth"
                />
              )}
            </div>

            <textarea
              value={entry.content}
              onChange={(event) => onUpdate(entry.id, { content: event.target.value })}
              rows={6}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 font-mono text-sm leading-relaxed text-white placeholder-white/30"
              placeholder="Write the prompt entry..."
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

function PromptEntryListItem({
  entry,
  onToggle,
  onDelete,
  onEdit,
}: {
  entry: SystemPromptEntry;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const controls = useDragControls();
  const toggleId = `prompt-entry-mobile-${entry.id}`;

  return (
    <Reorder.Item
      value={entry}
      dragListener={false}
      dragControls={controls}
      layout
      className={cn("rounded-xl border border-white/10 bg-white/5 p-3", "space-y-2")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onPointerDown={(event) => controls.start(event)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              "border border-white/10 bg-white/5 text-white/40",
            )}
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{entry.name}</p>
            <p className="text-[11px] text-white/40 uppercase tracking-wide">
              {entry.role} · {entry.injectionPosition}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <input
              id={toggleId}
              type="checkbox"
              checked={entry.enabled || entry.systemPrompt}
              onChange={() => onToggle(entry.id)}
              onClick={(event) => event.stopPropagation()}
              disabled={entry.systemPrompt}
              className="peer sr-only"
            />
            <label
              htmlFor={toggleId}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full",
                "border-2 border-transparent transition-all duration-200 ease-in-out",
                entry.enabled || entry.systemPrompt ? "bg-emerald-500" : "bg-white/20",
                entry.systemPrompt && "cursor-not-allowed opacity-60",
              )}
              title={entry.systemPrompt ? "System prompt entries are always enabled" : "Toggle"}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm",
                  "ring-0 transition duration-200 ease-in-out",
                  entry.enabled || entry.systemPrompt ? "translate-x-4" : "translate-x-0",
                )}
              />
            </label>
          </div>

          <button
            onClick={() => onEdit(entry.id)}
            className={cn(
              "rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70",
              "hover:bg-white/10 hover:text-white",
            )}
          >
            Edit
          </button>

          {!entry.systemPrompt && (
            <button
              onClick={() => onDelete(entry.id)}
              className={cn(
                "rounded-lg border border-white/10 p-2 text-white/40",
                "hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300",
              )}
              title="Delete entry"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-white/50 line-clamp-2">
        {entry.content?.trim() || "No content yet"}
      </p>
    </Reorder.Item>
  );
}

function getPromptTypeName(type: PromptType): string {
  switch (type) {
    case "system":
      return "System Prompt";
    case "summary":
      return "Dynamic Summary";
    case "memory":
      return "Dynamic Memory";
    case "reply":
      return "Reply Helper";
    case "group_chat":
      return "Group Chat";
    case "group_chat_roleplay":
      return "Group Chat RP";
    default:
      return "Custom Prompt";
  }
}

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col pb-16">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <div className="h-12 w-full animate-pulse rounded-xl bg-white/10" />
          <div className="h-80 w-full animate-pulse rounded-xl bg-white/10" />
        </div>
      </main>
    </div>
  );
}

export function EditPromptTemplate() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [entries, setEntries] = useState<SystemPromptEntry[]>([]);

  // Preview state
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [previewCharacterId, setPreviewCharacterId] = useState<string | null>(null);
  const [previewPersonaId, setPreviewPersonaId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [previewEntries, setPreviewEntries] = useState<SystemPromptEntry[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [previewMode, setPreviewMode] = useState<"rendered" | "raw">("rendered");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [collapsedEntries, setCollapsedEntries] = useState<Record<string, boolean>>({});
  const [mobileEntryEditorId, setMobileEntryEditorId] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  // Template metadata
  const [isAppDefault, setIsAppDefault] = useState(false);
  const [promptType, setPromptType] = useState<PromptType>(null);
  const [resetting, setResetting] = useState(false);
  const [requiredVariables, setRequiredVariables] = useState<string[]>([]);
  const [missingVariables, setMissingVariables] = useState<string[]>([]);

  const canReset =
    isAppDefault &&
    (promptType === "system" ||
      promptType === "summary" ||
      promptType === "memory" ||
      promptType === "reply");

  const usesEntryEditor =
    promptType !== "summary" && promptType !== "memory" && promptType !== "reply";

  const variables = VARIABLES_BY_TYPE[promptType || "default"] || VARIABLES_BY_TYPE.default;

  const contentValue = usesEntryEditor ? entriesToContent(entries) : content;
  const charCount = contentValue.length;
  const charCountColor =
    charCount > 8000 ? "text-red-400" : charCount > 5000 ? "text-amber-400" : "text-white/40";

  const canSave =
    name.trim().length > 0 &&
    (usesEntryEditor
      ? entries.some((entry) => entry.content.trim().length > 0)
      : content.trim().length > 0);

  // Expose save state to TopNav via window globals
  useEffect(() => {
    const globalWindow = window as any;
    globalWindow.__savePromptCanSave = canSave && !saving;
    globalWindow.__savePromptSaving = saving;

    return () => {
      delete globalWindow.__savePromptCanSave;
      delete globalWindow.__savePromptSaving;
    };
  }, [canSave, saving]);

  // Listen for save event from TopNav
  useEffect(() => {
    const handleSave = () => {
      if (canSave && !saving) {
        handleSave_internal();
      }
    };

    window.addEventListener("prompt:save", handleSave);
    return () => window.removeEventListener("prompt:save", handleSave);
  }, [canSave, saving, name, content, isAppDefault, id, missingVariables]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (isAppDefault && requiredVariables.length > 0) {
      const source = usesEntryEditor ? entriesToContent(entries) : content;
      const missing = requiredVariables.filter((v) => !source.includes(v));
      setMissingVariables(missing);
    }
  }, [content, entries, requiredVariables, isAppDefault, usesEntryEditor]);

  async function loadData() {
    try {
      const [chars, pers] = await Promise.all([listCharacters(), listPersonas()]);
      setCharacters(chars);
      setPersonas(pers);
      setPreviewCharacterId(chars[0]?.id ?? null);
      setPreviewPersonaId(pers.find((p) => p.isDefault)?.id ?? null);

      if (isEditing && id) {
        const [template, appDefaultId] = await Promise.all([
          getPromptTemplate(id),
          getAppDefaultTemplateId(),
        ]);

        if (template) {
          setName(template.name);
          setContent(template.content);
          const isProtected =
            template.id === appDefaultId || isProtectedPromptTemplate(template.id);
          setIsAppDefault(isProtected);

          let detectedType: PromptType = null;
          if (template.id === appDefaultId) {
            detectedType = "system";
          } else if (template.id === APP_DYNAMIC_SUMMARY_TEMPLATE_ID) {
            detectedType = "summary";
          } else if (template.id === APP_DYNAMIC_MEMORY_TEMPLATE_ID) {
            detectedType = "memory";
          } else if (template.id === APP_HELP_ME_REPLY_TEMPLATE_ID) {
            detectedType = "reply";
          } else if (template.id === APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID) {
            detectedType = "reply";
          } else if (template.id === APP_GROUP_CHAT_TEMPLATE_ID) {
            detectedType = "group_chat";
          } else if (template.id === APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID) {
            detectedType = "group_chat_roleplay";
          }
          setPromptType(detectedType);

          const shouldUseEntries =
            detectedType !== "summary" && detectedType !== "memory" && detectedType !== "reply";
          if (shouldUseEntries) {
            const nextEntries =
              template.entries?.length > 0
                ? template.entries
                : [createDefaultEntry(template.content)];
            const normalizedEntries = ensureSystemEntry(nextEntries);
            setEntries(normalizedEntries);
            setCollapsedEntries(
              Object.fromEntries(normalizedEntries.map((entry) => [entry.id, true])),
            );
          } else {
            setEntries([]);
          }

          if (isProtected) {
            const required = await getRequiredTemplateVariables(template.id);
            setRequiredVariables(required);
          }
        }
      } else {
        const def = await getDefaultSystemPromptTemplate();
        setContent(def);
        const seedEntries = [createDefaultEntry(def)];
        setEntries(seedEntries);
        setCollapsedEntries(Object.fromEntries(seedEntries.map((entry) => [entry.id, true])));
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleEntryUpdate = (id: string, updates: Partial<SystemPromptEntry>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)));
  };

  const handleToggleEntryCollapse = (id: string) => {
    setCollapsedEntries((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleEntryDelete = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleEntryToggle = (id: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id || entry.systemPrompt) return entry;
        return { ...entry, enabled: !entry.enabled };
      }),
    );
  };

  const handleAddEntry = () => {
    const entry = createExtraEntry();
    setEntries((prev) => [...prev, entry]);
    setCollapsedEntries((prev) => ({ ...prev, [entry.id]: false }));
  };

  const selectedMobileEntry = mobileEntryEditorId
    ? (entries.find((entry) => entry.id === mobileEntryEditorId) ?? null)
    : null;

  async function handleSave_internal() {
    const hasContent = usesEntryEditor
      ? entries.some((entry) => entry.content.trim().length > 0)
      : content.trim().length > 0;
    if (!name.trim() || !hasContent) return;

    if (isAppDefault && id && missingVariables.length > 0) {
      alert(`Cannot save: Missing required variables: ${missingVariables.join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      const contentToSave = usesEntryEditor ? entriesToContent(entries) : content.trim();
      if (isEditing && id) {
        await updatePromptTemplate(id, {
          name: name.trim(),
          content: contentToSave,
          entries: usesEntryEditor ? entries : undefined,
        });
      } else {
        await createPromptTemplate(
          name.trim(),
          "appWide" as any,
          [],
          contentToSave,
          usesEntryEditor ? entries : undefined,
        );
      }
      navigate("/settings/prompts");
    } catch (error) {
      console.error("Failed to save template:", error);
      alert("Failed to save template: " + String(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!isAppDefault || !promptType) return;
    if (!["system", "summary", "memory", "reply"].includes(promptType)) return;

    const promptTypeName = getPromptTypeName(promptType);
    if (!confirm(`Reset to the original default ${promptTypeName}? This cannot be undone.`)) {
      return;
    }

    setResetting(true);
    try {
      let updated;
      if (promptType === "system") {
        updated = await resetAppDefaultTemplate();
      } else if (promptType === "summary") {
        updated = await resetDynamicSummaryTemplate();
      } else if (promptType === "memory") {
        updated = await resetDynamicMemoryTemplate();
      } else {
        const { resetHelpMeReplyTemplate } = await import("../../../core/prompts/service");
        updated = await resetHelpMeReplyTemplate();
      }
      setContent(updated.content);
      if (usesEntryEditor) {
        const nextEntries =
          updated.entries?.length > 0 ? updated.entries : [createDefaultEntry(updated.content)];
        const normalizedEntries = ensureSystemEntry(nextEntries);
        setEntries(normalizedEntries);
        setCollapsedEntries(Object.fromEntries(normalizedEntries.map((entry) => [entry.id, true])));
      }
    } catch (error) {
      console.error("Failed to reset template:", error);
      alert("Failed to reset template");
    } finally {
      setResetting(false);
    }
  }

  async function handlePreview() {
    if (!previewCharacterId) return;
    setPreviewing(true);
    try {
      if (usesEntryEditor) {
        if (previewMode === "raw") {
          setPreviewEntries(entries);
        } else {
          const renderedEntries = await Promise.all(
            entries.map(async (entry) => {
              const rendered = await renderPromptPreview(entry.content, {
                characterId: previewCharacterId,
                personaId: previewPersonaId ?? undefined,
              });
              return { ...entry, content: rendered };
            }),
          );
          setPreviewEntries(renderedEntries);
        }
      } else {
        const rendered = await renderPromptPreview(content, {
          characterId: previewCharacterId,
          personaId: previewPersonaId ?? undefined,
        });
        setPreview(rendered);
      }
    } catch (e) {
      console.error("Preview failed", e);
      setPreview("<failed to render preview>");
      if (usesEntryEditor) {
        setPreviewEntries([]);
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function copyVariable(variable: string) {
    await navigator.clipboard.writeText(variable);
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 2000);
  }

  function insertVariable(variable: string) {
    if (usesEntryEditor) {
      setEntries((prev) => {
        if (prev.length === 0) return prev;
        const targetIndex = prev.findIndex((entry) => entry.systemPrompt);
        const index = targetIndex >= 0 ? targetIndex : 0;
        const next = [...prev];
        next[index] = {
          ...next[index],
          content: `${next[index].content}${next[index].content ? "\n" : ""}${variable}`,
        };
        return next;
      });
      return;
    }
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const newContent = content.substring(0, start) + variable + content.substring(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      const newPos = start + variable.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  // Preview Panel Component (used in both desktop inline and mobile sheet)
  const PreviewPanel = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={cn("space-y-3", isMobile ? "" : "")}>
      {/* Mode Toggle */}
      <div className="flex items-center gap-1 p-1 rounded-lg border border-white/10 bg-white/5">
        <button
          onClick={() => setPreviewMode("rendered")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5",
            radius.md,
            "text-xs font-medium transition",
            previewMode === "rendered"
              ? "bg-emerald-500/20 text-emerald-300"
              : "text-white/50 hover:text-white/70",
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Rendered
        </button>
        <button
          onClick={() => setPreviewMode("raw")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5",
            radius.md,
            "text-xs font-medium transition",
            previewMode === "raw"
              ? "bg-emerald-500/20 text-emerald-300"
              : "text-white/50 hover:text-white/70",
          )}
        >
          <Code2 className="h-3.5 w-3.5" />
          Raw
        </button>
      </div>

      {/* Character/Persona Selection */}
      {previewMode === "rendered" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={previewCharacterId ?? ""}
              onChange={(e) => setPreviewCharacterId(e.target.value || null)}
              className={cn(
                "w-full px-3 py-2",
                radius.md,
                "border border-white/10 bg-white/5",
                "text-sm text-white",
                "focus:border-white/20 focus:outline-none",
              )}
            >
              <option value="">Select character…</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={previewPersonaId ?? ""}
              onChange={(e) => setPreviewPersonaId(e.target.value || null)}
              className={cn(
                "w-full px-3 py-2",
                radius.md,
                "border border-white/10 bg-white/5",
                "text-sm text-white",
                "focus:border-white/20 focus:outline-none",
              )}
            >
              <option value="">Select persona…</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handlePreview}
            disabled={!previewCharacterId || previewing}
            className={cn(
              "w-full py-2",
              radius.md,
              "border text-sm font-medium transition",
              !previewCharacterId || previewing
                ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                : "border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
            )}
          >
            {previewing ? "Rendering…" : "Generate Preview"}
          </button>
        </>
      )}

      {/* Preview Output */}
      <div
        className={cn(
          "overflow-auto",
          radius.lg,
          "border border-white/10 bg-black/30 p-4",
          isMobile ? "max-h-80" : "max-h-64",
        )}
      >
        {usesEntryEditor ? (
          (() => {
            const entriesToShow = previewMode === "rendered" ? previewEntries : entries;
            if (previewMode === "rendered" && entriesToShow.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                  <Eye className="h-8 w-8 text-white/20 mb-2" />
                  <p className="text-sm text-white/50">No preview yet</p>
                  <p className="text-xs text-white/30">Select a character and generate</p>
                </div>
              );
            }
            if (entriesToShow.length === 0) {
              return <p className="text-xs text-white/40">No entries to preview</p>;
            }
            return (
              <div className="space-y-4">
                {entriesToShow.map((entry) => (
                  <div key={entry.id} className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">
                      {entry.role} · {entry.name}
                    </div>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-white/80 font-mono">
                      {entry.content || "No content"}
                    </pre>
                  </div>
                ))}
              </div>
            );
          })()
        ) : previewMode === "rendered" ? (
          preview ? (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-white/80 font-mono">
              {preview}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <Eye className="h-8 w-8 text-white/20 mb-2" />
              <p className="text-sm text-white/50">No preview yet</p>
              <p className="text-xs text-white/30">Select a character and generate</p>
            </div>
          )
        ) : (
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-white/80 font-mono">
            {content || "No content to preview"}
          </pre>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col pb-16">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        <div className="mx-auto w-full max-w-5xl">
          {/* Desktop: Two column layout */}
          <div className="flex flex-col lg:flex-row lg:gap-6">
            {/* Main Editor Column */}
            <div className="flex-1 space-y-4 min-w-0">
              {/* Protected Template Notice */}
              {isAppDefault && (
                <div className={cn(radius.lg, "border border-amber-500/30 bg-amber-500/10 p-3")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="h-4 w-4 text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-amber-200">Protected</span>
                        {promptType && (
                          <span className="text-xs text-amber-300/70 ml-2">
                            {getPromptTypeName(promptType)}
                          </span>
                        )}
                      </div>
                    </div>
                    {canReset && (
                      <button
                        onClick={handleReset}
                        disabled={resetting}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 shrink-0",
                          radius.md,
                          "text-xs font-medium text-amber-300",
                          "hover:bg-amber-500/20",
                          interactive.transition.fast,
                          "disabled:opacity-50",
                        )}
                      >
                        <RotateCcw className={cn("h-3.5 w-3.5", resetting && "animate-spin")} />
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Missing Variables Warning */}
              <AnimatePresence>
                {isAppDefault && missingVariables.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(radius.lg, "border border-red-500/30 bg-red-500/10 p-3")}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-200">
                          Missing Required Variables
                        </p>
                        <p className="text-xs text-red-300/70 mt-0.5">
                          Include: <span className="font-mono">{missingVariables.join(", ")}</span>
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Name Input */}
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-white/50">
                  Template Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Creative Roleplay"
                  className={cn(
                    "w-full px-4 py-3",
                    radius.lg,
                    "border border-white/10 bg-white/5",
                    "text-sm text-white placeholder-white/30",
                    interactive.transition.fast,
                    "focus:border-white/20 focus:bg-white/10 focus:outline-none",
                  )}
                />
              </div>

              {/* Content Editor */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-white/50">
                    {usesEntryEditor ? "Prompt Entries" : "Prompt Content"}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {usesEntryEditor && (
                      <button
                        onClick={handleAddEntry}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5",
                          radius.md,
                          "border border-emerald-400/30 bg-emerald-500/10",
                          "text-xs font-medium text-emerald-200",
                          interactive.transition.fast,
                          "hover:bg-emerald-500/20",
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Entry
                      </button>
                    )}
                    <button
                      onClick={() => setShowVariables(true)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5",
                        radius.md,
                        "border border-blue-400/30 bg-blue-500/10",
                        "text-xs font-medium text-blue-300",
                        interactive.transition.fast,
                        "hover:bg-blue-500/20",
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Variables
                    </button>
                    <button
                      onClick={() => setShowMobilePreview(true)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 lg:hidden",
                        radius.md,
                        "border border-white/10 bg-white/5",
                        "text-xs font-medium text-white/70",
                        interactive.transition.fast,
                        "hover:bg-white/10",
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                  </div>
                </div>

                {usesEntryEditor ? (
                  <div className="space-y-3">
                    <Reorder.Group
                      axis="y"
                      values={entries}
                      onReorder={setEntries}
                      className="space-y-3 hidden lg:flex lg:flex-col"
                    >
                      {entries.map((entry) => (
                        <PromptEntryCard
                          key={entry.id}
                          entry={entry}
                          onUpdate={handleEntryUpdate}
                          onDelete={handleEntryDelete}
                          onToggle={handleEntryToggle}
                          onToggleCollapse={handleToggleEntryCollapse}
                          collapsed={collapsedEntries[entry.id] ?? true}
                        />
                      ))}
                    </Reorder.Group>

                    <Reorder.Group
                      axis="y"
                      values={entries}
                      onReorder={setEntries}
                      className="space-y-2 lg:hidden"
                    >
                      {entries.map((entry) => (
                        <PromptEntryListItem
                          key={entry.id}
                          entry={entry}
                          onToggle={handleEntryToggle}
                          onDelete={handleEntryDelete}
                          onEdit={(id) => setMobileEntryEditorId(id)}
                        />
                      ))}
                    </Reorder.Group>

                    <div className="flex items-center justify-end">
                      <span
                        className={cn(
                          "px-2 py-1 rounded-md bg-black/60",
                          "text-xs font-medium",
                          charCountColor,
                        )}
                      >
                        {charCount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="You are a creative and engaging AI assistant..."
                      rows={20}
                      className={cn(
                        "w-full px-4 py-3 resize-none",
                        radius.lg,
                        "border border-white/10 bg-white/5",
                        "font-mono text-sm leading-relaxed text-white placeholder-white/30",
                        interactive.transition.fast,
                        "focus:border-white/20 focus:bg-white/10 focus:outline-none",
                      )}
                    />
                    <div className="absolute bottom-3 right-3 pointer-events-none">
                      <span
                        className={cn(
                          "px-2 py-1 rounded-md bg-black/60",
                          "text-xs font-medium",
                          charCountColor,
                        )}
                      >
                        {charCount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Preview Panel (Desktop - below content) */}
              <div className={cn(radius.lg, "border border-white/10 bg-white/5 hidden lg:block")}>
                {/* Collapsed Header / Toggle */}
                <button
                  onClick={() => setPreviewExpanded(!previewExpanded)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3",
                    "text-left",
                    interactive.transition.fast,
                    "hover:bg-white/5",
                    previewExpanded ? "border-b border-white/10" : "",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-white/50" />
                    <span className="text-sm font-medium text-white">Preview</span>
                    {!previewExpanded && preview && (
                      <span className="text-xs text-white/40 ml-2">(has generated preview)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {previewExpanded ? (
                      <ChevronUp className="h-4 w-4 text-white/50" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-white/50" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                <AnimatePresence>
                  {previewExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4">
                        <PreviewPanel />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Desktop Sidebar - Quick Insert Only */}
            <div className="hidden lg:block w-80 shrink-0 space-y-4">
              {/* Quick Insert Panel */}
              <div className={cn(radius.lg, "border border-white/10 bg-white/5 p-4 sticky top-4")}>
                <h3 className="text-sm font-medium text-white mb-1">Quick Insert</h3>
                <p className="text-xs text-white/40 mb-3">Click to insert at cursor</p>

                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {variables.map((v) => {
                    const isRequired = requiredVariables.includes(v.var);
                    const isMissing = missingVariables.includes(v.var);
                    return (
                      <button
                        key={v.var}
                        onClick={() => insertVariable(v.var)}
                        className={cn(
                          "w-full text-left p-2",
                          radius.md,
                          "border",
                          isMissing
                            ? "border-red-500/30 bg-red-500/10"
                            : isRequired
                              ? "border-amber-500/30 bg-amber-500/10"
                              : "border-white/10 bg-white/5",
                          interactive.transition.fast,
                          "hover:bg-white/10",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isRequired && (
                            <span
                              className={cn(
                                "text-xs",
                                isMissing ? "text-red-400" : "text-amber-400",
                              )}
                            >
                              ★
                            </span>
                          )}
                          <code
                            className={cn(
                              "text-xs font-medium",
                              isMissing ? "text-red-300" : "text-emerald-300",
                            )}
                          >
                            {v.var}
                          </code>
                        </div>
                        <p className="text-[10px] text-white/40 mt-0.5">{v.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Info text */}
                <div className="flex items-start gap-2 mt-3 pt-3 border-t border-white/10">
                  <span className="text-white/30 text-xs mt-0.5">ⓘ</span>
                  <p className="text-xs text-white/40 leading-relaxed">
                    Variables are replaced with actual values when the prompt is used.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Variables Bottom Sheet (Mobile) */}
      <BottomMenu
        isOpen={showVariables}
        onClose={() => setShowVariables(false)}
        title="Template Variables"
      >
        <div className="space-y-4">
          <p className="text-xs text-white/50">Tap to insert a variable into your prompt</p>

          {isAppDefault && requiredVariables.length > 0 && (
            <div className={cn(radius.lg, "border border-amber-400/30 bg-amber-500/10 p-3")}>
              <p className="text-xs text-amber-200">
                <span className="font-semibold">Required:</span> Variables marked with ★ must be
                included
              </p>
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {variables.map((item) => {
              const isRequired = requiredVariables.includes(item.var);
              const isMissing = missingVariables.includes(item.var);
              return (
                <div
                  key={item.var}
                  className={cn(
                    radius.lg,
                    "border p-3",
                    isMissing
                      ? "border-red-400/40 bg-red-500/10"
                      : isRequired
                        ? "border-amber-400/30 bg-amber-500/10"
                        : "border-white/10 bg-white/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isRequired && (
                          <span className={isMissing ? "text-red-400" : "text-amber-400"}>★</span>
                        )}
                        <code
                          className={cn(
                            "text-sm font-semibold",
                            isMissing ? "text-red-300" : "text-emerald-300",
                          )}
                        >
                          {item.var}
                        </code>
                        {copiedVar === item.var && (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <Check className="h-3 w-3" />
                            Copied
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-white/80">{item.label}</p>
                      <p className="text-xs text-white/50">{item.desc}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => copyVariable(item.var)}
                        className={cn(
                          "flex items-center justify-center h-8 w-8",
                          radius.md,
                          "border border-white/10 bg-white/5",
                          "text-white/50",
                          interactive.transition.fast,
                          "hover:bg-white/10 hover:text-white",
                        )}
                        title="Copy"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          insertVariable(item.var);
                          setShowVariables(false);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5",
                          radius.md,
                          "border border-emerald-400/30 bg-emerald-500/15",
                          "text-xs font-medium text-emerald-300",
                          interactive.transition.fast,
                          "hover:bg-emerald-500/25",
                        )}
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </BottomMenu>

      {/* Preview Bottom Sheet (Mobile only) */}
      <BottomMenu
        isOpen={showMobilePreview}
        onClose={() => setShowMobilePreview(false)}
        title="Prompt Preview"
      >
        <PreviewPanel isMobile />
      </BottomMenu>

      {/* Entry Editor Bottom Sheet (Mobile only) */}
      <BottomMenu
        isOpen={!!mobileEntryEditorId}
        onClose={() => setMobileEntryEditorId(null)}
        title="Edit Entry"
      >
        {selectedMobileEntry ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              <div className="space-y-1">
                <select
                  value={selectedMobileEntry.role}
                  onChange={(event) =>
                    handleEntryUpdate(selectedMobileEntry.id, {
                      role: event.target.value as any,
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {ENTRY_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-white/50">
                  Select which role the model receives for this entry.
                </p>
              </div>

              <div className="space-y-1">
                <select
                  value={selectedMobileEntry.injectionPosition}
                  onChange={(event) =>
                    handleEntryUpdate(selectedMobileEntry.id, {
                      injectionPosition: event.target.value as any,
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {ENTRY_POSITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-white/50">
                  Relative adds before chat, in-chat places inside history.
                </p>
              </div>

              {selectedMobileEntry.injectionPosition === "inChat" && (
                <div className="space-y-1">
                  <input
                    type="number"
                    min={0}
                    value={selectedMobileEntry.injectionDepth}
                    onChange={(event) =>
                      handleEntryUpdate(selectedMobileEntry.id, {
                        injectionDepth: Number(event.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    placeholder="Depth"
                  />
                  <p className="text-[11px] text-white/50">
                    Depth 0 is newest; higher numbers insert earlier.
                  </p>
                </div>
              )}
            </div>

            <textarea
              value={selectedMobileEntry.content}
              onChange={(event) =>
                handleEntryUpdate(selectedMobileEntry.id, { content: event.target.value })
              }
              rows={10}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 font-mono text-sm leading-relaxed text-white placeholder-white/30"
              placeholder="Write the prompt entry..."
            />
          </div>
        ) : (
          <p className="text-sm text-white/60">Select an entry to edit.</p>
        )}
      </BottomMenu>
    </div>
  );
}
