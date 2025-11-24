import { useNavigationManager, Routes } from "../../../navigation";

interface EmptyStateProps {
  title: string;
  showBackButton?: boolean;
}

export function EmptyState({ title, showBackButton = true }: EmptyStateProps) {
  const { backOrReplace } = useNavigationManager();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center text-gray-400">
      <p className="text-lg font-semibold text-white">{title}</p>
      {showBackButton && (
        <button
          onClick={() => backOrReplace(Routes.chat)}
          className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white transition hover:border-white/30"
        >
          Go back
        </button>
      )}
    </div>
  );
}
