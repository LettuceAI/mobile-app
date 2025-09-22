import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { createSession, getDefaultPersona, getSession, listCharacters, listSessionIds, saveSession } from "../../../../core/storage/repo";
import type { Character, Persona, Session, StoredMessage } from "../../../../core/storage/schemas";
import { regenerateAssistantMessage, sendChatTurn } from "../../../../core/chat/manager";

export interface MessageActionState {
  message: StoredMessage;
  mode: "view" | "edit";
}

export interface VariantState {
  variants: StoredMessage["variants"];
  selectedIndex: number;
  total: number;
}

export interface ChatController {
  character: Character | null;
  persona: Persona | null;
  session: Session | null;
  messages: StoredMessage[];
  draft: string;
  setDraft: (value: string) => void;
  loading: boolean;
  sending: boolean;
  error: string | null;
  setError: (value: string | null) => void;
  messageAction: MessageActionState | null;
  setMessageAction: (value: MessageActionState | null) => void;
  actionError: string | null;
  setActionError: (value: string | null) => void;
  actionStatus: string | null;
  setActionStatus: (value: string | null) => void;
  actionBusy: boolean;
  setActionBusy: (value: boolean) => void;
  editDraft: string;
  setEditDraft: (value: string) => void;
  heldMessageId: string | null;
  setHeldMessageId: (value: string | null) => void;
  regeneratingMessageId: string | null;
  handleSend: (message: string) => Promise<void>;
  handleRegenerate: (message: StoredMessage) => Promise<void>;
  getVariantState: (message: StoredMessage) => VariantState;
  applyVariantSelection: (messageId: string, variantId: string) => Promise<void>;
  handleVariantSwipe: (messageId: string, direction: "prev" | "next") => Promise<void>;
  handleVariantDrag: (messageId: string, offsetX: number) => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  handleDeleteMessage: (message: StoredMessage) => Promise<void>;
  resetMessageActions: () => void;
  initializeLongPressTimer: (id: number | null) => void;
}

