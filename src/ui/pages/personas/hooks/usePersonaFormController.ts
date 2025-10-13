import { useCallback, useEffect, useReducer } from "react";
import { useNavigate } from "react-router-dom";

import { getPersona, savePersona } from "../../../../core/storage/repo";

type PersonaFormState = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  title: string;
  description: string;
  isDefault: boolean;
};

type Action =
  | { type: "set_loading"; payload: boolean }
  | { type: "set_saving"; payload: boolean }
  | { type: "set_error"; payload: string | null }
  | { type: "set_fields"; payload: Partial<Omit<PersonaFormState, "loading" | "saving" | "error">> };

const initialState: PersonaFormState = {
  loading: true,
  saving: false,
  error: null,
  title: "",
  description: "",
  isDefault: false,
};

function reducer(state: PersonaFormState, action: Action): PersonaFormState {
  switch (action.type) {
    case "set_loading":
      return { ...state, loading: action.payload };
    case "set_saving":
      return { ...state, saving: action.payload };
    case "set_error":
      return { ...state, error: action.payload };
    case "set_fields":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function usePersonaFormController(personaId: string | undefined) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadPersona = useCallback(async () => {
    if (!personaId) {
      navigate("/personas");
      return;
    }

    dispatch({ type: "set_loading", payload: true });
    try {
      const persona = await getPersona(personaId);
      if (!persona) {
        navigate("/personas");
        return;
      }

      dispatch({
        type: "set_fields",
        payload: {
          title: persona.title,
          description: persona.description,
          isDefault: persona.isDefault ?? false,
        },
      });
      dispatch({ type: "set_error", payload: null });
    } catch (error) {
      console.error("Failed to load persona:", error);
      dispatch({
        type: "set_error",
        payload: "Failed to load persona",
      });
    } finally {
      dispatch({ type: "set_loading", payload: false });
    }
  }, [personaId, navigate]);

  useEffect(() => {
    void loadPersona();
  }, [loadPersona]);

  const setTitle = useCallback((value: string) => {
    dispatch({ type: "set_fields", payload: { title: value } });
  }, []);

  const setDescription = useCallback((value: string) => {
    dispatch({ type: "set_fields", payload: { description: value } });
  }, []);

  const setIsDefault = useCallback((value: boolean) => {
    dispatch({ type: "set_fields", payload: { isDefault: value } });
  }, []);

  const handleSave = useCallback(async () => {
    if (!personaId) {
      return;
    }

    const { title, description, isDefault } = state;
    if (!title.trim() || !description.trim()) {
      return;
    }

    dispatch({ type: "set_saving", payload: true });
    dispatch({ type: "set_error", payload: null });

    try {
      await savePersona({
        id: personaId,
        title: title.trim(),
        description: description.trim(),
        isDefault,
      });

      navigate("/personas");
    } catch (error: any) {
      console.error("Failed to save persona:", error);
      dispatch({
        type: "set_error",
        payload: error?.message || "Failed to save persona",
      });
    } finally {
      dispatch({ type: "set_saving", payload: false });
    }
  }, [personaId, state, navigate]);

  return {
    state,
    setTitle,
    setDescription,
    setIsDefault,
    handleSave,
  };
}
