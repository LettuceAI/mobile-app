import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  ChevronDown,
  Loader2,
  Copy,
  Trash2,
  RotateCcw,
  Edit3,
  Users,
  Sparkles,
  Image,
  RefreshCw,
  PenLine,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { listen } from "@tauri-apps/api/event";

import { storageBridge } from "../../../core/storage/files";
import {
  listCharacters,
  listPersonas,
  readSettings,
  generateGroupChatUserReply,
} from "../../../core/storage/repo";
import type {
  GroupSession,
  GroupMessage,
  GroupParticipation,
  Character,
  Persona,
  ImageAttachment,
  Settings,
  Model,
} from "../../../core/storage/schemas";
import { radius, interactive, cn } from "../../design-tokens";
import { useAvatar } from "../../hooks/useAvatar";
import { Routes } from "../../navigation";
import { BottomMenu, MenuButton } from "../../components/BottomMenu";
import { MarkdownRenderer } from "../chats/components/MarkdownRenderer";
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [_participationStats, setParticipationStats] = useState<GroupParticipation[]>([]);
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

  // Plus menu & Help Me Reply states
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showChoiceMenu, setShowChoiceMenu] = useState(false);
  const [showResultMenu, setShowResultMenu] = useState(false);
  const [generatedReply, setGeneratedReply] = useState<string | null>(null);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [helpMeReplyError, setHelpMeReplyError] = useState<string | null>(null);
  const [shouldTriggerFileInput, setShouldTriggerFileInput] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ImageAttachment[]>([]);
  const [supportsImageInput, setSupportsImageInput] = useState(false);

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
      const [sessionData, chars, personaList, msgs, stats, settingsData] = await Promise.all([
        storageBridge.groupSessionGet(groupSessionId),
        listCharacters(),
        listPersonas(),
        storageBridge.groupMessagesList(groupSessionId, MESSAGES_PAGE_SIZE),
        storageBridge.groupParticipationStats(groupSessionId),
        readSettings(),
      ]);

      console.log("🔍 Loaded messages:", msgs.length, "messages");
      console.log("🔍 First message modelId:", msgs[0]?.modelId);
      console.log("🔍 Last message modelId:", msgs[msgs.length - 1]?.modelId);
      console.log("🔍 Sample message:", msgs[msgs.length - 1]);

      if (!sessionData) {
        setError("Group session not found");
        setLoading(false);
        return;
      }

      setSession(sessionData);
      setCharacters(chars);
      setPersonas(personaList);
      setMessages(msgs);
      setParticipationStats(stats);
      setSettings(settingsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
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
      console.log("🔍 After send - updated messages count:", updatedMessages.length);
      console.log("🔍 Last message after send:", updatedMessages[updatedMessages.length - 1]);
      console.log("🔍 Last message modelId:", updatedMessages[updatedMessages.length - 1]?.modelId);
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

  // Check if all group characters support image input
  useEffect(() => {
    const checkImageSupport = async () => {
      if (!session || !settings || !characters.length) {
        setSupportsImageInput(false);
        return;
      }

      try {
        const groupChars = session.characterIds
          .map((id) => characters.find((c) => c.id === id))
          .filter(Boolean) as Character[];

        if (groupChars.length === 0) {
          setSupportsImageInput(false);
          return;
        }

        // Check if ALL characters support image input
        const allSupport = groupChars.every((char) => {
          const effectiveModelId = char.defaultModelId || settings.defaultModelId;
          const model = settings.models.find((m: Model) => m.id === effectiveModelId);
          return model?.inputScopes?.includes("image") ?? false;
        });

        setSupportsImageInput(allSupport);
      } catch (err) {
        console.error("Failed to check image support:", err);
        setSupportsImageInput(false);
      }
    };

    checkImageSupport();
  }, [session, settings, characters]);

  // Plus menu handlers
  const handleOpenPlusMenu = useCallback(() => {
    setShowPlusMenu(true);
  }, []);

  const handleHelpMeReply = useCallback(
    async (mode: "new" | "enrich") => {
      if (!session?.id) return;

      // Close other menus and show result menu with loading state immediately
      setShowChoiceMenu(false);
      setShowPlusMenu(false);
      setGeneratedReply(null);
      setHelpMeReplyError(null);
      setGeneratingReply(true);
      setShowResultMenu(true);

      try {
        const currentDraft = mode === "enrich" && draft.trim() ? draft : undefined;
        const result = await generateGroupChatUserReply(session.id, currentDraft);
        setGeneratedReply(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setHelpMeReplyError(message);
      } finally {
        setGeneratingReply(false);
      }
    },
    [session?.id, draft],
  );

  const handleUseReply = useCallback(() => {
    if (generatedReply) {
      setDraft(generatedReply);
    }
    setShowResultMenu(false);
    setGeneratedReply(null);
    setHelpMeReplyError(null);
  }, [generatedReply]);

  const handlePlusMenuImageUpload = useCallback(() => {
    setShowPlusMenu(false);
    setShouldTriggerFileInput(true);
  }, []);

  const handlePlusMenuHelpMeReply = useCallback(() => {
    setShowPlusMenu(false);
    if (draft.trim()) {
      // Has draft - show choice menu
      setShowChoiceMenu(true);
    } else {
      // No draft - generate directly
      void handleHelpMeReply("new");
    }
  }, [draft, handleHelpMeReply]);

  const addPendingAttachment = useCallback((attachment: ImageAttachment) => {
    setPendingAttachments((prev) => [...prev, attachment]);
  }, []);

  const removePendingAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }, []);

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
                  reasoning={message.reasoning ?? undefined}
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
          pendingAttachments={pendingAttachments}
          onAddAttachment={supportsImageInput ? addPendingAttachment : undefined}
          onRemoveAttachment={supportsImageInput ? removePendingAttachment : undefined}
          onOpenPlusMenu={handleOpenPlusMenu}
          triggerFileInput={shouldTriggerFileInput}
          onFileInputTriggered={() => setShouldTriggerFileInput(false)}
        />
      </div>

      {/* Plus Menu - Upload Image & Help Me Reply */}
      <BottomMenu isOpen={showPlusMenu} onClose={() => setShowPlusMenu(false)} title="Add Content">
        <div className="space-y-2">
          {supportsImageInput && (
            <MenuButton icon={Image} title="Upload Image" onClick={handlePlusMenuImageUpload} />
          )}
          <MenuButton
            icon={Sparkles}
            title="Help Me Reply"
            description="Let AI suggest what to say"
            onClick={handlePlusMenuHelpMeReply}
          />
        </div>
      </BottomMenu>

      {/* Choice Menu - Use existing draft or generate new */}
      <BottomMenu
        isOpen={showChoiceMenu}
        onClose={() => setShowChoiceMenu(false)}
        title="Help Me Reply"
      >
        <div className="space-y-2">
          <p className="text-sm text-white/60 mb-4">
            You have a draft message. How would you like to proceed?
          </p>
          <MenuButton
            icon={PenLine}
            title="Use my text as base"
            description="Expand and improve your draft"
            onClick={() => handleHelpMeReply("enrich")}
          />
          <MenuButton
            icon={Sparkles}
            title="Write something new"
            description="Generate a fresh reply"
            onClick={() => handleHelpMeReply("new")}
          />
        </div>
      </BottomMenu>

      {/* Result Menu - Show generated reply with Regenerate/Use options */}
      <BottomMenu
        isOpen={showResultMenu}
        onClose={() => {
          setShowResultMenu(false);
          setGeneratedReply(null);
          setHelpMeReplyError(null);
        }}
        title="Suggested Reply"
      >
        <div className="space-y-4">
          {generatingReply ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-white/50" />
            </div>
          ) : helpMeReplyError ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm">{helpMeReplyError}</p>
            </div>
          ) : generatedReply ? (
            <div
              className={cn(
                "bg-white/5 border border-white/10 p-4",
                radius.lg,
                "max-h-[40vh] overflow-y-auto",
              )}
            >
              <p className="text-white/90 text-sm whitespace-pre-wrap">{generatedReply}</p>
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              onClick={() => handleHelpMeReply(draft.trim() ? "enrich" : "new")}
              disabled={generatingReply}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 px-4",
                radius.lg,
                "bg-white/10 text-white/80 hover:bg-white/15",
                "disabled:opacity-50 transition-all",
              )}
            >
              <RefreshCw size={18} />
              <span>Regenerate</span>
            </button>
            <button
              onClick={handleUseReply}
              disabled={generatingReply || !generatedReply}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 px-4",
                radius.lg,
                "bg-emerald-500 text-white hover:bg-emerald-600",
                "disabled:opacity-50 transition-all",
              )}
            >
              <Check size={18} />
              <span>Use Reply</span>
            </button>
          </div>
        </div>
      </BottomMenu>

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
        settings={settings}
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
          <SettingsIcon size={18} />
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
  settings,
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
  settings: Settings | null;
}) {
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);

  const isAssistant = messageAction?.message.role === "assistant";

  // Debug logging for model info
  if (messageAction && isAssistant) {
    console.log("[MessageActions] Debug info:", {
      hasModelId: Boolean(messageAction.message.modelId),
      modelId: messageAction.message.modelId,
      hasSettings: Boolean(settings),
      settingsModelsCount: settings?.models.length,
      modelFound: settings?.models.find((m) => m.id === messageAction.message.modelId),
    });
  }

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
            {/* Model Info (for assistant messages) */}
            {isAssistant && messageAction.message.modelId && settings && (
              <div className="mb-4 px-3 py-2 rounded-lg border border-blue-400/20 bg-blue-400/10">
                <p className="text-[10px] text-blue-300/60 uppercase tracking-wide mb-1">
                  Generated with
                </p>
                <p className="text-xs text-blue-200 font-medium">
                  {settings.models.find((m) => m.id === messageAction.message.modelId)
                    ?.displayName || messageAction.message.modelId}
                </p>
              </div>
            )}

            {/* Thinking/Reasoning (for assistant messages) */}
            {isAssistant && messageAction.message.reasoning && (
              <div className="mb-4 px-3 py-2 rounded-lg border border-purple-400/20 bg-purple-400/10">
                <p className="text-[10px] text-purple-300/60 uppercase tracking-wide mb-1">
                  Thought process
                </p>
                <div className="text-xs text-purple-200 italic max-h-40 overflow-y-auto">
                  <MarkdownRenderer
                    content={messageAction.message.reasoning}
                    className="text-xs text-purple-200 **:text-purple-200"
                  />
                </div>
              </div>
            )}

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
