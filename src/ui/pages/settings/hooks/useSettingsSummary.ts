import { useCallback, useEffect, useReducer } from "react";

import { readSettings, listCharacters, listPersonas } from "../../../../core/storage/repo";
import type { Model, ProviderCredential } from "../../../../core/storage/schemas";

type SettingsSummaryState = {
  providers: ProviderCredential[];
  models: Model[];
  characterCount: number;
  personaCount: number;
  isLoading: boolean;
};

type Action =
  | { type: "set_loading"; payload: boolean }
  | {
      type: "set_data";
      payload: {
        providers: ProviderCredential[];
        models: Model[];
        characterCount: number;
        personaCount: number;
      };
    };

const initialState: SettingsSummaryState = {
  providers: [],
  models: [],
  characterCount: 0,
  personaCount: 0,
  isLoading: true,
};

function reducer(state: SettingsSummaryState, action: Action): SettingsSummaryState {
  switch (action.type) {
    case "set_loading":
      return { ...state, isLoading: action.payload };
    case "set_data":
      return {
        ...state,
        providers: action.payload.providers,
        models: action.payload.models,
        characterCount: action.payload.characterCount,
        personaCount: action.payload.personaCount,
        isLoading: false,
      };
    default:
      return state;
  }
}

export function useSettingsSummary() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const reload = useCallback(async () => {
    dispatch({ type: "set_loading", payload: true });
    try {
      const [settings, characters, personas] = await Promise.all([
        readSettings(),
        listCharacters(),
        listPersonas(),
      ]);

      dispatch({
        type: "set_data",
        payload: {
          providers: settings.providerCredentials,
          models: settings.models,
          characterCount: characters.length,
          personaCount: personas.length,
        },
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
      dispatch({ type: "set_loading", payload: false });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
