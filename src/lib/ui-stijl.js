/**
 * Gedeelde UI-stijl voor de hele app. Gebruik deze in plaats van losse class-strings,
 * zodat knoppen, keuzes, velden en kaarten overal hetzelfde ogen.
 *
 * Regels:
 * - Knoppen zijn altijd rond (rounded-full). Primair = groen gevuld, secundair = omlijnd.
 * - Keuzechips zijn rond; gekozen = groen gevuld.
 * - Invoervelden (input, select, textarea) zijn rounded-2xl, 48px hoog, wit.
 * - Kaarten zijn rounded-[22px] met het matte-glaseffect.
 */
export const VELD = "min-h-12 min-w-0 rounded-2xl border border-border bg-card px-4 py-2.5 text-[15px] font-normal text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-50";
export const LABEL = "block text-sm font-semibold text-ink";
export const chip = (aan) => `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${aan ? "border-brand bg-brand text-primary-foreground" : "border-border bg-card text-ink"}`;
export const KNOP = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-5 text-[15px] font-semibold text-primary-foreground shadow-sm transition disabled:opacity-45 disabled:shadow-none";
export const KNOP_2 = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-5 text-[15px] font-semibold text-ink transition disabled:opacity-45";
export const KAART = "rounded-[22px] border border-white/85 bg-white/60";
