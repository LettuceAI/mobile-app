import { useMemo } from "react";
import { motion, type PanInfo } from "framer-motion";
import { ArrowLeft, Loader2, RefreshCw, Settings } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { MarkdownRenderer } from "../../components/MarkdownRenderer";
import { BottomMenu } from "../../components/BottomMenu";
import { useChatController } from "./hooks/useChatController";
import type { StoredMessage } from "../../../core/storage/schemas";

const LONG_PRESS_DELAY = 450;

export function ChatConversationPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();

  const {
    character,
    session,
    messages,
    draft,
    setDraft,
    loading,
    sending,
    error,
    setError,
    messageAction,
    setMessageAction,
    actionError,
    setActionError,
    actionStatus,
    setActionStatus,
    actionBusy,
    setActionBusy,
    editDraft,
    setEditDraft,
    heldMessageId,
    setHeldMessageId,
    regeneratingMessageId,
    handleSend,
    handleRegenerate,
    getVariantState,
    handleVariantSwipe,
    handleVariantDrag,
    handleSaveEdit,
    handleDeleteMessage,
    resetMessageActions,
    initializeLongPressTimer,
  } = useChatController(characterId);

  const avatarDisplay = useMemo(() => {
    if (character?.avatarPath && isImageLike(character.avatarPath)) {
      return (
        <img
          src={character.avatarPath}
          alt={character?.name ?? "avatar"}
          className="h-10 w-10 rounded-xl object-cover"
        />
      );
    }

    const initials = character?.name ? character.name.slice(0, 2).toUpperCase() : "?";
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm font-semibold text-white">
        {initials}
      </div>
    );
  }, [character]);

  const openMessageActions = (message: StoredMessage) => {
    setMessageAction({ message, mode: "view" });
    setEditDraft(message.content);
    setActionError(null);
    setActionStatus(null);
    setActionBusy(false);
  };

  const scheduleLongPress = (message: StoredMessage) => {
    const timer = window.setTimeout(() => {
      initializeLongPressTimer(null);
      openMessageActions(message);
    }, LONG_PRESS_DELAY);
    initializeLongPressTimer(timer);
  };

  const handlePressStart = (message: StoredMessage) => () => {
    if (message.id.startsWith("placeholder")) return;
    setHeldMessageId(message.id);
    scheduleLongPress(message);
  };

  const handlePressEnd = () => {
    initializeLongPressTimer(null);
    setHeldMessageId(null);
  };

  const handleContextMenu = (message: StoredMessage) => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    initializeLongPressTimer(null);
    if (message.id.startsWith("placeholder")) return;
    openMessageActions(message);
    setHeldMessageId(null);
  };

  const closeMessageActions = (force = false) => {
    if (!force && (actionBusy || messageAction?.mode === "edit")) {
      return;
    }
    resetMessageActions();
  };

  const headerTitle = useMemo(() => character?.name ?? "Unknown", [character?.name]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-white/10 border-t-white/70" />
      </div>
    );
  }

  if (!character || !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center text-gray-400">
        <p className="text-lg font-semibold text-white">Character not found</p>
        <button
          onClick={() => navigate(-1)}
          className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white transition hover:border-white/30"
        >
          Go back
        </button>
      </div>
    );
  }

  const handleSendMessage = async () => {
    if (sending || !draft.trim()) return;
    setError(null);
    const content = draft.trim();
    setDraft("");
    await handleSend(content);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#050505]">
      <header className="z-20 flex-shrink-0 border-b border-white/10 bg-[#050505]/95 px-3 pb-3 pt-5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
            {avatarDisplay}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{headerTitle}</p>
              {character.description && (
                <p className="truncate text-xs text-gray-400">{character.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => console.log("open settings")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/25"
            aria-label="Conversation settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="relative flex-1 overflow-y-auto">
        <div className="space-y-6 px-3 pb-24 pt-4">
          {messages.map((message, index) => {
            const isAssistant = message.role === "assistant";
            const actionable = isAssistant && !message.id.startsWith("placeholder");
            const eventHandlers = actionable
              ? {
                  onMouseDown: handlePressStart(message),
                  onMouseUp: handlePressEnd,
                  onMouseLeave: handlePressEnd,
                  onTouchStart: handlePressStart(message),
                  onTouchEnd: handlePressEnd,
                  onTouchCancel: handlePressEnd,
                  onContextMenu: handleContextMenu(message),
                }
              : {};
            const isLatestAssistant = actionable && index === messages.length - 1;
            const variantState = getVariantState(message);
            const totalVariants = variantState.total || (isAssistant ? 1 : 0);
            const selectedVariantIndex =
              variantState.selectedIndex >= 0 ? variantState.selectedIndex : totalVariants > 0 ? totalVariants - 1 : -1;
            const enableSwipe = isLatestAssistant && (variantState.variants?.length ?? 0) > 1;
            const dragProps = enableSwipe
              ? {
                  drag: "x" as const,
                  dragConstraints: { left: -140, right: 140 },
                  dragElastic: 0.12,
                  dragMomentum: false,
                  dragSnapToOrigin: true,
                  dragTransition: { bounceStiffness: 520, bounceDamping: 36 },
                  onDragEnd: (_: unknown, info: PanInfo) =>
                    void handleVariantDrag(message.id, info.offset.x),
                }
              : {};
            const layoutEnabled = !enableSwipe;

            return (
              <div
                key={message.id}
                className={`relative flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <motion.div
                  layout={layoutEnabled}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition ${
                    message.role === "user"
                      ? `ml-auto bg-gradient-to-br from-emerald-500/60 to-emerald-400/40 text-white ${
                          heldMessageId === message.id ? "ring-2 ring-white/60" : ""
                        }`
                      : `bg-white/5 text-gray-100 ${
                          heldMessageId === message.id ? "border border-white/30" : "border border-transparent"
                        }`
                  }`}
                  {...eventHandlers}
                  {...dragProps}
                  whileDrag={enableSwipe ? { scale: 0.995 } : undefined}
                >
                  <MarkdownRenderer content={message.content} className="text-inherit" />

                  {isAssistant && totalVariants > 0 && (
                    <div className="mt-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
                      <span>
                        Variant {selectedVariantIndex >= 0 ? selectedVariantIndex + 1 : 1}
                        {totalVariants > 0 ? ` / ${totalVariants}` : ""}
                      </span>
                      {regeneratingMessageId === message.id && (
                        <span className="flex items-center gap-1 text-emerald-200">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Regenerating
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>

                {isLatestAssistant && (
                  <div className="absolute -bottom-4 right-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRegenerate(message)}
                      disabled={regeneratingMessageId === message.id || sending}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Regenerate response"
                    >
                      {regeneratingMessageId === message.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#050505] via-[#050505e6] to-transparent" />
      </main>

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
            onClick={handleSendMessage}
            disabled={!draft.trim() || sending}
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </footer>

      <BottomSheet
        messageAction={messageAction}
        actionError={actionError}
        actionStatus={actionStatus}
        actionBusy={actionBusy}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        closeMessageActions={closeMessageActions}
        setActionError={setActionError}
        setActionStatus={setActionStatus}
        handleSaveEdit={handleSaveEdit}
        handleDeleteMessage={handleDeleteMessage}
        setMessageAction={setMessageAction}
      />
    </div>
  );
}

function BottomSheet({
  messageAction,
  actionError,
  actionStatus,
  actionBusy,
  editDraft,
  setEditDraft,
  closeMessageActions,
  setActionError,
  setActionStatus,
  handleSaveEdit,
  handleDeleteMessage,
  setMessageAction,
}: {
  messageAction: { message: StoredMessage; mode: "view" | "edit" } | null;
  actionError: string | null;
  actionStatus: string | null;
  actionBusy: boolean;
  editDraft: string;
  setEditDraft: (value: string) => void;
  closeMessageActions: (force?: boolean) => void;
  setActionError: (value: string | null) => void;
  setActionStatus: (value: string | null) => void;
  handleSaveEdit: () => Promise<void>;
  handleDeleteMessage: (message: StoredMessage) => Promise<void>;
  setMessageAction: (value: { message: StoredMessage; mode: "view" | "edit" } | null) => void;
}) {
  return (
    <BottomMenu
      isOpen={Boolean(messageAction)}
      onClose={() => closeMessageActions(true)}
      title="Assistant message"
    >
      {messageAction && (
        <div className="space-y-4 text-white">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Token usage</p>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <dt className="text-gray-400">Prompt</dt>
                <dd className="mt-1 text-white">
                  {messageAction.message.usage?.promptTokens ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Completion</dt>
                <dd className="mt-1 text-white">
                  {messageAction.message.usage?.completionTokens ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Total</dt>
                <dd className="mt-1 text-white">
                  {messageAction.message.usage?.totalTokens ?? "—"}
                </dd>
              </div>
            </dl>
          </div>

          {actionStatus && <p className="text-xs text-emerald-200">{actionStatus}</p>}
          {actionError && <p className="text-xs text-red-300">{actionError}</p>}

          <div className="space-y-3">
            {messageAction.mode === "view" ? (
              <>
                <button
                  onClick={() => {
                    setActionError(null);
                    setActionStatus(null);
                    setMessageAction({ message: messageAction.message, mode: "edit" });
                    setEditDraft(messageAction.message.content);
                  }}
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/15"
                >
                  Edit message
                </button>
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
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/10"
                >
                  Copy content
                </button>
                <button
                  onClick={() => void handleDeleteMessage(messageAction.message)}
                  disabled={actionBusy}
                  className="w-full rounded-xl border border-red-500/40 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-400/60 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete message
                </button>
              </>
            ) : (
              <>
                <textarea
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-white/15 bg-black/40 p-3 text-sm text-white focus:border-emerald-400 focus:outline-none"
                  disabled={actionBusy}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setActionError(null);
                      setActionStatus(null);
                      setMessageAction({ message: messageAction.message, mode: "view" });
                      setEditDraft(messageAction.message.content);
                    }}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/25 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleSaveEdit()}
                    disabled={actionBusy}
                    className="rounded-full border border-emerald-400/50 bg-emerald-500/30 px-4 py-2 text-xs font-semibold text-white transition hover:border-emerald-300 hover:bg-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionBusy ? "Saving..." : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </BottomMenu>
  );
}

function isImageLike(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
}
