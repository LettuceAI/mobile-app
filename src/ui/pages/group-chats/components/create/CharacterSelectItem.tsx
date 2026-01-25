import { Check } from "lucide-react";

import type { Character } from "../../../../../core/storage/schemas";
import { AvatarImage } from "../../../../components/AvatarImage";
import { typography, radius, interactive, cn } from "../../../../design-tokens";
import { useAvatar } from "../../../../hooks/useAvatar";

type CharacterSelectItemProps = {
  character: Character;
  selected: boolean;
  onToggle: () => void;
};

export function CharacterSelectItem({ character, selected, onToggle }: CharacterSelectItemProps) {
  const avatarUrl = useAvatar("character", character.id, character.avatarPath, "round");
  const description = character.description || character.definition;

  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left",
        radius.md,
        "border transition",
        selected
          ? "border-emerald-400/40 bg-emerald-400/10"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
        interactive.transition.fast,
      )}
    >
      <div
        className={cn(
          "relative h-12 w-12 shrink-0 overflow-hidden rounded-full",
          "bg-linear-to-br from-white/10 to-white/5",
          selected ? "ring-2 ring-emerald-400/50" : "ring-1 ring-white/10",
        )}
      >
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={character.name} crop={character.avatarCrop} applyCrop />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/60">
            {character.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3
          className={cn(
            "truncate font-medium",
            typography.body.size,
            selected ? "text-emerald-100" : "text-white",
          )}
        >
          {character.name}
        </h3>
        {description && (
          <p className={cn("truncate text-sm", selected ? "text-emerald-200/60" : "text-white/50")}>
            {description}
          </p>
        )}
      </div>

      <div
        className={cn(
          "h-6 w-6 shrink-0 rounded-full flex items-center justify-center",
          "border transition",
          selected
            ? "border-emerald-400 bg-emerald-400 text-black"
            : "border-white/30 bg-transparent",
        )}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </div>
    </button>
  );
}
