import { useMemo, useReducer } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { savePersona } from "../../../../core/storage/repo";
import { saveAvatar } from "../../../../core/storage/avatars";
import { invalidateAvatarCache } from "../../../hooks/useAvatar";
import { importPersona, readFileAsText } from "../../../../core/storage/personaTransfer";
import { toast } from "../../../components/toast";
import type { AvatarCrop } from "../../../../core/storage/schemas";

export interface PersonaFormState {
  title: string;
  description: string;
  avatarPath: string | null;
  avatarCrop: AvatarCrop | null;
  avatarRoundPath: string | null;
  isDefault: boolean;
  saving: boolean;
  importing: boolean;
  error: string | null;
}

export type PersonaFormAction =
  | { type: "set_title"; value: string }
  | { type: "set_description"; value: string }
  | { type: "set_avatar_path"; value: string | null }
  | { type: "set_avatar_crop"; value: AvatarCrop | null }
  | { type: "set_avatar_round_path"; value: string | null }
  | { type: "set_default"; value: boolean }
  | { type: "set_saving"; value: boolean }
  | { type: "set_importing"; value: boolean }
  | { type: "set_error"; value: string | null }
  | {
      type: "hydrate_from_import";
      payload: {
        title: string;
        description: string;
        avatarPath: string | null;
        avatarCrop?: AvatarCrop | null;
        avatarRoundPath?: string | null;
      };
    };

export const initialCreatePersonaState: PersonaFormState = {
  title: "",
  description: "",
  avatarPath: null,
  avatarCrop: null,
  avatarRoundPath: null,
  isDefault: false,
  saving: false,
  importing: false,
  error: null,
};

export function createPersonaReducer(
  state: PersonaFormState,
  action: PersonaFormAction,
): PersonaFormState {
  switch (action.type) {
    case "set_title":
      return { ...state, title: action.value };
    case "set_description":
      return { ...state, description: action.value };
    case "set_avatar_path":
      return { ...state, avatarPath: action.value };
    case "set_avatar_crop":
      return { ...state, avatarCrop: action.value };
    case "set_avatar_round_path":
      return { ...state, avatarRoundPath: action.value };
    case "set_default":
      return { ...state, isDefault: action.value };
    case "set_saving":
      return { ...state, saving: action.value };
    case "set_importing":
      return { ...state, importing: action.value };
    case "set_error":
      return { ...state, error: action.value };
    case "hydrate_from_import":
      return {
        ...state,
        title: action.payload.title,
        description: action.payload.description,
        avatarPath: action.payload.avatarPath,
        avatarCrop: action.payload.avatarCrop ?? null,
        avatarRoundPath: action.payload.avatarRoundPath ?? null,
        isDefault: false,
      };
    default:
      return state;
  }
}

export function useCreatePersonaController() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, dispatch] = useReducer(createPersonaReducer, initialCreatePersonaState);

  const canSave = useMemo(
    () => state.title.trim().length > 0 && state.description.trim().length > 0 && !state.saving,
    [state.title, state.description, state.saving],
  );

  const topNavPath = useMemo(
    () => location.pathname + location.search,
    [location.pathname, location.search],
  );

  const handleAvatarUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        dispatch({ type: "set_avatar_path", value: reader.result as string });
        dispatch({ type: "set_avatar_crop", value: null });
        dispatch({ type: "set_avatar_round_path", value: null });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        dispatch({ type: "set_importing", value: true });
        if (file.name.toLowerCase().endsWith(".json")) {
          toast.warning(
            "Legacy JSON import detected",
            "JSON imports are deprecated and will be removed soon. Use Settings → Convert Files.",
          );
        }
        const jsonContent = await readFileAsText(file);
        const importedPersona = await importPersona(jsonContent);

        dispatch({
          type: "hydrate_from_import",
          payload: {
            title: importedPersona.title,
            description: importedPersona.description,
            avatarPath: importedPersona.avatarPath || null,
            avatarCrop: importedPersona.avatarCrop ?? null,
          },
        });
        dispatch({ type: "set_error", value: null });

        alert("Persona imported successfully! Opening it for review.");
        navigate(`/settings/personas/${importedPersona.id}/edit`);
      } catch (err: any) {
        console.error("Failed to import persona:", err);
        alert(err?.message || "Failed to import persona");
      } finally {
        dispatch({ type: "set_importing", value: false });
      }
    };

    input.click();
  };

  const handleSave = async () => {
    if (!canSave) return;

    try {
      dispatch({ type: "set_saving", value: true });
      dispatch({ type: "set_error", value: null });

      const personaId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

      let avatarFilename: string | undefined;
      if (state.avatarPath) {
        avatarFilename = await saveAvatar(
          "persona",
          personaId,
          state.avatarPath,
          state.avatarRoundPath,
        );
        if (!avatarFilename) {
          console.error("[CreatePersona] Failed to save avatar image");
        } else {
          invalidateAvatarCache("persona", personaId);
        }
      }

      await savePersona({
        id: personaId,
        title: state.title.trim(),
        description: state.description.trim(),
        avatarPath: avatarFilename,
        avatarCrop: avatarFilename ? (state.avatarCrop ?? undefined) : undefined,
        isDefault: state.isDefault,
      });

      navigate("/chat");
    } catch (e: any) {
      dispatch({ type: "set_error", value: e?.message || "Failed to save persona" });
    } finally {
      dispatch({ type: "set_saving", value: false });
    }
  };

  return {
    state,
    dispatch,
    canSave,
    handleAvatarUpload,
    handleImport,
    handleSave,
    topNavPath,
  };
}
