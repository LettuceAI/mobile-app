import type { AvatarCrop } from "../../core/storage/schemas";
import { cn } from "../design-tokens";

type AvatarImageProps = {
  src: string;
  alt: string;
  crop?: AvatarCrop | null;
  applyCrop?: boolean;
  className?: string;
  imgClassName?: string;
};

export function AvatarImage({
  src,
  alt,
  crop: _crop,
  applyCrop: _applyCrop = true,
  className,
  imgClassName,
}: AvatarImageProps) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <img
        src={src}
        alt={alt}
        className={cn("h-full w-full object-cover", imgClassName)}
        draggable={false}
      />
    </div>
  );
}
