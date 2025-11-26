import { ChevronsRight, SendHorizonal, Square } from "lucide-react";
import type { Character } from "../../../../core/storage/schemas";
import { radius, typography, interactive, shadows, cn } from "../../../design-tokens";

interface ChatFooterProps {
  draft: string;
  setDraft: (value: string) => void;
  error: string | null;
  sending: boolean;
  character: Character;
  onSendMessage: () => Promise<void>;
  onAbort?: () => Promise<void>;
  hasBackgroundImage?: boolean;
}

export function ChatFooter({
  draft,
  setDraft,
  error,
  sending,
  character,
  onSendMessage,
  onAbort,
  hasBackgroundImage
}: ChatFooterProps) {
  const hasDraft = draft.trim().length > 0;

  return (
    <footer className={`z-20 flex-shrink-0 px-4 pb-6 pt-3 ${!hasBackgroundImage ? 'bg-[#050505]' : ''}`}>
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
        radius.full,
        "border border-white/15 bg-white/5 backdrop-blur-md",
        shadows.md
      )}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={" "}
          rows={1}
          className={cn(
            "max-h-32 flex-1 resize-none bg-transparent py-3",
            typography.body.size,
            "text-white placeholder:text-transparent", // hide native text
            "focus:outline-none"
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !sending) {
              e.preventDefault();
              onSendMessage();
            }
          }}
          disabled={sending}
        />

        {draft.length === 0 && (
          <span
            className={cn(
              "pointer-events-none absolute left-5",
              "top-1/2 -translate-y-1/2",
              "text-white/40",
              "transition-opacity duration-150",
              "peer-not-placeholder-shown:opacity-0",
              "peer-focus:opacity-70"
            )}
          >
            Send a message...
          </span>

        )}
        <button
          onClick={sending && onAbort ? onAbort : onSendMessage}
          disabled={sending && !onAbort}
          className={cn(
            "flex shrink-0 items-center justify-center",
            radius.full,
            sending && onAbort
              ? "border border-red-400/40 bg-red-400/20 text-red-100"
              : hasDraft
                ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100"
                : "border border-white/15 bg-white/10 text-white/70",
            interactive.transition.fast,
            interactive.active.scale,
            sending && onAbort && "hover:border-red-400/60 hover:bg-red-400/30",
            !sending && hasDraft && "hover:border-emerald-400/60 hover:bg-emerald-400/30",
            !sending && !hasDraft && "hover:border-white/25 hover:bg-white/15",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
          title={sending && onAbort ? "Stop generation" : hasDraft ? "Send message" : "Continue conversation"}
          aria-label={sending && onAbort ? "Stop generation" : hasDraft ? "Send message" : "Continue conversation"}
        >
          {sending && onAbort ? (
            <Square size={18} fill="currentColor" />
          ) : sending ? (
            <span className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : hasDraft ? (
            <SendHorizonal size={18} />
          ) : (
            <ChevronsRight size={18} />
          )}
        </button>
      </div>
    </footer>
  );
}