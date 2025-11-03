import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Pencil, Trash2, Lock, Search } from "lucide-react";
import { cn } from "../../design-tokens";
import { listPromptTemplates, deletePromptTemplate, getAppDefaultTemplateId, isAppDefaultTemplate } from "../../../core/prompts/service";
import type { SystemPromptTemplate } from "../../../core/storage/schemas";

export function SystemPromptsPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SystemPromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [appDefaultId, setAppDefaultId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<"all" | "default" | "custom">("all");

  useEffect(() => {
    loadData();
    
    // Hook into bottom nav plus button
    const globalWindow = window as any;
    globalWindow.__openAddPromptTemplate = () => {
      navigate("/settings/prompts/new");
    };
    
    // Also listen for custom event
    const handleAdd = () => navigate("/settings/prompts/new");
    window.addEventListener("prompts:add", handleAdd);
    
    return () => {
      delete globalWindow.__openAddPromptTemplate;
      window.removeEventListener("prompts:add", handleAdd);
    };
  }, [navigate]);

  async function loadData() {
    try {
      const [data, defaultId] = await Promise.all([
        listPromptTemplates(),
        getAppDefaultTemplateId(),
      ]);
      
      // Sort: App Default first, then by creation date
      const sorted = data.sort((a, b) => {
        if (a.id === defaultId) return -1;
        if (b.id === defaultId) return 1;
        return b.createdAt - a.createdAt;
      });
      
      setTemplates(sorted);
      setAppDefaultId(defaultId);
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(template: SystemPromptTemplate) {
    const isDefault = await isAppDefaultTemplate(template.id);
    
    if (isDefault) {
      alert("Cannot delete the App Default template");
      return;
    }
    
    if (!confirm(`Delete "${template.name}"?`)) return;
    
    try {
      await deletePromptTemplate(template.id);
      setTemplates(prev => prev.filter(t => t.id !== template.id));
    } catch (error) {
      console.error("Failed to delete template:", error);
      alert("Failed to delete template. " + String(error));
    }
  }

  // Derived view: filtered by search and tag
  const filtered = templates.filter(t => {
    if (activeTag === "default" && t.id !== appDefaultId) return false;
    if (activeTag === "custom" && t.id === appDefaultId) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.content.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex min-h-screen flex-col bg-[#050505]">
      <main className="flex-1 px-4 pb-24 pt-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-2xl space-y-4"
        >
          {/* Info Card */}
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-3">
            <p className="text-xs text-blue-200/80">
              Create reusable system prompts. Use the + button below to add new templates.
            </p>
          </div>

          {/* Search & Tags */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts by name or content..."
                className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-white/25 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {([
                { key: "all", label: "All" },
                { key: "default", label: "Default" },
                { key: "custom", label: "Custom" },
              ] as const).map(tag => (
                <button
                  key={tag.key}
                  onClick={() => setActiveTag(tag.key)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] transition",
                    activeTag === tag.key
                      ? "border-blue-400/40 bg-blue-400/15 text-blue-100"
                      : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                  )}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Templates List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-white/50">Loading...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-sm text-white/50">No matching templates</p>
              <p className="mt-1 text-xs text-white/40">Adjust your search or tag filters</p>
            </div>
          ) : (
            <div className="space-y-3">{/* Changed from space-y-2 to space-y-3 */}
              <AnimatePresence mode="popLayout">
                {filtered.map((template) => (
                  <motion.div
                    key={template.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="overflow-hidden rounded-xl border border-white/10 bg-white/5"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white">{template.name}</h3>
                            {template.id === appDefaultId && (
                              <div className="flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                                Default
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => setExpandedId(expandedId === template.id ? null : template.id)}
                            className="w-full text-left text-xs leading-relaxed text-white/60 hover:text-white/80 transition"
                          >
                            {expandedId === template.id ? (
                              <div className="whitespace-pre-wrap">{template.content}</div>
                            ) : (
                              <div className="line-clamp-2">{template.content}</div>
                            )}
                          </button>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => navigate(`/settings/prompts/${template.id}`)}
                            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          
                          {template.id === appDefaultId ? (
                            <div className="flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px]">
                              <Lock className="h-3 w-3 text-amber-400" />
                              <span className="text-amber-200 font-medium">Protected</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDelete(template)}
                              className="rounded-lg border border-red-400/20 bg-red-400/5 p-2 text-red-400/70 transition hover:bg-red-400/10 hover:text-red-400 active:scale-95"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
