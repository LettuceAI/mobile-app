import { useCallback, useEffect, useReducer } from "react";

import { listPersonas, deletePersona, savePersona } from "../../../../core/storage/repo";
import type { Persona } from "../../../../core/storage/schemas";

type PersonasState = {
  personas: Persona[];
  loading: boolean;
  selectedPersona: Persona | null;
  showDeleteConfirm: boolean;
  deleting: boolean;
};

type Action =
  | { type: "set_loading"; payload: boolean }
  | { type: "set_personas"; payload: Persona[] }
  | { type: "set_selected_persona"; payload: Persona | null }
  | { type: "set_show_delete_confirm"; payload: boolean }
  | { type: "set_deleting"; payload: boolean };

const initialState: PersonasState = {
  personas: [],
  loading: true,
  selectedPersona: null,
  showDeleteConfirm: false,
  deleting: false,
};

function reducer(state: PersonasState, action: Action): PersonasState {
  switch (action.type) {
    case "set_loading":
      return { ...state, loading: action.payload };
    case "set_personas":
      return { ...state, personas: action.payload, loading: false };
    case "set_selected_persona":
      return { ...state, selectedPersona: action.payload };
    case "set_show_delete_confirm":
      return { ...state, showDeleteConfirm: action.payload };
    case "set_deleting":
      return { ...state, deleting: action.payload };
    default:
      return state;
  }
}

export function usePersonasController() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadPersonas = useCallback(async () => {
    dispatch({ type: "set_loading", payload: true });
    try {
      const list = await listPersonas();
      dispatch({ type: "set_personas", payload: list });
    } catch (error) {
      console.error("Failed to load personas:", error);
      dispatch({ type: "set_loading", payload: false });
    }
  }, []);

  useEffect(() => {
    void loadPersonas();
  }, [loadPersonas]);

  const setSelectedPersona = useCallback((persona: Persona | null) => {
    dispatch({ type: "set_selected_persona", payload: persona });
  }, []);

  const setShowDeleteConfirm = useCallback((value: boolean) => {
    dispatch({ type: "set_show_delete_confirm", payload: value });
  }, []);

  const handleDelete = useCallback(async () => {
    if (!state.selectedPersona) return;
    dispatch({ type: "set_deleting", payload: true });
    try {
      await deletePersona(state.selectedPersona.id);
      await loadPersonas();
      dispatch({ type: "set_show_delete_confirm", payload: false });
      dispatch({ type: "set_selected_persona", payload: null });
    } catch (error) {
      console.error("Failed to delete persona:", error);
    } finally {
      dispatch({ type: "set_deleting", payload: false });
    }
  }, [state.selectedPersona, loadPersonas]);

  const handleSetDefault = useCallback(
    async (persona: Persona) => {
      try {
        const personas = state.personas;

        await Promise.all(
          personas
            .filter((p) => p.isDefault && p.id !== persona.id)
            .map((p) => savePersona({ ...p, isDefault: false })),
        );

        await savePersona({ ...persona, isDefault: !persona.isDefault });
        await loadPersonas();
      } catch (error) {
        console.error("Failed to set default persona:", error);
      }
    },
    [state.personas, loadPersonas],
  );

  return {
    state,
    setSelectedPersona,
    setShowDeleteConfirm,
    handleDelete,
    handleSetDefault,
    reload: loadPersonas,
  };
}
