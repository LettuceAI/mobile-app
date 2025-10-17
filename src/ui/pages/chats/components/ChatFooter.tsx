import { Send, Sparkles } from "lucide-react";
import type { Character } from "../../../../core/storage/schemas";
import { radius, typography, interactive, shadows, cn } from "../../../design-tokens";

interface ChatFooterProps {
  draft: string;
  setDraft: (value: string) => void;
  error: string | null;
  sending: boolean;
  character: Character;
  onSendMessage: () => Promise<void>;
  hasBackgroundImage?: boolean;
}

export function ChatFooter({ 
  draft, 
  setDraft, 
  error, 
  sending, 
  character, 
  onSendMessage,
  hasBackgroundImage
}: ChatFooterProps) {
  const hasDraft = draft.trim().length > 0;
  
  return (
    <footer className={`z-20 flex-shrink-0 border-t border-white/10 px-4 pb-6 pt-3 ${!hasBackgroundImage ? 'bg-[#050505]' : ''}`}>
      {error && (
        <div className={cn(
          "mb-3 px-4 py-2.5",
          radius.md,
          "border border-red-400/30 bg-red-400/10",
          typography.bodySmall.size,
          "text-red-200"
        )}>
          {error}
        </div>
      )}
      <div className={cn(
        "flex items-end gap-2.5 p-2.5",
        radius.lg,
        "border border-white/15 bg-white/5",
        shadows.md
      )}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Message ${character.name}...`}
          rows={1}
          className={cn(
            "max-h-32 flex-1 resize-none bg-transparent",
            typography.body.size,
            "text-white placeholder:text-white/40",
            "focus:outline-none"
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !sending) {
              e.preventDefault();
              onSendMessage();
            }
          }}
        />
        <button
          onClick={onSendMessage}
          disabled={sending}
          className={cn(
            "flex shrink-0 items-center justify-center",
            radius.full,
            hasDraft
              ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100"
              : "border border-white/15 bg-white/10 text-white/70",
            interactive.transition.fast,
            interactive.active.scale,
            hasDraft && "hover:border-emerald-400/60 hover:bg-emerald-400/30",
            !hasDraft && "hover:border-white/25 hover:bg-white/15",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
          title={hasDraft ? "Send message" : "Continue conversation"}
          aria-label={hasDraft ? "Send message" : "Continue conversation"}
        >
            {sending ? (
            <span className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : hasDraft ? (
            <Send size={16} />
            ) : (
            <Sparkles size={16} />
            )}
        </button>
      </div>
    </footer>
  );
}