import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { listen } from "@tauri-apps/api/event";

import { storageBridge } from "../../../../core/storage/files";
import { listCharacters, listPersonas } from "../../../../core/storage/repo";
import type {
  GroupSession,
  GroupMessage,
  GroupParticipation,
  Character,
  Persona,
} from "../../../../core/storage/schemas";
import type { VariantState } from "../components";
import {
  groupChatUiReducer,
  initialGroupChatUiState,
  type MessageActionState,
} from "../reducers/groupChatReducer";

const MESSAGES_PAGE_SIZE = 50;

type GroupChatController = {
  session: GroupSession | null;
  characters: Character[];
  personas: Persona[];
  messages: GroupMessage[];
  participationStats: GroupParticipation[];
  currentPersona: Persona | null;
  groupCharacters: Character[];
  loading: boolean;
  sending: boolean;
  sendingStatus: string | null;
  regeneratingMessageId: string | null;
  error: string | null;
  draft: string;
  messageAction: MessageActionState | null;
  editDraft: string;
  actionBusy: boolean;
  actionStatus: string | null;
  actionError: string | null;
  heldMessageId: string | null;
  scrollContainerRef: RefObject<HTMLDivElement>;
  isAtBottomRef: MutableRefObject<boolean>;
  setDraft: (value: string) => void;
  setError: (value: string | null) => void;
  setEditDraft: (value: string) => void;
  setActionError: (value: string | null) => void;
  setActionStatus: (value: string | null) => void;
  setMessageAction: (value: MessageActionState | null) => void;
  getCharacterById: (characterId?: string | null) => Character | undefined;
  getVariantState: (message: GroupMessage) => VariantState;
  handleVariantDrag: (messageId: string, offsetX: number) => void;
  handleSend: () => Promise<void>;
  handleContinue: (forceCharacterId?: string) => Promise<void>;
  handleRegenerate: (messageId: string, forceCharacterId?: string) => Promise<void>;
  openMessageActions: (message: GroupMessage) => void;
  closeMessageActions: () => void;
  handleCopyMessage: () => Promise<void>;
  handleDeleteMessage: () => Promise<void>;
  handleRewindToMessage: () => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  handleScroll: () => void;
  scrollToBottom: () => void;
};

