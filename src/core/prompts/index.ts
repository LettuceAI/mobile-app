import { invoke } from "@tauri-apps/api/core";
import type { SystemPromptTemplate, PromptScope } from "../storage/schemas";

export async function listPromptTemplates(): Promise<SystemPromptTemplate[]> {
  return await invoke<SystemPromptTemplate[]>("list_prompt_templates");
}

export async function createPromptTemplate(
  name: string,
  scope: PromptScope,
  targetIds: string[],
  content: string
): Promise<SystemPromptTemplate> {
  return await invoke<SystemPromptTemplate>("create_prompt_template", {
    name,
    scope,
    targetIds,
    content,
  });
}

export async function updatePromptTemplate(
  id: string,
  updates: {
    name?: string;
    scope?: PromptScope;
    targetIds?: string[];
    content?: string;
  }
): Promise<SystemPromptTemplate> {
  return await invoke<SystemPromptTemplate>("update_prompt_template", {
    id,
    name: updates.name,
    scope: updates.scope,
    targetIds: updates.targetIds,
    content: updates.content,
  });
}

export async function deletePromptTemplate(id: string): Promise<void> {
  await invoke("delete_prompt_template", { id });
}

export async function getPromptTemplate(id: string): Promise<SystemPromptTemplate | null> {
  return await invoke<SystemPromptTemplate | null>("get_prompt_template", { id });
}

export async function getDefaultSystemPromptTemplate(): Promise<string> {
  return await invoke<string>("get_default_system_prompt_template");
}

export async function getAppDefaultTemplateId(): Promise<string> {
  return await invoke<string>("get_app_default_template_id");
}

export async function isAppDefaultTemplate(id: string): Promise<boolean> {
  return await invoke<boolean>("is_app_default_template", { id });
}

export async function resetAppDefaultTemplate(): Promise<SystemPromptTemplate> {
  return await invoke<SystemPromptTemplate>("reset_app_default_template");
}
