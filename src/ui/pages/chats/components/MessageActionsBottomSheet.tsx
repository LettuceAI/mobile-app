import { Edit3, Copy, RotateCcw, Trash2, Pin, PinOff, Brain } from "lucide-react";
import { BottomMenu, MenuButton } from "../../../components/BottomMenu";
import type { StoredMessage } from "../../../../core/storage/schemas";
import { useEffect } from "react";

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
  handleTogglePin: (message: StoredMessage) => Promise<void>;
  setMessageAction: (value: MessageActionState | null) => void;
  characterMemoryType?: string | null;
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
  handleTogglePin,
  setMessageAction,
  characterMemoryType,
}: MessageActionsBottomSheetProps) {

  useEffect(() => {
    console.log("Character Memory Type:", characterMemoryType, (messageAction?.message.memoryRefs?.length ?? 0) > 0 )
  }, []);

  return (
    <BottomMenu
      isOpen={Boolean(messageAction)}
      includeExitIcon={false}
      onClose={() => closeMessageActions(true)}
      title={messageAction?.message.role === "assistant" ? "Assistant Message" : "User Message"}
    >
      {messageAction && (
        <div className="space-y-4 text-white">
          {/* Token usage */}
          {messageAction.message.usage && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">Token Usage</span>
                <span className="text-sm font-medium text-white">
                  {messageAction.message.usage.totalTokens ?? "—"}
                </span>
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-white/40">
                <span>Prompt: {messageAction.message.usage.promptTokens ?? "—"}</span>
                <span>Response: {messageAction.message.usage.completionTokens ?? "—"}</span>
              </div>
            </div>
          )}

          {/* Status messages */}
          {actionStatus && (
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
              <p className="text-sm text-emerald-200">{actionStatus}</p>
            </div>
          )}
          {actionError && (
            <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2">
              <p className="text-sm text-red-200">{actionError}</p>
            </div>
          )}

          {messageAction.mode === "view" ? (
            <div className="space-y-3">
              {characterMemoryType === "dynamic" &&
                (messageAction.message.memoryRefs?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain size={14} className="text-emerald-300" />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-200/80">Memories Used</span>
                    </div>
                    <div className="space-y-1 text-xs leading-relaxed text-emerald-100/70">
                      {(messageAction.message.memoryRefs || []).slice(0, 8).map((mem, idx) => (
                        <div key={idx} className="line-clamp-2">
                          • {mem}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Primary actions - conditional based on message type */}
              {messageAction.message.role === "assistant" || (() => {
                const userMessages = messages.filter(m => m.role === "user" && !m.id.startsWith("placeholder"));
                const latestUserMessage = userMessages[userMessages.length - 1];
                return latestUserMessage?.id === messageAction.message.id;
              })() ? (
                <MenuButton
                  icon={Edit3}
                  title="Edit message"
                  description="Modify the content"
                  color="from-indigo-500 to-blue-600"
                  onClick={() => {
                    setActionError(null);
                    setActionStatus(null);
                    setMessageAction({ message: messageAction.message, mode: "edit" });
                    setEditDraft(messageAction.message.content);
                  }}
                />
              ) : null}

              {/* Copy action */}
              <MenuButton
                icon={Copy}
                title="Copy content"
                description="Copy to clipboard"
                color="from-purple-500 to-purple-600"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(messageAction.message.content);
                    setActionStatus("Copied to clipboard");
                    setTimeout(() => setActionStatus(null), 1500);
                  } catch (copyError) {
                    setActionError(copyError instanceof Error ? copyError.message : String(copyError));
                  }
                }}
              />

              {/* Pin/Unpin action */}
              <MenuButton
                icon={messageAction.message.isPinned ? PinOff : Pin}
                title={messageAction.message.isPinned ? "Unpin message" : "Pin message"}
                description={messageAction.message.isPinned ? "Remove pin protection" : "Protect from deletion and rewind"}
                color="from-blue-500 to-blue-600"
                onClick={() => void handleTogglePin(messageAction.message)}
                disabled={actionBusy}
              />

              {/* Assistant-specific actions */}
              {messageAction.message.role === "assistant" && (
                <MenuButton
                  icon={RotateCcw}
                  title="Rewind to here"
                  description="Remove all messages after this point"
                  color="from-indigo-500 to-blue-600"
                  onClick={() => void handleRewindToMessage(messageAction.message)}
                  disabled={actionBusy}
                />
              )}

              {/* Delete action */}
              <MenuButton
                icon={Trash2}
                title="Delete message"
                description={messageAction.message.isPinned ? "Unpin first to delete" : "Remove this message permanently"}
                color="from-rose-500 to-red-600"
                onClick={() => void handleDeleteMessage(messageAction.message)}
                disabled={actionBusy || messageAction.message.isPinned}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none resize-none"
                placeholder="Edit your message..."
                disabled={actionBusy}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setActionError(null);
                    setActionStatus(null);
                    setMessageAction({ message: messageAction.message, mode: "view" });
                    setEditDraft(messageAction.message.content);
                  }}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
                  disabled={actionBusy}
                  className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
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
