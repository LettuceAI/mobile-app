import { Edit3, Copy, RotateCcw, Trash2, Pin, PinOff, Brain, GitBranch, Users, type LucideIcon } from "lucide-react";
import { BottomMenu } from "../../../components/BottomMenu";
import type { StoredMessage } from "../../../../core/storage/schemas";
import { cn, radius } from "../../../design-tokens";

interface MessageActionState {
  message: StoredMessage;
  mode: "view" | "edit";
}

interface MessageActionsBottomSheetProps {
  messageAction: MessageActionState | null;
  actionError: string | null;
  actionStatus: string | null;
  actionBusy: boolean;
  editDraft: string;
  messages: StoredMessage[];
  setEditDraft: (value: string) => void;
  closeMessageActions: (force?: boolean) => void;
  setActionError: (value: string | null) => void;
  setActionStatus: (value: string | null) => void;
  handleSaveEdit: () => Promise<void>;
  handleDeleteMessage: (message: StoredMessage) => Promise<void>;
  handleRewindToMessage: (message: StoredMessage) => Promise<void>;
  handleBranchFromMessage: (message: StoredMessage) => Promise<string | null>;
  onBranchToCharacter: (message: StoredMessage) => void;
  handleTogglePin: (message: StoredMessage) => Promise<void>;
  setMessageAction: (value: MessageActionState | null) => void;
  characterMemoryType?: string | null;
}

// Action row component
function ActionRow({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  variant = "default",
  iconBg
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
  iconBg?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 px-1 py-2.5 transition-all rounded-lg",
        "hover:bg-white/5 active:bg-white/10",
        "disabled:opacity-40 disabled:pointer-events-none",
        variant === "danger" && "hover:bg-red-500/10"
      )}
    >
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded-lg",
        iconBg || "bg-white/10"
      )}>
        <Icon size={16} className={cn(
          variant === "danger" ? "text-red-400" : "text-white"
        )} />
      </div>
      <span className={cn(
        "text-[15px] text-left",
        variant === "danger" ? "text-red-400" : "text-white/90"
      )}>
        {label}
      </span>
    </button>
  );
}

