import { invoke } from "@tauri-apps/api/core";
import type { StoredMessage, UsageSummary } from "../storage/schemas";

export interface ChatTurnResult {
  sessionId: string;
  requestId?: string;
  userMessage: StoredMessage;
  assistantMessage: StoredMessage;
  usage?: UsageSummary;
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
