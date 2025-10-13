import { useNavigate } from "react-router-dom";
import { User, Trash2, Edit2, Star, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Persona } from "../../../core/storage/schemas";
import { BottomMenu } from "../../components";
import { usePersonasController } from "./hooks/usePersonasController";

const PersonaSkeleton = () => (
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

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="flex h-64 flex-col items-center justify-center">
    <User className="mb-3 h-12 w-12 text-white/20" />
    <h3 className="mb-1 text-lg font-medium text-white">No personas yet</h3>
    <p className="mb-4 text-center text-sm text-white/50">
      Create a persona to define how the AI should address you
    </p>
    <button
      onClick={onCreate}
      className="rounded-full border border-emerald-400/40 bg-emerald-400/20 px-6 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/30"
    >
      Create Persona
    </button>
  </div>
);

export function PersonasPage() {
  const navigate = useNavigate();
  const {
    state: { personas, loading, selectedPersona, showDeleteConfirm, deleting },
    setSelectedPersona,
    setShowDeleteConfirm,
    handleDelete,
    handleSetDefault,
  } = usePersonasController();

  const handleEditPersona = (persona: Persona) => {
    navigate(`/personas/${persona.id}/edit`);
  };

  const defaultPersona = personas.find((p) => p.isDefault);

  return (
    <div className="flex h-full flex-col pb-16 text-gray-200">
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        {loading ? (
          <PersonaSkeleton />
        ) : personas.length === 0 ? (
          <EmptyState onCreate={() => navigate("/create/persona")} />
        ) : (
          <div className="space-y-3">
            {/* Default Persona Indicator */}
            {defaultPersona && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 fill-emerald-400 text-emerald-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-emerald-200">Default Persona</div>
                    <div className="text-xs text-emerald-300/70">{defaultPersona.title}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Personas List */}
            <AnimatePresence mode="popLayout">
              {personas.map((persona, index) => (
                <motion.button
                  key={persona.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedPersona(persona)}
                  className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.995] ${
                    persona.isDefault
                      ? "border-emerald-400/40 bg-emerald-400/10 hover:border-emerald-400/60 hover:bg-emerald-400/15"
                      : "border-white/10 bg-[#0b0c12]/90 hover:border-white/25 hover:bg-[#0c0d13]/95"
                  }`}
                >
                  {!persona.isDefault && (
                    <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-purple-500/10 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                  )}

                  <div
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                      persona.isDefault
                        ? "border-emerald-400/40 bg-emerald-400/20"
                        : "border-white/15 bg-white/8"
                    }`}
                  >
                    <User
                      className={`h-5 w-5 ${
                        persona.isDefault ? "text-emerald-200" : "text-white/70"
                      }`}
                    />
                  </div>

                  <div className="relative min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-white">
                        {persona.title}
                      </h3>
                      {persona.isDefault && (
                        <Star className="h-3 w-3 shrink-0 fill-emerald-400 text-emerald-400" />
                      )}
                    </div>
                    <p className="line-clamp-1 text-xs text-gray-400">
                      {persona.description}
                    </p>
                  </div>

                  <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                    persona.isDefault
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 group-hover:border-emerald-400/50"
                      : "border-white/10 bg-white/5 text-white/70 group-hover:border-white/25 group-hover:text-white"
                  }`}>
                    <ChevronRight size={16} />
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Persona Actions Menu */}
      <BottomMenu
        isOpen={Boolean(selectedPersona)}
        onClose={() => setSelectedPersona(null)}
        title={selectedPersona?.title || ""}
      >
        {selectedPersona && (
          <div className="space-y-2">
            <button
              onClick={() => handleEditPersona(selectedPersona)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                <Edit2 className="h-4 w-4 text-white/70" />
              </div>
              <span className="text-sm font-medium text-white">Edit Persona</span>
            </button>

            <button
              onClick={() => void handleSetDefault(selectedPersona)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                <Star
                  className={`h-4 w-4 ${
                    selectedPersona.isDefault ? "fill-emerald-400 text-emerald-400" : "text-white/70"
                  }`}
                />
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium text-white">
                  {selectedPersona.isDefault ? "Unset as Default" : "Set as Default"}
                </span>
                <p className="text-xs text-white/50">
                  {selectedPersona.isDefault
                    ? "Remove default status"
                    : "Use this for all new chats"}
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                setShowDeleteConfirm(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left transition hover:border-red-500/50 hover:bg-red-500/20"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/20">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-sm font-medium text-red-300">Delete Persona</span>
            </button>
          </div>
        )}
      </BottomMenu>

      {/* Delete Confirmation */}
      <BottomMenu
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Persona?"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Are you sure you want to delete "{selectedPersona?.title}"? This action cannot be undone.
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
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/30 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </BottomMenu>
    </div>
  );
}
