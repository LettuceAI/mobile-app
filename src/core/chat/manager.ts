import { invoke } from "@tauri-apps/api/core";
import type { StoredMessage, UsageSummary, ImageAttachment, Session } from "../storage/schemas";

export interface ChatTurnResult {
  session: Session;
  sessionId: string;
  requestId?: string;
  userMessage: StoredMessage;
  assistantMessage: StoredMessage;
  usage?: UsageSummary;
}

export interface ChatRegenerateResult {
  session: Session;
  sessionId: string;
  requestId?: string;
  assistantMessage: StoredMessage;
}

export interface ChatContinueResult {
  session: Session;
  sessionId: string;
  requestId?: string;
  assistantMessage: StoredMessage;
}

export async function sendChatTurn(params: {
  sessionId: string;
  characterId: string;
  message: string;
  personaId?: string | null;
  swapPlaces?: boolean;
  stream?: boolean;
  requestId?: string;
  attachments?: ImageAttachment[];
}): Promise<ChatTurnResult> {
  const {
    sessionId,
    characterId,
    message,
    personaId,
    swapPlaces = false,
    stream = true,
    requestId,
    attachments = [],
  } = params;
  if (!message.trim() && attachments.length === 0) {
    throw new Error("Message cannot be empty");
  }

  return invoke<ChatTurnResult>("chat_completion", {
    args: {
      sessionId,
      characterId,
      userMessage: message,
      personaId: personaId ?? null,
      swapPlaces,
      stream,
      requestId: requestId ?? null,
      attachments,
    },
  });
}

export async function continueConversation(params: {
  sessionId: string;
  characterId: string;
  personaId?: string | null;
  swapPlaces?: boolean;
  stream?: boolean;
  requestId?: string;
}): Promise<ChatContinueResult> {
  const {
    sessionId,
    characterId,
    personaId,
    swapPlaces = false,
    stream = true,
    requestId,
  } = params;

  return invoke<ChatContinueResult>("chat_continue", {
    args: {
      sessionId,
      characterId,
      personaId: personaId ?? null,
      swapPlaces,
      stream,
      requestId: requestId ?? null,
    },
  });
}

export async function regenerateAssistantMessage(params: {
  sessionId: string;
  messageId: string;
  swapPlaces?: boolean;
  stream?: boolean;
  requestId?: string;
}): Promise<ChatRegenerateResult> {
  const { sessionId, messageId, swapPlaces = false, stream = true, requestId } = params;
  return invoke<ChatRegenerateResult>("chat_regenerate", {
    args: {
      sessionId,
      messageId,
      swapPlaces,
      stream,
      requestId: requestId ?? null,
    },
  });
}

export async function abortMessage(requestId: string): Promise<void> {
  return invoke<void>("abort_request", {
    requestId,
  });
}

export async function addChatMessageAttachment(params: {
  sessionId: string;
  characterId: string;
  messageId: string;
  role: "user" | "assistant";
  attachmentId: string;
  base64Data: string;
  mimeType: string;
  filename?: string;
  width?: number;
  height?: number;
}): Promise<StoredMessage> {
  return invoke<StoredMessage>("chat_add_message_attachment", {
    args: {
      sessionId: params.sessionId,
      characterId: params.characterId,
      messageId: params.messageId,
      role: params.role,
      attachmentId: params.attachmentId,
      base64Data: params.base64Data,
      mimeType: params.mimeType,
      filename: params.filename ?? null,
      width: params.width ?? null,
      height: params.height ?? null,
    },
  });
}
