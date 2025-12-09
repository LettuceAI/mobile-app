import { motion, type PanInfo } from "framer-motion";
import React, { useMemo } from "react";
import { RefreshCw, Pin, User, Bot } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { StoredMessage, Character, Persona } from "../../../../core/storage/schemas";
import { radius, typography, interactive, cn } from "../../../design-tokens";
import type { ThemeColors } from "../../../../core/utils/imageAnalysis";
import { useAvatar } from "../../../hooks/useAvatar";
import { useSessionAttachments } from "../../../hooks/useSessionAttachment";

interface VariantState {
  total: number;
  selectedIndex: number;
  variants?: Array<{ id: string; content: string; createdAt: number }>;
}

interface ChatMessageProps {
  message: StoredMessage;
  index: number;
  messagesLength: number;
  heldMessageId: string | null;
  regeneratingMessageId: string | null;
  sending: boolean;
  eventHandlers: Record<string, any>;
  getVariantState: (message: StoredMessage) => VariantState;
  handleVariantDrag: (messageId: string, offsetX: number) => void;
  handleRegenerate: (message: StoredMessage) => Promise<void>;
  isStartingSceneMessage: boolean;
  theme: ThemeColors;
  character: Character | null;
  persona: Persona | null;
  displayContent?: string;
  onImageClick?: (src: string, alt: string) => void;
}

// Avatar component for user/assistant
const MessageAvatar = React.memo(function MessageAvatar({
  role,
  character,
  persona,
}: {
  role: "user" | "assistant" | "scene" | "system";
  character: Character | null;
  persona: Persona | null;
}) {
  const characterAvatar = useAvatar("character", character?.id ?? "", character?.avatarPath);
  const personaAvatar = useAvatar("persona", persona?.id ?? "", persona?.avatarPath);

  if (role === "user") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-linear-to-br from-white/5 to-white/10">
        {personaAvatar ? (
          <img src={personaAvatar} alt="User" className="h-full w-full object-cover" />
        ) : (
          <User size={16} className="text-white/60" />
        )}
      </div>
    );
  }

  if (role === "assistant" || role === "scene") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-linear-to-br from-white/5 to-white/10">
        {characterAvatar ? (
          <img src={characterAvatar} alt="Assistant" className="h-full w-full object-cover" />
        ) : (
          <Bot size={16} className="text-white/60" />
        )}
      </div>
    );
  }

  return null;
});

// Memoized action buttons component
const MessageActions = React.memo(function MessageActions({
  disabled,
  isRegenerating,
  onRegenerate,
}: {
  disabled: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
}) {
  return (
    <motion.div 
      className="absolute -bottom-4 right-0 flex items-center gap-2"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ 
        type: "tween", 
        duration: 0.15, 
        ease: [0.25, 0.46, 0.45, 0.94],
        delay: 0.1
      }}
    >
      <button
        type="button"
        onClick={onRegenerate}
        disabled={disabled}
        className={cn(
          "flex items-center justify-center",
          radius.full,
          "border border-white/15 bg-white/10 text-white",
          interactive.transition.fast,
          "hover:border-white/30 hover:bg-white/20 hover:scale-105",
          interactive.active.scale,
          "disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:scale-100"
        )}
        aria-label="Regenerate response"
        style={{ willChange: 'transform' }}
      >
        {isRegenerating ? (
          <RefreshCw size={14} className="animate-spin rounded-full" />
        ) : (
          <RefreshCw size={14} />
        )}
      </button>
    </motion.div>
  );
});