export function useGroupChatController(groupSessionId?: string): GroupChatController {
  const [session, setSession] = useState<GroupSession | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [participationStats, setParticipationStats] = useState<GroupParticipation[]>([]);
  const [ui, dispatch] = useReducer(groupChatUiReducer, initialGroupChatUiState);

  const assistantPlaceholderIdRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const setUi = useCallback((patch: Partial<typeof ui>) => {
    dispatch({ type: "PATCH", patch });
  }, []);

  const currentPersona = useMemo(() => {
    if (!session?.personaId) return null;
    return personas.find((p) => p.id === session.personaId) || null;
  }, [session, personas]);

  const loadData = useCallback(async () => {
    if (!groupSessionId) return;

    try {
      setUi({ loading: true, error: null });
      const [sessionData, chars, personaList, msgs, stats] = await Promise.all([
        storageBridge.groupSessionGet(groupSessionId),
        listCharacters(),
        listPersonas(),
        storageBridge.groupMessagesList(groupSessionId, MESSAGES_PAGE_SIZE),
        storageBridge.groupParticipationStats(groupSessionId),
      ]);

      if (!sessionData) {
        setUi({ error: "Group session not found" });
        return;
      }

      setSession(sessionData);
      setCharacters(chars);
      setPersonas(personaList);
      setMessages(msgs);
      setParticipationStats(stats);
    } catch (err) {
      console.error("Failed to load group chat:", err);
      setUi({ error: "Failed to load group chat" });
    } finally {
      setUi({ loading: false });
    }
  }, [groupSessionId, setUi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!ui.error) return;

    const timer = setTimeout(() => {
      setUi({ error: null });
    }, 10000);

    return () => clearTimeout(timer);
  }, [ui.error, setUi]);

  useEffect(() => {
    if (isAtBottomRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!groupSessionId) return;

    const unlisten = listen<{
      sessionId: string;
      status: string;
      characterId?: string;
      characterName?: string;
    }>("group_chat_status", (event) => {
      const { sessionId, status, characterId, characterName } = event.payload;

      if (sessionId !== groupSessionId) return;

      if (status === "selecting_character") {
        setUi({
          sendingStatus: "selecting",
          selectedCharacterId: null,
          selectedCharacterName: null,
        });
      } else if (status === "character_selected") {
        setUi({
          sendingStatus: "generating",
          selectedCharacterId: characterId || null,
          selectedCharacterName: characterName || null,
        });
        const char = characters.find((c) => c.id === characterId);
        setUi({ selectedCharacterAvatarUrl: char?.avatarPath || null });

        const placeholderId = assistantPlaceholderIdRef.current;
        if (placeholderId && characterId) {
          setMessages((prev) => {
            return prev.map((m) =>
              m.id === placeholderId ? { ...m, speakerCharacterId: characterId } : m,
            );
          });
        }
      } else if (status === "complete") {
        setUi({
          sendingStatus: null,
          selectedCharacterId: null,
          selectedCharacterName: null,
          selectedCharacterAvatarUrl: null,
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [groupSessionId, characters, setUi]);

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
    if (!groupSessionId || !ui.draft.trim() || ui.sending) return;

    const userMessage = ui.draft.trim();
    const requestId = crypto.randomUUID();
    setUi({ draft: "", sending: true, sendingStatus: "selecting", error: null });

    const userPlaceholderId = `temp-user-${Date.now()}`;
    const assistantPlaceholderId = `temp-assistant-${Date.now()}`;
    assistantPlaceholderIdRef.current = assistantPlaceholderId;

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

    const tempAssistantMessage: GroupMessage = {
      id: assistantPlaceholderId,
      sessionId: groupSessionId,
      role: "assistant",
      content: "",
      speakerCharacterId: null,
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

    setMessages((prev) => [...prev, tempUserMessage, tempAssistantMessage]);
    scrollToBottom();

    let unlistenNormalized: (() => void) | null = null;

    try {
      unlistenNormalized = await listen<any>(`api-normalized://${requestId}`, (event) => {
        try {
          const payload =
            typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;

          if (payload && payload.type === "delta" && payload.data?.text) {
            setMessages((prev) => {
              return prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? { ...m, content: m.content + String(payload.data.text) }
                  : m,
              );
            });
          } else if (payload && payload.type === "reasoning" && payload.data?.text) {
            setMessages((prev) => {
              return prev.map((m) =>
                m.id === assistantPlaceholderId
                  ? { ...m, reasoning: (m.reasoning || "") + String(payload.data.text) }
                  : m,
              );
            });
          } else if (payload && payload.type === "error" && payload.data?.message) {
            setUi({ error: String(payload.data.message) });
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

      const updatedMessages = await storageBridge.groupMessagesList(
        groupSessionId,
        MESSAGES_PAGE_SIZE,
      );
      setMessages(updatedMessages);
      setParticipationStats(response.participationStats);
    } catch (err) {
      console.error("Failed to send message:", err);
      setUi({ error: err instanceof Error ? err.message : "Failed to send message" });
      setMessages((prev) =>
        prev.filter((m) => m.id !== userPlaceholderId && m.id !== assistantPlaceholderId),
      );
    } finally {
      if (unlistenNormalized) unlistenNormalized();
      assistantPlaceholderIdRef.current = null;
      setUi({
        sending: false,
        sendingStatus: null,
        selectedCharacterId: null,
        selectedCharacterName: null,
        selectedCharacterAvatarUrl: null,
      });
    }
  }, [groupSessionId, ui.draft, ui.sending, messages.length, scrollToBottom, setUi]);

  const handleRegenerate = useCallback(
    async (messageId: string, forceCharacterId?: string) => {
      if (!groupSessionId || ui.regeneratingMessageId) return;

      const requestId = crypto.randomUUID();
      setUi({ regeneratingMessageId: messageId, error: null });

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: "", reasoning: null } : m)),
      );

      let unlistenNormalized: (() => void) | null = null;

      try {
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
              setUi({ error: String(payload.data.message) });
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

        const updatedMessages = await storageBridge.groupMessagesList(
          groupSessionId,
          MESSAGES_PAGE_SIZE,
        );
        setMessages(updatedMessages);
        setParticipationStats(response.participationStats);
      } catch (err) {
        console.error("Failed to regenerate:", err);
        setUi({ error: err instanceof Error ? err.message : "Failed to regenerate" });
        const updatedMessages = await storageBridge.groupMessagesList(
          groupSessionId,
          MESSAGES_PAGE_SIZE,
        );
        setMessages(updatedMessages);
      } finally {
        if (unlistenNormalized) unlistenNormalized();
        setUi({ regeneratingMessageId: null });
      }
    },
    [groupSessionId, ui.regeneratingMessageId, setUi],
  );

  const handleContinue = useCallback(
    async (forceCharacterId?: string) => {
      if (!groupSessionId || ui.sending) return;

      const requestId = crypto.randomUUID();
      const assistantPlaceholderId = `temp-continue-${Date.now()}`;

      setUi({ sending: true, sendingStatus: "selecting", error: null });
      assistantPlaceholderIdRef.current = assistantPlaceholderId;

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
              setUi({ error: String(payload.data.message) });
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

        const updatedMessages = await storageBridge.groupMessagesList(
          groupSessionId,
          MESSAGES_PAGE_SIZE,
        );
        setMessages(updatedMessages);
        setParticipationStats(response.participationStats);
      } catch (err) {
        console.error("Failed to continue:", err);
        setUi({ error: err instanceof Error ? err.message : "Failed to continue" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantPlaceholderId));
      } finally {
        if (unlistenNormalized) unlistenNormalized();
        assistantPlaceholderIdRef.current = null;
        setUi({
          sending: false,
          sendingStatus: null,
          selectedCharacterId: null,
          selectedCharacterName: null,
          selectedCharacterAvatarUrl: null,
        });
      }
    },
    [groupSessionId, ui.sending, messages.length, scrollToBottom, setUi],
  );

  const getCharacterById = useCallback(
    (characterId?: string | null): Character | undefined => {
      if (!characterId) return undefined;
      return characters.find((c) => c.id === characterId);
    },
    [characters],
  );

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

  const openMessageActions = useCallback(
    (message: GroupMessage) => {
      setUi({
        messageAction: { message, mode: "view" },
        heldMessageId: message.id,
        actionError: null,
        actionStatus: null,
      });
    },
    [setUi],
  );

  const closeMessageActions = useCallback(() => {
    setUi({
      messageAction: null,
      heldMessageId: null,
      editDraft: "",
      actionError: null,
      actionStatus: null,
    });
  }, [setUi]);

  const handleCopyMessage = useCallback(async () => {
    if (!ui.messageAction) return;
    try {
      await navigator.clipboard?.writeText(ui.messageAction.message.content);
      setUi({ actionStatus: "Copied!" });
      setTimeout(() => setUi({ actionStatus: null }), 1500);
    } catch (err) {
      setUi({ actionError: err instanceof Error ? err.message : "Failed to copy" });
    }
  }, [ui.messageAction, setUi]);

  const handleDeleteMessage = useCallback(async () => {
    if (!ui.messageAction || !groupSessionId) return;

    setUi({ actionBusy: true });
    try {
      await storageBridge.groupMessageDelete(groupSessionId, ui.messageAction.message.id);
      const updatedMessages = await storageBridge.groupMessagesList(
        groupSessionId,
        MESSAGES_PAGE_SIZE,
      );
      setMessages(updatedMessages);
      closeMessageActions();
    } catch (err) {
      setUi({ actionError: err instanceof Error ? err.message : "Failed to delete" });
    } finally {
      setUi({ actionBusy: false });
    }
  }, [ui.messageAction, groupSessionId, closeMessageActions, setUi]);

  const handleRewindToMessage = useCallback(async () => {
    if (!ui.messageAction || !groupSessionId) return;

    setUi({ actionBusy: true });
    try {
      await storageBridge.groupMessagesDeleteAfter(groupSessionId, ui.messageAction.message.id);
      const updatedMessages = await storageBridge.groupMessagesList(
        groupSessionId,
        MESSAGES_PAGE_SIZE,
      );
      setMessages(updatedMessages);
      const stats = await storageBridge.groupParticipationStats(groupSessionId);
      setParticipationStats(stats);
      closeMessageActions();
    } catch (err) {
      setUi({ actionError: err instanceof Error ? err.message : "Failed to rewind" });
    } finally {
      setUi({ actionBusy: false });
    }
  }, [ui.messageAction, groupSessionId, closeMessageActions, setUi]);

  const handleSaveEdit = useCallback(async () => {
    if (!ui.messageAction || !groupSessionId || !ui.editDraft.trim()) return;

    setUi({ actionBusy: true });
    try {
      const updatedMessage = {
        ...ui.messageAction.message,
        content: ui.editDraft.trim(),
      };
      await storageBridge.groupMessageUpsert(groupSessionId, updatedMessage);
      const updatedMessages = await storageBridge.groupMessagesList(
        groupSessionId,
        MESSAGES_PAGE_SIZE,
      );
      setMessages(updatedMessages);
      closeMessageActions();
    } catch (err) {
      setUi({ actionError: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setUi({ actionBusy: false });
    }
  }, [ui.messageAction, ui.editDraft, groupSessionId, closeMessageActions, setUi]);

  const groupCharacters = useMemo(() => {
    if (!session) return [];
    return session.characterIds
      .map((id) => characters.find((c) => c.id === id))
      .filter(Boolean) as Character[];
  }, [session, characters]);

  const setDraft = useCallback((value: string) => setUi({ draft: value }), [setUi]);
  const setError = useCallback((value: string | null) => setUi({ error: value }), [setUi]);
  const setEditDraft = useCallback((value: string) => setUi({ editDraft: value }), [setUi]);
  const setActionError = useCallback(
    (value: string | null) => setUi({ actionError: value }),
    [setUi],
  );
  const setActionStatus = useCallback(
    (value: string | null) => setUi({ actionStatus: value }),
    [setUi],
  );
  const setMessageAction = useCallback(
    (value: MessageActionState | null) => setUi({ messageAction: value }),
    [setUi],
  );

  return {
    session,
    characters,
    personas,
    messages,
    participationStats,
    currentPersona,
    groupCharacters,
    loading: ui.loading,
    sending: ui.sending,
    sendingStatus: ui.sendingStatus,
    regeneratingMessageId: ui.regeneratingMessageId,
    error: ui.error,
    draft: ui.draft,
    messageAction: ui.messageAction,
    editDraft: ui.editDraft,
    actionBusy: ui.actionBusy,
    actionStatus: ui.actionStatus,
    actionError: ui.actionError,
    heldMessageId: ui.heldMessageId,
    scrollContainerRef,
    isAtBottomRef,
    setDraft,
    setError,
    setEditDraft,
    setActionError,
    setActionStatus,
    setMessageAction,
    getCharacterById,
    getVariantState,
    handleVariantDrag,
    handleSend,
    handleContinue,
    handleRegenerate,
    openMessageActions,
    closeMessageActions,
    handleCopyMessage,
    handleDeleteMessage,
    handleRewindToMessage,
    handleSaveEdit,
    handleScroll,
    scrollToBottom,
  };
}
