import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, ZoomOut, Check, RotateCcw } from "lucide-react";
import { cn, typography, radius, interactive, shadows } from "../../design-tokens";

interface Position {
  x: number;
  y: number;
}

interface AvatarPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onConfirm: (croppedImageDataUrl: string) => void;
}

export function AvatarPositionModal({
  isOpen,
  onClose,
  imageSrc,
  onConfirm,
}: AvatarPositionModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const centerImage = useCallback((imgWidth: number, imgHeight: number, newScale: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerCenterX = containerRect.width / 2;
    const containerCenterY = containerRect.height / 2;
    const scaledWidth = imgWidth * newScale;
    const scaledHeight = imgHeight * newScale;
    return {
      x: containerCenterX - scaledWidth / 2,
      y: containerCenterY - scaledHeight / 2,
    };
  }, []);

  useEffect(() => {
    if (isOpen && imageSrc) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setImageLoaded(false);
      setImageSize(null);
      
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageLoaded(true);
        setTimeout(() => {
          const centered = centerImage(img.naturalWidth, img.naturalHeight, 1);
          setPosition(centered);
        }, 50);
      };
      img.onerror = () => setImageLoaded(true);
      img.src = imageSrc;
    }
  }, [isOpen, imageSrc, centerImage]);

  const zoomToCenter = useCallback((newScale: number) => {
    if (!containerRef.current || !imageSize) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerCenterX = containerRect.width / 2;
    const containerCenterY = containerRect.height / 2;
    
    const imageCenterX = (containerCenterX - position.x) / scale;
    const imageCenterY = (containerCenterY - position.y) / scale;
    
    const newX = containerCenterX - imageCenterX * newScale;
    const newY = containerCenterY - imageCenterY * newScale;
    
    setScale(newScale);
    setPosition({ x: newX, y: newY });
  }, [scale, position, imageSize]);

  const handleZoomIn = useCallback(() => {
    const newScale = Math.min(scale + 0.1, 4);
    zoomToCenter(newScale);
  }, [scale, zoomToCenter]);

  const handleZoomOut = useCallback(() => {
    const newScale = Math.max(scale - 0.1, 0.1);
    zoomToCenter(newScale);
  }, [scale, zoomToCenter]);

  const handleReset = useCallback(() => {
    if (!imageSize) return;
    setScale(1);
    const centered = centerImage(imageSize.width, imageSize.height, 1);
    setPosition(centered);
  }, [imageSize, centerImage]);

  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      setIsDragging(true);
      setDragStart({
        x: clientX - position.x,
        y: clientY - position.y,
      });
    },
    [position]
  );

  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging) return;
      setPosition({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientX, e.clientY);
    },
    [handleDragStart]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    },
    [handleDragMove]
  );

  const handleMouseUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  const lastPinchDistance = useRef<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleDragStart(touch.clientX, touch.clientY);
        lastPinchDistance.current = null;
      } else if (e.touches.length === 2) {
        setIsDragging(false);
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDistance.current = Math.sqrt(dx * dx + dy * dy);
      }
    },
    [handleDragStart]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1 && lastPinchDistance.current === null) {
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
      } else if (e.touches.length === 2 && containerRef.current && imageSize) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (lastPinchDistance.current !== null) {
          const scaleDelta = (distance - lastPinchDistance.current) * 0.004;
          const newScale = Math.min(Math.max(scale + scaleDelta, 0.1), 4);
          
          const containerRect = containerRef.current.getBoundingClientRect();
          const containerCenterX = containerRect.width / 2;
          const containerCenterY = containerRect.height / 2;
          const imageCenterX = (containerCenterX - position.x) / scale;
          const imageCenterY = (containerCenterY - position.y) / scale;
          const newX = containerCenterX - imageCenterX * newScale;
          const newY = containerCenterY - imageCenterY * newScale;
          
          setScale(newScale);
          setPosition({ x: newX, y: newY });
        }
        lastPinchDistance.current = distance;
      }
    },
    [handleDragMove, scale, position, imageSize]
  );

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
    lastPinchDistance.current = null;
  }, [handleDragEnd]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current || !imageSize) return;
    
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    const newScale = Math.min(Math.max(scale + delta, 0.1), 4);
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerCenterX = containerRect.width / 2;
    const containerCenterY = containerRect.height / 2;
    const imageCenterX = (containerCenterX - position.x) / scale;
    const imageCenterY = (containerCenterY - position.y) / scale;
    const newX = containerCenterX - imageCenterX * newScale;
    const newY = containerCenterY - imageCenterY * newScale;
    
    setScale(newScale);
    setPosition({ x: newX, y: newY });
  }, [scale, position, imageSize]);

  const handleConfirm = useCallback(async () => {
    if (!imageRef.current || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imageRef.current;
    const container = containerRef.current;

    const outputSize = 512;
    canvas.width = outputSize;
    canvas.height = outputSize;

    const containerRect = container.getBoundingClientRect();
    const containerSize = Math.min(containerRect.width, containerRect.height);
    const circleRadius = containerSize * 0.45;

    const circleCenterX = (containerSize / 2 - position.x) / scale;
    const circleCenterY = (containerSize / 2 - position.y) / scale;
    
    const cropRadius = circleRadius / scale;
    const sourceX = circleCenterX - cropRadius;
    const sourceY = circleCenterY - cropRadius;
    const sourceSize = cropRadius * 2;

    ctx.clearRect(0, 0, outputSize, outputSize);
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      outputSize,
      outputSize
    );

    const dataUrl = canvas.toDataURL("image/png", 0.95);
    onConfirm(dataUrl);
    onClose();
  }, [scale, position, onConfirm, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-200 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className={cn(
              "fixed left-1/2 top-1/2 z-210 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2",
              "flex flex-col overflow-hidden border border-white/10 bg-[#0a0a0c]",
              "rounded-xl",
              shadows.xl
            )}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className={cn(typography.h3.size, typography.h3.weight, "text-white")}>
                Position Avatar
              </h3>
              <button
                onClick={onClose}
                className={cn(
                  "flex h-12 w-12 items-center justify-center text-white/50",
                  radius.full,
                  interactive.transition.default,
                  "hover:bg-white/10 hover:text-white active:scale-95"
                )}
              >
                <X size={18} />
              </button>
            </div>

            {/* Image Area with Circular Guide */}
            <div className="relative px-5 py-6">
              <p className={cn(typography.bodySmall.size, "mb-4 text-center text-white/50")}>
                Drag to position • Pinch or scroll to zoom
              </p>

              {/* Full image container (rectangular) */}
              <div
                ref={containerRef}
                className={cn(
                  "relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden",
                  radius.lg,
                  "cursor-move touch-none select-none",
                  "border border-white/10"
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onWheel={handleWheel}
              >
                {/* Image */}
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="Avatar to position"
                  className="absolute pointer-events-none"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transformOrigin: "top left",
                    maxWidth: "none",
                    transition: isDragging ? "none" : "transform 0.1s ease-out",
                  }}
                  onLoad={() => setImageLoaded(true)}
                  draggable={false}
                />

                {/* Darkening overlay with circular cutout */}
                <svg
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <mask id="circleMask">
                      <rect x="0" y="0" width="100" height="100" fill="white" />
                      <circle cx="50" cy="50" r="45" fill="black" />
                    </mask>
                  </defs>
                  {/* Dark overlay outside circle */}
                  <rect
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                    fill="rgba(0, 0, 0, 0.7)"
                    mask="url(#circleMask)"
                  />
                  {/* Circle border */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(52, 211, 153, 0.6)"
                    strokeWidth="0.8"
                  />
                  {/* Rule of thirds grid inside circle */}
                  <line
                    x1="50"
                    y1="5"
                    x2="50"
                    y2="95"
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="0.3"
                  />
                  <line
                    x1="5"
                    y1="50"
                    x2="95"
                    y2="50"
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="0.3"
                  />
                  {/* Center point */}
                  <circle cx="50" cy="50" r="1.5" fill="rgba(52, 211, 153, 0.5)" />
                </svg>

                {/* Loading overlay */}
                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                  </div>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={handleZoomOut}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center border border-white/10 bg-white/5 text-white/60",
                    radius.md,
                    interactive.transition.default,
                    "hover:bg-white/10 hover:text-white active:scale-95"
                  )}
                >
                  <ZoomOut size={18} />
                </button>

                <div
                  className={cn(
                    "flex h-12 min-w-20 items-center justify-center border border-white/10 bg-white/5 px-3",
                    radius.md
                  )}
                >
                  <span className="text-sm font-medium text-white/70">{Math.round(scale * 100)}%</span>
                </div>

                <button
                  onClick={handleZoomIn}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center border border-white/10 bg-white/5 text-white/60",
                    radius.md,
                    interactive.transition.default,
                    "hover:bg-white/10 hover:text-white active:scale-95"
                  )}
                >
                  <ZoomIn size={18} />
                </button>

                <button
                  onClick={handleReset}
                  className={cn(
                    "flex h-12 items-center justify-center gap-1.5 border border-white/10 bg-white/5 px-3 text-white/60",
                    radius.md,
                    interactive.transition.default,
                    "hover:bg-white/10 hover:text-white active:scale-95"
                  )}
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 border-t border-white/10 p-5">
              <button
                onClick={onClose}
                className={cn(
                  "flex-1 py-3 font-medium text-white/70",
                  radius.md,
                  "border border-white/10 bg-white/5",
                  interactive.transition.default,
                  "hover:bg-white/10 hover:text-white active:scale-[0.98]"
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!imageLoaded}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 py-3 font-semibold text-white",
                  radius.md,
                  "border border-emerald-400/40 bg-emerald-500/80",
                  interactive.transition.default,
                  imageLoaded
                    ? "hover:bg-emerald-500/90 active:scale-[0.98]"
                    : "cursor-not-allowed opacity-50"
                )}
              >
                <Check size={18} />
                Confirm
              </button>
            </div>

            {/* Hidden canvas for cropping */}
            <canvas ref={canvasRef} className="hidden" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
