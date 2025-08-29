import { getProvider } from "../providers/registry";
import { providerManager } from "../providers/manager";
import type { Message } from "../providers/types";
import type { ProviderCredential } from "../storage/schemas";

export async function sendChatTurn(opts: {
  cred: ProviderCredential;
  system?: string;
  model?: string;
  messages: Message[];
  signal?: AbortSignal;
  onDelta?: (t: string) => void;
}) {
  const { cred, messages, system, model, signal, onDelta } = opts;
  const reg = getProvider(cred.providerId);
  if (!reg) throw new Error("Unknown provider");
  const provider = reg.make();
  const cfg = {
    baseUrl: cred.baseUrl || reg.defaults?.baseUrl,
    headers: cred.headers,
    apiKeyRef: cred.apiKeyRef ? { ...cred.apiKeyRef, credId: cred.apiKeyRef.credId ?? cred.id } : undefined,
  };

  console.log(cfg)

  const res = await provider.chat(
    cfg,
    {
      model: model || (await providerManager.chooseModel(cred)) || "",
      messages,
      system,
      stream: !!onDelta,
      max_tokens: 1024,
      temperature: 0.7,
      top_p: 1,
      signal,
    },
    { onDelta },
  );
  return res;
}
