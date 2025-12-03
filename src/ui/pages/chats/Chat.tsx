import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import type { StoredMessage } from "../../../core/storage/schemas";
import { useImageData } from "../../hooks/useImageData";
import { isImageLight, getThemeForBackground, type ThemeColors } from "../../../core/utils/imageAnalysis";
import { getSession } from "../../../core/storage";

import { useChatController } from "./hooks/useChatController";
import { replacePlaceholders } from "../../../core/utils/placeholders";
import {
  ChatHeader,
  ChatFooter,
  ChatMessage,
  MessageActionsBottomSheet,
  LoadingSpinner,
  EmptyState
} from "./components";

const LONG_PRESS_DELAY = 450;
const SCROLL_THRESHOLD = 10; // pixels of movement to cancel long press

export function ChatConversationPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("sessionId") || undefined;

  const chatController = useChatController(characterId, { sessionId });
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const pressStartPosition = useRef<{ x: number; y: number } | null>(null);
  const [sessionForHeader, setSessionForHeader] = useState(chatController.session);

  // Reload session data when memories change
  const handleSessionUpdate = useCallback(async () => {
    if (sessionId) {
      const updatedSession = await getSession(sessionId);
      setSessionForHeader(updatedSession);
    }
  }, [sessionId]);

  useEffect(() => {
    setSessionForHeader(chatController.session);
  }, [chatController.session]);

  const {
    character,
    persona,
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
    handleAbort,
    getVariantState,
    handleVariantDrag,
    handleSaveEdit,
    handleDeleteMessage,
    resetMessageActions,
    initializeLongPressTimer,
    isStartingSceneMessage,
  } = chatController;

  const backgroundImageData = useImageData(character?.backgroundImagePath);
  const [theme, setTheme] = useState<ThemeColors>(getThemeForBackground(false));

  useEffect(() => {
    if (character) {
      console.log("[Chat] Character backgroundImagePath:", character.backgroundImagePath || "none");
      console.log("[Chat] Background image data loaded:", backgroundImageData ? "present" : "loading/failed");
    }
  }, [character, backgroundImageData]);

  useEffect(() => {
    if (!backgroundImageData) {
      setTheme(getThemeForBackground(false));
      return;
    }

    let mounted = true;

    isImageLight(backgroundImageData).then((isLight) => {
      if (mounted) {
        setTheme(getThemeForBackground(isLight));
      }
    });

    return () => {
      mounted = false;
    };
  }, [backgroundImageData]);

  const chatBackgroundStyle = useMemo<CSSProperties | undefined>(() => {
    if (!backgroundImageData) {
      return undefined;
    }

    return {
      backgroundImage: `linear-gradient(rgba(5, 5, 5, 0.15), rgba(5, 5, 5, 0.15)), url(${backgroundImageData})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }, [backgroundImageData]);

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

  const handlePressStart = useCallback((message: StoredMessage) => (event: React.MouseEvent | React.TouchEvent) => {
    if (message.id.startsWith("placeholder")) return;
    
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    pressStartPosition.current = { x: clientX, y: clientY };
    
    setHeldMessageId(message.id);
    scheduleLongPress(message);
  }, [scheduleLongPress, setHeldMessageId]);

  const handlePressMove = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!pressStartPosition.current) return;
    
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    const deltaX = Math.abs(clientX - pressStartPosition.current.x);
    const deltaY = Math.abs(clientY - pressStartPosition.current.y);
    
    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
      initializeLongPressTimer(null);
      setHeldMessageId(null);
      pressStartPosition.current = null;
    }
  }, [initializeLongPressTimer, setHeldMessageId]);

  const handlePressEnd = useCallback(() => {
    initializeLongPressTimer(null);
    setHeldMessageId(null);
    pressStartPosition.current = null;
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
      const content = draft.trim();
      setDraft("");
      await handleSend(content);
    } else {
      await handleContinue();
    }
  }, [sending, setError, draft, setDraft, handleSend, handleContinue]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!character || !session) {
    return <EmptyState title="Character not found" />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ backgroundColor: backgroundImageData ? undefined : '#050505' }}>
      {/* Full-screen background image (behind all content) */}
      {backgroundImageData && (
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={chatBackgroundStyle}
        />
      )}

      {/* Header */}
      <div className="relative z-20">
        <ChatHeader 
          character={character} 
          sessionId={sessionId} 
          session={sessionForHeader}
          hasBackgroundImage={!!backgroundImageData}
          onSessionUpdate={handleSessionUpdate}
        />
      </div>

      {/* Main content area */}
      <main ref={scrollContainerRef} className="relative z-10 flex-1 overflow-y-auto">
        <div
          className="space-y-6 px-3 pb-24 pt-4"
          style={{
            backgroundColor: backgroundImageData ? theme.contentOverlay : 'transparent',
          }}
        >
          {messages.map((message, index) => {
            const isAssistant = message.role === "assistant";
            const isUser = message.role === "user";
            const actionable = (isAssistant || isUser) && !message.id.startsWith("placeholder");
            // Replace placeholders for display only
            const charName = character?.name ?? "";
            const personaName = chatController.persona?.title ?? "";
            const displayContent = replacePlaceholders(message.content, charName, personaName);
            const eventHandlers = actionable
              ? {
                onMouseDown: handlePressStart(message),
                onMouseMove: handlePressMove,
                onMouseUp: handlePressEnd,
                onMouseLeave: handlePressEnd,
                onTouchStart: handlePressStart(message),
                onTouchMove: handlePressMove,
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
                isStartingSceneMessage={isStartingSceneMessage(message)}
                theme={theme}
                displayContent={displayContent}
                character={character}
                persona={persona}
              />
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <div className="relative z-10">
        <ChatFooter
          draft={draft}
          setDraft={setDraft}
          error={error}
          sending={sending}
          character={character}
          onSendMessage={handleSendMessage}
          onAbort={handleAbort}
          hasBackgroundImage={!!backgroundImageData}
        />
      </div>

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
        handleBranchFromMessage={async (message) => {
          const newSessionId = await chatController.handleBranchFromMessage(message);
          if (newSessionId && characterId) {
            navigate(`/chats/${characterId}?sessionId=${newSessionId}`);
          }
          return newSessionId;
        }}
        handleTogglePin={chatController.handleTogglePin}
        setMessageAction={setMessageAction}
        characterMemoryType={character?.memoryType}
      />
    </div>
  );
}
