export type GroupChatCreateState = {
  groupName: string;
  selectedIds: Set<string>;
  loading: boolean;
  creating: boolean;
  error: string | null;
};

type GroupChatCreateAction =
  | { type: "set-group-name"; value: string }
  | { type: "toggle-character"; id: string }
  | { type: "set-loading"; value: boolean }
  | { type: "set-creating"; value: boolean }
  | { type: "set-error"; value: string | null };

export const initialGroupChatCreateState: GroupChatCreateState = {
  groupName: "",
  selectedIds: new Set<string>(),
  loading: true,
  creating: false,
  error: null,
};

export function groupChatCreateReducer(
  state: GroupChatCreateState,
  action: GroupChatCreateAction,
): GroupChatCreateState {
  switch (action.type) {
    case "set-group-name":
      return { ...state, groupName: action.value, error: null };
    case "toggle-character": {
      const nextSelected = new Set(state.selectedIds);
      if (nextSelected.has(action.id)) {
        nextSelected.delete(action.id);
      } else {
        nextSelected.add(action.id);
      }
      return { ...state, selectedIds: nextSelected, error: null };
    }
    case "set-loading":
      return { ...state, loading: action.value };
    case "set-creating":
      return { ...state, creating: action.value };
    case "set-error":
      return { ...state, error: action.value };
    default:
      return state;
  }
}
