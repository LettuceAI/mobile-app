import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Eye,
  MessageCircle,
  Share2,
  Loader2,
  AlertCircle,
  Shield,
  Sparkles,
  BookOpen,
  Clock,
  User,
  FileText,
  Hash,
  CheckCircle2,
  Play,
} from "lucide-react";
import { cn, typography, interactive } from "../../design-tokens";
import { DiscoveryDetailSkeleton } from "./components";
import {
  fetchCardDetail,
  getCardImageUrl,
  formatCount,
  getAuthorName,
  importCharacter,
  fetchAlternateGreetings,
  fetchTags,
  fetchAuthorInfo,
  type DiscoveryCardDetailResponse,
  type AuthorInfo,
} from "../../../core/discovery";
import { MarkdownRenderer } from "../chats/components/MarkdownRenderer";
import { BottomMenu, MenuButton, MenuButtonGroup, MenuDivider } from "../../components";
import { createSession } from "../../../core/storage/repo";

interface TokenStat {
  label: string;
  value?: number;
  icon: typeof FileText;
}

function TokenStatCard({ label, value, icon: Icon }: TokenStat) {
  if (value === undefined || value === null) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
        <Icon className="h-4 w-4 text-white/60" />
      </div>
      <div>
        <p className="text-xs text-white/50">{label}</p>
        <p className="text-sm font-semibold text-white">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

export function DiscoveryCardDetailPage() {
  const navigate = useNavigate();
  const { path } = useParams<{ path: string }>();

  const [cardData, setCardData] = useState<DiscoveryCardDetailResponse | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [importedCharacterId, setImportedCharacterId] = useState<string | null>(null);
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [authorInfo, setAuthorInfo] = useState<AuthorInfo | null>(null);

  useEffect(() => {
    if (!path) {
      setError("No card path provided");
      setLoading(false);
      return;
    }

    const decodedPath = decodeURIComponent(path);

    const loadCard = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchCardDetail(decodedPath);
        setCardData(response);

        // Load image
        if (response.card.path) {
          const url = await getCardImageUrl(response.card.path, "webp", 800, 90);
          setImageUrl(url);
        }

        // Fetch alternate greetings from backend
        try {
          const altGreetings = await fetchAlternateGreetings(response.card.id);
          setAlternateGreetings(altGreetings);
        } catch (err) {
          console.error("Failed to load alternate greetings:", err);
        }

        // Fetch tags from backend
        try {
          const tagsData = await fetchTags(response.card.id);
          setTags(tagsData);
        } catch (err) {
          console.error("Failed to load tags:", err);
        }

        // Fetch author info from backend
        const authorName = getAuthorName(response.card.author, response.card.path);
        if (authorName && authorName !== "Anonymous") {
          try {
            const authorData = await fetchAuthorInfo(authorName);
            setAuthorInfo(authorData);
          } catch (err) {
            console.error("Failed to load author info:", err);
          }
        }
      } catch (err) {
        console.error("Failed to load card detail:", err);
        setError(err instanceof Error ? err.message : "Failed to load character");
      } finally {
        setLoading(false);
      }
    };

    loadCard();
  }, [path]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleShare = async () => {
    if (!cardData?.card) return;

    // Properly encode the path for URL - encodeURIComponent handles spaces and special chars
    const encodedPath = cardData.card.path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const shareUrl = `https://character-tavern.com/card/${encodedPath}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: cardData.card.name,
          text: cardData.card.tagline || `Check out ${cardData.card.name}!`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        // Could add toast notification here
      }
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  const handleDownload = async () => {
    if (!cardData?.card || downloading) return;

    setDownloading(true);

    try {
      // Import character using Rust backend (downloads avatar, fetches alt greetings, creates character)
      const characterId = await importCharacter(cardData.card.path);

      setDownloaded(true);
      setImportedCharacterId(characterId);
      setShowDownloadMenu(true);
    } catch (err) {
      console.error("Download failed:", err);
      setError(err instanceof Error ? err.message : "Failed to download character");
    } finally {
      setDownloading(false);
    }
  };

  const handleStartChat = useCallback(async () => {
    if (!importedCharacterId) return;

    try {
      const session = await createSession(importedCharacterId, cardData?.card.name || "New Chat");

      navigate(`/chat/${importedCharacterId}?sessionId=${session.id}`);
    } catch (err) {
      console.error("Failed to start chat:", err);
    }
  }, [importedCharacterId, cardData?.card.name, navigate]);

  const handleViewInLibrary = () => {
    navigate("/library");
  };

  const card = cardData?.card;
  const startingScenes = [
    card?.definitionFirstMessage
      ? { label: "Primary", content: card.definitionFirstMessage }
      : null,
    ...alternateGreetings.map((content, index) => ({
      label: `Alternate ${index + 1}`,
      content,
    })),
  ].filter((scene): scene is { label: string; content: string } => Boolean(scene));

  // Generate gradient fallback
  const gradientHue = card?.name
    ? card.name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360
    : 200;
  const fallbackGradient = `linear-gradient(135deg, hsl(${gradientHue}, 60%, 15%) 0%, hsl(${(gradientHue + 60) % 360}, 50%, 10%) 100%)`;

  if (loading) {
    return (
      <div className="flex h-full flex-col bg-[#050505]">
        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-[#0F0F0F]/80 px-4 backdrop-blur-md"
          style={{
            paddingTop: "calc(env(safe-area-inset-top) + 12px)",
            paddingBottom: "12px",
          }}
        >
          <button
            onClick={handleBack}
            className={cn(
              "flex items-center justify-center rounded-full p-2",
              "text-white/70 hover:bg-white/10 hover:text-white",
              interactive.transition.fast,
              interactive.active.scale,
            )}
          >
            <ArrowLeft size={20} strokeWidth={2.5} />
          </button>
          <div className="h-5 w-32 rounded bg-white/10" />
        </header>
        <DiscoveryDetailSkeleton />
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="flex h-full flex-col bg-[#050505]">
        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-[#0F0F0F]/80 px-4 backdrop-blur-md"
          style={{
            paddingTop: "calc(env(safe-area-inset-top) + 12px)",
            paddingBottom: "12px",
          }}
        >
          <button
            onClick={handleBack}
            className={cn(
              "flex items-center justify-center rounded-full p-2",
              "text-white/70 hover:bg-white/10 hover:text-white",
              interactive.transition.fast,
              interactive.active.scale,
            )}
          >
            <ArrowLeft size={20} strokeWidth={2.5} />
          </button>
          <h1 className={cn(typography.h1.size, "font-bold text-white")}>Error</h1>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-white">Failed to load</h3>
          <p className="mb-6 text-center text-sm text-white/50">{error || "Character not found"}</p>
          <button
            onClick={handleBack}
            className="rounded-xl border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/15 active:scale-95"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const authorName = getAuthorName(card.author, card.path);
  const createdDate = card.createdAt ? new Date(card.createdAt).toLocaleDateString() : null;

  return (
    <div className="flex h-full flex-col bg-[#050505]">
      {/* Header - floats over image with safe area */}
      <header
        className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 12px)",
        }}
      >
        <button
          onClick={handleBack}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            "border border-white/20 bg-black/40 text-white backdrop-blur-xl",
            "transition-all hover:bg-black/60",
            interactive.active.scale,
          )}
          aria-label="Go back"
        >
          <ArrowLeft size={20} strokeWidth={2.5} />
        </button>

        <button
          onClick={handleShare}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            "border border-white/20 bg-black/40 text-white backdrop-blur-xl",
            "transition-all hover:bg-black/60",
            interactive.active.scale,
          )}
          aria-label="Share"
        >
          <Share2 size={20} strokeWidth={2.5} />
        </button>
      </header>

      {/* Main scrollable content */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 100px)",
        }}
      >
        {/* Hero Image */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn(
            "relative aspect-4/3 w-full overflow-hidden",
            "lg:aspect-[21/9] lg:max-w-6xl lg:mx-auto lg:rounded-2xl lg:border lg:border-white/10",
          )}
          style={{ background: fallbackGradient }}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt={card.name}
              className={cn(
                "h-full w-full object-cover transition-opacity duration-500",
                imageLoaded ? "opacity-100" : "opacity-0",
                card.isNsfw && "blur-xl scale-110",
              )}
              onLoad={() => setImageLoaded(true)}
            />
          )}

          {/* NSFW Overlay */}
          {card.isNsfw && (
            <div className="absolute inset-0 z-5 flex items-center justify-center bg-black/50">
              <div className="flex flex-col items-center gap-2">
                <Shield className="h-12 w-12 text-red-400" />
                <span className="text-sm font-bold uppercase tracking-wider text-red-400">
                  NSFW Content
                </span>
              </div>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-linear-to-t from-[#050505] via-transparent to-transparent" />

          {/* Badges */}
          <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2">
            {card.isNsfw && (
              <span className="flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg shadow-red-600/40">
                <Shield className="h-3 w-3" />
                NSFW
              </span>
            )}
            {card.isOc && (
              <span className="flex items-center gap-1 rounded-full bg-violet-500/90 px-2.5 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
                <Sparkles className="h-3 w-3" />
                Original
              </span>
            )}
            {card.lorebookId && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/90 px-2.5 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
                <BookOpen className="h-3 w-3" />
                Lorebook
              </span>
            )}
          </div>
        </motion.div>

        {/* Content */}
        <div className="space-y-6 px-4 pt-4 lg:mx-auto lg:max-w-4xl lg:px-0 lg:pt-6">
          {/* Title & Author */}
          {/* Author */}
          <div>
            <h1 className={cn(typography.h1.size, "mb-1 font-bold text-white")}>{card.name}</h1>
            {card.inChatName && card.inChatName !== card.name && (
              <p className="mb-2 text-sm text-white/50">Also known as: {card.inChatName}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
              {authorName !== "Anonymous" && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {authorName}
                </span>
              )}
              {createdDate && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {createdDate}
                </span>
              )}
            </div>
          </div>

          {/* Stats - use analytics fields which are the correct ones */}
          {(card.analyticsViews || card.analyticsDownloads || card.analyticsMessages) && (
            <div className="flex items-center gap-4">
              {card.analyticsViews !== undefined && card.analyticsViews > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-white/60">
                  <Eye className="h-4 w-4" />
                  <span>{formatCount(card.analyticsViews)}</span>
                </div>
              )}
              {card.analyticsDownloads !== undefined && card.analyticsDownloads > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-white/60">
                  <Download className="h-4 w-4" />
                  <span>{formatCount(card.analyticsDownloads)}</span>
                </div>
              )}
              {card.analyticsMessages !== undefined && card.analyticsMessages > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-white/60">
                  <MessageCircle className="h-4 w-4" />
                  <span>{formatCount(card.analyticsMessages)}</span>
                </div>
              )}
            </div>
          )}

          {/* Tagline */}
          {card.tagline && (
            <p className="text-base leading-relaxed text-white/80">{card.tagline}</p>
          )}

          {/* Description */}
          {card.description && (
            <div className="space-y-2">
              <h3 className={cn(typography.body.size, "font-semibold text-white")}>Description</h3>
              <MarkdownRenderer content={card.description} className="text-white/70" />
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-white/10" />

          {/* Token Statistics */}
          {card.tokenTotal !== undefined && card.tokenTotal > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-white/50" />
                <h3 className={cn(typography.body.size, "font-semibold text-white")}>
                  Token Usage
                </h3>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                  {card.tokenTotal.toLocaleString()} total
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <TokenStatCard label="Description" value={card.tokenDescription} icon={FileText} />
                <TokenStatCard label="Personality" value={card.tokenPersonality} icon={User} />
                <TokenStatCard label="Scenario" value={card.tokenScenario} icon={BookOpen} />
                <TokenStatCard
                  label="First Message"
                  value={card.tokenFirstMes}
                  icon={MessageCircle}
                />
                <TokenStatCard
                  label="Scenes"
                  value={1 + alternateGreetings.length}
                  icon={Sparkles}
                />
                <TokenStatCard label="Examples" value={card.tokenMesExample} icon={FileText} />
                <TokenStatCard
                  label="System Prompt"
                  value={card.tokenSystemPrompt}
                  icon={FileText}
                />
              </div>
            </div>
          )}

          {/* Character Preview Sections */}
          {startingScenes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-white/50" />
                <h3 className={cn(typography.body.size, "font-semibold text-white")}>
                  Starting Scenes
                </h3>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                  {startingScenes.length}
                </span>
              </div>
              <div className="space-y-3">
                {startingScenes.map((scene, index) => (
                  <div
                    key={`${scene.label}-${index}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">
                      {scene.label}
                    </p>
                    <MarkdownRenderer content={scene.content} className="text-white/70" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {card.definitionScenario && (
            <div className="space-y-2">
              <h3 className={cn(typography.body.size, "font-semibold text-white")}>Scenario</h3>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                  {card.definitionScenario.length > 300
                    ? card.definitionScenario.slice(0, 300) + "..."
                    : card.definitionScenario}
                </p>
              </div>
            </div>
          )}

          {card.definitionPersonality && (
            <div className="space-y-2">
              <h3 className={cn(typography.body.size, "font-semibold text-white")}>Personality</h3>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                  {card.definitionPersonality.length > 300
                    ? card.definitionPersonality.slice(0, 300) + "..."
                    : card.definitionPersonality}
                </p>
              </div>
            </div>
          )}

          {/* Stats Section */}
          <div className="space-y-2">
            <h3 className={cn(typography.body.size, "font-semibold text-white")}>Stats</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <Eye className="mx-auto mb-2 h-5 w-5 text-blue-400" />
                <div className="text-lg font-bold text-white">
                  {formatCount(card.analyticsViews)}
                </div>
                <div className="text-xs text-white/50">Views</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <Download className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
                <div className="text-lg font-bold text-white">
                  {formatCount(card.analyticsDownloads)}
                </div>
                <div className="text-xs text-white/50">Downloads</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <MessageCircle className="mx-auto mb-2 h-5 w-5 text-purple-400" />
                <div className="text-lg font-bold text-white">
                  {formatCount(card.analyticsMessages)}
                </div>
                <div className="text-xs text-white/50">Messages</div>
              </div>
            </div>
          </div>

          {/* Tags Section */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <h3 className={cn(typography.body.size, "font-semibold text-white")}>Tags</h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <span
                    key={index}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Author Section */}
          {authorInfo && (
            <div className="space-y-2">
              <h3 className={cn(typography.body.size, "font-semibold text-white")}>Author</h3>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  {authorInfo.avatarUrl && (
                    <img
                      src={authorInfo.avatarUrl}
                      alt={authorInfo.displayName}
                      className="h-12 w-12 rounded-full border border-white/10"
                    />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-white">{authorInfo.displayName}</div>
                    {authorInfo.followersCount !== undefined && (
                      <div className="text-sm text-white/50">
                        {authorInfo.followersCount} followers
                      </div>
                    )}
                  </div>
                  <User className="h-5 w-5 text-white/30" />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Fixed bottom action bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0F0F0F]/95 px-4 backdrop-blur-xl"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
          paddingTop: "16px",
        }}
      >
        <div className="mx-auto flex max-w-md gap-3 lg:max-w-none">
          {downloaded ? (
            <>
              <button
                onClick={() => setShowDownloadMenu(true)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl py-3",
                  "border border-emerald-500/30 bg-emerald-500/20",
                  "text-sm font-semibold text-emerald-100",
                  interactive.active.scale,
                )}
              >
                <CheckCircle2 className="h-5 w-5" />
                Downloaded
              </button>
              <button
                onClick={handleStartChat}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl py-3",
                  "bg-emerald-500 text-sm font-semibold text-white",
                  "shadow-lg shadow-emerald-500/25",
                  interactive.active.scale,
                )}
              >
                <Play className="h-5 w-5" />
                Start Chat
              </button>
            </>
          ) : (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl py-3",
                "bg-emerald-500 text-sm font-semibold text-white",
                "shadow-lg shadow-emerald-500/25",
                "disabled:opacity-60",
                interactive.active.scale,
              )}
            >
              {downloading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  Download Character
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Download Success Menu */}
      <BottomMenu
        isOpen={showDownloadMenu}
        onClose={() => setShowDownloadMenu(false)}
        title="Character Downloaded!"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10"
                  style={{ background: fallbackGradient }}
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={card.name}
                      className={cn("h-full w-full object-cover", card.isNsfw && "blur-md")}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base font-semibold text-white/70">
                      {card.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{card.name}</p>
                  <p className="text-xs text-white/50">Added to your library</p>
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                  Saved
                </span>
              </div>
            </div>
          </div>

          <MenuButtonGroup>
            <MenuButton
              icon={Play}
              title="Start Chat"
              description="Open the first scene now"
              color="from-emerald-500 to-emerald-600"
              onClick={handleStartChat}
            />
            <MenuButton
              icon={BookOpen}
              title="View in Library"
              description="Edit, manage, or export later"
              color="from-blue-500 to-cyan-600"
              onClick={handleViewInLibrary}
            />
          </MenuButtonGroup>

          <MenuButton
            icon={ArrowLeft}
            title="Continue Browsing"
            description="Back to discovery"
            onClick={() => setShowDownloadMenu(false)}
          />
        </div>
      </BottomMenu>
    </div>
  );
}

export default DiscoveryCardDetailPage;
