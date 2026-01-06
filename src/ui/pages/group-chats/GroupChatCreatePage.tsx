import { ArrowLeft, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { radius, interactive, cn } from "../../design-tokens";
import { Routes } from "../../navigation";
import { CharacterSelectItem } from "./components/create/CharacterSelectItem";
import { useGroupChatCreateController } from "./hooks/useGroupChatCreateController";

export function GroupChatCreatePage() {
  const navigate = useNavigate();
  const { characters, ui, defaultName, setGroupName, toggleCharacter, handleCreate } =
    useGroupChatCreateController({
      onCreated: (sessionId) => navigate(Routes.groupChat(sessionId), { replace: true }),
    });

  const selectedCount = ui.selectedIds.size;
  const canCreate = selectedCount >= 2;
  const namePlaceholder =
    selectedCount >= 2 && defaultName.trim().length > 0 ? defaultName : "Enter group name...";

  return (
    <div className="flex h-screen flex-col text-gray-200 overflow-hidden">
      <header className="shrink-0 px-4 pb-3 pt-10 border-b border-white/10 bg-[#050505]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(Routes.groupChats)}
            className="flex shrink-0 items-center justify-center -ml-2 text-white transition hover:text-white/80"
            aria-label="Back"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
          </button>
          <h1 className="text-xl font-bold text-white/90">New Group Chat</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-0">
        <div className="mb-6">
          <label className="block text-sm font-medium text-white/70 mb-2">
            Group Name (optional)
          </label>
          <input
            type="text"
            value={ui.groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder={namePlaceholder}
            className={cn(
              "w-full px-4 py-3",
              radius.md,
              "border border-white/15 bg-white/5",
              "text-white placeholder:text-white/30",
              "focus:outline-none focus:border-white/30",
              interactive.transition.fast,
            )}
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-white/70">
              Select Characters ({selectedCount} selected)
            </label>
            {selectedCount < 2 && (
              <span className="text-xs text-amber-400/80">Min. 2 required</span>
            )}
          </div>

          {ui.loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-16 animate-pulse",
                    radius.md,
                    "border border-white/5 bg-white/5",
                  )}
                />
              ))}
            </div>
          ) : characters.length === 0 ? (
            <div
              className={cn(
                "p-6 text-center",
                radius.md,
                "border border-dashed border-white/10 bg-white/2",
              )}
            >
              <Users className="mx-auto h-8 w-8 text-white/30 mb-2" />
              <p className="text-sm text-white/50">
                No characters yet. Create some characters first to start a group chat.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {characters.map((character) => (
                <CharacterSelectItem
                  key={character.id}
                  character={character}
                  selected={ui.selectedIds.has(character.id)}
                  onToggle={() => toggleCharacter(character.id)}
                />
              ))}
            </div>
          )}
        </div>

        {ui.error && (
          <div
            className={cn(
              "mb-4 px-4 py-2.5",
              radius.md,
              "border border-red-400/30 bg-red-400/10",
              "text-sm text-red-200",
            )}
          >
            {ui.error}
          </div>
        )}
      </main>

      <footer className="shrink-0 px-4 py-4 border-t border-white/10 bg-[#050505] sticky bottom-0">
        <button
          onClick={handleCreate}
          disabled={!canCreate || ui.creating}
          className={cn(
            "w-full py-3",
            radius.md,
            "font-medium",
            interactive.transition.fast,
            canCreate
              ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100 hover:border-emerald-400/60 hover:bg-emerald-400/30"
              : "border border-white/10 bg-white/5 text-white/30 cursor-not-allowed",
            "disabled:opacity-50",
          )}
        >
          {ui.creating ? "Creating..." : `Create Group Chat (${selectedCount} characters)`}
        </button>
      </footer>
    </div>
  );
}