export function MessageActionsBottomSheet({
  messageAction,
  actionError,
  actionStatus,
  actionBusy,
  editDraft,
  messages,
  setEditDraft,
  closeMessageActions,
  setActionError,
  setActionStatus,
  handleSaveEdit,
  handleDeleteMessage,
  handleRewindToMessage,
  handleBranchFromMessage,
  onBranchToCharacter,
  handleTogglePin,
  setMessageAction,
  characterMemoryType,
}: MessageActionsBottomSheetProps) {

  const canEdit = messageAction?.message.role === "assistant" || (() => {
    const userMessages = messages.filter(m => m.role === "user" && !m.id.startsWith("placeholder"));
    const latestUserMessage = userMessages[userMessages.length - 1];
    return latestUserMessage?.id === messageAction?.message.id;
  })();

  const handleCopy = async () => {
    if (!messageAction) return;
    try {
      await navigator.clipboard?.writeText(messageAction.message.content);
      setActionStatus("Copied!");
      setTimeout(() => setActionStatus(null), 1500);
    } catch (copyError) {
      setActionError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  };

  return (
    <BottomMenu
      isOpen={Boolean(messageAction)}
      includeExitIcon={false}
      onClose={() => closeMessageActions(true)}
      title={messageAction?.message.role === "assistant" ? "Assistant Message" : "User Message"}
    >
      {messageAction && (
        <div className="text-white">
          {/* Token usage - minimal */}
          {messageAction.message.usage && (
            <div className="flex items-center gap-2 text-xs text-white/40 mb-4">
              <span>{messageAction.message.usage.promptTokens ?? 0} in</span>
              <span>·</span>
              <span>{messageAction.message.usage.completionTokens ?? 0} out</span>
              <span>·</span>
              <span className="text-white/60 font-medium">{messageAction.message.usage.totalTokens ?? 0} tokens</span>
            </div>
          )}

          {/* Status messages */}
          {actionStatus && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10">
              <p className="text-sm text-emerald-200">{actionStatus}</p>
            </div>
          )}
          {actionError && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-red-400/20 bg-red-400/10">
              <p className="text-sm text-red-200">{actionError}</p>
            </div>
          )}

          {messageAction.mode === "view" ? (
            <div className="space-y-1">
              {/* Memories section */}
              {characterMemoryType === "dynamic" &&
                (messageAction.message.memoryRefs?.length ?? 0) > 0 && (
                  <div className="mb-3 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain size={14} className="text-emerald-400" />
                      <span className="text-xs font-medium text-emerald-300">
                        {messageAction.message.memoryRefs?.length} memories used
                      </span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {(messageAction.message.memoryRefs || []).map((ref, idx) => {
                        const match = ref.match(/^(\d+(\.\d+)?)::(.*)$/);
                        const score = match ? parseFloat(match[1]) : null;
                        const text = match ? match[3] : ref;
                        return (
                          <div key={idx} className="bg-black/20 rounded p-2 text-xs border border-emerald-500/10">
                            {score !== null && (
                              <div className="text-[10px] font-bold text-emerald-400 mb-1">
                                Match: {(score * 100).toFixed(0)}%
                              </div>
                            )}
                            <div className="text-emerald-100/90 leading-relaxed whitespace-pre-wrap">
                              {text}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Basic actions */}
              {canEdit && (
                <ActionRow
                  icon={Edit3}
                  label="Edit"
                  iconBg="bg-blue-500/20"
                  onClick={() => {
                    setActionError(null);
                    setActionStatus(null);
                    setMessageAction({ message: messageAction.message, mode: "edit" });
                    setEditDraft(messageAction.message.content);
                  }}
                />
              )}

              <ActionRow
                icon={Copy}
                label="Copy"
                iconBg="bg-violet-500/20"
                onClick={() => void handleCopy()}
              />

              <ActionRow
                icon={messageAction.message.isPinned ? PinOff : Pin}
                label={messageAction.message.isPinned ? "Unpin" : "Pin"}
                iconBg="bg-amber-500/20"
                onClick={() => void handleTogglePin(messageAction.message)}
                disabled={actionBusy}
              />

              {/* Separator */}
              <div className="h-px bg-white/5 my-2" />

              {/* Chat flow actions */}
              {messageAction.message.role === "assistant" && (
                <ActionRow
                  icon={RotateCcw}
                  label="Rewind to here"
                  iconBg="bg-cyan-500/20"
                  onClick={() => void handleRewindToMessage(messageAction.message)}
                  disabled={actionBusy}
                />
              )}

              <ActionRow
                icon={GitBranch}
                label="Branch from here"
                iconBg="bg-emerald-500/20"
                onClick={() => void handleBranchFromMessage(messageAction.message)}
                disabled={actionBusy}
              />

              <ActionRow
                icon={Users}
                label="Branch to character"
                iconBg="bg-pink-500/20"
                onClick={() => onBranchToCharacter(messageAction.message)}
                disabled={actionBusy}
              />

              {/* Separator */}
              <div className="h-px bg-white/5 my-2" />

              <ActionRow
                icon={Trash2}
                label={messageAction.message.isPinned ? "Unpin to delete" : "Delete"}
                onClick={() => void handleDeleteMessage(messageAction.message)}
                disabled={actionBusy || messageAction.message.isPinned}
                variant="danger"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                rows={5}
                className={cn(
                  "w-full p-3 text-sm text-white placeholder-white/40",
                  "border border-white/10 bg-black/30",
                  "focus:border-white/20 focus:outline-none resize-none",
                  radius.lg
                )}
                placeholder="Edit your message..."
                disabled={actionBusy}
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setActionError(null);
                    setActionStatus(null);
                    setMessageAction({ message: messageAction.message, mode: "view" });
                    setEditDraft(messageAction.message.content);
                  }}
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-medium text-white/70 transition",
                    "border border-white/10 bg-white/5",
                    "hover:bg-white/10 hover:text-white",
                    "active:scale-[0.98]",
                    radius.lg
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
                  disabled={actionBusy}
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-semibold text-white transition",
                    "bg-emerald-500",
                    "hover:bg-emerald-400",
                    "active:scale-[0.98]",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    radius.lg
                  )}
                >
                  {actionBusy ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </BottomMenu>
  );
}
