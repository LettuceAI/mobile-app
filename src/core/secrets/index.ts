import { invoke } from "@tauri-apps/api/core";

let memorySecrets = new Map<string, string>();

export type SecretRef = { providerId: string; key: string; credId?: string };

const SERVICE = "lettuceai";

function k(ref: SecretRef) {
  const account = `${ref.providerId}:${ref.credId ?? "default"}`;
  return { service: `${SERVICE}:${ref.key}`, account };
}

export async function getSecret(ref: SecretRef): Promise<string | null> {
  try {
    if (ref.credId) {
      const v = (await invoke("secret_for_cred_get", { providerId: ref.providerId, credId: ref.credId, key: ref.key })) as
        | string
        | null;
      if (v != null) return v;
    }
    const result = (await invoke("secret_get", k(ref))) as string | null;
    if (result != null) return result;
    const legacy = (await invoke("secret_get", { service: `${SERVICE}:${ref.key}`, account: ref.providerId })) as
      | string
      | null;
    return legacy ?? null;
  } catch {
    return (
      memorySecrets.get(`${ref.providerId}:${ref.credId ?? "default"}:${ref.key}`) ??
      memorySecrets.get(`${ref.providerId}:${ref.key}`) ??
      null
    );
  }
}

export async function setSecret(ref: SecretRef, value: string | null): Promise<void> {
  try {
    if (ref.credId) {
      if (value === null)
        await invoke("secret_for_cred_delete", { providerId: ref.providerId, credId: ref.credId, key: ref.key });
      else await invoke("secret_for_cred_set", { providerId: ref.providerId, credId: ref.credId, key: ref.key, value });
      return;
    }
    if (value === null) await invoke("secret_delete", k(ref));
    else await invoke("secret_set", { ...k(ref), value });
  } catch {
    const mk = `${ref.providerId}:${ref.credId ?? "default"}:${ref.key}`;
    if (value === null) memorySecrets.delete(mk);
    else memorySecrets.set(mk, value);
  }
}
