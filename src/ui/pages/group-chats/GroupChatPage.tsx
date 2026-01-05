import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  ChevronDown,
  Loader2,
  Copy,
  Trash2,
  RotateCcw,
  Edit3,
  Users,
  X,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { listen } from "@tauri-apps/api/event";

import { storageBridge } from "../../../core/storage/files";
import { listCharacters, listPersonas } from "../../../core/storage/repo";
import type {
  GroupSession,
  GroupMessage,
  GroupParticipation,
  Character,
  Persona,
} from "../../../core/storage/schemas";
import { radius, interactive, cn } from "../../design-tokens";
import { useAvatar } from "../../hooks/useAvatar";
import { Routes } from "../../navigation";
import { BottomMenu } from "../../components/BottomMenu";
import { GroupChatFooter, GroupChatMessage, type VariantState } from "./components";

const MESSAGES_PAGE_SIZE = 50;

// ============================================================================
// Types
// ============================================================================

interface MessageActionState {
  message: GroupMessage;
  mode: "view" | "edit";
}

// ============================================================================
// Main Component
// ============================================================================

export function GroupChatPage() {
  const { groupSessionId } = useParams<{ groupSessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<GroupSession | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [participationStats, setParticipationStats] = useState<GroupParticipation[]>([]);
  const [showParticipation, setShowParticipation] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState<string | null>(null); // "selecting" | "generating"
  const [_selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  // Ref to track the current placeholder message ID for streaming
  const assistantPlaceholderIdRef = useRef<string | null>(null);
  // Track selected character during generation (for status display)
  const [_selectedCharacterName, setSelectedCharacterName] = useState<string | null>(null);
  const [_selectedCharacterAvatarUrl, setSelectedCharacterAvatarUrl] = useState<string | null>(
    null,
  );
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Message actions state
  const [messageAction, setMessageAction] = useState<MessageActionState | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [heldMessageId, setHeldMessageId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Get current persona
  const currentPersona = useMemo(() => {
    if (!session?.personaId) return null;
    return personas.find((p) => p.id === session.personaId) || null;
  }, [session, personas]);

  // Load session data
  const loadData = useCallback(async () => {
    if (!groupSessionId) return;

    try {
      const [sessionData, chars, personaList, msgs, stats] = await Promise.all([
        storageBridge.groupSessionGet(groupSessionId),
        listCharacters(),
        listPersonas(),
        storageBridge.groupMessagesList(groupSessionId, MESSAGES_PAGE_SIZE),
        storageBridge.groupParticipationStats(groupSessionId),
      ]);

      if (!sessionData) {
        setError("Group session not found");
        return;
      }

      setSession(sessionData);
      setCharacters(chars);
      setPersonas(personaList);
      setMessages(msgs);
      setParticipationStats(stats);
    } catch (err) {
      console.error("Failed to load group chat:", err);
      setError("Failed to load group chat");
    } finally {
      setLoading(false);
    }
  }, [groupSessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-dismiss errors after 10 seconds
  useEffect(() => {
    if (!error) return;

    const timer = setTimeout(() => {
      setError(null);
    }, 10000);

    return () => clearTimeout(timer);
  }, [error]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isAtBottomRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Listen for group chat status events
  useEffect(() => {
    if (!groupSessionId) return;

    const unlisten = listen<{
      sessionId: string;
      status: string;
      characterId?: string;
      characterName?: string;
    }>("group_chat_status", (event) => {
      const { sessionId, status, characterId, characterName } = event.payload;

      // Only process events for this session
      if (sessionId !== groupSessionId) return;

      if (status === "selecting_character") {
        setSendingStatus("selecting");
        setSelectedCharacterId(null);
        setSelectedCharacterName(null);
      } else if (status === "character_selected") {
        setSendingStatus("generating");
        setSelectedCharacterId(characterId || null);
        setSelectedCharacterName(characterName || null);
        // Look up character avatar
        const char = characters.find((c) => c.id === characterId);
        setSelectedCharacterAvatarUrl(char?.avatarPath || null);

        // Update the placeholder message with the selected character
        const placeholderId = assistantPlaceholderIdRef.current;
        if (placeholderId && characterId) {
          setMessages((prev) => {
            return prev.map((m) =>
              m.id === placeholderId ? { ...m, speakerCharacterId: characterId } : m,
            );
          });
        }
      } else if (status === "complete") {
        setSendingStatus(null);
        setSelectedCharacterId(null);
        setSelectedCharacterName(null);
        setSelectedCharacterAvatarUrl(null);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [groupSessionId, characters]);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!groupSessionId || !draft.trim() || sending) return;

    const userMessage = draft.trim();
    const requestId = crypto.randomUUID();
    setDraft("");
    setSending(true);
    setSendingStatus("selecting");
    setError(null);

    // Create stable IDs for placeholders
    const userPlaceholderId = `temp-user-${Date.now()}`;
    const assistantPlaceholderId = `temp-assistant-${Date.now()}`;

    // Store the assistant placeholder ID in ref so the status listener can find it
    assistantPlaceholderIdRef.current = assistantPlaceholderId;

    // Optimistic update - add user message
    const tempUserMessage: GroupMessage = {
      id: userPlaceholderId,
      sessionId: groupSessionId,
      role: "user",
      content: userMessage,
      speakerCharacterId: null,
      turnNumber: messages.length + 1,
      createdAt: Date.now(),
      usage: undefined,
      variants: undefined,
      selectedVariantId: undefined,
      isPinned: false,
      attachments: [],
      reasoning: null,
      selectionReasoning: null,
    };

    // Create placeholder assistant message (will be updated with character when selected)
    const tempAssistantMessage: GroupMessage = {
      id: assistantPlaceholderId,
      sessionId: groupSessionId,
      role: "assistant",
      content: "",
      speakerCharacterId: null, // Will be set when character_selected event fires
      turnNumber: messages.length + 2,
      createdAt: Date.now(),
      usage: undefined,
      variants: undefined,
      selectedVariantId: undefined,
      isPinned: false,
      attachments: [],
      reasoning: null,
      selectionReasoning: null,
    };

    // Add both user and assistant placeholder immediately
    setMessages((prev) => [...prev, tempUserMessage, tempAssistantMessage]);
    scrollToBottom();

    let unlistenNormalized: (() => void) | null = null;

    try {
      // Listen for streaming updates
      unlistenNormalized = await listen<any>(`api-normalized://${requestId}`, (event) => {
        try {
          const payload =
            typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;

          if (payload && payload.type === "delta" && payload.data?.text) {
            // Update the placeholder message with streamed content
            setMessages((prev) => {
              return prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? { ...m, content: m.content + String(payload.data.text) }
                  : m,
              );
            });
          } else if (payload && payload.type === "reasoning" && payload.data?.text) {
            // Update reasoning
            setMessages((prev) => {
              return prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? { ...m, reasoning: (m.reasoning || "") + String(payload.data.text) }
                  : m,
              );
            });
          } else if (payload && payload.type === "error" && payload.data?.message) {
            setError(String(payload.data.message));
          }
        } catch {
          // ignore malformed payloads
        }
      });

      const response = await storageBridge.groupChatSend(
        groupSessionId,
        userMessage,
        true,
        requestId,
      );

      // Update messages with actual saved messages
      const updatedMessages = await storageBridge.groupMessagesList(
        groupSessionId,
        MESSAGES_PAGE_SIZE,
      );
      setMessages(updatedMessages);
      setParticipationStats(response.participationStats);
    } catch (err) {
      console.error("Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to send message");
      // Remove optimistic messages on error
      setMessages((prev) =>
        prev.filter((m) => m.id !== userPlaceholderId && m.id !== assistantPlaceholderId),
      );
    } finally {
      if (unlistenNormalized) unlistenNormalized();
      assistantPlaceholderIdRef.current = null;
      setSending(false);
      setSendingStatus(null);
      setSelectedCharacterId(null);
      setSelectedCharacterName(null);
      setSelectedCharacterAvatarUrl(null);
    }
  }, [groupSessionId, draft, sending, messages.length, scrollToBottom]);

  const handleRegenerate = useCallback(
    async (messageId: string, forceCharacterId?: string) => {
      if (!groupSessionId || regeneratingMessageId) return;

      const requestId = crypto.randomUUID();
      setRegeneratingMessageId(messageId);
      setError(null);

      // Clear the message content to show streaming
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: "", reasoning: null } : m)),
      );

      let unlistenNormalized: (() => void) | null = null;

      try {
        // Listen for streaming updates
        unlistenNormalized = await listen<any>(`api-normalized://${requestId}`, (event) => {
          try {
            const payload =
              typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;

            if (payload && payload.type === "delta" && payload.data?.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId ? { ...m, content: m.content + String(payload.data.text) } : m,
                ),
              );
            } else if (payload && payload.type === "reasoning" && payload.data?.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId
                    ? { ...m, reasoning: (m.reasoning || "") + String(payload.data.text) }
                    : m,
                ),
              );
            } else if (payload && payload.type === "error" && payload.data?.message) {
              setError(String(payload.data.message));
            }
          } catch {
            // ignore malformed payloads
          }
        });

        const response = await storageBridge.groupChatRegenerate(
          groupSessionId,
          messageId,
          forceCharacterId,
          requestId,
        );

        // Update messages with final saved data
        const updatedMessages = await storageBridge.groupMessagesList(
          groupSessionId,
          MESSAGES_PAGE_SIZE,
        );
        setMessages(updatedMessages);
        setParticipationStats(response.participationStats);
      } catch (err) {
        console.error("Failed to regenerate:", err);
        setError(err instanceof Error ? err.message : "Failed to regenerate");
        // Reload messages to restore original content on error
        const updatedMessages = await storageBridge.groupMessagesList(
          groupSessionId,
          MESSAGES_PAGE_SIZE,
        );
        setMessages(updatedMessages);
      } finally {
        if (unlistenNormalized) unlistenNormalized();
        setRegeneratingMessageId(null);
      }
    },
    [groupSessionId, regeneratingMessageId],
  );

  const handleContinue = useCallback(
    async (forceCharacterId?: string) => {
      if (!groupSessionId || sending) return;

      const requestId = crypto.randomUUID();
      const assistantPlaceholderId = `temp-continue-${Date.now()}`;

      setSending(true);
      setSendingStatus("selecting");
      setError(null);

      // Store placeholder ID for status listener
      assistantPlaceholderIdRef.current = assistantPlaceholderId;

      // Create placeholder assistant message
      const tempAssistantMessage: GroupMessage = {
        id: assistantPlaceholderId,
        sessionId: groupSessionId,
        role: "assistant",
        content: "",
        speakerCharacterId: null,
        turnNumber: messages.length + 1,
        createdAt: Date.now(),
        usage: undefined,
        variants: undefined,
        selectedVariantId: undefined,
        isPinned: false,
        attachments: [],
        reasoning: null,
        selectionReasoning: null,
      };

      setMessages((prev) => [...prev, tempAssistantMessage]);
      scrollToBottom();

      let unlistenNormalized: (() => void) | null = null;

      try {
        // Listen for streaming updates
        unlistenNormalized = await listen<any>(`api-normalized://${requestId}`, (event) => {
          try {
            const payload =
              typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;

            if (payload && payload.type === "delta" && payload.data?.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantPlaceholderId
                    ? { ...m, content: m.content + String(payload.data.text) }
                    : m,
                ),
              );
            } else if (payload && payload.type === "reasoning" && payload.data?.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantPlaceholderId
                    ? { ...m, reasoning: (m.reasoning || "") + String(payload.data.text) }
                    : m,
                ),
              );
            } else if (payload && payload.type === "error" && payload.data?.message) {
              setError(String(payload.data.message));
            }
          } catch {
            // ignore malformed payloads
          }
        });

        const response = await storageBridge.groupChatContinue(
          groupSessionId,
          forceCharacterId,
          requestId,
        );

        // Update messages with final saved data
        const updatedMessages = await storageBridge.groupMessagesList(
          groupSessionId,
          MESSAGES_PAGE_SIZE,
        );
        setMessages(updatedMessages);
        setParticipationStats(response.participationStats);
      } catch (err) {
        console.error("Failed to continue:", err);
        setError(err instanceof Error ? err.message : "Failed to continue");
        // Remove placeholder on error
        setMessages((prev) => prev.filter((m) => m.id !== assistantPlaceholderId));
      } finally {
        if (unlistenNormalized) unlistenNormalized();
        assistantPlaceholderIdRef.current = null;
        setSending(false);
        setSendingStatus(null);
        setSelectedCharacterId(null);
        setSelectedCharacterName(null);
        setSelectedCharacterAvatarUrl(null);
      }
    },
    [groupSessionId, sending, messages.length, scrollToBottom],
  );

  const getCharacterById = useCallback(
    (characterId?: string | null): Character | undefined => {
      if (!characterId) return undefined;
      return characters.find((c) => c.id === characterId);
    },
    [characters],
  );

  // Variant state management for drag-to-change-variants
  const getVariantState = useCallback((message: GroupMessage): VariantState => {
    const variants = message.variants ?? [];
    if (variants.length === 0) {
      return {
        variants: [],
        selectedIndex: -1,
        total: 0,
      };
    }
    const explicitIndex = message.selectedVariantId
      ? variants.findIndex((variant) => variant.id === message.selectedVariantId)
      : -1;
    const selectedIndex = explicitIndex >= 0 ? explicitIndex : variants.length - 1;
    return {
      variants,
      selectedIndex,
      total: variants.length,
    };
  }, []);

  const handleVariantSwipe = useCallback(
    async (messageId: string, direction: "prev" | "next") => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      const variantState = getVariantState(message);
      if (variantState.total <= 1) return;

      const currentIndex = variantState.selectedIndex;
      let nextIndex: number;

      if (direction === "prev") {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : variantState.total - 1;
      } else {
        nextIndex = currentIndex < variantState.total - 1 ? currentIndex + 1 : 0;
      }

      const variants = variantState.variants ?? [];
      const nextVariant = variants[nextIndex];
      if (!nextVariant) return;

      try {
        await storageBridge.groupMessageSelectVariant(messageId, nextVariant.id);
        // Refresh messages to get updated content
        const updatedMessages = await storageBridge.groupMessagesList(
          groupSessionId!,
          MESSAGES_PAGE_SIZE,
        );
        setMessages(updatedMessages);
      } catch (err) {
        console.error("Failed to select variant:", err);
      }
    },
    [messages, getVariantState, groupSessionId],
  );

  const handleVariantDrag = useCallback(
    (messageId: string, offsetX: number) => {
      if (offsetX > 60) {
        void handleVariantSwipe(messageId, "prev");
      } else if (offsetX < -60) {
        void handleVariantSwipe(messageId, "next");
      }
    },
    [handleVariantSwipe],
  );

  // Message action handlers
  const openMessageActions = useCallback((message: GroupMessage) => {
    setMessageAction({ message, mode: "view" });
    setHeldMessageId(message.id);
    setActionError(null);
    setActionStatus(null);
  }, []);

  const closeMessageActions = useCallback(() => {
    setMessageAction(null);
    setHeldMessageId(null);
    setEditDraft("");
    setActionError(null);
    setActionStatus(null);
  }, []);

  const handleCopyMessage = useCallback(async () => {
    if (!messageAction) return;
    try {
      await navigator.clipboard?.writeText(messageAction.message.content);
      setActionStatus("Copied!");
      setTimeout(() => setActionStatus(null), 1500);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to copy");
    }
  }, [messageAction]);

  const handleDeleteMessage = useCallback(async () => {
    if (!messageAction || !groupSessionId) return;

    setActionBusy(true);
    try {
      await storageBridge.groupMessageDelete(groupSessionId, messageAction.message.id);
      const updatedMessages = await storageBridge.groupMessagesList(
        groupSessionId,
        MESSAGES_PAGE_SIZE,
      );
      setMessages(updatedMessages);
      closeMessageActions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setActionBusy(false);
    }
  }, [messageAction, groupSessionId, closeMessageActions]);

  const handleRewindToMessage = useCallback(async () => {
    if (!messageAction || !groupSessionId) return;

    setActionBusy(true);
    try {
      await storageBridge.groupMessagesDeleteAfter(groupSessionId, messageAction.message.id);
      const updatedMessages = await storageBridge.groupMessagesList(
        groupSessionId,
        MESSAGES_PAGE_SIZE,
      );
      setMessages(updatedMessages);
      const stats = await storageBridge.groupParticipationStats(groupSessionId);
      setParticipationStats(stats);
      closeMessageActions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to rewind");
    } finally {
      setActionBusy(false);
    }
  }, [messageAction, groupSessionId, closeMessageActions]);

  const handleSaveEdit = useCallback(async () => {
    if (!messageAction || !groupSessionId || !editDraft.trim()) return;

    setActionBusy(true);
    try {
      const updatedMessage = {
        ...messageAction.message,
        content: editDraft.trim(),
      };
      await storageBridge.groupMessageUpsert(groupSessionId, updatedMessage);
      const updatedMessages = await storageBridge.groupMessagesList(
        groupSessionId,
        MESSAGES_PAGE_SIZE,
      );
      setMessages(updatedMessages);
      closeMessageActions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setActionBusy(false);
    }
  }, [messageAction, groupSessionId, editDraft, closeMessageActions]);

  const groupCharacters = useMemo(() => {
    if (!session) return [];
    return session.characterIds
      .map((id) => characters.find((c) => c.id === id))
      .filter(Boolean) as Character[];
  }, [session, characters]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050505]">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 bg-[#050505]">
        <p className="text-white/50 mb-4">{error || "Group session not found"}</p>
        <button
          onClick={() => navigate(Routes.groupChats)}
          className={cn(
            "px-4 py-2",
            radius.md,
            "border border-white/15 bg-white/10 text-white",
            interactive.transition.fast,
          )}
        >
          Back to Group Chats
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-[#050505]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Header */}
      <div className="relative z-20 shrink-0">
        <GroupChatHeader
          session={session}
          characters={groupCharacters}
          onBack={() => navigate(Routes.groupChats)}
          onSettings={() => navigate(Routes.groupChatSettings(session.id))}
          onMemories={() => navigate(Routes.groupChatMemories(session.id))}
        />
        {/* Participation Bar - shows who's been speaking */}
        {showParticipation && participationStats.length > 0 && (
          <ParticipationBar
            stats={participationStats}
            characters={groupCharacters}
            onClose={() => setShowParticipation(false)}
          />
        )}
      </div>

      {/* Main content area - flex-1 takes remaining space */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative z-10 flex-1 overflow-y-auto"
      >
        <div className="space-y-4 px-4 pb-6 pt-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[50vh] items-center justify-center">
              <p className="text-white/30 text-center">
                Start a conversation with {groupCharacters.map((c) => c.name).join(", ")}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((message, index) => (
                <GroupChatMessage
                  key={message.id}
                  message={message}
                  index={index}
                  messagesLength={messages.length}
                  heldMessageId={heldMessageId}
                  regeneratingMessageId={regeneratingMessageId}
                  sending={sending}
                  character={getCharacterById(message.speakerCharacterId)}
                  persona={currentPersona}
                  getVariantState={getVariantState}
                  handleVariantDrag={handleVariantDrag}
                  handleRegenerate={async (msg) => {
                    await handleRegenerate(msg.id);
                  }}
                  onLongPress={(msg) => openMessageActions(msg)}
                />
              ))}
            </AnimatePresence>
          )}

          {/* Sending Indicator - only show during selection phase */}
          {sending && sendingStatus === "selecting" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 mt-4 text-white/50"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Selecting character...</span>
            </motion.div>
          )}
        </div>
      </main>

      {/* Scroll to Bottom Button */}
      <AnimatePresence>
        {!isAtBottomRef.current && messages.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            className={cn(
              "fixed right-4 z-20",
              "h-10 w-10 rounded-full",
              "border border-white/20 bg-[#1a1b23]",
              "flex items-center justify-center",
              "text-white/70 hover:text-white",
              interactive.transition.fast,
              "bottom-[calc(env(safe-area-inset-bottom)+88px)]",
            )}
          >
            <ChevronDown size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div
        className="relative z-10 shrink-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <GroupChatFooter
          draft={draft}
          setDraft={setDraft}
          error={error}
          setError={setError}
          sending={sending}
          characters={groupCharacters}
          persona={currentPersona}
          onSendMessage={handleSend}
          onContinue={messages.length > 0 ? () => handleContinue() : undefined}
          onAbort={undefined}
          hasBackgroundImage={false}
        />
      </div>

      {/* Message Actions Bottom Sheet */}
      <MessageActionsBottomSheet
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
        handleRewindToMessage={handleRewindToMessage}
        handleCopyMessage={handleCopyMessage}
        setMessageAction={setMessageAction}
        onRegenerate={(charId) => {
          closeMessageActions();
          if (messageAction) {
            handleRegenerate(messageAction.message.id, charId);
          }
        }}
        characters={groupCharacters}
      />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function GroupChatHeader({
  session,
  characters,
  onBack,
  onSettings,
  onMemories,
}: {
  session: GroupSession;
  characters: Character[];
  onBack: () => void;
  onSettings: () => void;
  onMemories: () => void;
}) {
  return (
    <header className="border-b border-white/10 px-4 pb-3 pt-3">
      <div className="flex items-center">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center justify-center -ml-2 text-white transition hover:text-white/80"
          aria-label="Back"
        >
          <ArrowLeft size={14} strokeWidth={2.5} />
        </button>

        <div className="min-w-0 flex-1 ml-2">
          <h1 className="truncate text-lg font-bold text-white/90">{session.name}</h1>
          <p className="truncate text-xs text-white/50">{characters.length} characters</p>
        </div>

        {/* Stacked Avatars */}
        <div className="relative flex items-center mr-2">
          {characters.slice(0, 4).map((char, index) => (
            <CharacterMiniAvatar
              key={char.id}
              character={char}
              style={{
                marginLeft: index > 0 ? "-8px" : "0",
                zIndex: 4 - index,
              }}
            />
          ))}
          {characters.length > 4 && (
            <div
              className={cn(
                "h-7 w-7 rounded-full",
                "border-2 border-[#050505] bg-white/20",
                "flex items-center justify-center",
                "text-[10px] font-medium text-white/70",
              )}
              style={{ marginLeft: "-8px", zIndex: 0 }}
            >
              +{characters.length - 4}
            </div>
          )}
        </div>

        <button
          onClick={onMemories}
          className="flex h-9 w-9 items-center justify-center text-white/70 hover:text-white transition"
          aria-label="Memories"
        >
          <Sparkles size={18} />
        </button>

        <button
          onClick={onSettings}
          className="flex h-9 w-9 items-center justify-center text-white/70 hover:text-white transition"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}

function CharacterMiniAvatar({
  character,
  style,
}: {
  character: Character;
  style?: React.CSSProperties;
}) {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  return (
    <div
      className={cn(
        "h-7 w-7 rounded-full overflow-hidden",
        "border-2 border-[#050505]",
        "bg-linear-to-br from-white/10 to-white/5",
      )}
      style={style}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white/60">
          {character.name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function ParticipationBar({
  stats,
  characters,
  onClose,
}: {
  stats: GroupParticipation[];
  characters: Character[];
  onClose?: () => void;
}) {
  const totalSpeaks = stats.reduce((sum, s) => sum + s.speakCount, 0);

  if (totalSpeaks === 0) return null;

  const sortedStats = [...stats].sort((a, b) => b.speakCount - a.speakCount);

  const colors = [
    "bg-emerald-400",
    "bg-blue-400",
    "bg-purple-400",
    "bg-amber-400",
    "bg-pink-400",
    "bg-cyan-400",
    "bg-orange-400",
    "bg-lime-400",
  ];

  return (
    <div className="px-4 py-2 border-b border-white/5 bg-[#0a0a0c]">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden flex bg-white/5">
          {sortedStats.map((stat, index) => {
            const pct = (stat.speakCount / totalSpeaks) * 100;
            return (
              <div
                key={stat.characterId}
                className={cn(colors[index % colors.length], "transition-all duration-300")}
                style={{ width: `${pct}%` }}
              />
            );
          })}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/50 transition-colors"
            aria-label="Hide participation bar"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {sortedStats.slice(0, 4).map((stat, index) => {
          const char = characters.find((c) => c.id === stat.characterId);
          const pct = Math.round((stat.speakCount / totalSpeaks) * 100);
          return (
            <div key={stat.characterId} className="flex items-center gap-1">
              <div className={cn("h-1.5 w-1.5 rounded-full", colors[index % colors.length])} />
              <span className="text-[10px] text-white/50">
                {char?.name?.split(" ")[0] || "?"} {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Message Actions Bottom Sheet
// ============================================================================

function ActionRow({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  variant = "default",
  iconBg,
}: {
  icon: typeof Copy;
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
        variant === "danger" && "hover:bg-red-500/10",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg",
          iconBg || "bg-white/10",
        )}
      >
        <Icon size={16} className={cn(variant === "danger" ? "text-red-400" : "text-white")} />
      </div>
      <span
        className={cn(
          "text-[15px] text-left",
          variant === "danger" ? "text-red-400" : "text-white/90",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function MessageActionsBottomSheet({
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
  handleRewindToMessage,
  handleCopyMessage,
  setMessageAction,
  onRegenerate,
  characters,
}: {
  messageAction: MessageActionState | null;
  actionError: string | null;
  actionStatus: string | null;
  actionBusy: boolean;
  editDraft: string;
  setEditDraft: (value: string) => void;
  closeMessageActions: () => void;
  setActionError: (value: string | null) => void;
  setActionStatus: (value: string | null) => void;
  handleSaveEdit: () => Promise<void>;
  handleDeleteMessage: () => Promise<void>;
  handleRewindToMessage: () => Promise<void>;
  handleCopyMessage: () => Promise<void>;
  setMessageAction: (value: MessageActionState | null) => void;
  onRegenerate: (characterId?: string) => void;
  characters: Character[];
}) {
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);

  const isAssistant = messageAction?.message.role === "assistant";

  return (
    <>
      <BottomMenu
        isOpen={Boolean(messageAction) && !showCharacterPicker}
        includeExitIcon={false}
        onClose={closeMessageActions}
        title={isAssistant ? "Character Message" : "Your Message"}
      >
        {messageAction && (
          <div className="text-white">
            {/* Selection Reasoning (for assistant messages) */}
            {isAssistant && messageAction.message.selectionReasoning && (
              <div className="mb-4 px-3 py-2 rounded-lg border border-white/10 bg-white/5">
                <p className="text-[10px] text-white/40 uppercase tracking-wide mb-1">
                  Why this character responded
                </p>
                <p className="text-xs text-white/70 italic">
                  {messageAction.message.selectionReasoning}
                </p>
              </div>
            )}

            {/* Token usage */}
            {messageAction.message.usage && (
              <div className="flex items-center gap-2 text-xs text-white/40 mb-4">
                <span>{messageAction.message.usage.promptTokens ?? 0} in</span>
                <span>·</span>
                <span>{messageAction.message.usage.completionTokens ?? 0} out</span>
                <span>·</span>
                <span className="text-white/60 font-medium">
                  {messageAction.message.usage.totalTokens ?? 0} tokens
                </span>
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
                {/* Edit */}
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

                {/* Copy */}
                <ActionRow
                  icon={Copy}
                  label="Copy"
                  iconBg="bg-violet-500/20"
                  onClick={() => void handleCopyMessage()}
                />

                {/* Regenerate with different character (assistant only) */}
                {isAssistant && (
                  <ActionRow
                    icon={Users}
                    label="Regenerate with different character"
                    iconBg="bg-emerald-500/20"
                    onClick={() => setShowCharacterPicker(true)}
                  />
                )}

                {/* Separator */}
                <div className="h-px bg-white/5 my-2" />

                {/* Rewind */}
                <ActionRow
                  icon={RotateCcw}
                  label="Rewind to here"
                  iconBg="bg-cyan-500/20"
                  onClick={() => void handleRewindToMessage()}
                  disabled={actionBusy}
                />

                {/* Separator */}
                <div className="h-px bg-white/5 my-2" />

                {/* Delete */}
                <ActionRow
                  icon={Trash2}
                  label={messageAction.message.isPinned ? "Unpin to delete" : "Delete"}
                  onClick={() => void handleDeleteMessage()}
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
                    radius.lg,
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
                      radius.lg,
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
                      radius.lg,
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

      {/* Character Picker for Regenerate */}
      <BottomMenu
        isOpen={showCharacterPicker}
        includeExitIcon={false}
        onClose={() => setShowCharacterPicker(false)}
        title="Choose Character"
      >
        <div className="space-y-2">
          <p className="text-sm text-white/50 mb-3">
            Select which character should respond instead:
          </p>
          {characters.map((char) => (
            <CharacterPickerItem
              key={char.id}
              character={char}
              onClick={() => {
                setShowCharacterPicker(false);
                onRegenerate(char.id);
              }}
            />
          ))}
        </div>
      </BottomMenu>
    </>
  );
}

function CharacterPickerItem({
  character,
  onClick,
}: {
  character: Character;
  onClick: () => void;
}) {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 p-3 text-left",
        radius.lg,
        "border border-white/10 bg-white/5",
        "hover:border-white/20 hover:bg-white/10",
        interactive.transition.fast,
      )}
    >
      <div
        className={cn(
          "h-10 w-10 rounded-full overflow-hidden",
          "bg-linear-to-br from-white/10 to-white/5",
          "ring-1 ring-white/10",
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={character.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/60">
            {character.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{character.name}</p>
        {character.description && (
          <p className="text-xs text-white/50 truncate">{character.description}</p>
        )}
      </div>
    </button>
  );
}
