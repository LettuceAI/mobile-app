import type {
  AdvancedModelSettings,
  Model,
  ProviderCredential,
} from "../../../../core/storage/schemas";

export type ModelsState = {
  providers: ProviderCredential[];
  models: Model[];
  defaultModelId: string | null;
  advancedSettings: AdvancedModelSettings;
  advancedDraft: AdvancedModelSettings;
  advancedSaving: boolean;
  advancedError: string | null;
  forceCustomMode: boolean;
};

export type ModelsAction =
  | {
      type: "load_success";
      payload: {
        providers: ProviderCredential[];
        models: Model[];
        defaultModelId: string | null;
        advancedSettings: AdvancedModelSettings;
      };
    }
  | { type: "set_advanced_draft"; payload: AdvancedModelSettings }
  | { type: "set_advanced_saving"; payload: boolean }
  | { type: "set_advanced_error"; payload: string | null }
  | { type: "set_force_custom_mode"; payload: boolean }
  | { type: "set_models"; payload: Model[] }
  | { type: "set_providers"; payload: ProviderCredential[] }
  | { type: "set_default_model_id"; payload: string | null }
  | { type: "set_advanced_settings"; payload: AdvancedModelSettings };

export const initialModelsState: ModelsState = {
  providers: [],
  models: [],
  defaultModelId: null,
  advancedSettings: {} as AdvancedModelSettings,
  advancedDraft: {} as AdvancedModelSettings,
  advancedSaving: false,
  advancedError: null,
  forceCustomMode: false,
};

export function modelsReducer(
  state: ModelsState,
  action: ModelsAction,
): ModelsState {
  switch (action.type) {
    case "load_success":
      return {
        ...state,
        providers: action.payload.providers,
        models: action.payload.models,
        defaultModelId: action.payload.defaultModelId,
        advancedSettings: action.payload.advancedSettings,
        advancedDraft: action.payload.advancedSettings,
      };
    case "set_advanced_draft":
      return {
        ...state,
        advancedDraft: action.payload,
      };
    case "set_advanced_saving":
      return {
        ...state,
        advancedSaving: action.payload,
      };
    case "set_advanced_error":
      return {
        ...state,
        advancedError: action.payload,
      };
    case "set_force_custom_mode":
      return {
        ...state,
        forceCustomMode: action.payload,
      };
    case "set_models":
      return {
        ...state,
        models: action.payload,
      };
    case "set_providers":
      return {
        ...state,
        providers: action.payload,
      };
    case "set_default_model_id":
      return {
        ...state,
        defaultModelId: action.payload,
      };
    case "set_advanced_settings":
      return {
        ...state,
        advancedSettings: action.payload,
      };
    default:
      return state;
  }
}
