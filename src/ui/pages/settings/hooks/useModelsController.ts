import { useCallback, useEffect, useReducer } from "react";
import {
  readSettings,
  removeModel,
  setDefaultModel,
  SETTINGS_UPDATED_EVENT,
} from "../../../../core/storage/repo";
import {
  initialModelsState,
  modelsReducer,
  type ModelsState,
} from "./modelsReducer";

type ControllerReturn = {
  state: ModelsState;
  reload: () => Promise<void>;
  handleSetDefault: (modelId: string) => Promise<void>;
  handleDelete: (modelId: string) => Promise<void>;
};

export function useModelsController(): ControllerReturn {
  const [state, dispatch] = useReducer(modelsReducer, initialModelsState);

  const reload = useCallback(async () => {
    try {
      const settings = await readSettings();
      const providers = settings.providerCredentials;
      const models = settings.models;
      const defaultModelId = settings.defaultModelId ?? null;

      dispatch({
        type: "load_success",
        payload: {
          providers,
          models,
          defaultModelId,
        },
      });
    } catch (error) {
      console.error("Failed to load models settings", error);
    }
  }, []);

  const handleSetDefault = useCallback(async (modelId: string) => {
    try {
      await setDefaultModel(modelId);
    } catch (error) {
      console.error("Failed to set default model", error);
    }
  }, []);

  const handleDelete = useCallback(async (modelId: string) => {
    try {
      await removeModel(modelId);
    } catch (error) {
      console.error("Failed to remove model", error);
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

  return {
    state,
    reload,
    handleSetDefault,
    handleDelete,
  };
}