export function useChatController(characterId?: string): ChatController {
  const [character, setCharacter] = useState<Character | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [messageAction, setMessageAction] = useState<MessageActionState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [heldMessageId, setHeldMessageId] = useState<string | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      try {
        unlisten = await listen("chat://debug", (event) => {
          console.log("[chat-debug]", event.payload);
        });
      } catch (err) {
        console.warn("ChatController: failed to attach debug listener", err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!characterId) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const list = await listCharacters();
        const match = list.find((c) => c.id === characterId) ?? null;
        if (!match) {
          if (!cancelled) {
            setCharacter(null);
          }
          return;
        }

        const personaDefault = await getDefaultPersona().catch((err) => {
          console.warn("ChatController: failed to load persona", err);
          return null;
        });

        const sessionIds = await listSessionIds().catch(() => [] as string[]);
        let existingSession: Session | null = null;
        let latestUpdatedAt = -Infinity;
        for (const id of sessionIds) {
          const maybe = await getSession(id).catch((err) => {
            console.warn("ChatController: failed to read session", { id, err });
            return null;
          });
          if (maybe?.characterId === match.id) {
            if (!existingSession || maybe.updatedAt > latestUpdatedAt) {
              existingSession = maybe;
              latestUpdatedAt = maybe.updatedAt;
            }
          }
        }
        if (!existingSession) {
          existingSession = await createSession(match.id, match.name ?? "New chat");
        }
        const orderedMessages = [...(existingSession.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
        const normalizedSession: Session = { ...existingSession, messages: orderedMessages };

        if (!cancelled) {
          setCharacter(match);
          setPersona(personaDefault ?? null);
          setSession(normalizedSession);
          setMessages(orderedMessages);
        }
      } catch (err) {
        console.error("ChatController: failed to load chat", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }, [longPressTimer]);

  const resetMessageActions = useCallback(() => {
    setMessageAction(null);
    setEditDraft("");
    setActionError(null);
    setActionStatus(null);
  }, []);

  const initializeLongPressTimer = useCallback((timer: number | null) => {
    setLongPressTimer(timer);
  }, []);

  const getVariantState = useCallback((message: StoredMessage): VariantState => {
    const variants = message.variants ?? [];
    if (variants.length === 0) {
      return {
        variants,
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

  const applyVariantSelection = useCallback(
    async (messageId: string, variantId: string) => {
      if (!session || regeneratingMessageId) return;
      const currentMessage = messages.find((msg) => msg.id === messageId);
      if (!currentMessage) return;
      const variants = currentMessage.variants ?? [];
      const targetVariant = variants.find((variant) => variant.id === variantId);
      if (!targetVariant) return;

      const updatedMessage: StoredMessage = {
        ...currentMessage,
        content: targetVariant.content,
        usage: targetVariant.usage ?? currentMessage.usage,
        selectedVariantId: targetVariant.id,
      };

      const updatedMessages = messages.map((msg) => (msg.id === messageId ? updatedMessage : msg));
      setMessages(updatedMessages);

      const updatedSession: Session = {
        ...session,
        messages: updatedMessages,
        updatedAt: Date.now(),
      } as Session;
      setSession(updatedSession);

      if (messageAction?.message.id === messageId) {
        setMessageAction({ message: updatedMessage, mode: messageAction.mode });
      }

      try {
        await saveSession(updatedSession);
      } catch (err) {
        console.error("ChatController: failed to persist variant selection", err);
      }
    },
    [messageAction, messages, regeneratingMessageId, session],
  );

  const handleVariantSwipe = useCallback(
    async (messageId: string, direction: "prev" | "next") => {
      if (!session || regeneratingMessageId) return;
      if (messages.length === 0 || messages[messages.length - 1]?.id !== messageId) return;
      const currentMessage = messages.find((msg) => msg.id === messageId);
      if (!currentMessage || currentMessage.role !== "assistant") return;
      const variants = currentMessage.variants ?? [];
      if (variants.length <= 1) return;

      const state = getVariantState(currentMessage);
      const currentIndex = state.selectedIndex >= 0 ? state.selectedIndex : variants.length - 1;
      const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0 || nextIndex >= variants.length) return;
      const nextVariant = variants[nextIndex];
      await applyVariantSelection(messageId, nextVariant.id);
    },
    [applyVariantSelection, getVariantState, messages, regeneratingMessageId, session],
  );

  const handleVariantDrag = useCallback(
    async (messageId: string, offsetX: number) => {
      if (offsetX > 60) {
        await handleVariantSwipe(messageId, "prev");
      } else if (offsetX < -60) {
        await handleVariantSwipe(messageId, "next");
      }
    },
    [handleVariantSwipe],
  );

  const handleSend = useCallback(
    async (message: string) => {
      if (!session || !character) return;
      const requestId = crypto.randomUUID();

      const userPlaceholder = createPlaceholderMessage("user", message);
      const assistantPlaceholder = createPlaceholderMessage("assistant", "");

      setSending(true);
      setMessages((prev) => [...prev, userPlaceholder, assistantPlaceholder]);

      let unlisten: UnlistenFn | null = null;

      try {
        unlisten = await listen<string>(`api://${requestId}`, (event) => {
          const delta = parseStreamDelta(event.payload ?? "");
          if (!delta) return;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantPlaceholder.id
                ? { ...msg, content: msg.content + delta }
                : msg,
            ),
          );
        });

        const result = await sendChatTurn({
          sessionId: session.id,
          characterId: character.id,
          message,
          personaId: persona?.id,
          stream: true,
          requestId,
        });

        setSession((prev) => {
          if (!prev) return prev;
          const updatedMessages = [...(prev.messages ?? []), result.userMessage, result.assistantMessage];
          return {
            ...prev,
            messages: updatedMessages,
            updatedAt: result.assistantMessage.createdAt,
          } as Session;
        });

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === userPlaceholder.id) {
              return result.userMessage;
            }
            if (msg.id === assistantPlaceholder.id) {
              return result.assistantMessage;
            }
            return msg;
          }),
        );
      } catch (err) {
        console.error("ChatController: send failed", err);
        setError(err instanceof Error ? err.message : String(err));
        const latest = await getSession(session.id).catch(() => null);
        if (latest) {
          const ordered = [...(latest.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
          setSession({ ...latest, messages: ordered });
          setMessages(ordered);
        } else {
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantPlaceholder.id));
        }
      } finally {
        if (unlisten) {
          unlisten();
        }
        setSending(false);
      }
    },
    [character, persona?.id, session],
  );

  const handleRegenerate = useCallback(
    async (message: StoredMessage) => {
      if (!session) return;
      if (messages.length === 0 || messages[messages.length - 1]?.id !== message.id) return;
      if (message.role !== "assistant") return;
      if (regeneratingMessageId) return;

      const requestId = crypto.randomUUID();
      let unlisten: UnlistenFn | null = null;

      setRegeneratingMessageId(message.id);
      setError(null);
      setHeldMessageId(null);

      setMessages((prev) =>
        prev.map((msg) => (msg.id === message.id ? { ...msg, content: "" } : msg)),
      );

      try {
        unlisten = await listen<string>(`api://${requestId}`, (event) => {
          const delta = parseStreamDelta(event.payload ?? "");
          if (!delta) return;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === message.id
                ? {
                    ...msg,
                    content: msg.content + delta,
                  }
                : msg,
            ),
          );
        });

        const result = await regenerateAssistantMessage({
          sessionId: session.id,
          messageId: message.id,
          stream: true,
          requestId,
        });

        setSession((prev) => {
          if (!prev) return prev;
          const updatedMessages = [...(prev.messages ?? [])].map((msg) =>
            msg.id === message.id ? result.assistantMessage : msg,
          );
          return {
            ...prev,
            messages: updatedMessages,
            updatedAt: Date.now(),
          } as Session;
        });

        setMessages((prev) =>
          prev.map((msg) => (msg.id === message.id ? result.assistantMessage : msg)),
        );
        if (messageAction?.message.id === message.id) {
          setMessageAction({ message: result.assistantMessage, mode: messageAction.mode });
        }
      } catch (err) {
        console.error("ChatController: regenerate failed", err);
        setError(err instanceof Error ? err.message : String(err));
        const latest = await getSession(session.id).catch(() => null);
        if (latest) {
          const ordered = [...(latest.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
          setSession({ ...latest, messages: ordered });
          setMessages(ordered);
        }
      } finally {
        if (unlisten) {
          unlisten();
        }
        setRegeneratingMessageId(null);
      }
    },
    [messageAction, messages, regeneratingMessageId, session],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!session || !messageAction) return;
    const updatedContent = editDraft.trim();
    if (!updatedContent) {
      setActionError("Message cannot be empty");
      return;
    }
    setActionBusy(true);
    setActionError(null);
    setActionStatus(null);
    try {
      const updatedMessages = (session.messages ?? []).map((msg) =>
        msg.id === messageAction.message.id
          ? {
              ...msg,
              content: updatedContent,
              variants: (msg.variants ?? []).map((variant) =>
                variant.id === (msg.selectedVariantId ?? variant.id)
                  ? { ...variant, content: updatedContent }
                  : variant,
              ),
            }
          : msg,
      );
      const updatedSession: Session = {
        ...session,
        messages: updatedMessages,
        updatedAt: Date.now(),
      };
      await saveSession(updatedSession);
      setSession(updatedSession);
      setMessages(updatedMessages);
      resetMessageActions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }, [editDraft, messageAction, resetMessageActions, session]);

  const handleDeleteMessage = useCallback(
    async (message: StoredMessage) => {
      if (!session) return;
      const confirmed = window.confirm("Delete this message?");
      if (!confirmed) return;
      setActionBusy(true);
      setActionError(null);
      setActionStatus(null);
      try {
        const updatedMessages = (session.messages ?? []).filter((msg) => msg.id !== message.id);
        const updatedSession: Session = {
          ...session,
          messages: updatedMessages,
          updatedAt: Date.now(),
        };
        await saveSession(updatedSession);
        setSession(updatedSession);
        setMessages(updatedMessages);
        resetMessageActions();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setActionBusy(false);
      }
    },
    [resetMessageActions, session],
  );

  useEffect(() => {
    return () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  return {
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
    handleRegenerate,
    getVariantState,
    applyVariantSelection,
    handleVariantSwipe,
    handleVariantDrag,
    handleSaveEdit,
    handleDeleteMessage,
    resetMessageActions,
    initializeLongPressTimer: (timer) => {
      if (timer === null) {
        clearLongPress();
      } else {
        setLongPressTimer(timer);
      }
    },
  };
}

function createPlaceholderMessage(role: "user" | "assistant", content: string): StoredMessage {
  return {
    id: `placeholder-${role}-${crypto.randomUUID()}`,
    role,
    content,
    createdAt: Date.now(),
    usage: undefined,
    variants: [],
    selectedVariantId: undefined,
  };
}

function parseStreamDelta(chunk: string): string {
  let output = "";
  const lines = chunk.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === "string") {
        output += delta;
      }
    } catch (error) {
      continue;
    }
  }
  return output;
}
