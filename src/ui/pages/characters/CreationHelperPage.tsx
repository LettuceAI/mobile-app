import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Check,
  PenLine,
  RefreshCw,
  Image as ImageIcon,
  Eye,
} from "lucide-react";
import { TopNav } from "../../components/App";
import { cn, typography, animations, radius, shadows } from "../../design-tokens";
import { BottomMenu, MenuButton, MenuSection } from "../../components";
import { MarkdownRenderer } from "../chats/components/MarkdownRenderer";
import { CharacterPreviewCard } from "./components";
import { CreationHelperFooter } from "./components/CreationHelperFooter";
import { ReferenceSelector, ReferenceAvatar, Reference } from "./components/ReferenceSelector";
import { listCharacters, listPersonas } from "../../../core/storage/repo";

interface CreationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  createdAt: number;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  toolCallId: string;
  result: Record<string, unknown>;
  success: boolean;
}

interface DraftCharacter {
  name: string | null;
  definition?: string | null;
  description: string | null;
  scenes: DraftScene[];
  defaultSceneId: string | null;
  avatarPath: string | null;
  backgroundImagePath: string | null;
  disableAvatarGradient: boolean;
  defaultModelId: string | null;
  promptTemplateId: string | null;
}

interface DraftScene {
  id: string;
  content: string;
  direction: string | null;
}

interface CreationSession {
  id: string;
  messages: CreationMessage[];
  draft: DraftCharacter;
  draftHistory: DraftCharacter[];
  status: "active" | "previewShown" | "completed" | "cancelled";
  createdAt: number;
  updatedAt: number;
}

interface ImageAttachment {
  id: string;
  data: string;
  mimeType: string;
  filename?: string;
}

interface UploadedImage {
  id: string;
  data: string;
  mimeType: string;
}

