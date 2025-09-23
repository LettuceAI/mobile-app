import { ChevronRight, ChevronsRight, Loader2 } from "lucide-react";
import type { Character } from "../../../../core/storage/schemas";

interface ChatFooterProps {
  draft: string;
  setDraft: (value: string) => void;
  error: string | null;
  sending: boolean;
  character: Character;
  onSendMessage: () => Promise<void>;
}

export function ChatFooter({ 
  draft, 
  setDraft, 
  error, 
  sending, 
  character, 
  onSendMessage 
}: ChatFooterProps) {
  return (
    <footer className="z-20 flex-shrink-0 border-t border-white/10 bg-[#050505]/95 px-3 pb-6 pt-3 backdrop-blur">
      {error && (
        <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-100">
          {error}
        </div>
      )}
      <div className="flex items-end gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.4)]">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Message ${character.name}`}
          rows={1}
          className="max-h-32 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
        />
        <button
          onClick={onSendMessage}
          disabled={sending}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          title={draft.trim() ? "Send message" : "Continue conversation"}
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
            </>
          ) : draft.trim() ? (
            <>
              <ChevronRight className="h-4 w-4" />
            </>
          ) : (
            <>
              <ChevronsRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </footer>
  );
}