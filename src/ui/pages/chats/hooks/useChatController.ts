import { useCallback, useEffect, useReducer, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { createSession, getDefaultPersona, getSession, listCharacters, listSessionIds, saveSession, listPersonas, SETTINGS_UPDATED_EVENT } from "../../../../core/storage/repo";
import type { Character, Persona, Session, StoredMessage } from "../../../../core/storage/schemas";
import { continueConversation, regenerateAssistantMessage, sendChatTurn } from "../../../../core/chat/manager";
import { chatReducer, initialChatState, type MessageActionState } from "./chatReducer";

export interface VariantState {
  variants: StoredMessage["variants"];
  selectedIndex: number;
  total: number;
}

export interface ChatController {
  // State
  character: Character | null;
  persona: Persona | null;
  session: Session | null;
  messages: StoredMessage[];
  draft: string;
  loading: boolean;
  sending: boolean;
  error: string | null;
  messageAction: MessageActionState | null;
  actionError: string | null;
  actionStatus: string | null;
  actionBusy: boolean;
  editDraft: string;
  heldMessageId: string | null;
  regeneratingMessageId: string | null;

  // Setters 
  setDraft: (value: string) => void;
  setError: (value: string | null) => void;
  setMessageAction: (value: MessageActionState | null) => void;
  setActionError: (value: string | null) => void;
  setActionStatus: (value: string | null) => void;
  setActionBusy: (value: boolean) => void;
  setEditDraft: (value: string) => void;
  setHeldMessageId: (value: string | null) => void;

  // Actions
  handleSend: (message: string) => Promise<void>;
  handleContinue: () => Promise<void>;
  handleRegenerate: (message: StoredMessage) => Promise<void>;
  getVariantState: (message: StoredMessage) => VariantState;
  applyVariantSelection: (messageId: string, variantId: string) => Promise<void>;
  handleVariantSwipe: (messageId: string, direction: "prev" | "next") => Promise<void>;
  handleVariantDrag: (messageId: string, offsetX: number) => Promise<void>;
  handleSaveEdit: () => Promise<void>;
  handleDeleteMessage: (message: StoredMessage) => Promise<void>;
  handleRewindToMessage: (message: StoredMessage) => Promise<void>;
  resetMessageActions: () => void;
  initializeLongPressTimer: (id: number | null) => void;
}

export function useChatController(
  characterId?: string,
  options: { sessionId?: string } = {}
): ChatController {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const { sessionId } = options;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setSettingsVersion((prev) => prev + 1);
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handler);
    };
  }, []);

  useEffect(() => {
    if (!characterId) return;

    let cancelled = false;

    (async () => {
      try {
        dispatch({ type: "SET_LOADING", payload: true });
        dispatch({ type: "SET_ERROR", payload: null });

        const list = await listCharacters();
        const match = list.find((c) => c.id === characterId) ?? null;
        if (!match) {
          if (!cancelled) {
            dispatch({ type: "SET_CHARACTER", payload: null });
          }
          return;
        }

        let targetSession: Session | null = null;

        if (sessionId) {
          const explicitSession = await getSession(sessionId).catch((err) => {
            console.warn("ChatController: failed to load requested session", { sessionId, err });
            return null;
          });
          if (explicitSession && explicitSession.characterId === match.id) {
            targetSession = explicitSession;
          }
        }

        if (!targetSession) {
          const sessionIds = await listSessionIds().catch(() => [] as string[]);
          let latestUpdatedAt = -Infinity;
          for (const id of sessionIds) {
            const maybe = await getSession(id).catch((err) => {
              console.warn("ChatController: failed to read session", { id, err });
              return null;
            });
            if (maybe?.characterId === match.id) {
              if (!targetSession || maybe.updatedAt > latestUpdatedAt) {
                targetSession = maybe;
                latestUpdatedAt = maybe.updatedAt;
              }
            }
          }
        }

        if (!targetSession) {
          targetSession = await createSession(match.id, match.name ?? "New chat");
        }

        const orderedMessages = [...(targetSession.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
        const normalizedSession: Session = { ...targetSession, messages: orderedMessages };

        // Load persona: prefer session's personaId, fallback to default
        let selectedPersona: Persona | null = null;
        if (normalizedSession.personaId) {
          const allPersonas = await listPersonas().catch(() => [] as Persona[]);
          selectedPersona = allPersonas.find(p => p.id === normalizedSession.personaId) ?? null;
        }
        if (!selectedPersona) {
          selectedPersona = await getDefaultPersona().catch((err) => {
            console.warn("ChatController: failed to load persona", err);
            return null;
          });
        }

        if (!cancelled) {
          dispatch({ type: "SET_CHARACTER", payload: match });
          dispatch({ type: "SET_PERSONA", payload: selectedPersona });
          dispatch({ type: "SET_SESSION", payload: normalizedSession });
          dispatch({ type: "SET_MESSAGES", payload: orderedMessages });
        }
      } catch (err) {
        console.error("ChatController: failed to load chat", err);
        if (!cancelled) {
          dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        if (!cancelled) {
          dispatch({ type: "SET_LOADING", payload: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [characterId, sessionId, settingsVersion]);

  const clearLongPress = useCallback(() => {
    if (state.longPressTimer !== null) {
      window.clearTimeout(state.longPressTimer);
      dispatch({ type: "SET_LONG_PRESS_TIMER", payload: null });
    }
  }, [state.longPressTimer]);

  const resetMessageActions = useCallback(() => {
    dispatch({ type: "RESET_MESSAGE_ACTIONS" });
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
      if (!state.session || state.regeneratingMessageId) return;
      const currentMessage = state.messages.find((msg) => msg.id === messageId);
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

      const updatedMessages = state.messages.map((msg) => (msg.id === messageId ? updatedMessage : msg));
      dispatch({ type: "SET_MESSAGES", payload: updatedMessages });

      const updatedSession: Session = {
        ...state.session,
        messages: updatedMessages,
        updatedAt: Date.now(),
      } as Session;
      dispatch({ type: "SET_SESSION", payload: updatedSession });

      if (state.messageAction?.message.id === messageId) {
        dispatch({ type: "SET_MESSAGE_ACTION", payload: { message: updatedMessage, mode: state.messageAction.mode } });
      }

      try {
        await saveSession(updatedSession);
      } catch (err) {
        console.error("ChatController: failed to persist variant selection", err);
      }
    },
    [state.messageAction, state.messages, state.regeneratingMessageId, state.session],
  );

  const handleVariantSwipe = useCallback(
    async (messageId: string, direction: "prev" | "next") => {
      if (!state.session || state.regeneratingMessageId) return;
      if (state.messages.length === 0 || state.messages[state.messages.length - 1]?.id !== messageId) return;
      const currentMessage = state.messages.find((msg) => msg.id === messageId);
      if (!currentMessage || currentMessage.role !== "assistant") return;
      const variants = currentMessage.variants ?? [];
      if (variants.length <= 1) return;

      const variantState = getVariantState(currentMessage);
      const currentIndex = variantState.selectedIndex >= 0 ? variantState.selectedIndex : variants.length - 1;
      const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0 || nextIndex >= variants.length) return;
      const nextVariant = variants[nextIndex];
      await applyVariantSelection(messageId, nextVariant.id);
    },
    [applyVariantSelection, getVariantState, state.messages, state.regeneratingMessageId, state.session],
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
      if (!state.session || !state.character) return;
      const requestId = crypto.randomUUID();

      const userPlaceholder = createPlaceholderMessage("user", message);
      const assistantPlaceholder = createPlaceholderMessage("assistant", "");

      dispatch({ type: "SET_SENDING", payload: true });
      dispatch({ type: "SET_MESSAGES", payload: [...state.messages, userPlaceholder, assistantPlaceholder] });

      let unlisten: UnlistenFn | null = null;

      try {
        unlisten = await listen<string>(`api://${requestId}`, (event) => {
          const delta = parseStreamDelta(event.payload ?? "");
          if (!delta) return;
          dispatch({ 
            type: "UPDATE_MESSAGE_CONTENT", 
            payload: { messageId: assistantPlaceholder.id, content: delta } 
          });
        });

        const result = await sendChatTurn({
          sessionId: state.session.id,
          characterId: state.character.id,
          message,
          personaId: state.persona?.id,
          stream: true,
          requestId,
        });

        const updatedSession: Session = {
          ...state.session,
          messages: [...(state.session.messages ?? []), result.userMessage, result.assistantMessage],
          updatedAt: result.assistantMessage.createdAt,
        } as Session;

        dispatch({ type: "SET_SESSION", payload: updatedSession });
        dispatch({ type: "SET_MESSAGES", payload: updatedSession.messages ?? [] });
        dispatch({ 
          type: "REPLACE_PLACEHOLDER_MESSAGES", 
          payload: { userPlaceholder, assistantPlaceholder, userMessage: result.userMessage, assistantMessage: result.assistantMessage } 
        });
      } catch (err) {
        console.error("ChatController: send failed", err);
        dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : String(err) });
        const latest = await getSession(state.session.id).catch(() => null);
        if (latest) {
          const ordered = [...(latest.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
          dispatch({ type: "SET_SESSION", payload: { ...latest, messages: ordered } });
          dispatch({ type: "SET_MESSAGES", payload: ordered });
        } else {
          dispatch({ 
            type: "SET_MESSAGES", 
            payload: state.messages.filter((msg) => msg.id !== assistantPlaceholder.id) 
          });
        }
      } finally {
        if (unlisten) {
          unlisten();
        }
        dispatch({ type: "SET_SENDING", payload: false });
      }
    },
    [state.character, state.persona?.id, state.session, state.messages],
  );

  const handleContinue = useCallback(
    async () => {
      if (!state.session || !state.character) return;
      const requestId = crypto.randomUUID();

      const assistantPlaceholder = createPlaceholderMessage("assistant", "");

      dispatch({ type: "SET_SENDING", payload: true });
      dispatch({ type: "SET_MESSAGES", payload: [...state.messages, assistantPlaceholder] });

      let unlisten: UnlistenFn | null = null;

      try {
        unlisten = await listen<string>(`api://${requestId}`, (event) => {
          const delta = parseStreamDelta(event.payload ?? "");
          if (!delta) return;
          dispatch({ 
            type: "UPDATE_MESSAGE_CONTENT", 
            payload: { messageId: assistantPlaceholder.id, content: delta } 
          });
        });

        const result = await continueConversation({
          sessionId: state.session.id,
          characterId: state.character.id,
          personaId: state.persona?.id,
          stream: true,
          requestId,
        });

        const currentMessages = state.messages.filter((msg) => msg.id !== assistantPlaceholder.id);
        const updatedSession: Session = {
          ...state.session,
          messages: [...currentMessages, result.assistantMessage],
          updatedAt: result.assistantMessage.createdAt,
        } as Session;

        dispatch({ type: "SET_SESSION", payload: updatedSession });
        dispatch({ type: "SET_MESSAGES", payload: updatedSession.messages ?? [] });
      } catch (err) {
        console.error("ChatController: continue failed", err);
        dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : String(err) });
        dispatch({ 
          type: "SET_MESSAGES", 
          payload: state.messages.filter((msg) => msg.id !== assistantPlaceholder.id) 
        });
        if (state.session) {
          const currentMessages = state.messages.filter((msg) => msg.id !== assistantPlaceholder.id);
          const syncedSession: Session = {
            ...state.session,
            messages: currentMessages,
            updatedAt: Date.now(),
          };
          try {
            await saveSession(syncedSession);
            dispatch({ type: "SET_SESSION", payload: syncedSession });
          } catch (saveErr) {
            console.error("ChatController: failed to sync session after continue error", saveErr);
          }
        }
      } finally {
        if (unlisten) {
          unlisten();
        }
        dispatch({ type: "SET_SENDING", payload: false });
      }
    },
    [state.character, state.persona?.id, state.session, state.messages],
  );

  const handleRegenerate = useCallback(
    async (message: StoredMessage) => {
      if (!state.session) return;
      if (state.messages.length === 0 || state.messages[state.messages.length - 1]?.id !== message.id) return;
      if (message.role !== "assistant") return;
      if (state.regeneratingMessageId) return;

      const requestId = crypto.randomUUID();
      let unlisten: UnlistenFn | null = null;

      dispatch({ type: "SET_REGENERATING_MESSAGE_ID", payload: message.id });
      dispatch({ type: "SET_ERROR", payload: null });
      dispatch({ type: "SET_HELD_MESSAGE_ID", payload: null });

      dispatch({ 
        type: "SET_MESSAGES", 
        payload: state.messages.map((msg) => (msg.id === message.id ? { ...msg, content: "" } : msg)) 
      });

      try {
        unlisten = await listen<string>(`api://${requestId}`, (event) => {
          const delta = parseStreamDelta(event.payload ?? "");
          if (!delta) return;
          dispatch({ 
            type: "UPDATE_MESSAGE_CONTENT", 
            payload: { messageId: message.id, content: delta } 
          });
        });

        const result = await regenerateAssistantMessage({
          sessionId: state.session.id,
          messageId: message.id,
          stream: true,
          requestId,
        });

        const updatedMessages = [...(state.session.messages ?? [])].map((msg) =>
          msg.id === message.id ? result.assistantMessage : msg,
        );
        const updatedSession: Session = {
          ...state.session,
          messages: updatedMessages,
          updatedAt: Date.now(),
        } as Session;

        dispatch({ type: "SET_SESSION", payload: updatedSession });
        dispatch({ 
          type: "SET_MESSAGES", 
          payload: state.messages.map((msg) => (msg.id === message.id ? result.assistantMessage : msg)) 
        });
        
        if (state.messageAction?.message.id === message.id) {
          dispatch({ 
            type: "SET_MESSAGE_ACTION", 
            payload: { message: result.assistantMessage, mode: state.messageAction.mode } 
          });
        }
      } catch (err) {
        console.error("ChatController: regenerate failed", err);
        dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : String(err) });
        const latest = await getSession(state.session.id).catch(() => null);
        if (latest) {
          const ordered = [...(latest.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
          dispatch({ type: "SET_SESSION", payload: { ...latest, messages: ordered } });
          dispatch({ type: "SET_MESSAGES", payload: ordered });
        }
      } finally {
        if (unlisten) {
          unlisten();
        }
        dispatch({ type: "SET_REGENERATING_MESSAGE_ID", payload: null });
      }
    },
    [state.messageAction, state.messages, state.regeneratingMessageId, state.session],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!state.session || !state.messageAction) return;
    const updatedContent = state.editDraft.trim();
    if (!updatedContent) {
      dispatch({ type: "SET_ACTION_ERROR", payload: "Message cannot be empty" });
      return;
    }
    dispatch({ type: "SET_ACTION_BUSY", payload: true });
    dispatch({ type: "SET_ACTION_ERROR", payload: null });
    dispatch({ type: "SET_ACTION_STATUS", payload: null });
    try {
      const updatedMessages = (state.session.messages ?? []).map((msg) =>
        msg.id === state.messageAction!.message.id
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
        ...state.session,
        messages: updatedMessages,
        updatedAt: Date.now(),
      };
      await saveSession(updatedSession);
      dispatch({ type: "SET_SESSION", payload: updatedSession });
      dispatch({ type: "SET_MESSAGES", payload: updatedMessages });
      resetMessageActions();
    } catch (err) {
      dispatch({ type: "SET_ACTION_ERROR", payload: err instanceof Error ? err.message : String(err) });
    } finally {
      dispatch({ type: "SET_ACTION_BUSY", payload: false });
    }
  }, [state.editDraft, state.messageAction, resetMessageActions, state.session]);

  const handleDeleteMessage = useCallback(
    async (message: StoredMessage) => {
      if (!state.session) return;
      const confirmed = window.confirm("Delete this message?");
      if (!confirmed) return;
      dispatch({ type: "SET_ACTION_BUSY", payload: true });
      dispatch({ type: "SET_ACTION_ERROR", payload: null });
      dispatch({ type: "SET_ACTION_STATUS", payload: null });
      try {
        const updatedMessages = (state.session.messages ?? []).filter((msg) => msg.id !== message.id);
        const updatedSession: Session = {
          ...state.session,
          messages: updatedMessages,
          updatedAt: Date.now(),
        };
        await saveSession(updatedSession);
        dispatch({ type: "SET_SESSION", payload: updatedSession });
        dispatch({ type: "SET_MESSAGES", payload: updatedMessages });
        resetMessageActions();
      } catch (err) {
        dispatch({ type: "SET_ACTION_ERROR", payload: err instanceof Error ? err.message : String(err) });
      } finally {
        dispatch({ type: "SET_ACTION_BUSY", payload: false });
      }
    },
    [resetMessageActions, state.session],
  );

  const handleRewindToMessage = useCallback(
    async (message: StoredMessage) => {
      if (!state.session) return;
      const confirmed = window.confirm(
        "Rewind conversation to this message? All messages after this point will be removed."
      );
      if (!confirmed) return;
      
      dispatch({ type: "SET_ACTION_BUSY", payload: true });
      dispatch({ type: "SET_ACTION_ERROR", payload: null });
      dispatch({ type: "SET_ACTION_STATUS", payload: null });
      
      try {
        const messageIndex = state.session.messages.findIndex((msg) => msg.id === message.id);
        if (messageIndex === -1) {
          dispatch({ type: "SET_ACTION_ERROR", payload: "Message not found" });
          return;
        }
        
        const updatedMessages = state.session.messages.slice(0, messageIndex + 1);
        const updatedSession: Session = {
          ...state.session,
          messages: updatedMessages,
          updatedAt: Date.now(),
        };
        
        await saveSession(updatedSession);
        dispatch({ type: "SET_SESSION", payload: updatedSession });
        dispatch({ type: "REWIND_TO_MESSAGE", payload: { messageId: message.id, messages: updatedMessages } });
        resetMessageActions();
      } catch (err) {
        dispatch({ type: "SET_ACTION_ERROR", payload: err instanceof Error ? err.message : String(err) });
      } finally {
        dispatch({ type: "SET_ACTION_BUSY", payload: false });
      }
    },
    [resetMessageActions, state.session],
  );

  useEffect(() => {
    return () => {
      if (state.longPressTimer !== null) {
        window.clearTimeout(state.longPressTimer);
      }
    };
  }, [state.longPressTimer]);

  return {
    // State
    character: state.character,
    persona: state.persona,
    session: state.session,
    messages: state.messages,
    draft: state.draft,
    loading: state.loading,
    sending: state.sending,
    error: state.error,
    messageAction: state.messageAction,
    actionError: state.actionError,
    actionStatus: state.actionStatus,
    actionBusy: state.actionBusy,
    editDraft: state.editDraft,
    heldMessageId: state.heldMessageId,
    regeneratingMessageId: state.regeneratingMessageId,
    
    // Setters
    setDraft: useCallback((value: string) => dispatch({ type: "SET_DRAFT", payload: value }), []),
    setError: useCallback((value: string | null) => dispatch({ type: "SET_ERROR", payload: value }), []),
    setMessageAction: useCallback((value: MessageActionState | null) => dispatch({ type: "SET_MESSAGE_ACTION", payload: value }), []),
    setActionError: useCallback((value: string | null) => dispatch({ type: "SET_ACTION_ERROR", payload: value }), []),
    setActionStatus: useCallback((value: string | null) => dispatch({ type: "SET_ACTION_STATUS", payload: value }), []),
    setActionBusy: useCallback((value: boolean) => dispatch({ type: "SET_ACTION_BUSY", payload: value }), []),
    setEditDraft: useCallback((value: string) => dispatch({ type: "SET_EDIT_DRAFT", payload: value }), []),
    setHeldMessageId: useCallback((value: string | null) => dispatch({ type: "SET_HELD_MESSAGE_ID", payload: value }), []),
    
    // Actions
    handleSend,
    handleContinue,
    handleRegenerate,
    getVariantState,
    applyVariantSelection,
    handleVariantSwipe,
    handleVariantDrag,
    handleSaveEdit,
    handleDeleteMessage,
    handleRewindToMessage,
    resetMessageActions,
    initializeLongPressTimer: (timer) => {
      if (timer === null) {
        clearLongPress();
      } else {
        dispatch({ type: "SET_LONG_PRESS_TIMER", payload: timer });
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
