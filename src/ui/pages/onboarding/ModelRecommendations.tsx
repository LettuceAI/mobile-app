import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Zap, DollarSign, Brain } from "lucide-react";

type FactorCard = {
    icon: "sparkles" | "zap" | "dollar" | "brain";
    title: string;
    description: string;
    questions: string[];
};

const factors: FactorCard[] = [
    {
        icon: "sparkles",
        title: "Quality & capabilities",
        description:
            "How smart does the model need to be? Bigger, newer models usually reason better, write nicer text, and handle messy prompts more gracefully.",
        questions: [
            "Do you need deep character consistency and emotional intelligence?",
            "Do you care about immersive storytelling and believable character personalities?",
            "Do you want the model to remember character details and stay in-character across long sessions?",
        ],
    },
    {
        icon: "zap",
        title: "Speed & latency",
        description:
            "Faster models feel better for chatty and back-and-forth conversations. Some models trade a bit of quality for a lot more speed.",
        questions: [
            "Do you want near-instant replies to keep roleplay flowing naturally?",
            "Are you doing rapid-fire dialogue scenes where waiting would break immersion?",
            "Is this for casual RP where quick back-and-forth matters more than perfect responses?",
        ],
    },
    {
        icon: "dollar",
        title: "Budget & usage",
        description:
            "Every provider bills per token. Even cheap models add up if you chat a lot, so pick something that matches how often and how heavily you use it.",
        questions: [
            "Are you okay paying more for richer character interactions, or do you want something cheap for daily RP?",
            "Do you have free models from your provider/router you can try first?",
            "Will you run long roleplay sessions with detailed scene descriptions?",
            "Do you have a hard monthly budget you don't want to exceed?",
        ],
    },
    {
        icon: "brain",
        title: "Safety, privacy & extras",
        description:
            "Providers differ in how they handle safety, logging, and extra features like images, tools, or long context windows.",
        questions: [
            "Do you need fewer content filters for mature or creative roleplay scenarios?",
            "Do you care if your private RP conversations are logged or used for training?",
            "Do you need long context windows for complex storylines and character histories?",
        ],
    },
];

const iconMap = {
    sparkles: Sparkles,
    zap: Zap,
    dollar: DollarSign,
    brain: Brain,
};

export function ModelRecommendationsPage() {
    const navigate = useNavigate();

    return (
        <div className="flex min-h-screen flex-col bg-black text-white px-4 pb-8 pt-[calc(env(safe-area-inset-top)+12px)]">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <button
                    onClick={() => navigate(-1)}
                    className="flexitems-center justify-center rounded-full border border-white/10 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 active:scale-95 transition"
                    aria-label="Go back"
                >
                    <ArrowLeft size={10} />
                </button>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-white/60">
                    Model Guide
                </div>
                <div className="w-10" />
            </div>

            {/* Title & intro */}
            <h1 className="text-2xl font-semibold leading-tight text-white">How do I choose a model?</h1>
            <p className="mt-2 text-sm text-white/65">
                LettuceAI doesn&apos;t force a single &quot;best&quot; model. Instead, you pick what fits your{" "}
                <span className="font-medium text-white/80">use case, budget, and vibe</span>. Use this guide to decide
                what to try and where to look.
            </p>

            {/* Factors */}
            <div className="mt-6 space-y-4">
                {factors.map((factor) => {
                    const Icon = iconMap[factor.icon];
                    return (
                        <div
                            key={factor.title}
                            className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:border-white/20 hover:bg-white/8 transition"
                        >
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-green-500/20 to-darkgreen-500/20 border border-white/10 shrink-0">
                                    <Icon size={20} className="text-green-300" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-semibold text-white mb-1">{factor.title}</h3>
                                    <p className="text-sm text-white/70 mb-3 leading-relaxed">{factor.description}</p>

                                    <div>
                                        <p className="text-xs font-medium text-white/50 mb-1.5">Ask yourself:</p>
                                        <ul className="space-y-1.5 text-xs text-white/75">
                                            {factor.questions.map((q) => (
                                                <li key={q} className="flex gap-1.5">
                                                    <span className="mt-[3px] h-1 w-1 rounded-full bg-white/40 shrink-0" />
                                                    <span>{q}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Where to look for models */}
            <div className="mt-8 rounded-2xl border border-white/10 bg-linear-to-br from-white/5 to-transparent p-4 space-y-3">
                <h2 className="text-sm font-semibold text-white">Where can I find models?</h2>
                <p className="text-xs text-white/70">
                    Most providers and routers have a <span className="font-medium text-white/85">model list or catalog</span>.
                    Browse those pages to see what they offer, pricing, limits, and special features.
                </p>

                <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-white/75">
                    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                        <p className="font-medium text-white/85 mb-0.5">Direct providers</p>
                        <p className="text-white/60">
                            OpenAI, Anthropic, Google Gemini, xAI, Mistral, etc. Each has a console/dashboard where you can see
                            official model names, capabilities, and pricing.
                        </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                        <p className="font-medium text-white/85 mb-0.5">Routers & hubs</p>
                        <p className="text-white/60">
                            Services like OpenRouter or other aggregators list many models from different providers in one place,
                            often with benchmarks and pricing comparisons.
                        </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                        <p className="font-medium text-white/85 mb-0.5">Community recommendations</p>
                        <p className="text-white/60">
                            Look at docs, blogs, or community posts from your provider/router. They usually highlight which models
                            are best for chat, coding, or speed.
                        </p>
                    </div>
                </div>
            </div>

            {/* Rules of thumb */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                <h2 className="text-sm font-semibold text-white">Simple rules of thumb</h2>
                <ul className="space-y-1.5 text-xs text-white/70">
                    <li>• For casual chatting → pick a fast, cheap chat model from your provider/router.</li>
                    <li>• For experiments or high volume → start with the cheapest model that feels good enough, then upgrade if needed.</li>
                    <li>• If something feels off (too slow / too dumb / too expensive) → you can always switch models later in LettuceAI.</li>
                </ul>
            </div>

            <div className="mt-4 text-[11px] text-white/45">
                Always check the provider&apos;s own documentation for the latest model list, limits, and pricing. This page is
                about how to think, not what to buy.
            </div>
        </div>
    );
}
