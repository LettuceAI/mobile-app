import { useRef } from "react";
import { ChevronsRight, Plus, SendHorizonal, Square, X } from "lucide-react";
import type { Character, ImageAttachment } from "../../../../core/storage/schemas";
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
  pendingAttachments?: ImageAttachment[];
  onAddAttachment?: (attachment: ImageAttachment) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
}

export function ChatFooter({
  draft,
  setDraft,
  error,
  sending,
  onSendMessage,
  onAbort,
  hasBackgroundImage,
  pendingAttachments = [],
  onAddAttachment,
  onRemoveAttachment,
}: ChatFooterProps) {
  const hasDraft = draft.trim().length > 0;
  const hasAttachments = pendingAttachments.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !onAddAttachment) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        
        // Create image to get dimensions
        const img = new Image();
        img.onload = () => {
          const attachment: ImageAttachment = {
            id: crypto.randomUUID(),
            data: base64,
            mimeType: file.type,
            filename: file.name,
            width: img.width,
            height: img.height,
          };
          onAddAttachment(attachment);
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    }

    // Reset input so same file can be selected again
    event.target.value = "";
  };

  const handlePlusClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <footer className={`z-20 shrink-0 px-4 pb-6 pt-3 ${!hasBackgroundImage ? 'bg-[#050505]' : ''}`}>
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
      
      {/* Attachment Preview */}
      {hasAttachments && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingAttachments.map((attachment) => (
            <div 
              key={attachment.id} 
              className={cn(
                "relative group",
                radius.md,
                "overflow-hidden border border-white/15 bg-white/5"
              )}
            >
              <img
                src={attachment.data}
                alt={attachment.filename || "Attachment"}
                className="h-16 w-16 object-cover"
              />
              {onRemoveAttachment && (
                <button
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className={cn(
                    "absolute -right-1 -top-1",
                    "flex h-5 w-5 items-center justify-center",
                    radius.full,
                    "bg-red-500 text-white",
                    "opacity-0 group-hover:opacity-100",
                    interactive.transition.fast
                  )}
                  aria-label="Remove attachment"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className={cn(
        "flex items-end gap-2.5 p-2.5",
        radius.full,
        "border border-white/15 bg-white/5 backdrop-blur-md",
        shadows.md
      )}>
        {/* Plus button for attachments */}
        {onAddAttachment && (
          <button
            onClick={handlePlusClick}
            disabled={sending}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center",
              radius.full,
              "border border-white/15 bg-white/10 text-white/70",
              interactive.transition.fast,
              interactive.active.scale,
              "hover:border-white/25 hover:bg-white/15",
              "disabled:cursor-not-allowed disabled:opacity-40"
            )}
            title="Add image"
            aria-label="Add image attachment"
          >
            <Plus size={20} />
          </button>
        )}

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={" "}
          rows={1}
          className={cn(
            "max-h-32 flex-1 resize-none bg-transparent py-3",
            typography.body.size,
            "text-white placeholder:text-transparent",
            "focus:outline-none"
          )}
          disabled={sending}
        />

        {draft.length === 0 && !hasAttachments && (
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
            "flex h-10 w-10 shrink-0 items-center justify-center",
            radius.full,
            sending && onAbort
              ? "border border-red-400/40 bg-red-400/20 text-red-100"
              : (hasDraft || hasAttachments)
                ? "border border-emerald-400/40 bg-emerald-400/20 text-emerald-100"
                : "border border-white/15 bg-white/10 text-white/70",
            interactive.transition.fast,
            interactive.active.scale,
            sending && onAbort && "hover:border-red-400/60 hover:bg-red-400/30",
            !sending && (hasDraft || hasAttachments) && "hover:border-emerald-400/60 hover:bg-emerald-400/30",
            !sending && !hasDraft && !hasAttachments && "hover:border-white/25 hover:bg-white/15",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
          title={sending && onAbort ? "Stop generation" : (hasDraft || hasAttachments) ? "Send message" : "Continue conversation"}
          aria-label={sending && onAbort ? "Stop generation" : (hasDraft || hasAttachments) ? "Send message" : "Continue conversation"}
        >
          {sending && onAbort ? (
            <Square size={18} fill="currentColor" />
          ) : sending ? (
            <span className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (hasDraft || hasAttachments) ? (
            <SendHorizonal size={18} />
          ) : (
            <ChevronsRight size={18} />
          )}
        </button>
      </div>
    </footer>
  );
}