import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { StoredMessage } from "../../../core/storage/schemas";

import { useChatController } from "./hooks/useChatController";
import { 
  ChatHeader, 
  ChatFooter, 
  ChatMessage, 
  MessageActionsBottomSheet,
  LoadingSpinner,
  EmptyState
} from "./components";

const LONG_PRESS_DELAY = 450;

export function ChatConversationPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId") || undefined;

  const chatController = useChatController(characterId, { sessionId });
  
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
    handleContinue,
    handleRegenerate,
    getVariantState,
    handleVariantDrag,
    handleSaveEdit,
    handleDeleteMessage,
    resetMessageActions,
    initializeLongPressTimer,
  } = chatController;

  const openMessageActions = useCallback((message: StoredMessage) => {
    setMessageAction({ message, mode: "view" });
    setEditDraft(message.content);
    setActionError(null);
    setActionStatus(null);
    setActionBusy(false);
  }, [setMessageAction, setEditDraft, setActionError, setActionStatus, setActionBusy]);

  const scheduleLongPress = useCallback((message: StoredMessage) => {
    const timer = window.setTimeout(() => {
      initializeLongPressTimer(null);
      openMessageActions(message);
    }, LONG_PRESS_DELAY);
    initializeLongPressTimer(timer);
  }, [initializeLongPressTimer, openMessageActions]);

  const handlePressStart = useCallback((message: StoredMessage) => () => {
    if (message.id.startsWith("placeholder")) return;
    setHeldMessageId(message.id);
    scheduleLongPress(message);
  }, [scheduleLongPress, setHeldMessageId]);

  const handlePressEnd = useCallback(() => {
    initializeLongPressTimer(null);
    setHeldMessageId(null);
  }, [initializeLongPressTimer, setHeldMessageId]);

  const handleContextMenu = useCallback((message: StoredMessage) => (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    initializeLongPressTimer(null);
    if (message.id.startsWith("placeholder")) return;
    openMessageActions(message);
    setHeldMessageId(null);
  }, [initializeLongPressTimer, setHeldMessageId, openMessageActions]);

  const closeMessageActions = useCallback((force = false) => {
    if (!force && (actionBusy || messageAction?.mode === "edit")) {
      return;
    }
    resetMessageActions();
  }, [actionBusy, messageAction?.mode, resetMessageActions]);

  const handleSendMessage = useCallback(async () => {
    if (sending) return;
    setError(null);
    
    if (draft.trim()) {
      // Regular send with user message
      const content = draft.trim();
      setDraft("");
      await handleSend(content);
    } else {
      // Continue conversation without user input
      await handleContinue();
    }
  }, [sending, setError, draft, setDraft, handleSend, handleContinue]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!character || !session) {
    return <EmptyState title="Character not found" />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#050505]">
      <ChatHeader character={character} />

      <main className="relative flex-1 overflow-y-auto">
        <div 
          className="space-y-6 px-3 pb-24 pt-4"
          style={{ 
            willChange: 'scroll-position',
            transform: 'translateZ(0)', // Force GPU acceleration for scroll
          }}
        >
          {messages.map((message, index) => {
            const isAssistant = message.role === "assistant";
            const isUser = message.role === "user";
            const actionable = (isAssistant || isUser) && !message.id.startsWith("placeholder");
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

            return (
              <ChatMessage
                key={message.id}
                message={message}
                index={index}
                messagesLength={messages.length}
                heldMessageId={heldMessageId}
                regeneratingMessageId={regeneratingMessageId}
                sending={sending}
                eventHandlers={eventHandlers}
                getVariantState={getVariantState}
                handleVariantDrag={handleVariantDrag}
                handleRegenerate={handleRegenerate}
              />
            );
          })}
        </div>
      </main>

      <ChatFooter
        draft={draft}
        setDraft={setDraft}
        error={error}
        sending={sending}
        character={character}
        onSendMessage={handleSendMessage}
      />

      <MessageActionsBottomSheet
        messageAction={messageAction}
        actionError={actionError}
        actionStatus={actionStatus}
        actionBusy={actionBusy}
        editDraft={editDraft}
        messages={messages}
        setEditDraft={setEditDraft}
        closeMessageActions={closeMessageActions}
        setActionError={setActionError}
        setActionStatus={setActionStatus}
        handleSaveEdit={handleSaveEdit}
        handleDeleteMessage={handleDeleteMessage}
        handleRewindToMessage={chatController.handleRewindToMessage}
        setMessageAction={setMessageAction}
      />
    </div>
  );
}
