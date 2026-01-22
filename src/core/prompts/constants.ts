export const APP_DEFAULT_TEMPLATE_ID = "prompt_app_default";
export const APP_DYNAMIC_SUMMARY_TEMPLATE_ID = "prompt_app_dynamic_summary";
export const APP_DYNAMIC_MEMORY_TEMPLATE_ID = "prompt_app_dynamic_memory";
export const APP_HELP_ME_REPLY_TEMPLATE_ID = "prompt_app_help_me_reply";
export const APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID =
  "prompt_app_help_me_reply_conversational";
export const APP_GROUP_CHAT_TEMPLATE_ID = "prompt_app_group_chat";
export const APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID = "prompt_app_group_chat_roleplay";

const PROTECTED_TEMPLATE_IDS = new Set([
  APP_DEFAULT_TEMPLATE_ID,
  APP_DYNAMIC_SUMMARY_TEMPLATE_ID,
  APP_DYNAMIC_MEMORY_TEMPLATE_ID,
  APP_HELP_ME_REPLY_TEMPLATE_ID,
  APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID,
  APP_GROUP_CHAT_TEMPLATE_ID,
  APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID,
]);

const NON_SYSTEM_TEMPLATE_IDS = new Set([
  APP_DYNAMIC_SUMMARY_TEMPLATE_ID,
  APP_DYNAMIC_MEMORY_TEMPLATE_ID,
  APP_HELP_ME_REPLY_TEMPLATE_ID,
  APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID,
  APP_GROUP_CHAT_TEMPLATE_ID,
  APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID,
]);

export function isProtectedPromptTemplate(id: string): boolean {
  return PROTECTED_TEMPLATE_IDS.has(id);
}

export function isSystemPromptTemplate(id: string): boolean {
  return !NON_SYSTEM_TEMPLATE_IDS.has(id);
}

export function getPromptTypeLabel(id: string): string {
  switch (id) {
    case APP_DYNAMIC_SUMMARY_TEMPLATE_ID:
      return "Dynamic Summary";
    case APP_DYNAMIC_MEMORY_TEMPLATE_ID:
      return "Dynamic Memory";
    case APP_HELP_ME_REPLY_TEMPLATE_ID:
      return "Reply Helper";
    case APP_HELP_ME_REPLY_CONVERSATIONAL_TEMPLATE_ID:
      return "Reply Helper (Conversational)";
    case APP_GROUP_CHAT_TEMPLATE_ID:
      return "Group Chat";
    case APP_GROUP_CHAT_ROLEPLAY_TEMPLATE_ID:
      return "Group Chat RP";
    default:
      return "System";
  }
}
