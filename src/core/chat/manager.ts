import { invoke } from "@tauri-apps/api/core";
import type { StoredMessage, UsageSummary } from "../storage/schemas";

export interface ChatTurnResult {
  sessionId: string;
  requestId?: string;
  userMessage: StoredMessage;
  assistantMessage: StoredMessage;
  usage?: UsageSummary;
}

export interface ChatRegenerateResult {
  sessionId: string;
  requestId?: string;
  assistantMessage: StoredMessage;
}

export interface ChatContinueResult {
  sessionId: string;
  requestId?: string;
  assistantMessage: StoredMessage;
}

export async function sendChatTurn(params: {
  sessionId: string;
  characterId: string;
  message: string;
  personaId?: string | null;
  stream?: boolean;
  requestId?: string;
}): Promise<ChatTurnResult> {
  const { sessionId, characterId, message, personaId, stream = true, requestId } = params;
  if (!message.trim()) {
    throw new Error("Message cannot be empty");
  }

  return invoke<ChatTurnResult>("chat_completion", {
    args: {
      sessionId,
      characterId,
      userMessage: message,
      personaId: personaId ?? null,
      stream,
      requestId: requestId ?? null,
    }
  });
}

export async function continueConversation(params: {
  sessionId: string;
  characterId: string;
  personaId?: string | null;
  stream?: boolean;
  requestId?: string;
}): Promise<ChatContinueResult> {
  const { sessionId, characterId, personaId, stream = true, requestId } = params;

  return invoke<ChatContinueResult>("chat_continue", {
    args: {
      sessionId,
      characterId,
      personaId: personaId ?? null,
      stream,
      requestId: requestId ?? null,
    }
  });
}

export async function regenerateAssistantMessage(params: {
  sessionId: string;
  messageId: string;
  stream?: boolean;
  requestId?: string;
}): Promise<ChatRegenerateResult> {
  const { sessionId, messageId, stream = true, requestId } = params;
  return invoke<ChatRegenerateResult>("chat_regenerate", {
    args: {
      sessionId,
      messageId,
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
