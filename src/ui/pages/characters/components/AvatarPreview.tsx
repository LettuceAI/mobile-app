import { useMemo } from "react";

interface AvatarPreviewProps {
  avatarPath: string;
  name: string;
}

export function AvatarPreview({ avatarPath, name }: AvatarPreviewProps) {
  const preview = useMemo(() => {
    if (!avatarPath) {
      const initial = name.trim().charAt(0) || "?";
      return (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
          <span className="text-3xl font-bold text-white">{initial.toUpperCase()}</span>
        </div>
      );
    }

    return <img src={avatarPath} alt="Character avatar" className="h-full w-full object-cover" />;
  }, [avatarPath, name]);

  return <>{preview}</>;
}
