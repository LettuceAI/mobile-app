import {
  CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import type {
  AccessibilitySettings,
  Character,
  Model,
  StoredMessage,
} from "../../../core/storage/schemas";
import { createDefaultAccessibilitySettings } from "../../../core/storage/schemas";
import {
  abortAudioPreview,
  generateTtsForMessage,
  isDeviceTtsSpeaking,
  listAudioModels,
  listAudioProviders,
  listUserVoices,
  playAudioFromBase64,
  speakDeviceTts,
  stopDeviceTts,
  type AudioModel,
  type AudioProvider,
  type AudioProviderType,
  type TtsPreviewResponse,
  type UserVoice,
} from "../../../core/storage/audioProviders";
import { useImageData } from "../../hooks/useImageData";
import {
  isImageLight,
  getThemeForBackground,
  type ThemeColors,
} from "../../../core/utils/imageAnalysis";
import {
  generateUserReply,
  getSessionMeta,
  listCharacters,
  readSettings,
  SETTINGS_UPDATED_EVENT,
  SESSION_UPDATED_EVENT,
} from "../../../core/storage";
import { playAccessibilitySound } from "../../../core/utils/accessibilityAudio";

import { useChatController } from "./hooks/useChatController";
import { replacePlaceholders } from "../../../core/utils/placeholders";
import {
  ChatHeader,
  ChatFooter,
  ChatMessage,
  MessageActionsBottomSheet,
  LoadingSpinner,
  EmptyState,
} from "./components";
import { BottomMenu, MenuButton } from "../../components";
import { useAvatar } from "../../hooks/useAvatar";
import { Image, RefreshCw, Sparkles, Check, PenLine } from "lucide-react";
import { radius, cn } from "../../design-tokens";

const LONG_PRESS_DELAY = 450;
const SCROLL_THRESHOLD = 10; // pixels of movement to cancel long press
const AUTOLOAD_TOP_THRESHOLD_PX = 120;
const STICKY_BOTTOM_THRESHOLD_PX = 80;
const MAX_AUDIO_CACHE_ENTRIES = 50;

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
  const pendingScrollAdjustRef = useRef<{ prevScrollTop: number; prevScrollHeight: number } | null>(
    null,
  );
  const loadingOlderRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const [showCharacterSelector, setShowCharacterSelector] = useState(false);
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);
  const [messageToBranch, setMessageToBranch] = useState<StoredMessage | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ src: string; alt: string } | null>(null);
  const [supportsImageInput, setSupportsImageInput] = useState(false);
  const audioCacheRef = useRef<{
    providers: AudioProvider[] | null;
    userVoices: UserVoice[] | null;
    modelsByProviderType: Map<AudioProviderType, AudioModel[]>;
  }>({
    providers: null,
    userVoices: null,
    modelsByProviderType: new Map(),
  });
  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>(
    createDefaultAccessibilitySettings(),
  );
  const audioPreviewCacheRef = useRef<Map<string, TtsPreviewResponse>>(new Map());
  const [audioStatusByMessage, setAudioStatusByMessage] = useState<
    Record<string, "loading" | "playing">
  >({});
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const audioPlayingMessageIdRef = useRef<string | null>(null);
  const deviceTtsMessageIdRef = useRef<string | null>(null);
  const deviceTtsPollRef = useRef<number | null>(null);
  const deviceTtsRequestRef = useRef<{ requestId: string; messageId: string } | null>(null);
  const audioRequestRef = useRef<{ requestId: string; messageId: string } | null>(null);
  const cancelledAudioRequestsRef = useRef<Set<string>>(new Set());
  const abortRequestedRef = useRef(false);
  const abortSoundRef = useRef(false);
  const wasGeneratingRef = useRef(false);
  const autoPlaySignatureRef = useRef<string | null>(null);
  const autoPlayInFlightRef = useRef(false);
  const sendStartSignatureRef = useRef<string | null>(null);
  const sendingPrevRef = useRef(false);
  const previousChatKeyRef = useRef<string | null>(null);

  // Help Me Reply states
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showChoiceMenu, setShowChoiceMenu] = useState(false);
  const [showResultMenu, setShowResultMenu] = useState(false);
  const [generatedReply, setGeneratedReply] = useState<string | null>(null);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [helpMeReplyError, setHelpMeReplyError] = useState<string | null>(null);
  const [shouldTriggerFileInput, setShouldTriggerFileInput] = useState(false);

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
    let mounted = true;
    const loadAccessibilitySettings = async () => {
      try {
        const settings = await readSettings();
        const next =
          settings.advancedSettings?.accessibility ?? createDefaultAccessibilitySettings();
        if (mounted) {
          setAccessibilitySettings(next);
        }
      } catch (error) {
        console.error("Failed to load accessibility settings:", error);
      }
    };

    void loadAccessibilitySettings();
    const listener = () => {
      void loadAccessibilitySettings();
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, listener);
    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdate);
    return () => {
      mounted = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, listener);
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdate);
    };
  }, [handleSessionUpdate]);



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
    streamingReasoning,
  } = chatController;

  const isGenerating = sending || regeneratingMessageId !== null;
  const lastMessageContentLength = messages[messages.length - 1]?.content.length ?? 0;

  const backgroundImageData = useImageData(character?.backgroundImagePath);
  const [theme, setTheme] = useState<ThemeColors>(getThemeForBackground(false));

  useEffect(() => {
    const checkModelCapabilities = async () => {
      if (!character) {
        setSupportsImageInput(false);
        return;
      }
      try {
        const settings = await readSettings();
        const effectiveModelId = character.defaultModelId || settings.defaultModelId;
        const currentModel = settings.models.find((m: Model) => m.id === effectiveModelId);
        const hasImageScope = currentModel?.inputScopes?.includes("image") ?? false;
        setSupportsImageInput(hasImageScope);
      } catch (err) {
        console.error("Failed to check model capabilities:", err);
        setSupportsImageInput(false);
      }
    };
    checkModelCapabilities();
  }, [character]);

  useEffect(() => {
    if (character) {
      console.log("[Chat] Character backgroundImagePath:", character.backgroundImagePath || "none");
      console.log(
        "[Chat] Background image data loaded:",
        backgroundImageData ? "present" : "loading/failed",
      );
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

  const ensureAudioProviders = useCallback(async () => {
    if (audioCacheRef.current.providers) {
      return audioCacheRef.current.providers;
    }
    const providers = await listAudioProviders();
    audioCacheRef.current.providers = providers;
    return providers;
  }, []);

  const ensureUserVoices = useCallback(async () => {
    if (audioCacheRef.current.userVoices) {
      return audioCacheRef.current.userVoices;
    }
    const voices = await listUserVoices();
    audioCacheRef.current.userVoices = voices;
    return voices;
  }, []);

  const ensureAudioModels = useCallback(async (providerType: AudioProviderType) => {
    const cached = audioCacheRef.current.modelsByProviderType.get(providerType);
    if (cached) {
      return cached;
    }
    const models = await listAudioModels(providerType);
    audioCacheRef.current.modelsByProviderType.set(providerType, models);
    return models;
  }, []);

  const setAudioStatus = useCallback((messageId: string, status: "loading" | "playing" | null) => {
    setAudioStatusByMessage((prev) => {
      if (status === null) {
        if (!(messageId in prev)) return prev;
        const next = { ...prev };
        delete next[messageId];
        return next;
      }
      if (prev[messageId] === status) return prev;
      return { ...prev, [messageId]: status };
    });
  }, []);

  const clearDeviceTtsState = useCallback(() => {
    if (deviceTtsPollRef.current !== null) {
      window.clearInterval(deviceTtsPollRef.current);
      deviceTtsPollRef.current = null;
    }
    const messageId = deviceTtsMessageIdRef.current;
    deviceTtsMessageIdRef.current = null;
    if (messageId) {
      setAudioStatus(messageId, null);
    }
  }, [setAudioStatus]);

  const cancelDeviceTtsRequest = useCallback(
    async (messageId?: string) => {
      const pending = deviceTtsRequestRef.current;
      if (!pending || (messageId && pending.messageId !== messageId)) {
        return;
      }
      deviceTtsRequestRef.current = null;
      setAudioStatus(pending.messageId, null);
      try {
        await stopDeviceTts();
      } catch (error) {
        console.warn("Failed to stop device TTS:", error);
      }
    },
    [setAudioStatus],
  );

  const startDeviceTtsMonitor = useCallback(
    (messageId: string) => {
      if (deviceTtsPollRef.current !== null) {
        window.clearInterval(deviceTtsPollRef.current);
      }
      const poll = async () => {
        try {
          const speaking = await isDeviceTtsSpeaking();
          if (!speaking) {
            clearDeviceTtsState();
            return;
          }
          setAudioStatus(messageId, "playing");
        } catch (error) {
          console.warn("Failed to poll device TTS status:", error);
          clearDeviceTtsState();
        }
      };
      deviceTtsPollRef.current = window.setInterval(() => {
        void poll();
      }, 500);
      void poll();
    },
    [clearDeviceTtsState, setAudioStatus],
  );

  const stopDeviceTtsPlayback = useCallback(async () => {
    const pending = deviceTtsRequestRef.current;
    deviceTtsRequestRef.current = null;
    if (pending) {
      setAudioStatus(pending.messageId, null);
    }
    try {
      await stopDeviceTts();
    } catch (error) {
      console.warn("Failed to stop device TTS:", error);
    }
    clearDeviceTtsState();
  }, [clearDeviceTtsState, setAudioStatus]);

  const playDeviceTts = useCallback(
    async (messageId: string, text: string, voiceId?: string) => {
      const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      deviceTtsRequestRef.current = { requestId, messageId };
      setAudioStatus(messageId, "loading");
      try {
        await speakDeviceTts({ text, voiceId });
      } catch (error) {
        if (deviceTtsRequestRef.current?.requestId === requestId) {
          deviceTtsRequestRef.current = null;
        }
        setAudioStatus(messageId, null);
        throw error;
      }
      if (deviceTtsRequestRef.current?.requestId !== requestId) {
        return;
      }
      deviceTtsRequestRef.current = null;
      deviceTtsMessageIdRef.current = messageId;
      setAudioStatus(messageId, "playing");
      startDeviceTtsMonitor(messageId);
    },
    [setAudioStatus, startDeviceTtsMonitor],
  );

  const buildAudioCacheKey = useCallback(
    (params: {
      providerId: string;
      modelId: string;
      voiceId: string;
      text: string;
      prompt?: string | null;
    }) => {
      const promptKey = params.prompt?.trim() ?? "";
      return [params.providerId, params.modelId, params.voiceId, promptKey, params.text].join("::");
    },
    [],
  );

  const cacheAudioPreview = useCallback((key: string, response: TtsPreviewResponse) => {
    const cache = audioPreviewCacheRef.current;
    cache.set(key, response);
    if (cache.size <= MAX_AUDIO_CACHE_ENTRIES) return;
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }, []);

  const startAudioPlayback = useCallback(
    (messageId: string, response: TtsPreviewResponse) => {
      setAudioStatus(messageId, "playing");
      const audio = playAudioFromBase64(response.audioBase64, response.format);
      audioPlaybackRef.current = audio;
      audioPlayingMessageIdRef.current = messageId;
      audio.onended = () => {
        if (audioPlaybackRef.current === audio) {
          audioPlaybackRef.current = null;
          audioPlayingMessageIdRef.current = null;
          setAudioStatus(messageId, null);
        }
      };
      audio.onerror = () => {
        if (audioPlaybackRef.current === audio) {
          audioPlaybackRef.current = null;
          audioPlayingMessageIdRef.current = null;
          setAudioStatus(messageId, null);
        }
      };
    },
    [setAudioStatus],
  );

  const stopAudioPlayback = useCallback(() => {
    const audio = audioPlaybackRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.onerror = null;
    }
    audioPlaybackRef.current = null;
    const messageId = audioPlayingMessageIdRef.current;
    if (messageId) {
      audioPlayingMessageIdRef.current = null;
      setAudioStatus(messageId, null);
    }
    void stopDeviceTtsPlayback();
  }, [setAudioStatus, stopDeviceTtsPlayback]);

  const cancelAudioGeneration = useCallback(async () => {
    const pending = audioRequestRef.current;
    if (!pending) return;
    audioRequestRef.current = null;
    cancelledAudioRequestsRef.current.add(pending.requestId);
    setAudioStatus(pending.messageId, null);
    try {
      await abortAudioPreview(pending.requestId);
    } catch (error) {
      console.warn("Failed to cancel audio preview:", error);
    }
  }, [setAudioStatus]);

  const handleStopAudio = useCallback(
    (message: StoredMessage) => {
      if (audioPlayingMessageIdRef.current && audioPlayingMessageIdRef.current !== message.id) {
        return;
      }
      if (deviceTtsMessageIdRef.current && deviceTtsMessageIdRef.current !== message.id) {
        return;
      }
      stopAudioPlayback();
    },
    [stopAudioPlayback],
  );

  const handleCancelAudio = useCallback(
    (message: StoredMessage) => {
      if (audioRequestRef.current && audioRequestRef.current.messageId !== message.id) {
        return;
      }
      if (deviceTtsRequestRef.current && deviceTtsRequestRef.current.messageId === message.id) {
        void cancelDeviceTtsRequest(message.id);
        return;
      }
      void cancelAudioGeneration();
    },
    [cancelAudioGeneration, cancelDeviceTtsRequest],
  );

  useEffect(() => {
    const chatKey = `${characterId ?? ""}:${sessionId ?? ""}`;
    const previousKey = previousChatKeyRef.current;
    if (previousKey && previousKey !== chatKey) {
      stopAudioPlayback();
      void cancelAudioGeneration();
    }
    previousChatKeyRef.current = chatKey;
  }, [cancelAudioGeneration, characterId, sessionId, stopAudioPlayback]);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
      void cancelAudioGeneration();
    };
  }, [cancelAudioGeneration, stopAudioPlayback]);

  const handlePlayMessageAudio = useCallback(
    async (message: StoredMessage, text: string) => {
      if (message.id.startsWith("placeholder")) return;
      if (message.role !== "assistant" && message.role !== "scene") return;
      if (!character?.voiceConfig) return;

      const trimmedText = text.trim();
      if (!trimmedText) return;

      if (audioRequestRef.current?.messageId === message.id) {
        await cancelAudioGeneration();
        return;
      }
      if (audioPlayingMessageIdRef.current === message.id) {
        stopAudioPlayback();
        return;
      }
      if (deviceTtsMessageIdRef.current === message.id) {
        await stopDeviceTtsPlayback();
        return;
      }

      if (audioRequestRef.current) {
        await cancelAudioGeneration();
      }
      if (audioPlaybackRef.current) {
        stopAudioPlayback();
      }
      if (deviceTtsMessageIdRef.current || deviceTtsRequestRef.current) {
        await stopDeviceTtsPlayback();
      }

      const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      audioRequestRef.current = { requestId, messageId: message.id };
      setAudioStatus(message.id, "loading");

      let providers: AudioProvider[];
      try {
        providers = await ensureAudioProviders();
      } catch (error) {
        if (audioRequestRef.current?.requestId === requestId) {
          audioRequestRef.current = null;
        }
        setAudioStatus(message.id, null);
        const messageText = error instanceof Error ? error.message : String(error);
        const isAbort =
          messageText.toLowerCase().includes("aborted") ||
          messageText.toLowerCase().includes("cancel");
        if (isAbort) return;
        throw error;
      }

      if (character.voiceConfig.source === "user" && character.voiceConfig.userVoiceId) {
        let voices = await ensureUserVoices();
        let voice = voices.find((v) => v.id === character.voiceConfig?.userVoiceId);
        if (!voice) {
          audioCacheRef.current.userVoices = null;
          voices = await ensureUserVoices();
          voice = voices.find((v) => v.id === character.voiceConfig?.userVoiceId);
        }
        if (!voice) {
          throw new Error("Assigned voice not found.");
        }
        const provider = providers.find((p) => p.id === voice.providerId);
        if (provider?.providerType === "device_tts") {
          if (audioRequestRef.current?.requestId === requestId) {
            audioRequestRef.current = null;
          }
          await playDeviceTts(message.id, trimmedText, voice.voiceId);
          return;
        }

        const cacheKey = buildAudioCacheKey({
          providerId: voice.providerId,
          modelId: voice.modelId,
          voiceId: voice.voiceId,
          text: trimmedText,
          prompt: voice.prompt,
        });
        const cached = audioPreviewCacheRef.current.get(cacheKey);
        if (cached) {
          if (audioRequestRef.current?.requestId !== requestId) {
            cancelledAudioRequestsRef.current.delete(requestId);
            return;
          }
          audioRequestRef.current = null;
          if (cancelledAudioRequestsRef.current.has(requestId)) {
            cancelledAudioRequestsRef.current.delete(requestId);
            setAudioStatus(message.id, null);
            return;
          }
          startAudioPlayback(message.id, cached);
          return;
        }

        try {
          const response = await generateTtsForMessage(
            voice.providerId,
            voice.modelId,
            voice.voiceId,
            trimmedText,
            voice.prompt,
            requestId,
          );
          if (audioRequestRef.current?.requestId !== requestId) {
            cancelledAudioRequestsRef.current.delete(requestId);
            return;
          }
          audioRequestRef.current = null;
          if (cancelledAudioRequestsRef.current.has(requestId)) {
            cancelledAudioRequestsRef.current.delete(requestId);
            setAudioStatus(message.id, null);
            return;
          }
          cacheAudioPreview(cacheKey, response);
          startAudioPlayback(message.id, response);
          return;
        } catch (error) {
          if (audioRequestRef.current?.requestId === requestId) {
            audioRequestRef.current = null;
          }
          setAudioStatus(message.id, null);
          const messageText = error instanceof Error ? error.message : String(error);
          const isAbort =
            messageText.toLowerCase().includes("aborted") ||
            messageText.toLowerCase().includes("cancel");
          if (isAbort) return;
          throw error;
        }
      }

      if (character.voiceConfig.source === "provider") {
        const providerId = character.voiceConfig.providerId;
        const voiceId = character.voiceConfig.voiceId;
        if (!providerId || !voiceId) {
          throw new Error("Voice assignment is missing provider details.");
        }
        const provider = providers.find((p) => p.id === providerId);
        if (!provider) {
          throw new Error("Assigned provider not found.");
        }
        if (provider.providerType === "device_tts") {
          if (audioRequestRef.current?.requestId === requestId) {
            audioRequestRef.current = null;
          }
          await playDeviceTts(message.id, trimmedText, voiceId);
          return;
        }

        let modelId = character.voiceConfig.modelId;
        if (!modelId) {
          const models = await ensureAudioModels(provider.providerType as AudioProviderType);
          modelId = models[0]?.id;
        }
        if (!modelId) {
          throw new Error("No audio models available for this provider.");
        }

        const cacheKey = buildAudioCacheKey({
          providerId,
          modelId,
          voiceId,
          text: trimmedText,
        });
        const cached = audioPreviewCacheRef.current.get(cacheKey);
        if (cached) {
          if (audioRequestRef.current?.requestId !== requestId) {
            cancelledAudioRequestsRef.current.delete(requestId);
            return;
          }
          audioRequestRef.current = null;
          if (cancelledAudioRequestsRef.current.has(requestId)) {
            cancelledAudioRequestsRef.current.delete(requestId);
            setAudioStatus(message.id, null);
            return;
          }
          startAudioPlayback(message.id, cached);
          return;
        }

        try {
          const response = await generateTtsForMessage(
            providerId,
            modelId,
            voiceId,
            trimmedText,
            undefined,
            requestId,
          );
          if (audioRequestRef.current?.requestId !== requestId) {
            cancelledAudioRequestsRef.current.delete(requestId);
            return;
          }
          audioRequestRef.current = null;
          if (cancelledAudioRequestsRef.current.has(requestId)) {
            cancelledAudioRequestsRef.current.delete(requestId);
            setAudioStatus(message.id, null);
            return;
          }
          cacheAudioPreview(cacheKey, response);
          startAudioPlayback(message.id, response);
        } catch (error) {
          if (audioRequestRef.current?.requestId === requestId) {
            audioRequestRef.current = null;
          }
          setAudioStatus(message.id, null);
          const messageText = error instanceof Error ? error.message : String(error);
          const isAbort =
            messageText.toLowerCase().includes("aborted") ||
            messageText.toLowerCase().includes("cancel");
          if (isAbort) return;
          throw error;
        }
      }
    },
    [
      buildAudioCacheKey,
      cacheAudioPreview,
      cancelAudioGeneration,
      character,
      ensureAudioModels,
      ensureAudioProviders,
      ensureUserVoices,
      playDeviceTts,
      setAudioStatus,
      stopDeviceTtsPlayback,
      startAudioPlayback,
      stopAudioPlayback,
    ],
  );

  const effectiveVoiceAutoplay = useMemo(() => {
    return session?.voiceAutoplay ?? character?.voiceAutoplay ?? false;
  }, [character?.voiceAutoplay, session?.voiceAutoplay]);

  const handleAbortWithFlag = useCallback(async () => {
    abortRequestedRef.current = true;
    abortSoundRef.current = true;
    playAccessibilitySound("failure", accessibilitySettings);
    await handleAbort();
  }, [accessibilitySettings, handleAbort]);

  const openMessageActions = useCallback(
    (message: StoredMessage) => {
      setMessageAction({ message, mode: "view" });
      setEditDraft(message.content);
      setActionError(null);
      setActionStatus(null);
      setActionBusy(false);
    },
    [setMessageAction, setEditDraft, setActionError, setActionStatus, setActionBusy],
  );

  const scheduleLongPress = useCallback(
    (message: StoredMessage) => {
      const timer = window.setTimeout(() => {
        initializeLongPressTimer(null);
        openMessageActions(message);
      }, LONG_PRESS_DELAY);
      initializeLongPressTimer(timer);
    },
    [initializeLongPressTimer, openMessageActions],
  );

  const handlePressStart = useCallback(
    (message: StoredMessage) => (event: React.MouseEvent | React.TouchEvent) => {
      if (message.id.startsWith("placeholder")) return;

      const clientX = "touches" in event ? event.touches[0].clientX : event.clientX;
      const clientY = "touches" in event ? event.touches[0].clientY : event.clientY;
      pressStartPosition.current = { x: clientX, y: clientY };

      setHeldMessageId(message.id);
      scheduleLongPress(message);
    },
    [scheduleLongPress, setHeldMessageId],
  );

  const handlePressMove = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      if (!pressStartPosition.current) return;

      const clientX = "touches" in event ? event.touches[0].clientX : event.clientX;
      const clientY = "touches" in event ? event.touches[0].clientY : event.clientY;

      const deltaX = Math.abs(clientX - pressStartPosition.current.x);
      const deltaY = Math.abs(clientY - pressStartPosition.current.y);

      if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
        initializeLongPressTimer(null);
        setHeldMessageId(null);
        pressStartPosition.current = null;
      }
    },
    [initializeLongPressTimer, setHeldMessageId],
  );

  const handlePressEnd = useCallback(() => {
    initializeLongPressTimer(null);
    setHeldMessageId(null);
    pressStartPosition.current = null;
  }, [initializeLongPressTimer, setHeldMessageId]);

  // Help Me Reply handlers
  const handleOpenPlusMenu = useCallback(() => {
    setShowPlusMenu(true);
  }, []);

  const handleHelpMeReply = useCallback(async (mode: 'new' | 'enrich') => {
    if (!session?.id) return;

    // Close other menus and show result menu with loading state immediately
    setShowChoiceMenu(false);
    setShowPlusMenu(false);
    setGeneratedReply(null);
    setHelpMeReplyError(null);
    setGeneratingReply(true);
    setShowResultMenu(true);

    try {
      const currentDraft = mode === 'enrich' && draft.trim() ? draft : undefined;
      const result = await generateUserReply(session.id, currentDraft);
      setGeneratedReply(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHelpMeReplyError(message);
    } finally {
      setGeneratingReply(false);
    }
  }, [session?.id, draft]);

  const handleUseReply = useCallback(() => {
    if (generatedReply) {
      setDraft(generatedReply);
    }
    setShowResultMenu(false);
    setGeneratedReply(null);
    setHelpMeReplyError(null);
  }, [generatedReply, setDraft]);

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
      void handleHelpMeReply('new');
    }
  }, [draft, handleHelpMeReply]);

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

  const updateIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return null;

    const { scrollTop, clientHeight, scrollHeight } = container;
    const atBottom = scrollTop + clientHeight >= scrollHeight - STICKY_BOTTOM_THRESHOLD_PX;
    isAtBottomRef.current = atBottom;
    setIsAtBottom((prev) => (prev === atBottom ? prev : atBottom));
    return scrollTop;
  }, []);

  const handleScroll = useCallback(() => {
    const scrollTop = updateIsAtBottom();
    if (scrollTop === null) return;

    if (scrollTop <= AUTOLOAD_TOP_THRESHOLD_PX && hasMoreMessagesBefore) {
      void loadOlderFromDb();
    }
  }, [hasMoreMessagesBefore, loadOlderFromDb, updateIsAtBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const handleContextMenu = useCallback(
    (message: StoredMessage) => (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      initializeLongPressTimer(null);
      if (message.id.startsWith("placeholder")) return;
      openMessageActions(message);
      setHeldMessageId(null);
    },
    [initializeLongPressTimer, setHeldMessageId, openMessageActions],
  );

  const closeMessageActions = useCallback(
    (force = false) => {
      if (!force && (actionBusy || messageAction?.mode === "edit")) {
        return;
      }
      resetMessageActions();
    },
    [actionBusy, messageAction?.mode, resetMessageActions],
  );

  const handleSendMessage = useCallback(async () => {
    if (sending) return;
    setError(null);

    const hasContent = draft.trim().length > 0 || pendingAttachments.length > 0;

    if (hasContent) {
      const content = draft.trim();
      setDraft("");
      playAccessibilitySound("send", accessibilitySettings);
      await handleSend(content);
    } else {
      playAccessibilitySound("send", accessibilitySettings);
      await handleContinue();
    }
  }, [
    sending,
    setError,
    draft,
    setDraft,
    handleSend,
    handleContinue,
    pendingAttachments,
    accessibilitySettings,
  ]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (isAtBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
      updateIsAtBottom();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, lastMessageContentLength, isGenerating, updateIsAtBottom]);

  useEffect(() => {
    if (sending && !sendingPrevRef.current) {
      abortRequestedRef.current = false;
      const lastPlayable = [...messages]
        .reverse()
        .find(
          (msg) =>
            (msg.role === "assistant" || msg.role === "scene") &&
            !msg.id.startsWith("placeholder") &&
            msg.content.trim().length > 0,
        );
      if (lastPlayable) {
        sendStartSignatureRef.current = `${lastPlayable.id}:${replacePlaceholders(
          lastPlayable.content,
          character?.name ?? "",
          persona?.title ?? "",
        )}`;
      } else {
        sendStartSignatureRef.current = null;
      }
    }
    const wasSending = sendingPrevRef.current;
    sendingPrevRef.current = sending;

    if (!wasSending || sending) return;
    if (!effectiveVoiceAutoplay) return;
    if (abortRequestedRef.current) {
      abortRequestedRef.current = false;
      return;
    }
    if (autoPlayInFlightRef.current) return;

    const lastPlayable = [...messages]
      .reverse()
      .find(
        (msg) =>
          (msg.role === "assistant" || msg.role === "scene") &&
          !msg.id.startsWith("placeholder") &&
          msg.content.trim().length > 0,
      );

    if (!lastPlayable) return;

    const displayText = replacePlaceholders(
      lastPlayable.content,
      character?.name ?? "",
      persona?.title ?? "",
    );
    const signature = `${lastPlayable.id}:${displayText}`;
    if (signature === sendStartSignatureRef.current) return;
    if (signature === autoPlaySignatureRef.current) return;

    autoPlaySignatureRef.current = signature;
    autoPlayInFlightRef.current = true;
    void handlePlayMessageAudio(lastPlayable, displayText)
      .catch((error) => {
        console.error("Failed to autoplay message audio:", error);
      })
      .finally(() => {
        autoPlayInFlightRef.current = false;
      });
  }, [
    character?.name,
    effectiveVoiceAutoplay,
    handlePlayMessageAudio,
    messages,
    persona?.title,
    sending,
  ]);

  useEffect(() => {
    const wasGenerating = wasGeneratingRef.current;
    if (!wasGenerating && isGenerating) {
      abortSoundRef.current = false;
    }
    if (wasGenerating && !isGenerating) {
      if (abortSoundRef.current) {
        abortSoundRef.current = false;
        return;
      }
      if (error) {
        playAccessibilitySound("failure", accessibilitySettings);
      } else {
        playAccessibilitySound("success", accessibilitySettings);
      }
    }
    wasGeneratingRef.current = isGenerating;
  }, [accessibilitySettings, error, isGenerating]);

  useEffect(() => {
    if (!isAtBottom || !isGenerating) return;
    scrollToBottom("auto");
  }, [isAtBottom, isGenerating, scrollToBottom]);

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
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ backgroundColor: backgroundImageData ? undefined : "#050505" }}
    >
      {/* Full-screen background image (behind all content) */}
      {backgroundImageData && (
        <div className="pointer-events-none fixed inset-0 z-0" style={chatBackgroundStyle} />
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
            backgroundColor: backgroundImageData ? theme.contentOverlay : "transparent",
          }}
        >
          {hasMoreMessagesBefore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void loadOlderFromDb()}
                className={cn(
                  "px-3 py-1.5 text-xs text-white/70 border border-white/15 bg-white/5 hover:bg-white/10",
                  radius.full,
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
                  audioStatus={audioStatusByMessage[message.id]}
                  onPlayAudio={handlePlayMessageAudio}
                  onStopAudio={handleStopAudio}
                  onCancelAudio={handleCancelAudio}
                  onImageClick={handleImageClick}
                  reasoning={streamingReasoning[message.id] || (message.reasoning ?? undefined)}
                />
              </div>
            );
          })}
        </div>
      </main>

      <AnimatePresence>
        {!isAtBottom && (
          <motion.button
            type="button"
            aria-label="Scroll to bottom"
            onClick={() => scrollToBottom("smooth")}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "fixed right-3 z-30 flex h-11 w-11 items-center justify-center",
              "bottom-[calc(env(safe-area-inset-bottom)+88px)]",
              "border border-white/15 bg-black/40 text-white/80 shadow-lg backdrop-blur-sm",
              "hover:bg-black/55 active:scale-95",
              radius.full,
            )}
          >
            <ChevronDown size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="relative z-10">
        <ChatFooter
          draft={draft}
          setDraft={setDraft}
          error={error}
          sending={sending}
          character={character}
          onSendMessage={handleSendMessage}
          onAbort={handleAbortWithFlag}
          hasBackgroundImage={!!backgroundImageData}
          pendingAttachments={pendingAttachments}
          onAddAttachment={supportsImageInput ? addPendingAttachment : undefined}
          onRemoveAttachment={supportsImageInput ? removePendingAttachment : undefined}
          onOpenPlusMenu={handleOpenPlusMenu}
          triggerFileInput={shouldTriggerFileInput}
          onFileInputTriggered={() => setShouldTriggerFileInput(false)}
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
            .filter((c) => c.id !== characterId)
            .map((char) => (
              <CharacterOption
                key={char.id}
                character={char}
                onClick={async () => {
                  if (!messageToBranch) return;
                  const result = await chatController.handleBranchToCharacter(
                    messageToBranch,
                    char.id,
                  );
                  if (result) {
                    setShowCharacterSelector(false);
                    setMessageToBranch(null);
                    navigate(`/chat/${result.characterId}?sessionId=${result.sessionId}`);
                  }
                }}
              />
            ))}
          {availableCharacters.filter((c) => c.id !== characterId).length === 0 && (
            <p className="text-center text-white/40 py-8">
              No other characters available. Create more characters first.
            </p>
          )}
        </div>
      </BottomMenu>

      {/* Plus Menu - Upload Image | Help Me Reply */}
      <BottomMenu
        isOpen={showPlusMenu}
        onClose={() => setShowPlusMenu(false)}
        title="Add Content"
      >
        <div className="space-y-2">
          {supportsImageInput && (
            <MenuButton
              icon={Image}
              title="Upload Image"
              onClick={handlePlusMenuImageUpload}
            />
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
            onClick={() => handleHelpMeReply('enrich')}
          />
          <MenuButton
            icon={Sparkles}
            title="Write something new"
            description="Generate a fresh reply"
            onClick={() => handleHelpMeReply('new')}
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
              <LoadingSpinner />
            </div>
          ) : helpMeReplyError ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm">{helpMeReplyError}</p>
            </div>
          ) : generatedReply ? (
            <div className={cn(
              "bg-white/5 border border-white/10 p-4",
              radius.lg,
              "max-h-[40vh] overflow-y-auto"
            )}>
              <p className="text-white/90 text-sm whitespace-pre-wrap">
                {generatedReply}
              </p>
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              onClick={() => handleHelpMeReply(draft.trim() ? 'enrich' : 'new')}
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
              <span>Use This</span>
            </button>
          </div>
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
    </div >
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
        "active:scale-[0.99]",
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
