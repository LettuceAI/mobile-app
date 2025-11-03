import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { cn } from "../../design-tokens";
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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Load characters and personas for preview context
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
        // Prefill content with the app's default system prompt when creating a new template
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
        // New templates are global/app-wide by default in the simplified model
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505]">
        <div className="text-sm text-white/50">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050505]">
      <main className="flex-1 px-4 pb-24 pt-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-2xl space-y-4"
        >
          {/* Form */}
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                Template Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Friendly Assistant"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
            </div>

            {/* Preview Context (does not save) */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                Preview Context (does not save)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={previewCharacterId ?? ""}
                  onChange={(e) => setPreviewCharacterId(e.target.value || null)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
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
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
                >
                  <option value="">No persona</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePreview}
                  disabled={!previewCharacterId || previewing}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm transition",
                    !previewCharacterId || previewing
                      ? "border-white/10 bg-white/5 text-white/30"
                      : "border-blue-400/40 bg-blue-400/20 text-blue-100 hover:bg-blue-400/30"
                  )}
                >
                  {previewing ? "Rendering…" : "Render Preview"}
                </button>
              </div>
              {preview && (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                  {preview}
                </pre>
              )}
            </div>

            {/* Content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Prompt Content
                </label>
                {isAppDefault && (
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-200 transition hover:bg-blue-400/20 active:scale-95 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {resetting ? "Resetting..." : "Reset to Default"}
                  </button>
                )}
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="You are a helpful AI assistant..."
                rows={12}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
              />
              <p className="text-xs text-white/40">{content.length} characters</p>
            </div>

            {/* Template Variables Info */}
            <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-blue-200">
                Available Variables
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-blue-200/70">
                <div><code className="text-emerald-300">{"{{char.name}}"}</code> - Character name</div>
                <div><code className="text-emerald-300">{"{{char.desc}}"}</code> - Description</div>
                <div><code className="text-emerald-300">{"{{scene}}"}</code> - Starting scene</div>
                <div><code className="text-emerald-300">{"{{persona.name}}"}</code> - Persona name</div>
                <div><code className="text-emerald-300">{"{{persona.desc}}"}</code> - Persona desc</div>
                <div><code className="text-emerald-300">{"{{rules}}"}</code> - Character rules</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !content.trim()}
                className={cn(
                  "flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition",
                  saving || !name.trim() || !content.trim()
                    ? "border border-white/10 bg-white/5 text-white/30"
                    : "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30 active:scale-[0.99]"
                )}
              >
                {saving ? "Saving..." : isEditing ? "Update Template" : "Create Template"}
              </button>
              <button
                onClick={() => navigate("/settings/prompts")}
                disabled={saving}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10 active:scale-[0.99] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
