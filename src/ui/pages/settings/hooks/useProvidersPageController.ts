import { useCallback, useEffect, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  readSettings,
  addOrUpdateProviderCredential,
  removeProviderCredential,
  SETTINGS_UPDATED_EVENT,
} from "../../../../core/storage/repo";
import { providerRegistry } from "../../../../core/providers/registry";
import { getSecret, setSecret } from "../../../../core/secrets";
import type { ProviderCredential } from "../../../../core/storage/schemas";
import {
  initialProvidersPageState,
  providersPageReducer,
  type ProvidersPageState,
} from "./providersPageReducer";

type VerifyProviderApiKeyResult = {
  providerId: string;
  valid: boolean;
  status?: number;
  error?: string;
  details?: unknown;
};

type ControllerReturn = {
  state: ProvidersPageState;
  reload: () => Promise<void>;
  openEditor: (provider?: ProviderCredential) => void;
  closeEditor: () => void;
  setSelectedProvider: (provider: ProviderCredential | null) => void;
  setApiKey: (value: string) => void;
  setValidationError: (message: string | null) => void;
  updateEditorProvider: (updates: Partial<ProviderCredential>) => void;
  handleSaveProvider: () => Promise<void>;
  handleDeleteProvider: (id: string) => Promise<void>;
};

export function useProvidersPageController(): ControllerReturn {
  const [state, dispatch] = useReducer(
    providersPageReducer,
    initialProvidersPageState,
  );

  const reload = useCallback(async () => {
    const settings = await readSettings();
    dispatch({ type: "set_providers", payload: settings.providerCredentials });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const handler = () => {
      void reload();
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handler);
  }, [reload]);

  const openEditor = useCallback(
    (provider?: ProviderCredential) => {
      const newId = provider?.id ?? crypto.randomUUID();
      const baseProvider: ProviderCredential = provider
        ? {
            ...provider,
            apiKeyRef: provider.apiKeyRef
              ? { ...provider.apiKeyRef }
              : undefined,
          }
        : ({
            id: newId,
            providerId: providerRegistry[0].id,
            label: "",
            apiKeyRef: {
              providerId: providerRegistry[0].id,
              key: "apiKey",
              credId: newId,
            },
          } as ProviderCredential);

      dispatch({ type: "set_selected_provider", payload: null });
      dispatch({
        type: "open_editor",
        payload: { provider: baseProvider, apiKey: "" },
      });

      if (provider?.apiKeyRef) {
        const ref = { ...provider.apiKeyRef, credId: provider.id };
        getSecret(ref).then((key) =>
          dispatch({ type: "set_api_key", payload: key || "" }),
        );
      } else {
        dispatch({ type: "set_api_key", payload: "" });
      }
    },
    [],
  );

  const closeEditor = useCallback(() => {
    dispatch({ type: "close_editor" });
  }, []);

  const setSelectedProvider = useCallback((provider: ProviderCredential | null) => {
    dispatch({ type: "set_selected_provider", payload: provider });
  }, []);

  const setApiKey = useCallback((value: string) => {
    dispatch({ type: "set_api_key", payload: value });
  }, []);

  const setValidationError = useCallback((message: string | null) => {
    dispatch({ type: "set_validation_error", payload: message });
  }, []);

  const updateEditorProvider = useCallback(
    (updates: Partial<ProviderCredential>) => {
      dispatch({ type: "update_editor_provider", payload: updates });
    },
    [],
  );

  const handleSaveProvider = useCallback(async () => {
    const { editorProvider, apiKey } = state;
    if (!editorProvider) return;

    dispatch({ type: "set_validation_error", payload: null });
    dispatch({ type: "set_is_saving", payload: true });

    try {
      const requiresVerification = ["openai", "anthropic", "openrouter"].includes(
        editorProvider.providerId,
      );
      const trimmedKey = apiKey.trim();

      if (requiresVerification) {
        if (!trimmedKey) {
          dispatch({
            type: "set_validation_error",
            payload: "API key required",
          });
          return;
        }

        let verification: VerifyProviderApiKeyResult;
        try {
          verification = await invoke<VerifyProviderApiKeyResult>(
            "verify_provider_api_key",
            {
              providerId: editorProvider.providerId,
              credentialId: editorProvider.id,
              apiKey: trimmedKey,
              baseUrl: editorProvider.baseUrl ?? null,
            },
          );
        } catch (error) {
          dispatch({
            type: "set_validation_error",
            payload:
              error instanceof Error ? error.message : String(error),
          });
          return;
        }

        if (!verification.valid) {
          dispatch({
            type: "set_validation_error",
            payload: verification.error || "Invalid API key",
          });
          return;
        }
      }

      const providerToSave: ProviderCredential = {
        ...editorProvider,
        apiKeyRef: editorProvider.apiKeyRef
          ? { ...editorProvider.apiKeyRef, credId: editorProvider.id }
          : undefined,
      };

      await addOrUpdateProviderCredential(providerToSave);

      if (providerToSave.apiKeyRef && trimmedKey) {
        await setSecret(providerToSave.apiKeyRef, trimmedKey);
      }

      await reload();
      dispatch({ type: "close_editor" });
    } finally {
      dispatch({ type: "set_is_saving", payload: false });
    }
  }, [state, reload]);

  const handleDeleteProvider = useCallback(
    async (id: string) => {
      dispatch({ type: "set_is_deleting", payload: true });
      try {
        await removeProviderCredential(id);
        await reload();
        dispatch({ type: "set_selected_provider", payload: null });
      } finally {
        dispatch({ type: "set_is_deleting", payload: false });
      }
    },
    [reload],
  );

  return {
    state,
    reload,
    openEditor,
    closeEditor,
    setSelectedProvider,
    setApiKey,
    setValidationError,
    updateEditorProvider,
    handleSaveProvider,
    handleDeleteProvider,
  };
}
