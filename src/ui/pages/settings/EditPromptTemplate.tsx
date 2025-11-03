import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { RotateCcw, Eye, Code2, BookTemplate, Check } from "lucide-react";
import { cn } from "../../design-tokens";
import { BottomMenu } from "../../components";
import {
  createPromptTemplate,
  updatePromptTemplate,
  getPromptTemplate,
  getAppDefaultTemplateId,
  resetAppDefaultTemplate,
  getDefaultSystemPromptTemplate,
  renderPromptPreview,
} from "../../../core/prompts/service";
import { listCharacters, listPersonas } from "../../../core/storage";
import type { Character, Persona } from "../../../core/storage/schemas";

export function EditPromptTemplate() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [previewCharacterId, setPreviewCharacterId] = useState<string | null>(null);
  const [previewPersonaId, setPreviewPersonaId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [isAppDefault, setIsAppDefault] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewMode, setPreviewMode] = useState<"rendered" | "raw">("rendered");
  const [showVariables, setShowVariables] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

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
          setIsAppDefault(template.id === appDefaultId);
        }
      } else {
        const def = await getDefaultSystemPromptTemplate();
        setContent(def);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!name.trim() || !content.trim()) {
      return;
    }

    setSaving(true);
    try {
      if (isEditing && id) {
        await updatePromptTemplate(id, {
          name: name.trim(),
          content: content.trim(),
        });
      } else {
        await createPromptTemplate(name.trim(), "appWide" as any, [], content.trim());
      }
      navigate("/settings/prompts");
    } catch (error) {
      console.error("Failed to save template:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset to the original default prompt template? This cannot be undone.")) {
      return;
    }

    setResetting(true);
    try {
      const updated = await resetAppDefaultTemplate();
      setContent(updated.content);
      alert("Reset to default successfully!");
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
      const rendered = await renderPromptPreview(content, {
        characterId: previewCharacterId,
        personaId: previewPersonaId ?? undefined,
      });
      setPreview(rendered);
    } catch (e) {
      console.error("Preview failed", e);
      setPreview("<failed to render preview>");
    } finally {
      setPreviewing(false);
    }
  }

  async function copyVariable(variable: string) {
    await navigator.clipboard.writeText(variable);
    setCopiedVar(variable);
    setTimeout(() => setCopiedVar(null), 2000);
  }

  const charCount = content.length;
  const charCountColor = 
    charCount > 8000 ? "text-red-400" :
    charCount > 5000 ? "text-amber-400" :
    "text-white/40";

  const variables = [
    { var: "{{char.name}}", label: "Character Name", desc: "Character's name" },
    { var: "{{char.desc}}", label: "Character Desc", desc: "Character description" },
    { var: "{{scene}}", label: "Scene", desc: "Starting scene/scenario" },
    { var: "{{persona.name}}", label: "User Name", desc: "User persona name" },
    { var: "{{persona.desc}}", label: "User Desc", desc: "User persona description" },
    { var: "{{rules}}", label: "Rules", desc: "Character behavioral rules" },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505]">
        <div className="text-sm text-white/50">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050505]">
      <main className="flex-1 px-4 pb-24 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-2xl space-y-4"
        >
          {/* Form */}
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Template Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Roleplay Master"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-white placeholder-white/30 transition focus:border-blue-400/40 focus:bg-black/40 focus:outline-none"
              />
            </div>

            {/* Content Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-white/70">
                  Prompt Content
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowVariables(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-purple-400/30 bg-purple-400/10 px-2.5 py-1.5 text-xs font-medium text-purple-200 transition hover:bg-purple-400/20 active:scale-95"
                  >
                    <BookTemplate className="h-3 w-3" />
                    Variables
                  </button>
                  {isAppDefault && (
                    <button
                      onClick={handleReset}
                      disabled={resetting}
                      className="flex items-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-400/10 px-2.5 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-blue-400/20 active:scale-95 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {resetting ? "..." : "Reset"}
                    </button>
                  )}
                </div>
              </div>

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="You are a helpful AI assistant...&#10;&#10;Use {{char.name}} and {{scene}} in your prompt."
                rows={18}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 font-mono text-sm leading-relaxed text-white placeholder-white/30 transition focus:border-blue-400/40 focus:bg-black/40 focus:outline-none"
              />
              
              <div className="flex items-center justify-between text-xs">
                <span className={cn("font-medium", charCountColor)}>
                  {charCount.toLocaleString()} characters
                  {charCount > 5000 && <span className="ml-1.5 text-white/40">• Long prompt</span>}
                </span>
              </div>
            </div>

            {/* Preview Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-white/70">
                  Preview
                </label>
                <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-0.5">
                  <button
                    onClick={() => setPreviewMode("rendered")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition",
                      previewMode === "rendered"
                        ? "bg-blue-400/20 text-blue-200"
                        : "text-white/50"
                    )}
                  >
                    <Eye className="h-3 w-3" />
                    Rendered
                  </button>
                  <button
                    onClick={() => setPreviewMode("raw")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition",
                      previewMode === "raw"
                        ? "bg-blue-400/20 text-blue-200"
                        : "text-white/50"
                    )}
                  >
                    <Code2 className="h-3 w-3" />
                    Raw
                  </button>
                </div>
              </div>

              {previewMode === "rendered" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={previewCharacterId ?? ""}
                      onChange={(e) => setPreviewCharacterId(e.target.value || null)}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white transition focus:border-blue-400/40 focus:outline-none"
                    >
                      <option value="">Character…</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={previewPersonaId ?? ""}
                      onChange={(e) => setPreviewPersonaId(e.target.value || null)}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white transition focus:border-blue-400/40 focus:outline-none"
                    >
                      <option value="">Persona…</option>
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
                      "w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition",
                      !previewCharacterId || previewing
                        ? "border-white/10 bg-white/5 text-white/30"
                        : "border-blue-400/40 bg-blue-400/15 text-blue-100 hover:bg-blue-400/25 active:scale-[0.99]"
                    )}
                  >
                    {previewing ? "Rendering…" : "Generate Preview"}
                  </button>
                </>
              )}

              {/* Preview Output */}
              {previewMode === "rendered" && preview && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-white/80">
                    {preview}
                  </pre>
                </div>
              )}

              {previewMode === "raw" && content && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-white/80">
                    {content}
                  </pre>
                </div>
              )}

              {!preview && previewMode === "rendered" && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
                  <p className="text-sm text-white/50">No preview yet</p>
                  <p className="mt-1 text-xs text-white/30">Select character & generate</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !content.trim()}
                className={cn(
                  "flex-1 rounded-xl px-4 py-3.5 text-sm font-semibold transition",
                  saving || !name.trim() || !content.trim()
                    ? "border border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                    : "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30 active:scale-[0.99]"
                )}
              >
                {saving ? "Saving..." : isEditing ? "Update Template" : "Create Template"}
              </button>
              <button
                onClick={() => navigate("/settings/prompts")}
                disabled={saving}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-medium text-white transition hover:bg-white/10 active:scale-[0.99] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Variables Bottom Sheet */}
      <BottomMenu
        isOpen={showVariables}
        onClose={() => setShowVariables(false)}
        title="Template Variables"
      >
        <p className="mb-4 text-xs text-white/50">Tap to copy variable to clipboard</p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {variables.map((item) => (
            <button
              key={item.var}
              onClick={() => copyVariable(item.var)}
              className="w-full rounded-xl border border-purple-400/20 bg-purple-400/5 p-4 text-left transition-colors active:bg-purple-400/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-semibold text-emerald-300">{item.var}</code>
                    {copiedVar === item.var && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="h-3 w-3" />
                        Copied
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-white/90">{item.label}</p>
                  <p className="text-xs text-white/50">{item.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </BottomMenu>
    </div>
  );
}
