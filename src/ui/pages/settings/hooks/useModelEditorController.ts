import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import {
  readSettings,
  addOrUpdateModel,
  removeModel,
  setDefaultModel,
} from "../../../../core/storage/repo";
import type {
  AdvancedModelSettings,
  Model,
  ProviderCredential,
} from "../../../../core/storage/schemas";
import { providerRegistry } from "../../../../core/providers/registry";
import {
  createDefaultAdvancedModelSettings,
} from "../../../../core/storage/schemas";
import {
  sanitizeAdvancedModelSettings,
} from "../../../components/AdvancedModelSettingsForm";
import {
  initialModelEditorState,
  modelEditorReducer,
  type ModelEditorState,
} from "./modelEditorReducer";

type ControllerReturn = {
  state: ModelEditorState;
  isNew: boolean;
  canSave: boolean;
  providerDisplay: (prov: ProviderCredential) => string;
  handleDisplayNameChange: (value: string) => void;
  handleModelNameChange: (value: string) => void;
  handleProviderSelection: (providerId: string, providerLabel: string) => void;
  setModelAdvancedDraft: (settings: AdvancedModelSettings) => void;
  toggleOverride: () => void;
  setOverrideEnabled: (enabled: boolean) => void;
  handleTemperatureChange: (value: number) => void;
  handleTopPChange: (value: number) => void;
  handleMaxTokensChange: (value: number | null) => void;
  handleSave: () => Promise<void>;
  handleDelete: () => Promise<void>;
  handleSetDefault: () => Promise<void>;
  clearError: () => void;
};

function useModelEditorState() {
  return useReducer(modelEditorReducer, initialModelEditorState);
}