function ChatMessageInner({
  message,
  index,
  messagesLength,
  heldMessageId,
  regeneratingMessageId,
  sending,
  eventHandlers,
  getVariantState,
  handleVariantDrag,
  handleRegenerate,
  isStartingSceneMessage,
  theme,
  character,
  persona,
  displayContent,
  onImageClick,
}: ChatMessageProps) {
  // Memoize all computed values
  const computed = useMemo(() => {
    const isAssistant = message.role === "assistant";
    const isScene = message.role === "scene";
    const isUser = message.role === "user";
    const isPlaceholder = message.id.startsWith("placeholder");
    const actionable = (isAssistant || isUser || isScene) && !isPlaceholder;
    const isLatestAssistant = isAssistant && actionable && index === messagesLength - 1;
    const variantState = getVariantState(message);
    const totalVariants = variantState.total || ((isAssistant || isScene) ? 1 : 0);
    const selectedVariantIndex =
      variantState.selectedIndex >= 0 ? variantState.selectedIndex : totalVariants > 0 ? totalVariants - 1 : -1;
    
    const enableSwipe = isStartingSceneMessage 
      ? (index === 0 && variantState.total > 1)
      : isLatestAssistant && (variantState.variants?.length ?? 0) > 1;
    
    const showTypingIndicator = isAssistant && isPlaceholder && message.content.trim().length === 0;
    const showRegenerateButton = isLatestAssistant && !isStartingSceneMessage;
    const shouldAnimate = !isPlaceholder;

    return {
      isAssistant,
      isScene,
      isUser,
      isPlaceholder,
      isLatestAssistant,
      totalVariants,
      selectedVariantIndex,
      enableSwipe,
      showTypingIndicator,
      showRegenerateButton,
      shouldAnimate,
    };
  }, [message.role, message.id, message.content, index, messagesLength, getVariantState, isStartingSceneMessage]);

  const dragProps = useMemo(
    () =>
      computed.enableSwipe
        ? {
            drag: "x" as const,
            dragConstraints: { left: -140, right: 140 },
            dragElastic: 0.08,
            dragMomentum: false,
            dragSnapToOrigin: true,
            dragTransition: { bounceStiffness: 600, bounceDamping: 40 },
            onDragEnd: (_: unknown, info: PanInfo) =>
              void handleVariantDrag(message.id, info.offset.x),
            whileDrag: { scale: 0.98 },
            style: { willChange: "transform", transform: "translate3d(0,0,0)" },
          }
        : {},
    [computed.enableSwipe, handleVariantDrag, message.id]
  );

  const animTransition = useMemo(
    () =>
      computed.shouldAnimate
        ? { type: "tween" as const, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const }
        : { duration: 0 },
    [computed.shouldAnimate]
  );

  // Load attachments with lazy loading support for persisted images
  const loadedAttachments = useSessionAttachments(message.attachments);

  return (
    <div
      className={cn(
        "relative flex gap-2",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {/* Avatar for assistant/scene messages (left side) */}
      {(message.role === "assistant" || message.role === "scene") && (
        <MessageAvatar role={message.role} character={character} persona={persona} />
      )}

      <motion.div
        initial={computed.shouldAnimate ? { opacity: 0, y: 4 } : false}
        animate={computed.shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
        transition={animTransition}
        className={cn(
          "max-w-[82%] px-4 py-2.5 leading-relaxed",
          radius.lg,
          typography.body.size,
          message.role === "user"
            ? cn(
                `ml-auto ${theme.userBg} ${theme.userText} border ${theme.userBorder}`,
                heldMessageId === message.id && "ring-2 ring-emerald-400/50"
              )
            : cn(
                `border ${theme.assistantBg} ${theme.assistantText}`,
                heldMessageId === message.id ? "border-white/30" : theme.assistantBorder
              )
        )}
        {...eventHandlers}
        {...dragProps}
      >
        {/* Pin indicator */}
        {message.isPinned && (
          <motion.div 
            className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-blue-500/40 bg-blue-500/20 shadow-lg"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Pin size={12} className="text-blue-300" />
          </motion.div>
        )}
        
        {computed.showTypingIndicator ? (
          <TypingIndicator />
        ) : (
          <>
            {/* Display attachments if present (with lazy loading support) */}
            {loadedAttachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {loadedAttachments.map((attachment) => (
                  <div 
                    key={attachment.id}
                    className={cn(
                      radius.md,
                      "overflow-hidden border border-white/15",
                      attachment.data && onImageClick && "cursor-pointer hover:border-white/30 transition-colors"
                    )}
                    onClick={() => attachment.data && onImageClick?.(
                      attachment.data,
                      attachment.filename || "Attached image"
                    )}
                  >
                    {attachment.data ? (
                      <img
                        src={attachment.data}
                        alt={attachment.filename || "Attached image"}
                        className="max-h-48 max-w-full object-contain"
                        style={{
                          maxWidth: attachment.width && attachment.width > 300 ? 300 : attachment.width || 300
                        }}
                      />
                    ) : (
                      // Loading placeholder
                      <div 
                        className="flex items-center justify-center bg-white/5"
                        style={{
                          width: Math.min(attachment.width || 150, 300),
                          height: Math.min(attachment.height || 100, 192)
                        }}
                      >
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <MarkdownRenderer 
              key={message.id + ":" + computed.selectedVariantIndex}
              content={displayContent ?? message.content} 
              className="text-inherit select-none" 
            />
          </>
        )}

        {(computed.isAssistant || computed.isScene) && computed.totalVariants > 1 && (
          <motion.div 
            className={cn(
              "mt-2.5 flex items-center justify-between pr-2",
              typography.caption.size,
              typography.caption.weight,
              "uppercase tracking-wider text-white/40"
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.15 }}
          >
            <span className="text-white">
              {isStartingSceneMessage ? "Scene" : "Variant"} {computed.selectedVariantIndex >= 0 ? computed.selectedVariantIndex + 1 : 1}
              {computed.totalVariants > 0 ? ` / ${computed.totalVariants}` : ""}
            </span>
            {regeneratingMessageId === message.id && (
              <motion.span 
                className="flex items-center gap-1.5 text-emerald-300"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
              >
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300/30 border-t-emerald-300" />
                Regenerating
              </motion.span>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Avatar for user messages (right side) */}
      {message.role === "user" && (
        <MessageAvatar role={message.role} character={character} persona={persona} />
      )}

      {computed.showRegenerateButton && (
        <MessageActions
          disabled={regeneratingMessageId === message.id || sending}
          isRegenerating={regeneratingMessageId === message.id}
          onRegenerate={() => void handleRegenerate(message)}
        />
      )}
    </div>
  );
}

export const ChatMessage = React.memo(ChatMessageInner, (prev, next) => {
  const a = prev.message;
  const b = next.message;
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.content === b.content &&
    a.selectedVariantId === b.selectedVariantId &&
    (a.variants?.length ?? 0) === (b.variants?.length ?? 0) &&
    (a.attachments?.length ?? 0) === (b.attachments?.length ?? 0) &&
    prev.index === next.index &&
    prev.messagesLength === next.messagesLength &&
    prev.heldMessageId === next.heldMessageId &&
    prev.regeneratingMessageId === next.regeneratingMessageId &&
    prev.sending === next.sending &&
    prev.isStartingSceneMessage === next.isStartingSceneMessage &&
    prev.theme === next.theme &&
    prev.character?.id === next.character?.id &&
    prev.character?.avatarPath === next.character?.avatarPath &&
    prev.persona?.id === next.persona?.id &&
    prev.persona?.avatarPath === next.persona?.avatarPath
  );
});

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1" aria-label="Assistant is typing" aria-live="polite">
      <span className="typing-dot" />
      <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
      <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
    </div>
  );
}
