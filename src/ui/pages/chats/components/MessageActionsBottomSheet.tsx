import { Edit3, Copy, RotateCcw, Trash2, Pin, PinOff } from "lucide-react";
import { BottomMenu } from "../../../components/BottomMenu";
import type { StoredMessage } from "../../../../core/storage/schemas";

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
}: MessageActionsBottomSheetProps) {
  return (
    <BottomMenu
      isOpen={Boolean(messageAction)}
      includeExitIcon={false}
      onClose={() => closeMessageActions(true)}
      title={messageAction?.message.role === "assistant" ? "Assistant Message" : "User Message"}
    >
      {messageAction && (
        <div className="space-y-4 text-white">
          {/* Token usage - simplified and clean */}
          {messageAction.message.usage && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Token Usage</span>
                <span className="text-sm font-medium text-white">
                  {messageAction.message.usage.totalTokens ?? "—"}
                </span>
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>Prompt: {messageAction.message.usage.promptTokens ?? "—"}</span>
                <span>Response: {messageAction.message.usage.completionTokens ?? "—"}</span>
              </div>
            </div>
          )}

          {/* Status messages */}
          {actionStatus && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <p className="text-sm text-emerald-200">{actionStatus}</p>
            </div>
          )}
          {actionError && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-sm text-red-200">{actionError}</p>
            </div>
          )}

          {messageAction.mode === "view" ? (
            <div className="space-y-3">
              {/* Primary actions - conditional based on message type */}
              {messageAction.message.role === "assistant" || (() => {
                // For user messages, only show edit if it's the latest user message
                const userMessages = messages.filter(m => m.role === "user" && !m.id.startsWith("placeholder"));
                const latestUserMessage = userMessages[userMessages.length - 1];
                return latestUserMessage?.id === messageAction.message.id;
              })() ? (
                <button
                  onClick={() => {
                    setActionError(null);
                    setActionStatus(null);
                    setMessageAction({ message: messageAction.message, mode: "edit" });
                    setEditDraft(messageAction.message.content);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-white transition hover:border-white/25 hover:bg-white/10"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                    <Edit3 size={16} />
                  </div>
                  <div>
                    <div className="font-medium">Edit message</div>
                    <div className="text-sm text-gray-400">Modify the content</div>
                  </div>
                </button>
              ) : null}

              {/* Copy action - available for all messages */}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(messageAction.message.content);
                    setActionStatus("Copied to clipboard");
                    setTimeout(() => setActionStatus(null), 1500);
                  } catch (copyError) {
                    setActionError(copyError instanceof Error ? copyError.message : String(copyError));
                  }
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-white transition hover:border-white/25 hover:bg-white/10"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/10">
                  <Copy size={16} />
                </div>
                <div>
                  <div className="font-medium">Copy content</div>
                  <div className="text-sm text-gray-400">Copy to clipboard</div>
                </div>
              </button>

              {/* Pin/Unpin action - available for all messages */}
              <button
                onClick={() => void handleTogglePin(messageAction.message)}
                disabled={actionBusy}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:border-blue-500/30 hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50 ${
                  messageAction.message.isPinned
                    ? "border-blue-500/20 bg-blue-500/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                  messageAction.message.isPinned
                    ? "border-blue-500/20 bg-blue-500/15"
                    : "border-white/10 bg-white/10"
                }`}>
                  {messageAction.message.isPinned ? (
                    <PinOff size={16} className="text-blue-200" />
                  ) : (
                    <Pin size={16} className="text-white" />
                  )}
                </div>
                <div>
                  <div className={`font-medium ${messageAction.message.isPinned ? "text-blue-100" : "text-white"}`}>
                    {messageAction.message.isPinned ? "Unpin message" : "Pin message"}
                  </div>
                  <div className={`text-sm ${messageAction.message.isPinned ? "text-blue-200/70" : "text-gray-400"}`}>
                    {messageAction.message.isPinned ? "Remove pin protection" : "Protect from deletion and rewind"}
                  </div>
                </div>
              </button>

              {/* Assistant-specific actions */}
              {messageAction.message.role === "assistant" && (
                <button
                  onClick={() => void handleRewindToMessage(messageAction.message)}
                  disabled={actionBusy}
                  className="flex w-full items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-left transition hover:border-amber-500/30 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/15">
                    <RotateCcw size={16} className="text-amber-200" />
                  </div>
                  <div>
                    <div className="font-medium text-amber-100">Rewind to here</div>
                    <div className="text-sm text-amber-200/70">Remove all messages after this point</div>
                  </div>
                </button>
              )}

              {/* Delete action */}
              <button
                onClick={() => void handleDeleteMessage(messageAction.message)}
                disabled={actionBusy || messageAction.message.isPinned}
                className="flex w-full items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-2 text-left transition hover:border-red-500/30 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/15">
                  <Trash2 size={16} className="text-red-200" />
                </div>
                <div>
                  <div className="font-medium text-red-100">Delete message</div>
                  <div className="text-sm text-red-200/70">
                    {messageAction.message.isPinned ? "Unpin first to delete" : "Remove this message permanently"}
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-white/15 bg-black/40 p-4 text-sm text-white placeholder-gray-400 focus:border-emerald-400 focus:outline-none resize-none"
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
                  className="flex-1 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
                  disabled={actionBusy}
                  className="flex-1 rounded-full border border-emerald-400/50 bg-emerald-500/20 px-6 py-3 text-sm font-medium text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
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