export function useModelEditorController(): ControllerReturn {
  const navigate = useNavigate();
  const { modelId } = useParams<{ modelId: string }>();
  const isNew = !modelId || modelId === "new";
  const [state, dispatch] = useModelEditorState();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      dispatch({ type: "set_loading", payload: true });
      dispatch({ type: "set_error", payload: null });
      try {
        const settings = await readSettings();
        const providers = settings.providerCredentials;
        const defaultModelId = settings.defaultModelId ?? null;
        const globalAdvanced =
          settings.advancedModelSettings ?? createDefaultAdvancedModelSettings();

        let nextEditorModel: Model | null = null;
        let nextDraft = sanitizeAdvancedModelSettings(globalAdvanced);
        let overrideEnabled = false;

        if (isNew) {
          const firstProvider = providers[0];
          const firstRegistry = providerRegistry[0];
          nextEditorModel = {
            id: crypto.randomUUID(),
            name: "",
            displayName: "",
            providerId: firstProvider?.providerId || firstRegistry?.id || "",
            providerLabel: firstProvider?.label || firstRegistry?.name || "",
            createdAt: Date.now(),
          } as Model;
        } else {
          const existing = settings.models.find((m) => m.id === modelId) || null;
          if (!existing) {
            navigate("/settings/models");
            return;
          }
          nextEditorModel = existing;
          if (existing.advancedModelSettings) {
            overrideEnabled = true;
            nextDraft = sanitizeAdvancedModelSettings(
              existing.advancedModelSettings,
            );
          }
        }

        if (nextEditorModel && providers.length > 0) {
          const hasMatch = providers.some(
            (p) =>
              p.providerId === nextEditorModel!.providerId &&
              p.label === nextEditorModel!.providerLabel,
          );
          if (!hasMatch) {
            const fallback = providers[0];
            nextEditorModel = {
              ...nextEditorModel,
              providerId: fallback.providerId,
              providerLabel: fallback.label,
            };
          }
        }

        if (!cancelled) {
          dispatch({
            type: "load_success",
            payload: {
              providers,
              defaultModelId,
              editorModel: nextEditorModel,
              globalAdvanced,
              modelAdvancedDraft: nextDraft,
              overrideEnabled,
            },
          });
        }
      } catch (error) {
        console.error("Failed to load model settings", error);
        if (!cancelled) {
          dispatch({
            type: "set_error",
            payload: "Failed to load model settings",
          });
          dispatch({ type: "set_loading", payload: false });
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isNew, modelId, navigate]);

  const providerDisplay = useMemo(() => {
    return (prov: ProviderCredential) => {
      const reg = providerRegistry.find((p) => p.id === prov.providerId);
      return `${prov.label} (${reg?.name || prov.providerId})`;
    };
  }, []);

  const canSave = useMemo(() => {
    const { editorModel, providers, saving, verifying } = state;
    if (!editorModel) return false;
    const hasProvider =
      providers.find(
        (p) =>
          p.providerId === editorModel.providerId &&
          p.label === editorModel.providerLabel,
      ) || providers.find((p) => p.providerId === editorModel.providerId);
    return (
      !!editorModel.displayName?.trim() &&
      !!editorModel.name?.trim() &&
      !!hasProvider &&
      !saving &&
      !verifying
    );
  }, [state]);

  const handleDisplayNameChange = useCallback(
    (value: string) => {
      dispatch({
        type: "update_editor_model",
        payload: { displayName: value },
      });
    },
    [dispatch],
  );

  const handleModelNameChange = useCallback(
    (value: string) => {
      dispatch({
        type: "update_editor_model",
        payload: { name: value },
      });
    },
    [dispatch],
  );

  const handleProviderSelection = useCallback(
    (providerId: string, providerLabel: string) => {
      dispatch({
        type: "update_editor_model",
        payload: {
          providerId,
          providerLabel,
        },
      });
    },
    [dispatch],
  );

  const setModelAdvancedDraft = useCallback(
    (settings: AdvancedModelSettings) => {
      dispatch({
        type: "set_model_advanced_draft",
        payload: sanitizeAdvancedModelSettings(settings),
      });
    },
    [dispatch],
  );

  const setOverrideEnabled = useCallback(
    (enabled: boolean) => {
      dispatch({ type: "set_override_enabled", payload: enabled });
    },
    [dispatch],
  );

  const toggleOverride = useCallback(() => {
    setOverrideEnabled(!state.overrideEnabled);
  }, [setOverrideEnabled, state.overrideEnabled]);

  const handleTemperatureChange = useCallback(
    (value: number) => {
      const rounded = Number(value.toFixed(2));
      dispatch({
        type: "set_model_advanced_draft",
        payload: {
          ...state.modelAdvancedDraft,
          temperature: rounded,
        },
      });
    },
    [dispatch, state.modelAdvancedDraft],
  );

  const handleTopPChange = useCallback(
    (value: number) => {
      const rounded = Number(value.toFixed(2));
      dispatch({
        type: "set_model_advanced_draft",
        payload: {
          ...state.modelAdvancedDraft,
          topP: rounded,
        },
      });
    },
    [dispatch, state.modelAdvancedDraft],
  );

  const handleMaxTokensChange = useCallback(
    (value: number | null) => {
      dispatch({
        type: "set_model_advanced_draft",
        payload: {
          ...state.modelAdvancedDraft,
          maxOutputTokens: value,
        },
      });
    },
    [dispatch, state.modelAdvancedDraft],
  );

  const clearError = useCallback(() => {
    dispatch({ type: "set_error", payload: null });
  }, [dispatch]);

  const handleSave = useCallback(async () => {
    const { editorModel, providers, overrideEnabled, modelAdvancedDraft } =
      state;
    if (!editorModel) return;

    dispatch({ type: "set_error", payload: null });

    const providerCred =
      providers.find(
        (p) =>
          p.providerId === editorModel.providerId &&
          p.label === editorModel.providerLabel,
      ) || providers.find((p) => p.providerId === editorModel.providerId);

    if (!providerCred) {
      dispatch({
        type: "set_error",
        payload: "Select a provider with valid credentials",
      });
      return;
    }

    const shouldVerify = ["openai", "anthropic"].includes(
      providerCred.providerId,
    );
    if (shouldVerify) {
      try {
        dispatch({ type: "set_verifying", payload: true });
        const name = editorModel.name.trim();
        if (!name) {
          dispatch({ type: "set_error", payload: "Model name required" });
          return;
        }

        let resp: { exists: boolean; error?: string } | undefined;
        try {
          resp = await invoke<{ exists: boolean; error?: string }>(
            "verify_model_exists",
            {
              providerId: providerCred.providerId,
              credentialId: providerCred.id,
              model: name,
            },
          );
        } catch (err) {
          console.warn(
            "Invoke verify_model_exists failed, treating as undefined:",
            err,
          );
        }
        if (!resp) {
          dispatch({
            type: "set_error",
            payload: "Model verification unavailable (backend)",
          });
          return;
        }
        if (!resp.exists) {
          dispatch({
            type: "set_error",
            payload: resp.error || "Model not found on provider",
          });
          return;
        }
      } catch (error: any) {
        dispatch({
          type: "set_error",
          payload: error?.message || "Verification failed",
        });
        return;
      } finally {
        dispatch({ type: "set_verifying", payload: false });
      }
    }

    dispatch({ type: "set_saving", payload: true });
    try {
      await addOrUpdateModel({
        ...editorModel,
        providerId: providerCred.providerId,
        providerLabel: providerCred.label,
        advancedModelSettings: overrideEnabled
          ? sanitizeAdvancedModelSettings(modelAdvancedDraft)
          : undefined,
      });
      navigate("/settings/models");
    } catch (error: any) {
      console.error("Failed to save model", error);
      dispatch({
        type: "set_error",
        payload: error?.message || "Failed to save model",
      });
    } finally {
      dispatch({ type: "set_saving", payload: false });
    }
  }, [navigate, state]);

  const handleDelete = useCallback(async () => {
    const { editorModel } = state;
    if (!editorModel || isNew) return;
    dispatch({ type: "set_deleting", payload: true });
    dispatch({ type: "set_error", payload: null });
    try {
      await removeModel(editorModel.id);
      navigate("/settings/models");
    } catch (error: any) {
      console.error("Failed to delete model", error);
      dispatch({
        type: "set_error",
        payload: error?.message || "Failed to delete model",
      });
    } finally {
      dispatch({ type: "set_deleting", payload: false });
    }
  }, [navigate, state, isNew]);

  const handleSetDefault = useCallback(async () => {
    const { editorModel } = state;
    if (!editorModel) return;
    try {
      await setDefaultModel(editorModel.id);
      dispatch({ type: "set_default_model_id", payload: editorModel.id });
    } catch (error) {
      console.error("Failed to set default model", error);
    }
  }, [state]);

  return {
    state,
    isNew,
    canSave,
    providerDisplay,
    handleDisplayNameChange,
    handleModelNameChange,
    handleProviderSelection,
    setModelAdvancedDraft,
    toggleOverride,
    setOverrideEnabled,
    handleTemperatureChange,
    handleTopPChange,
    handleMaxTokensChange,
    handleSave,
    handleDelete,
    handleSetDefault,
    clearError,
  };
}
