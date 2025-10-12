import type { Character, Persona, Session, StoredMessage } from "../../../../core/storage/schemas";

export interface MessageActionState {
  message: StoredMessage;
  mode: "view" | "edit";
}

export interface ChatState {
  // Core data
  character: Character | null;
  persona: Persona | null;
  session: Session | null;
  messages: StoredMessage[];
  
  // UI state
  draft: string;
  loading: boolean;
  sending: boolean;
  error: string | null;
  
  // Message actions
  messageAction: MessageActionState | null;
  actionError: string | null;
  actionStatus: string | null;
  actionBusy: boolean;
  editDraft: string;
  
  // Interaction state
  heldMessageId: string | null;
  regeneratingMessageId: string | null;
}

export type ChatAction =
  | { type: "BATCH"; actions: ChatAction[] }
  | { type: "SET_CHARACTER"; payload: Character | null }
  | { type: "SET_PERSONA"; payload: Persona | null }
  | { type: "SET_SESSION"; payload: Session | null }
  | { type: "SET_MESSAGES"; payload: StoredMessage[] }
  | { type: "SET_DRAFT"; payload: string }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SENDING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_MESSAGE_ACTION"; payload: MessageActionState | null }
  | { type: "SET_ACTION_ERROR"; payload: string | null }
  | { type: "SET_ACTION_STATUS"; payload: string | null }
  | { type: "SET_ACTION_BUSY"; payload: boolean }
  | { type: "SET_EDIT_DRAFT"; payload: string }
  | { type: "SET_HELD_MESSAGE_ID"; payload: string | null }
  | { type: "SET_REGENERATING_MESSAGE_ID"; payload: string | null }
  | { type: "RESET_MESSAGE_ACTIONS" }
  | { type: "UPDATE_MESSAGE_CONTENT"; payload: { messageId: string; content: string } }
  | { type: "REPLACE_PLACEHOLDER_MESSAGES"; payload: { userPlaceholder: StoredMessage; assistantPlaceholder: StoredMessage; userMessage: StoredMessage; assistantMessage: StoredMessage } }
  | { type: "REWIND_TO_MESSAGE"; payload: { messageId: string; messages: StoredMessage[] } };

export const initialChatState: ChatState = {
  character: null,
  persona: null,
  session: null,
  messages: [],
  draft: "",
  loading: true,
  sending: false,
  error: null,
  messageAction: null,
  actionError: null,
  actionStatus: null,
  actionBusy: false,
  editDraft: "",
  heldMessageId: null,
  regeneratingMessageId: null,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === "BATCH") {
    return action.actions.reduce(chatReducer, state);
  }

  switch (action.type) {
    case "SET_CHARACTER":
      return { ...state, character: action.payload };
    
    case "SET_PERSONA":
      return { ...state, persona: action.payload };
    
    case "SET_SESSION":
      return { ...state, session: action.payload };
    
    case "SET_MESSAGES":
      return { ...state, messages: action.payload };
    
    case "SET_DRAFT":
      return { ...state, draft: action.payload };
    
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    
    case "SET_SENDING":
      return { ...state, sending: action.payload };
    
    case "SET_ERROR":
      return { ...state, error: action.payload };
    
    case "SET_MESSAGE_ACTION":
      return { ...state, messageAction: action.payload };
    
    case "SET_ACTION_ERROR":
      return { ...state, actionError: action.payload };
    
    case "SET_ACTION_STATUS":
      return { ...state, actionStatus: action.payload };
    
    case "SET_ACTION_BUSY":
      return { ...state, actionBusy: action.payload };
    
    case "SET_EDIT_DRAFT":
      return { ...state, editDraft: action.payload };
    
    case "SET_HELD_MESSAGE_ID":
      return { ...state, heldMessageId: action.payload };
    
    case "SET_REGENERATING_MESSAGE_ID":
      return { ...state, regeneratingMessageId: action.payload };
    
    case "RESET_MESSAGE_ACTIONS":
      return {
        ...state,
        messageAction: null,
        editDraft: "",
        actionError: null,
        actionStatus: null,
      };
    
    case "UPDATE_MESSAGE_CONTENT":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.messageId
            ? { ...msg, content: msg.content + action.payload.content }
            : msg
        ),
      };
    
    case "REPLACE_PLACEHOLDER_MESSAGES":
      const { userPlaceholder, assistantPlaceholder, userMessage, assistantMessage } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) => {
          if (msg.id === userPlaceholder.id) return userMessage;
          if (msg.id === assistantPlaceholder.id) return assistantMessage;
          return msg;
        }),
      };
    
    case "REWIND_TO_MESSAGE":
      return {
        ...state,
        messages: action.payload.messages,
      };
    
    default:
      return state;
  }
}