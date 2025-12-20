export const typography = {
    display: {
        size: 'text-2xl',        // 24px
        weight: 'font-extrabold',
        lineHeight: 'leading-tight',
        tracking: 'tracking-tight',
    },
    h1: {
        size: 'text-xl',         // 20px
        weight: 'font-bold',
        lineHeight: 'leading-snug',
        tracking: 'tracking-tight',
    },
    h2: {
        size: 'text-lg',         // 18px
        weight: 'font-bold',
        lineHeight: 'leading-snug',
        tracking: 'tracking-tight',
    },
    h3: {
        size: 'text-base',       // 16px
        weight: 'font-semibold',
        lineHeight: 'leading-normal',
    },
    heading: {
        size: 'text-xl',        
        weight: 'font-semibold',
        lineHeight: 'leading-relaxed',
    },
    body: {
        size: 'text-sm',         // 14px
        weight: 'font-normal',
        lineHeight: 'leading-relaxed',
    },
    bodySmall: {
        size: 'text-[12px]',         // 12px
        weight: 'font-normal',
        lineHeight: 'leading-normal',
    },
    label: {
        size: 'text-[12px]',         // 12px
        weight: 'font-medium',
        lineHeight: 'leading-none',
        tracking: 'tracking-wide', // 0.025em
    },
    caption: {
        size: 'text-[11px]',     // 11px
        weight: 'font-medium',
        lineHeight: 'leading-none',
    },
    overline: {
        size: 'text-[10px]',    // 10px
        weight: 'font-bold',
        lineHeight: 'leading-none',
        tracking: 'tracking-wider', // 0.05em
        transform: 'uppercase',
    },
} as const;

export const colors = {
    surface: {
        base: 'bg-[#000000]',
        elevated: 'bg-[#0A0A0A]',
        overlay: 'bg-black/60',
    },
    border: {
        subtle: 'border-white/15',
        default: 'border-white/20',
        strong: 'border-white/30',
        interactive: 'border-white/40',
    },
    text: {
        primary: 'text-white',
        secondary: 'text-white/80',
        tertiary: 'text-white/50',
        disabled: 'text-white/30',
    },
    accent: {
        emerald: {
            subtle: 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200',
            default: 'bg-emerald-400/20 border-emerald-400/40 text-emerald-100',
            strong: 'bg-emerald-400/30 border-emerald-400/60 text-emerald-50',
        },
        amber: {
            subtle: 'bg-amber-400/10 border-amber-400/30 text-amber-200',
            default: 'bg-amber-400/15 border-amber-400/40 text-amber-100',
        },
        red: {
            subtle: 'bg-red-400/10 border-red-400/30 text-red-200',
            default: 'bg-red-400/15 border-red-400/40 text-red-100',
        },
    },
    glass: {
        subtle: 'bg-white/5 backdrop-blur-lg border border-white/10',
        default: 'bg-white/10 backdrop-blur-xl border border-white/15',
        strong: 'bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/10',
    },
    effects: {
        glow: 'shadow-[0_0_20px_-5px_rgba(52,211,153,0.3)]',
        gradient: {
            brand: 'bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-emerald-500/20',
            surface: 'bg-gradient-to-b from-[#050505] to-[#000000]',
            text: 'bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent',
        }
    }
} as const;

export const spacing = {
    section: 'space-y-6',
    group: 'space-y-4',
    item: 'space-y-3',
    field: 'space-y-2',
    tight: 'space-y-1.5',
    inline: 'gap-3',
    inlineSmall: 'gap-2',
} as const;

export const radius = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
} as const;

export const shadows = {
    sm: 'shadow-[0_2px_8px_rgba(0,0,0,0.2)]',
    md: 'shadow-[0_4px_16px_rgba(0,0,0,0.3)]',
    lg: 'shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
    xl: 'shadow-[0_12px_32px_rgba(0,0,0,0.5)]',
    glow: 'shadow-[0_8px_24px_rgba(52,211,153,0.15)]',
} as const;

export const interactive = {
    hover: {
        scale: 'hover:scale-[1.02]',
        opacity: 'hover:opacity-90',
        brightness: 'hover:brightness-110',
    },
    active: {
        scale: 'active:scale-[0.98]',
    },
    transition: {
        fast: 'transition-all duration-150',
        default: 'transition-all duration-200',
        slow: 'transition-all duration-300',
    },
    focus: {
        ring: 'focus:outline-none focus:ring-2 focus:ring-white/20',
    },
} as const;

export const components = {
    button: {
        primary: `${radius.md} ${interactive.transition.fast} ${interactive.active.scale} ${interactive.focus.ring}`,
        sizes: {
            sm: 'px-3 py-1.5 text-xs',
            md: 'px-4 py-2.5 text-sm',
            lg: 'px-6 py-3 text-base',
        },
    },
    input: {
        base: `${radius.md} border ${colors.border.subtle} bg-black/20 backdrop-blur-xl ${interactive.transition.default} focus:${colors.border.interactive} focus:bg-black/30 focus:outline-none`,
        sizes: {
            sm: 'px-3 py-2 text-xs',
            md: 'px-4 py-3 text-sm',
            lg: 'px-4 py-3.5 text-base',
        },
    },
    card: {
        base: `${radius.lg} border ${colors.border.subtle} bg-white/5 ${interactive.transition.default}`,
        interactive: `hover:${colors.border.strong} hover:bg-white/10 ${interactive.active.scale}`,
    },
    listItem: {
        base: `${radius.md} border ${colors.border.subtle} bg-white/5 ${interactive.transition.default}`,
        interactive: `hover:${colors.border.strong} hover:bg-white/10 ${interactive.active.scale}`,
    },
} as const;

export const animations = {
    fadeIn: {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -16 },
        transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
    },
    fadeInFast: {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.15, ease: 'easeOut' },
    },
    slideUp: {
        initial: { opacity: 0, y: 32 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 32 },
        transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
    },
    scaleIn: {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
        transition: { duration: 0.2 },
    },
} as const;

export function cn(...classes: (string | boolean | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ');
}
