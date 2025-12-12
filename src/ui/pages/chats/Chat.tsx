import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { Character, Model, StoredMessage } from "../../../core/storage/schemas";
import { useImageData } from "../../hooks/useImageData";
import { isImageLight, getThemeForBackground, type ThemeColors } from "../../../core/utils/imageAnalysis";
import { getSessionMeta, listCharacters, readSettings } from "../../../core/storage";

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
import { BottomMenu } from "../../components";
import { useAvatar } from "../../hooks/useAvatar";
import { radius, cn } from "../../design-tokens";

const LONG_PRESS_DELAY = 450;
const SCROLL_THRESHOLD = 10; // pixels of movement to cancel long press
const AUTOLOAD_TOP_THRESHOLD_PX = 120;
const STICKY_BOTTOM_THRESHOLD_PX = 80;

export function ChatConversationPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("sessionId") || undefined;
  const jumpToMessageId = searchParams.get("jumpToMessage");

  const chatController = useChatController(characterId, { sessionId });
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const pressStartPosition = useRef<{ x: number; y: number } | null>(null);
  const [sessionForHeader, setSessionForHeader] = useState(chatController.session);
  const pendingScrollAdjustRef = useRef<{ prevScrollTop: number; prevScrollHeight: number } | null>(null);
  const loadingOlderRef = useRef(false);
  const isAtBottomRef = useRef(true);

  const [showCharacterSelector, setShowCharacterSelector] = useState(false);
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);
  const [messageToBranch, setMessageToBranch] = useState<StoredMessage | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ src: string; alt: string } | null>(null);
  const [isMultimodelModel, setIsMultimodelModel] = useState(false);

  const handleImageClick = useCallback((src: string, alt: string) => {
    setSelectedImage({ src, alt });
  }, []);

  useEffect(() => {
    if (showCharacterSelector) {
      listCharacters().then(setAvailableCharacters).catch(console.error);
    }
  }, [showCharacterSelector]);


  // Reload session data when memories change
  const handleSessionUpdate = useCallback(async () => {
    if (sessionId) {
      const updatedSession = await getSessionMeta(sessionId);
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
    pendingAttachments,
    addPendingAttachment,
    removePendingAttachment,
    handleSend,
    handleContinue,
    handleRegenerate,
    handleAbort,
    hasMoreMessagesBefore,
    loadOlderMessages,
    ensureMessageLoaded,
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
    const checkModelType = async () => {
      if (!character) {
        setIsMultimodelModel(false);
        return;
      }
      try {
        const settings = await readSettings();
        const effectiveModelId = character.defaultModelId || settings.defaultModelId;
        const currentModel = settings.models.find((m: Model) => m.id === effectiveModelId);
        setIsMultimodelModel(currentModel?.modelType === "multimodel");
      } catch (err) {
        console.error("Failed to check model type:", err);
        setIsMultimodelModel(false);
      }
    };
    checkModelType();
  }, [character]);

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

  const loadOlderFromDb = useCallback(async () => {
    if (!hasMoreMessagesBefore) return;
    if (loadingOlderRef.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    loadingOlderRef.current = true;
    pendingScrollAdjustRef.current = {
      prevScrollTop: container.scrollTop,
      prevScrollHeight: container.scrollHeight,
    };
    try {
      await loadOlderMessages();
    } finally {
      // scroll restore happens in the messages-length effect
    }
  }, [hasMoreMessagesBefore, loadOlderMessages]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, clientHeight, scrollHeight } = container;

    const atBottom = scrollTop + clientHeight >= scrollHeight - STICKY_BOTTOM_THRESHOLD_PX;
    isAtBottomRef.current = atBottom;

    if (scrollTop <= AUTOLOAD_TOP_THRESHOLD_PX && hasMoreMessagesBefore) {
      void loadOlderFromDb();
    }
  }, [hasMoreMessagesBefore, loadOlderFromDb]);

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

    const hasContent = draft.trim().length > 0 || pendingAttachments.length > 0;

    if (hasContent) {
      const content = draft.trim();
      setDraft("");
      await handleSend(content);
    } else {
      await handleContinue();
    }
  }, [sending, setError, draft, setDraft, handleSend, handleContinue, pendingAttachments]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    if (!isAtBottomRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages.length]);

  useEffect(() => {
    const adjust = pendingScrollAdjustRef.current;
    if (!adjust) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    // Preserve the visible viewport position when prepending older messages.
    const nextScrollHeight = container.scrollHeight;
    const delta = nextScrollHeight - adjust.prevScrollHeight;
    container.scrollTop = adjust.prevScrollTop + delta;
    pendingScrollAdjustRef.current = null;
    loadingOlderRef.current = false;
  }, [messages.length]);

  useEffect(() => {
    if (!jumpToMessageId || loading) return;

    let cancelled = false;

    (async () => {
      await ensureMessageLoaded(jumpToMessageId);
      if (cancelled) return;

      let rafId: number | null = null;
      let tries = 0;
      const tryScroll = () => {
        const element = document.getElementById(`message-${jumpToMessageId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("bg-white/10", "rounded-lg", "transition-colors", "duration-1000");
          window.setTimeout(() => {
            element.classList.remove("bg-white/10");
          }, 2000);
          return;
        }

        tries += 1;
        if (tries < 20) {
          rafId = window.requestAnimationFrame(tryScroll);
        }
      };

      rafId = window.requestAnimationFrame(tryScroll);
      return () => {
        if (rafId !== null) window.cancelAnimationFrame(rafId);
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [ensureMessageLoaded, jumpToMessageId, loading, messages.length]);

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
      <main
        ref={scrollContainerRef}
        className="relative z-10 flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div
          className="space-y-6 px-3 pb-24 pt-4"
          style={{
            backgroundColor: backgroundImageData ? theme.contentOverlay : 'transparent',
          }}
        >
          {hasMoreMessagesBefore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void loadOlderFromDb()}
                className={cn(
                  "px-3 py-1.5 text-xs text-white/70 border border-white/15 bg-white/5 hover:bg-white/10",
                  radius.full
                )}
              >
                Load earlier messages
              </button>
            </div>
          )}

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
              <div
                key={message.id}
                id={`message-${message.id}`}
                className="scroll-mt-24 transition-colors duration-500"
              >
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
                  onImageClick={handleImageClick}
                />
              </div>
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
          pendingAttachments={pendingAttachments}
          onAddAttachment={isMultimodelModel ? addPendingAttachment : undefined}
          onRemoveAttachment={isMultimodelModel ? removePendingAttachment : undefined}
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
            navigate(`/chat/${characterId}?sessionId=${newSessionId}`);
          }
          return newSessionId;
        }}
        onBranchToCharacter={(message) => {
          setMessageToBranch(message);
          closeMessageActions(true);
          setShowCharacterSelector(true);
        }}
        handleTogglePin={chatController.handleTogglePin}
        setMessageAction={setMessageAction}
        characterMemoryType={character?.memoryType}
      />

      {/* Character Selection for Branch */}
      <BottomMenu
        isOpen={showCharacterSelector}
        onClose={() => {
          setShowCharacterSelector(false);
          setMessageToBranch(null);
        }}
        title="Select Character"
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-white/50 mb-4">
            Choose a character to continue this conversation with:
          </p>
          {availableCharacters
            .filter(c => c.id !== characterId)
            .map((char) => (
              <CharacterOption
                key={char.id}
                character={char}
                onClick={async () => {
                  if (!messageToBranch) return;
                  const result = await chatController.handleBranchToCharacter(messageToBranch, char.id);
                  if (result) {
                    setShowCharacterSelector(false);
                    setMessageToBranch(null);
                    navigate(`/chat/${result.characterId}?sessionId=${result.sessionId}`);
                  }
                }}
              />
            ))}
          {availableCharacters.filter(c => c.id !== characterId).length === 0 && (
            <p className="text-center text-white/40 py-8">
              No other characters available. Create more characters first.
            </p>
          )}
        </div>
      </BottomMenu>

      {/* Full-screen Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/95 p-4"
            onClick={() => setSelectedImage(null)}
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute right-6 top-10 z-101 flex h-10 w-11 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-400"
              onClick={() => setSelectedImage(null)}
            >
              <X size={24} />
            </motion.button>
            <motion.img
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CharacterOption({ character, onClick }: { character: Character; onClick: () => void }) {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 p-3 text-left transition",
        radius.lg,
        "border border-white/10 bg-white/5",
        "hover:border-white/20 hover:bg-white/10",
        "active:scale-[0.99]"
      )}
    >
      <div className={cn("h-10 w-10 overflow-hidden shrink-0", radius.full, "bg-white/10")}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white/50 font-semibold">
            {character.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-white truncate">{character.name}</h3>
        <p className="text-xs text-white/50 truncate">
          {character.description || "No description"}
        </p>
      </div>
    </button>
  );
}