// Component to fetch and display uploaded image thumbnail
function ImageThumbnail({
  sessionId,
  imageId,
  filename,
  localCache,
}: {
  sessionId: string;
  imageId: string;
  filename: string;
  localCache?: Record<string, string>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(localCache?.[imageId] || null);
  const [loading, setLoading] = useState(!localCache?.[imageId]);

  useEffect(() => {
    if (localCache?.[imageId]) {
      setImageUrl(localCache[imageId]);
      setLoading(false);
      return;
    }

    let active = true;
    const fetchImage = async () => {
      try {
        const img = await invoke<UploadedImage | null>("creation_helper_get_uploaded_image", {
          sessionId,
          imageId,
        });
        if (active && img) {
          setImageUrl(img.data);
        }
      } catch (err) {
        console.error("Failed to load image thumbnail:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchImage();
    return () => {
      active = false;
    };
  }, [sessionId, imageId, localCache?.[imageId]]);

  if (loading) return <div className="h-20 w-20 animate-pulse bg-white/10 rounded-md" />;
  if (!imageUrl)
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-200">
        <ImageIcon className="h-3 w-3" />
        <span>Failed to load</span>
      </div>
    );

  return (
    <div className="group relative h-24 w-24 overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <img
        src={imageUrl.startsWith("data:") ? imageUrl : `data:image/png;base64,${imageUrl}`}
        alt={filename}
        className="h-full w-full object-cover transition-transform group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
        <span className="text-[10px] text-white truncate w-full">{filename}</span>
      </div>
    </div>
  );
}

export function CreationHelperPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<CreationSession | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ImageAttachment[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [messageReferences, setMessageReferences] = useState<Record<string, Reference[]>>({});
  const [messageDisplayContent, setMessageDisplayContent] = useState<Record<string, string>>({});
  const [showReferenceSelector, setShowReferenceSelector] = useState(false);
  const [referenceSelectorType, setReferenceSelectorType] = useState<"character" | "persona">(
    "character",
  );
  // Entity avatar lookup: maps entityId -> avatarPath
  const [entityAvatars, setEntityAvatars] = useState<Record<string, string>>({});
  // Local image cache for optimistic/instant display: maps imageId -> base64 data
  const [localImageCache, setLocalImageCache] = useState<Record<string, string>>({});
  const [selectedTool, setSelectedTool] = useState<{
    call: ToolCall;
    result: ToolResult;
  } | null>(null);
  const [showToolDetail, setShowToolDetail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load entity avatars for reference lookup
  useEffect(() => {
    const loadEntityAvatars = async () => {
      try {
        const [characters, personas] = await Promise.all([listCharacters(), listPersonas()]);
        const lookup: Record<string, string> = {};
        characters.forEach((c) => {
          if (c.avatarPath) lookup[c.id] = c.avatarPath;
        });
        personas.forEach((p) => {
          if (p.avatarPath) lookup[p.id] = p.avatarPath;
        });
        setEntityAvatars(lookup);
      } catch (err) {
        console.error("Failed to load entity avatars:", err);
      }
    };
    loadEntityAvatars();
  }, []);

  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      try {
        const newSession = await invoke<CreationSession>("creation_helper_start");
        setSession(newSession);

        // Send initial greeting
        const greetingSession = await invoke<CreationSession>("creation_helper_send_message", {
          sessionId: newSession.id,
          message: "Hi! I want to create a new character.",
          uploadedImages: null,
        });
        setSession(greetingSession);
      } catch (err) {
        console.error("Failed to start creation helper:", err);
        setError("Failed to start the creation helper. Please try again.");
      }
    };

    initSession();
  }, []);

  // Listen for updates from backend
  useEffect(() => {
    const unlisten = listen("creation-helper-update", (event) => {
      const payload = event.payload as { sessionId: string; draft: DraftCharacter; status: string };
      if (session && payload.sessionId === session.id) {
        setSession((prev) =>
          prev
            ? { ...prev, draft: payload.draft, status: payload.status as CreationSession["status"] }
            : null,
        );

        // Check if we should show preview
        if (payload.status === "previewShown") {
          setShowPreview(true);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [session?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages]);

  const handleSend = useCallback(async () => {
    if (!session || !inputValue.trim() || sending) return;

    // Build message with references
    let message = inputValue.trim();

    if (references.length > 0) {
      const referenceText = references
        .map((ref) => {
          // Include ID in format: [Referenced Character: "Name" (id:abc-123)]
          if (ref.type === "character") {
            return `[Referenced Character: "${ref.name}" (id:${ref.id})]\n${ref.description || "No definition available."}`;
          } else {
            return `[Referenced Persona: "${ref.name}" (id:${ref.id})]\n${ref.description || "No description available."}`;
          }
        })
        .join("\n\n");

      message = `${message}\n\n---\n${referenceText}`;
    }

    // Append pending attachments info
    if (pendingAttachments.length > 0) {
      const attachmentText = pendingAttachments
        .map((att) => `[Uploaded Image: "${att.filename || "image.png"}" (id:${att.id})]`)
        .join("\n");

      message = `${message}\n\n---\n${attachmentText}`;
    }

    const optimisticId = crypto.randomUUID();
    const displayContent = inputValue.trim();

    // Store references for this message
    if (references.length > 0) {
      setMessageReferences((prev) => ({
        ...prev,
        [optimisticId]: [...references],
      }));
    }

    // Store the display content (without reference text) for this message
    setMessageDisplayContent((prev) => ({
      ...prev,
      [optimisticId]: displayContent,
    }));

    // Optimistic UI update (show original message without reference details)
    const userMsg: CreationMessage = {
      id: optimisticId,
      role: "user",
      content: message,
      toolCalls: [],
      toolResults: [],
      createdAt: Date.now(),
    };

    setSession((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, userMsg],
          }
        : null,
    );

    setSending(true);
    setError(null);

    // Prepare images for upload
    const imagesToUpload =
      pendingAttachments.length > 0
        ? pendingAttachments.map((att) => ({
            id: att.id,
            data: att.data,
            mimeType: att.mimeType,
          }))
        : null;

    // Clear inputs immediately for better UX
    setInputValue("");
    setReferences([]);
    setPendingAttachments([]);

    try {
      const updatedSession = await invoke<CreationSession>("creation_helper_send_message", {
        sessionId: session.id,
        message,
        uploadedImages: imagesToUpload,
      });

      setSession(updatedSession);

      // Check for tool actions that trigger UI
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 1];
      if (lastMessage?.toolResults) {
        for (const result of lastMessage.toolResults) {
          const resObj = result.result as any;
          if (resObj && typeof resObj === "object") {
            const action = resObj.action;
            if (action === "show_preview" || action === "request_confirmation") {
              setShowPreview(true);
              if (action === "request_confirmation") {
                setShowConfirmation(true);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to send message:", err);
      // Display actual error message from backend
      const errorMsg =
        typeof err === "string" ? err : err.message || "Failed to send message. Please try again.";
      setError(errorMsg);

      // Remove optimistic message on failure
      setSession((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== optimisticId),
            }
          : null,
      );

      // Restore inputs so user can retry
      setInputValue(inputValue);
      setReferences(references);
      setPendingAttachments(pendingAttachments);
    } finally {
      setSending(false);
    }
  }, [session, inputValue, sending, references, pendingAttachments]);

  const handleRegenerate = useCallback(async () => {
    if (!session || sending) return;

    // Find last assistant message
    const assistantMessages = session.messages.filter((m) => m.role === "assistant");
    const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];

    if (!lastAssistantMsg) return;

    // Optimistic Update: Remove message and revert draft state
    setSession((prev) => {
      if (!prev) return null;
      const nextDraftHistory = [...prev.draftHistory];
      const revertedDraft = nextDraftHistory.pop() || prev.draft;

      return {
        ...prev,
        messages: prev.messages.filter((m) => m.id !== lastAssistantMsg.id),
        draft: revertedDraft,
        draftHistory: nextDraftHistory,
      };
    });

    setSending(true);
    setError(null);

    try {
      const updatedSession = await invoke<CreationSession>("creation_helper_regenerate", {
        sessionId: session.id,
      });

      setSession(updatedSession);

      // Check for tool actions that trigger UI
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 1];
      if (lastMessage?.toolResults) {
        for (const result of lastMessage.toolResults) {
          const resObj = result.result as any;
          if (resObj && typeof resObj === "object") {
            const action = resObj.action;
            if (action === "show_preview" || action === "request_confirmation") {
              setShowPreview(true);
              if (action === "request_confirmation") {
                setShowConfirmation(true);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to regenerate:", err);
      const errorMsg =
        typeof err === "string" ? err : err.message || "Failed to regenerate. Please try again.";
      setError(errorMsg);
    } finally {
      setSending(false);
    }
  }, [session, sending]);

  const handleUseCharacter = useCallback(async () => {
    if (!session) return;

    try {
      const draft = await invoke<DraftCharacter>("creation_helper_complete", {
        sessionId: session.id,
      });

      // Navigate to create character page with pre-filled data
      navigate("/create/character", {
        state: { draftCharacter: draft },
      });
    } catch (err: any) {
      console.error("Failed to complete character:", err);
      setError(typeof err === "string" ? err : "Failed to save character.");
    }
  }, [session, navigate]);

  const handleEditManually = useCallback(() => {
    if (!session?.draft) return;
    navigate("/create/character", {
      state: { draftCharacter: session.draft },
    });
  }, [session, navigate]);

  const handleAbort = useCallback(() => {
    if (!session) return;
    invoke("creation_helper_cancel", { sessionId: session.id })
      .then(() => {
        setSending(false);
        setError("Generation stopped.");
      })
      .catch(console.error);
  }, [session]);

  const handleBack = () => {
    if (session) {
      invoke("creation_helper_cancel", { sessionId: session.id }).catch(console.error);
    }
    navigate(-1);
  };

  // Tool display helpers
  const getToolDisplayName = (toolName: string): string => {
    const names: Record<string, string> = {
      set_character_name: "Set name",
      set_character_definition: "Set definition",
      set_character_description: "Set definition",
      add_scene: "Add scene",
      update_scene: "Update scene",
      toggle_avatar_gradient: "Toggle gradient",
      set_default_model: "Set model",
      set_system_prompt: "Set prompt",
      use_uploaded_image_as_avatar: "Set avatar",
      use_uploaded_image_as_chat_background: "Set background",
      show_preview: "Show preview",
      request_confirmation: "Ready to save",
    };
    return names[toolName] || toolName;
  };

  // Thinking indicator component
  const ThinkingIndicator = () => (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-start mb-6"
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          radius.lg,
          "bg-white/5 border border-white/10 backdrop-blur-sm shadow-lg",
          shadows.md,
        )}
      >
        <div className="relative">
          <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
          <div className="absolute inset-0 blur-sm bg-emerald-400/20 animate-pulse rounded-full" />
        </div>
        <span className="text-sm font-medium text-white/50 tracking-wide">Thinking...</span>
      </div>
    </motion.div>
  );

  return (
    <div className="flex h-screen flex-col bg-[#050505]">
      <TopNav
        currentPath="/create/character/helper"
        onBackOverride={handleBack}
        titleOverride="AI Character Creator"
        rightAction={
          <button
            onClick={() => setShowPreview(true)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all",
              "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10",
              "active:scale-95",
            )}
          >
            <Eye className="h-4 w-4" />
            <span className="text-xs font-medium">Preview</span>
          </button>
        }
      />

      {/* Messages Container */}
      <main className="flex-1 overflow-y-auto px-4 pt-[calc(72px+env(safe-area-inset-top))] pb-32">
        <div className="mx-auto max-w-2xl space-y-4 py-4">
          {/* Welcome Message */}
          {!session?.messages.length && (
            <motion.div
              {...animations.fadeIn}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-rose-500/20 to-amber-500/20 border border-rose-400/30">
                <Sparkles className="h-8 w-8 text-rose-300" />
              </div>
              <h2 className={cn(typography.h2.size, typography.h2.weight, "text-white mb-2")}>
                AI Character Creator
              </h2>
              <p className="text-white/60 text-sm max-w-xs">
                I'll help you create a character through conversation. Just tell me what you have in
                mind!
              </p>
              <div className="mt-4 flex items-center gap-1">
                <Loader2 className="h-4 w-4 text-white/40 animate-spin" />
                <span className="text-xs text-white/40">Starting...</span>
              </div>
            </motion.div>
          )}

          {/* Messages */}
          <AnimatePresence mode="popLayout">
            {session?.messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-white/10 text-white"
                      : "bg-white/5 border border-white/10 text-white/90",
                  )}
                >
                  {/* Message Content */}
                  {(() => {
                    // Strip reference/attachment text if present (text after "---\n")
                    let displayText = message.content;

                    // Check for stored display content first
                    if (messageDisplayContent[message.id]) {
                      displayText = messageDisplayContent[message.id];
                    } else {
                      // Strip reference/attachment section if present
                      const separator = "\n\n---\n";
                      const sepIndex = displayText.indexOf(separator);
                      if (sepIndex !== -1) {
                        displayText = displayText.substring(0, sepIndex).trim();
                      }
                    }

                    return displayText.trim() ? (
                      <MarkdownRenderer
                        content={displayText}
                        className={cn(
                          "text-sm leading-relaxed",
                          message.role === "user" ? "text-white" : "text-white/90",
                        )}
                      />
                    ) : null;
                  })()}

                  {/* References & Attachments Display */}
                  {(() => {
                    // 1. References
                    let refs = messageReferences[message.id];
                    if (!refs || refs.length === 0) {
                      // Parse reference names and IDs from content as fallback
                      const refPattern =
                        /\[Referenced (Character|Persona): "([^"]+)" \(id:([^)]+)\)\]/g;
                      const matches = [...message.content.matchAll(refPattern)];
                      if (matches.length > 0) {
                        refs = matches.map((match) => ({
                          type: match[1].toLowerCase() as "character" | "persona",
                          id: match[3],
                          name: match[2],
                        }));
                      }
                    }

                    // 2. Uploaded Images
                    const imgPattern = /\[Uploaded Image: "([^"]+)" \(id:([^)]+)\)\]/g;
                    const imgMatches = [...message.content.matchAll(imgPattern)];
                    const images = imgMatches.map((match) => ({
                      filename: match[1],
                      id: match[2],
                    }));

                    if ((!refs || refs.length === 0) && images.length === 0) return null;

                    return (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {/* References */}
                        {refs?.map((ref) => (
                          <div
                            key={ref.id}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1",
                              "rounded-full text-xs",
                              ref.type === "character"
                                ? "bg-purple-500/20 text-purple-200"
                                : "bg-amber-500/20 text-amber-200",
                            )}
                          >
                            <ReferenceAvatar
                              type={ref.type}
                              id={ref.id}
                              avatarPath={ref.avatarPath || entityAvatars[ref.id]}
                              name={ref.name}
                              size="sm"
                            />
                            <span>{ref.name}</span>
                          </div>
                        ))}

                        {/* Images */}
                        {images.map((img) => (
                          <ImageThumbnail
                            key={img.id}
                            sessionId={session.id}
                            imageId={img.id}
                            filename={img.filename}
                            localCache={localImageCache}
                          />
                        ))}
                      </div>
                    );
                  })()}

                  {/* Tool Calls Display */}
                  {message.toolResults && message.toolResults.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                      {message.toolResults.map((result) => {
                        // Find matching tool call by ID
                        const toolCall = message.toolCalls.find(
                          (tc) => tc.id === result.toolCallId,
                        );
                        return (
                          <button
                            key={result.toolCallId}
                            onClick={() => {
                              if (toolCall) {
                                setSelectedTool({ call: toolCall, result });
                                setShowToolDetail(true);
                              }
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 transition-all text-left group",
                              result.success
                                ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                : "bg-red-500/10 text-red-300 hover:bg-red-500/20",
                            )}
                          >
                            {result.success ? (
                              <Check className="h-3 w-3 shrink-0" />
                            ) : (
                              <span className="h-3 w-3 shrink-0">✗</span>
                            )}
                            <span className="truncate flex-1">
                              {getToolDisplayName(toolCall?.name || "Unknown Tool")}
                            </span>
                            <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                              View Details
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Regeneration Button */}
          {session &&
            !sending &&
            session.messages.length > 0 &&
            session.messages[session.messages.length - 1].role === "assistant" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-center mb-6"
              >
                <button
                  onClick={handleRegenerate}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2",
                    "bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors",
                    radius.full,
                    typography.bodySmall.size,
                  )}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Regenerate Response</span>
                </button>
              </motion.div>
            )}

          {/* Thinking Indicator */}
          {sending && <ThinkingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Footer Input Area */}
      <div className="fixed bottom-0 left-0 right-0 pb-[env(safe-area-inset-bottom)]">
        <CreationHelperFooter
          draft={inputValue}
          setDraft={setInputValue}
          error={error}
          sending={sending}
          onSendMessage={handleSend}
          onAbort={handleAbort}
          pendingAttachments={pendingAttachments}
          onAddAttachment={(attachment) => {
            setPendingAttachments((prev) => [...prev, attachment]);
            setLocalImageCache((prev) => ({ ...prev, [attachment.id]: attachment.data }));
          }}
          onRemoveAttachment={(id) => {
            setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
          }}
          references={references}
          onRemoveReference={(id) => {
            setReferences((prev) => prev.filter((r) => r.id !== id));
          }}
          onOpenReferenceSelector={(type) => {
            setReferenceSelectorType(type);
            setShowReferenceSelector(true);
          }}
        />
      </div>

      {/* Reference Selector */}
      <ReferenceSelector
        isOpen={showReferenceSelector}
        onClose={() => setShowReferenceSelector(false)}
        type={referenceSelectorType}
        onSelect={(ref) => {
          setReferences((prev) => [...prev, ref]);
        }}
        existingRefs={references}
      />

      {/* Preview Bottom Sheet */}
      <BottomMenu
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          setShowConfirmation(false);
        }}
        title={showConfirmation ? "Ready to Save?" : "Character Preview"}
      >
        {session?.draft && (
          <div className="space-y-4">
            <CharacterPreviewCard draft={session.draft} sessionId={session.id} />

            <MenuSection>
              <MenuButton
                icon={Check}
                title="Use This Character"
                description="Save and start chatting"
                color="from-emerald-500 to-teal-600"
                onClick={handleUseCharacter}
              />
              <MenuButton
                icon={RefreshCw}
                title="Keep Editing"
                description="Continue the conversation"
                color="from-blue-500 to-cyan-600"
                onClick={() => {
                  setShowPreview(false);
                  setShowConfirmation(false);
                }}
              />
              <MenuButton
                icon={PenLine}
                title="Edit Manually"
                description="Fine-tune in the editor"
                color="from-amber-500 to-orange-600"
                onClick={handleEditManually}
              />
            </MenuSection>
          </div>
        )}
      </BottomMenu>

      {/* Tool Detail Bottom Sheet */}
      <BottomMenu
        isOpen={showToolDetail}
        onClose={() => setShowToolDetail(false)}
        title={selectedTool ? getToolDisplayName(selectedTool.call.name) : "Tool Usage Details"}
      >
        {selectedTool && (
          <div className="space-y-6 pb-6">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  selectedTool.result.success
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400",
                )}
              >
                {selectedTool.result.success ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span className="text-lg font-bold">✗</span>
                )}
              </div>
              <div>
                <h3
                  className={cn(typography.h2.size, typography.h2.weight, "text-white text-base")}
                >
                  {selectedTool.result.success ? "Execution Successful" : "Execution Failed"}
                </h3>
                <p className="text-white/40 text-[10px] uppercase tracking-wider font-bold">
                  Tool: {selectedTool.call.name}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-wider px-1">
                  Model Input (Arguments)
                </h4>
                <div className="bg-black/40 rounded-xl p-3 border border-white/5 overflow-x-auto">
                  <pre className="text-xs text-blue-200 font-mono leading-relaxed">
                    {JSON.stringify(selectedTool.call.arguments, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-wider px-1">
                  Tool Output (Result)
                </h4>
                <div className="bg-black/40 rounded-xl p-3 border border-white/5 overflow-x-auto">
                  <pre
                    className={cn(
                      "text-xs font-mono leading-relaxed",
                      selectedTool.result.success ? "text-emerald-200" : "text-red-200",
                    )}
                  >
                    {JSON.stringify(selectedTool.result.result, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </BottomMenu>
    </div>
  );
}
