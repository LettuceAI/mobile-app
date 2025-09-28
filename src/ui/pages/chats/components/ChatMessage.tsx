import { motion, type PanInfo } from "framer-motion";
import { Loader2, RefreshCw } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { StoredMessage } from "../../../../core/storage/schemas";

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
}

export function ChatMessage({
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
}: ChatMessageProps) {
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";
  const actionable = (isAssistant || isUser) && !message.id.startsWith("placeholder");
  const isLatestAssistant = isAssistant && actionable && index === messagesLength - 1;
  const variantState = getVariantState(message);
  const totalVariants = variantState.total || (isAssistant ? 1 : 0);
  const selectedVariantIndex =
    variantState.selectedIndex >= 0 ? variantState.selectedIndex : totalVariants > 0 ? totalVariants - 1 : -1;
  const enableSwipe = isLatestAssistant && (variantState.variants?.length ?? 0) > 1;
  const isPlaceholder = message.id.startsWith("placeholder");
  const showTypingIndicator = isAssistant && isPlaceholder && message.content.trim().length === 0;
  
  const dragProps = enableSwipe
    ? {
        drag: "x" as const,
        dragConstraints: { left: -140, right: 140 },
        dragElastic: 0.08,
        dragMomentum: false,
        dragSnapToOrigin: true,
        dragTransition: { bounceStiffness: 600, bounceDamping: 40 },
        onDragEnd: (_: unknown, info: PanInfo) =>
          void handleVariantDrag(message.id, info.offset.x),
      }
    : {};

  const shouldAnimate = !isPlaceholder;
  const shouldUseLayout = false; 

  return (
    <div
      className={`relative flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <motion.div
        layout={shouldUseLayout}
        initial={shouldAnimate ? { opacity: 0, y: 4 } : false}
        animate={shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
        transition={shouldAnimate ? { 
          type: "tween", 
          duration: 0.2, 
          ease: [0.25, 0.46, 0.45, 0.94] 
        } : { duration: 0 }}
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition-colors duration-150 ${
          message.role === "user"
            ? `ml-auto bg-gradient-to-br from-emerald-500/60 to-emerald-400/40 text-white ${
                heldMessageId === message.id ? "ring-2 ring-white/60" : ""
              }`
            : `bg-white/5 text-gray-100 ${
                heldMessageId === message.id ? "border border-white/30" : "border border-transparent"
              }`
        }`}
        {...eventHandlers}
        {...dragProps}
        whileDrag={enableSwipe ? { scale: 0.98 } : undefined}
        style={{ 
          willChange: enableSwipe ? 'transform' : 'auto',
          transform: 'translate3d(0,0,0)', 
        }}
      >
        {showTypingIndicator ? (
          <TypingIndicator />
        ) : (
          <MarkdownRenderer content={message.content} className="text-inherit" />
        )}

        {isAssistant && totalVariants > 1 && (
          <motion.div 
            className="mt-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 pr-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.15 }}
          >
            <span>
              Variant {selectedVariantIndex >= 0 ? selectedVariantIndex + 1 : 1}
              {totalVariants > 0 ? ` / ${totalVariants}` : ""}
            </span>
            {regeneratingMessageId === message.id && (
              <motion.span 
                className="flex items-center gap-1 text-emerald-200"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                Regenerating
              </motion.span>
            )}
          </motion.div>
        )}
      </motion.div>

      {isLatestAssistant && (
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
            onClick={() => void handleRegenerate(message)}
            disabled={regeneratingMessageId === message.id || sending}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all duration-150 hover:border-white/40 hover:bg-white/20 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            aria-label="Regenerate response"
            style={{ willChange: 'transform' }}
          >
            {regeneratingMessageId === message.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </motion.div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1" aria-label="Assistant is typing" aria-live="polite">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-2 w-2 rounded-full bg-gray-300"
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.9, 1.1, 0.9] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            repeatType: "loop",
            delay: index * 0.2,
          }}
        />
      ))}
    </div>
  );
}
