import { useCallback, useEffect, useMemo, useReducer } from "react";
import { createDefaultAdvancedModelSettings } from "../../../../core/storage/schemas";
import {
  readSettings,
  saveAdvancedModelSettings,
  SETTINGS_UPDATED_EVENT,
} from "../../../../core/storage/repo";
import {
  formatAdvancedModelSettingsSummary,
  sanitizeAdvancedModelSettings,
} from "../../../components/AdvancedModelSettingsForm";
import type { AdvancedModelSettings } from "../../../../core/storage/schemas";
import {
  initialModelsState,
  modelsReducer,
  type ModelsState,
} from "./modelsReducer";

type ControllerReturn = {
  state: ModelsState;
  reload: () => Promise<void>;
  setAdvancedDraft: (settings: AdvancedModelSettings) => void;
  updateAdvancedDraft: (updates: Partial<AdvancedModelSettings>) => void;
  setForceCustomMode: (value: boolean) => void;
  handleSaveAdvancedDefaults: () => Promise<void>;
  normalizedDraft: AdvancedModelSettings;
  normalizedCurrent: AdvancedModelSettings;
  advancedDirty: boolean;
  advancedSummary: string;
};

export function useModelsController(): ControllerReturn {
  const [state, dispatch] = useReducer(modelsReducer, initialModelsState);

  const reload = useCallback(async () => {
    try {
      const settings = await readSettings();
      const providers = settings.providerCredentials;
      const models = settings.models;
      const defaultModelId = settings.defaultModelId ?? null;
      const advancedSettings = sanitizeAdvancedModelSettings(
        settings.advancedModelSettings ?? createDefaultAdvancedModelSettings(),
      );

      dispatch({
        type: "load_success",
        payload: {
          providers,
          models,
          defaultModelId,
          advancedSettings,
        },
      });
    } catch (error) {
      console.error("Failed to load models settings", error);
    }
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

  const setAdvancedDraft = useCallback(
    (settings: AdvancedModelSettings) => {
      dispatch({
        type: "set_advanced_draft",
        payload: sanitizeAdvancedModelSettings(settings),
      });
    },
    [dispatch],
  );

  const updateAdvancedDraft = useCallback(
    (updates: Partial<AdvancedModelSettings>) => {
      dispatch({
        type: "set_advanced_draft",
        payload: sanitizeAdvancedModelSettings({
          ...state.advancedDraft,
          ...updates,
        }),
      });
    },
    [dispatch, state.advancedDraft],
  );

  const setForceCustomMode = useCallback(
    (value: boolean) => {
      dispatch({ type: "set_force_custom_mode", payload: value });
    },
    [dispatch],
  );

  const handleSaveAdvancedDefaults = useCallback(async () => {
    dispatch({ type: "set_advanced_saving", payload: true });
    dispatch({ type: "set_advanced_error", payload: null });
    try {
      const sanitized = sanitizeAdvancedModelSettings(state.advancedDraft);
      await saveAdvancedModelSettings(sanitized);
      dispatch({ type: "set_advanced_settings", payload: sanitized });
      dispatch({ type: "set_advanced_draft", payload: sanitized });
    } catch (error) {
      console.error("Failed to save advanced settings:", error);
      dispatch({
        type: "set_advanced_error",
        payload:
          error instanceof Error
            ? error.message
            : "Failed to save advanced settings",
      });
    } finally {
      dispatch({ type: "set_advanced_saving", payload: false });
    }
  }, [state.advancedDraft]);

  const normalizedDraft = useMemo(
    () => sanitizeAdvancedModelSettings(state.advancedDraft),
    [state.advancedDraft],
  );

  const normalizedCurrent = useMemo(
    () => sanitizeAdvancedModelSettings(state.advancedSettings),
    [state.advancedSettings],
  );

  const advancedDirty = useMemo(() => {
    return (
      JSON.stringify(normalizedDraft) !== JSON.stringify(normalizedCurrent)
    );
  }, [normalizedDraft, normalizedCurrent]);

  const advancedSummary = useMemo(() => {
    return formatAdvancedModelSettingsSummary(
      normalizedCurrent,
      "Temp 0.7 • Top P 1 • Max 1024",
    );
  }, [normalizedCurrent]);

  return {
    state,
    reload,
    setAdvancedDraft,
    updateAdvancedDraft,
    setForceCustomMode,
    handleSaveAdvancedDefaults,
    normalizedDraft,
    normalizedCurrent,
    advancedDirty,
    advancedSummary,
  };
}
