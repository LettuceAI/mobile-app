import { useState, useCallback, useRef, useEffect } from "react";
import { Camera } from "lucide-react";
import { cn, radius, interactive } from "../../design-tokens";
import { readSettings } from "../../../core/storage/repo";

import { AvatarSourceMenu } from "./AvatarSourceMenu";
import { AvatarGenerationSheet } from "./AvatarGenerationSheet";
import { AvatarPositionModal } from "./AvatarPositionModal";

export { AvatarSourceMenu, AvatarGenerationSheet, AvatarPositionModal };

interface AvatarPickerProps {
  currentAvatarPath: string;
  onAvatarChange: (path: string) => void;
  avatarPreview?: React.ReactNode;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  showRemoveButton?: boolean;
  onRemove?: () => void;
}

export function AvatarPicker({
  currentAvatarPath,
  onAvatarChange,
  avatarPreview,
  placeholder,
  size = "lg",
}: AvatarPickerProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showGenerationSheet, setShowGenerationSheet] = useState(false);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState<string | null>(null);
  const [hasImageGenModels, setHasImageGenModels] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const settings = await readSettings();
        const imageModels = settings.models.filter(
          (m) => m.modelType === "imagegeneration"
        );
        setHasImageGenModels(imageModels.length > 0);
      } catch {
        setHasImageGenModels(false);
      }
    })();
  }, []);

  const sizeClasses = {
    sm: "h-16 w-16",
    md: "h-24 w-24",
    lg: "h-32 w-32",
  };

  const handleButtonClick = useCallback(() => {
    setShowMenu(true);
  }, []);

  const handleChooseImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPendingImageSrc(dataUrl);
      setShowPositionModal(true);
    };
    reader.readAsDataURL(file);

    e.target.value = "";
  }, []);

  const handleGeneratedImage = useCallback((imageDataUrl: string) => {
    setPendingImageSrc(imageDataUrl);
    setShowPositionModal(true);
  }, []);

  const handleEditCurrent = useCallback(() => {
    if (currentAvatarPath) {
      setPendingImageSrc(currentAvatarPath);
      setShowPositionModal(true);
    }
  }, [currentAvatarPath]);

  const handlePositionConfirm = useCallback(
    (croppedImageDataUrl: string) => {
      onAvatarChange(croppedImageDataUrl);
      setPendingImageSrc(null);
    },
    [onAvatarChange]
  );

  const handlePositionModalClose = useCallback(() => {
    setShowPositionModal(false);
    setPendingImageSrc(null);
  }, []);

  return (
    <div className="relative inline-block">
      {/* Main avatar container */}
      <div
        className={cn(
          "relative overflow-hidden flex items-center justify-center",
          sizeClasses[size],
          radius.full,
          "bg-[#111113]",
          currentAvatarPath 
            ? "border-[3px] border-white/10" 
            : "border-2 border-dashed border-white/15"
        )}
      >
        {avatarPreview ? (
          avatarPreview
        ) : currentAvatarPath ? (
          <img 
            src={currentAvatarPath} 
            alt="Avatar" 
            className="h-full w-full object-cover"
          />
        ) : placeholder ? (
          <span className={cn(
            "font-semibold text-white/30",
            size === "sm" ? "text-base" : size === "md" ? "text-xl" : "text-2xl"
          )}>{placeholder}</span>
        ) : null}
      </div>

      {/* Camera button */}
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className={cn(
          "absolute z-20 flex items-center justify-center",
          "bottom-0 right-0 h-12 w-12",
          radius.full,
          "bg-[#1a1a1c] border border-white/10",
          "text-white/70",
          interactive.transition.default,
          "hover:bg-[#252528] hover:text-white hover:border-white/20",
          "active:scale-95"
        )}
      >
        <Camera size={16} strokeWidth={2} />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <AvatarSourceMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        onGenerateImage={() => setShowGenerationSheet(true)}
        onChooseImage={handleChooseImage}
        onEditCurrent={handleEditCurrent}
        hasImageGenerationModels={hasImageGenModels}
        hasCurrentAvatar={!!currentAvatarPath}
      />

      <AvatarGenerationSheet
        isOpen={showGenerationSheet}
        onClose={() => setShowGenerationSheet(false)}
        onImageGenerated={handleGeneratedImage}
      />

      {pendingImageSrc && (
        <AvatarPositionModal
          isOpen={showPositionModal}
          onClose={handlePositionModalClose}
          imageSrc={pendingImageSrc}
          onConfirm={handlePositionConfirm}
        />
      )}
    </div>
  );
}
