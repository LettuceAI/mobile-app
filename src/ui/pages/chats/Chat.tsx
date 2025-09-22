import { useEffect, useMemo, useState } from "react";
import type { MouseEvent, TouchEvent } from "react";
import { motion, PanInfo } from "framer-motion";
import { ArrowLeft, Settings, RefreshCw, Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useNavigate, useParams } from "react-router-dom";

import { createSession, getDefaultPersona, getSession, listCharacters, listSessionIds, saveSession } from "../../../core/storage/repo";
import type { Character, Persona, Session, StoredMessage } from "../../../core/storage/schemas";
import { sendChatTurn, regenerateAssistantMessage } from "../../../core/chat/manager";
import { BottomMenu } from "../../components/BottomMenu";
import { MarkdownRenderer } from "../../components/MarkdownRenderer";

export function ChatConversationPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();

  const [character, setCharacter] = useState<Character | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null);
  const [messageAction, setMessageAction] = useState<{ message: StoredMessage; mode: "view" | "edit" } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [heldMessageId, setHeldMessageId] = useState<string | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);

  const LONG_PRESS_DELAY = 450;

  const clearLongPress = () => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const closeMessageActions = (force = false) => {
    if (!force && (actionBusy || messageAction?.mode === "edit")) {
      return;
    }
    setMessageAction(null);
    setEditDraft("");
    setActionError(null);
    setActionStatus(null);
  };

  const openMessageActions = (message: StoredMessage) => {
    setMessageAction({ message, mode: "view" });
    setEditDraft(message.content);
    setActionError(null);
    setActionStatus(null);
    setActionBusy(false);
  };

  const scheduleLongPress = (message: StoredMessage) => {
    clearLongPress();
    const timer = window.setTimeout(() => {
      setLongPressTimer(null);
      openMessageActions(message);
    }, LONG_PRESS_DELAY);
    setLongPressTimer(timer);
  };

  const handlePressStart = (message: StoredMessage) => (
    event: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>,
  ) => {
    if (message.id.startsWith("placeholder")) return;
    scheduleLongPress(message);
    setHeldMessageId(message.id);
  };

  const handlePressEnd = () => {
    clearLongPress();
    setHeldMessageId(null);
  };

  const handleContextMenu = (message: StoredMessage) => (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    clearLongPress();
    if (message.id.startsWith("placeholder")) return;
    openMessageActions(message);
    setHeldMessageId(null);
  };

  const handleCopyMessage = async (message: StoredMessage) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
        setActionStatus("Copied to clipboard");
        setTimeout(() => setActionStatus(null), 1500);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const getVariantState = (message: StoredMessage) => {
    const variants = message.variants ?? [];
    if (variants.length === 0) {
      return {
        variants,
        selectedIndex: -1,
        selectedVariant: undefined,
        total: 0,
      } as const;
    }
    const explicitIndex = message.selectedVariantId
      ? variants.findIndex((variant) => variant.id === message.selectedVariantId)
      : -1;
    const selectedIndex = explicitIndex >= 0 ? explicitIndex : variants.length - 1;
    const selectedVariant = variants[selectedIndex];
    return {
      variants,
      selectedIndex,
      selectedVariant,
      total: variants.length,
    } as const;
  };

  const applyVariantSelection = async (messageId: string, variantId: string) => {
    if (!session) return;
    if (regeneratingMessageId) return;
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
      console.error("ChatConversationPage: failed to persist variant selection", err);
    }
  };

  const handleVariantSwipe = async (messageId: string, direction: "prev" | "next") => {
    if (!session) return;
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
  };

  const handleVariantDrag = (messageId: string, info: PanInfo) => {
    if (info.offset.x > 60) {
      void handleVariantSwipe(messageId, "prev");
    } else if (info.offset.x < -60) {
      void handleVariantSwipe(messageId, "next");
    }
  };

  const handleBeginEdit = () => {
    if (!messageAction) return;
    setActionError(null);
    setActionStatus(null);
    setMessageAction({ message: messageAction.message, mode: "edit" });
    setEditDraft(messageAction.message.content);
  };

  const handleCancelEdit = () => {
    if (!messageAction) return;
    setActionError(null);
    setActionStatus(null);
    setMessageAction({ message: messageAction.message, mode: "view" });
    setEditDraft(messageAction.message.content);
  };

  const handleSaveEdit = async () => {
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
      setMessageAction({
        message: {
          ...messageAction.message,
          content: updatedContent,
          variants: (messageAction.message.variants ?? []).map((variant) =>
            variant.id === (messageAction.message.selectedVariantId ?? variant.id)
              ? { ...variant, content: updatedContent }
              : variant,
          ),
        },
        mode: "view",
      });
      closeMessageActions(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteMessage = async (message: StoredMessage) => {
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
      closeMessageActions(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    if (!messageAction) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMessageActions(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messageAction]);

  useEffect(() => {
    return () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      try {
        console.log("ChatConversationPage: attaching debug listener");
        unlisten = await listen("chat://debug", (event) => {
          console.log("[chat-debug]", event.payload);
        });
      } catch (err) {
        console.warn("ChatConversationPage: failed to attach debug listener", err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        console.debug("ChatConversationPage: loading character", { characterId });
        const list = await listCharacters();
        const match = list.find((c) => c.id === characterId) ?? null;
        if (!match) {
          if (!cancelled) {
            setCharacter(null);
          }
          return;
        }

        console.debug("ChatConversationPage: character loaded", match);

        const personaDefault = await getDefaultPersona().catch((err) => {
          console.warn("ChatConversationPage: failed to load persona", err);
          return null;
        });

        const sessionIds = await listSessionIds().catch(() => [] as string[]);
        console.debug("ChatConversationPage: session IDs", sessionIds);
        let existingSession: Session | null = null;
        let latestUpdatedAt = -Infinity;
        for (const id of sessionIds) {
          const maybe = await getSession(id).catch((err) => {
            console.warn("ChatConversationPage: failed to read session", { id, err });
            return null;
          });

          console.debug("ChatConversationPage: checking session", { id, characterId: maybe?.characterId, updatedAt: maybe?.updatedAt, prompt: maybe?.systemPrompt });

          if (maybe?.characterId === match.id) {
            if (!existingSession || maybe.updatedAt > latestUpdatedAt) {
              existingSession = maybe;
              latestUpdatedAt = maybe.updatedAt;
            }
          }
        }
        if (!existingSession) {
          console.debug("ChatConversationPage: creating session for", match.id);
          existingSession = await createSession(match.id, match.name ?? "New chat");
        } else {
          console.debug("ChatConversationPage: selected existing session", {
            sessionId: existingSession.id,
            messageCount: existingSession.messages?.length ?? 0,
            updatedAt: existingSession.updatedAt,
          });
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
        console.error("Failed to load chat", err);
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

  const headerTitle = useMemo(() => character?.name ?? "Unknown", [character?.name]);

  const handleSend = async (message: string) => {
    if (!session || !character) return;
    const requestId = crypto.randomUUID();

    const userPlaceholder = createPlaceholderMessage("user", message);
    const assistantPlaceholder = createPlaceholderMessage("assistant", "");

    setSending(true);
    setMessages((prev) => [...prev, userPlaceholder, assistantPlaceholder]);

    let unlisten: UnlistenFn | null = null;

    try {
      console.debug("ChatConversationPage: sending message", { requestId, messageLength: message.length });
      unlisten = await listen<string>(`api://${requestId}`, (event) => {
        const delta = parseStreamDelta(event.payload ?? "");
        if (!delta) return;
        console.debug("ChatConversationPage: stream delta", { requestId, deltaLength: delta.length });
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
      console.debug("ChatConversationPage: chat turn result", {
        requestId,
        assistantLength: result.assistantMessage.content.length,
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
      console.error("Chat send failed", err);
      setError(err instanceof Error ? err.message : String(err));
      const latest = await getSession(session.id).catch(() => null);

      console.debug("ChatConversationPage: checking session", { id: session.id, characterId: latest?.characterId, updatedAt: latest?.updatedAt, prompt: latest?.systemPrompt });

      if (latest) {
        const ordered = [...(latest.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
        setSession({ ...latest, messages: ordered });
        setMessages(ordered);
      } else {
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantPlaceholder.id));
      }
    } finally {
      if (unlisten) {
        console.debug("ChatConversationPage: cleaning up listener", { requestId });
        unlisten();
      }
      setSending(false);
    }
  };

  const handleRegenerate = async (message: StoredMessage) => {
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
      console.error("ChatConversationPage: regenerate failed", err);
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
  };

  const avatarDisplay = useMemo(() => {
    if (character?.avatarPath && isImageLike(character.avatarPath)) {
      return <img src={character.avatarPath} alt={character?.name ?? "avatar"} className="h-10 w-10 rounded-xl object-cover" />;
    }

    const initials = character?.name ? character.name.slice(0, 2).toUpperCase() : "?";
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm font-semibold text-white">
        {initials}
      </div>
    );
  }, [character]);

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
                onDragEnd: (_: unknown, info: PanInfo) => handleVariantDrag(message.id, info),
              }
              : {};
            const layoutEnabled = !enableSwipe;

            return (
                <div
                key={message.id}
                className={`relative flex ${message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                <motion.div
                  layout={layoutEnabled}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition ${message.role === "user"
                    ? `ml-auto bg-gradient-to-br from-emerald-500/60 to-emerald-400/40 text-white ${heldMessageId === message.id ? "ring-2 ring-white/60" : ""
                    }`
                    : `bg-white/5 text-gray-100 ${heldMessageId === message.id ? "border border-white/30" : "border border-transparent"
                    }`
                  }`}
                  {...eventHandlers}
                  {...dragProps}
                  whileDrag={enableSwipe ? { scale: 0.995 } : undefined}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                >
                  <MarkdownRenderer content={message.content} className="text-inherit" />

                  {isAssistant && totalVariants > 1 && (
                  <div className="mt-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
                    <span>
                      Variant {selectedVariantIndex >= 0 ? selectedVariantIndex + 1 : 1}
                      {totalVariants > 0 ? ` / ${totalVariants}` : ""}
                    </span>
                    {regeneratingMessageId === message.id && (
                    <span className="flex items-center gap-1 text-emerald-200">
                      <Loader2 className="h-5 w-5 animate-spin" />
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
                    onClick={() => handleRegenerate(message)}
                    disabled={regeneratingMessageId === message.id || sending}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Regenerate response"
                  >

                    {regeneratingMessageId === message.id ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                    <RefreshCw className="h-8 w-8" />
                    )}
                  </button>
                  </div>
                )}
                </div>
            );
          })}
        </div>
      </main>

      <footer className="z-20 flex-shrink-0 border-t border-white/10 bg-[#050505]/95 px-3 pb-6 pt-3 backdrop-blur">
        {error && (
          <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-100">
            {error}
          </div>
        )}
        <div className="flex items-end gap-3 rounded-2xl border border-white/15 bg-white/5 p-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message ${character.name}`}
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <button
            onClick={async () => {
              if (sending || !draft.trim()) return;
              setError(null);
              const content = draft.trim();
              setDraft("");
              await handleSend(content);
            }}
            disabled={!draft.trim() || sending}
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </footer>

      <BottomMenu
        isOpen={Boolean(messageAction)}
        onClose={() => closeMessageActions(true)}
        title="Assistant message"
        includeExitIcon
        location="bottom"
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

            {messageAction.mode === "view" && (
              <div className="space-y-3">
                <button
                  onClick={() => handleBeginEdit()}
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/15"
                >
                  Edit message
                </button>
                <button
                  onClick={() => handleCopyMessage(messageAction.message)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/10"
                >
                  Copy content
                </button>
                <button
                  onClick={() => handleDeleteMessage(messageAction.message)}
                  disabled={actionBusy}
                  className="w-full rounded-xl border border-red-500/40 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-100 transition hover:border-red-400/60 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete message
                </button>
              </div>
            )}

            {messageAction.mode === "edit" && (
              <div className="space-y-3">
                <textarea
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-white/15 bg-black/40 p-3 text-sm text-white focus:border-emerald-400 focus:outline-none"
                  disabled={actionBusy}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleCancelEdit}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/25 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={actionBusy}
                    className="rounded-full border border-emerald-400/50 bg-emerald-500/30 px-4 py-2 text-xs font-semibold text-white transition hover:border-emerald-300 hover:bg-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionBusy ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </BottomMenu>
    </div>
  );
}

function isImageLike(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("data:image");
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
