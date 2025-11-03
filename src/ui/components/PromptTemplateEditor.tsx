import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../design-tokens";
import { createPromptTemplate, updatePromptTemplate } from "../../core/prompts/service";
import { renderPromptPreview } from "../../core/prompts/service";
import { listCharacters, listPersonas } from "../../core/storage";
import type { SystemPromptTemplate, Character, Persona } from "../../core/storage/schemas";

interface PromptTemplateEditorProps {
  template?: SystemPromptTemplate;
  onClose: () => void;
  onSave: () => void;
}

export function PromptTemplateEditor({ template, onClose, onSave }: PromptTemplateEditorProps) {
  const isEditing = !!template;
  
  const [name, setName] = useState(template?.name || "");
  const [content, setContent] = useState(template?.content || "");
  // Simplified: scopes and targetIds removed in UI; new templates are App-wide by default
  
  const [characters, setCharacters] = useState<Character[]>([]);
  // loading removed from UI now that target selection is gone
  const [saving, setSaving] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [previewCharacterId, setPreviewCharacterId] = useState<string | null>(null);
  const [previewPersonaId, setPreviewPersonaId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // no longer showing a loading placeholder
    try {
      const chars = await listCharacters();
      setCharacters(chars);
      setPreviewCharacterId(chars[0]?.id ?? null);
      
      const pers = await listPersonas();
      setPersonas(pers);
      setPreviewPersonaId(pers.find(p => p.isDefault)?.id ?? null);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      // no-op
    }
  }

  async function handleSave() {
    if (!name.trim() || !content.trim()) {
      alert("Name and content are required");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updatePromptTemplate(template.id, {
          name: name.trim(),
          content: content.trim(),
        });
      } else {
        await createPromptTemplate(name.trim(), "appWide" as any, [], content.trim());
      }
      
      onSave();
      onClose();
    } catch (error) {
      console.error("Failed to save template:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl rounded-2xl border border-white/20 bg-[#0b0b0d] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? "Edit Prompt Template" : "Create Prompt Template"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* Name Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              TEMPLATE NAME
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Friendly Assistant"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
            />
          </div>

          {/* Preview Context */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              PREVIEW CONTEXT (does not save)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={previewCharacterId ?? ""}
                onChange={(e) => setPreviewCharacterId(e.target.value || null)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
              >
                <option value="">Select character…</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                value={previewPersonaId ?? ""}
                onChange={(e) => setPreviewPersonaId(e.target.value || null)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
              >
                <option value="">No persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
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

          {/* Content Textarea */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-white/70">
              PROMPT CONTENT
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your custom system prompt..."
              rows={12}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
            />
            <p className="text-xs text-white/40">
              {content.length} characters
            </p>
          </div>

          {/* Template Variables Info */}
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 px-4 py-3">
            <div className="text-xs font-medium text-blue-200">Available Variables:</div>
            <div className="mt-2 space-y-1 text-xs text-blue-200/70">
              <div><code className="text-emerald-300">{"{{char.name}}"}</code> - Character name</div>
              <div><code className="text-emerald-300">{"{{char.desc}}"}</code> - Character description</div>
              <div><code className="text-emerald-300">{"{{scene}}"}</code> - Starting scene</div>
              <div><code className="text-emerald-300">{"{{persona.name}}"}</code> - Persona name</div>
              <div><code className="text-emerald-300">{"{{persona.desc}}"}</code> - Persona description</div>
              <div><code className="text-emerald-300">{"{{rules}}"}</code> - Character rules</div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 border-t border-white/10 px-6 py-4">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !content.trim()}
            className={cn(
              "flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
              saving || !name.trim() || !content.trim()
                ? "border-white/10 bg-white/5 text-white/30"
                : "border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30 active:scale-[0.99]"
            )}
          >
            {saving ? "Saving..." : isEditing ? "Update Template" : "Create Template"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition hover:bg-white/10 active:scale-[0.99] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

