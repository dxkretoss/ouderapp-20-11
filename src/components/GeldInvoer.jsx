import { useTranslation } from "react-i18next";
import { bewerkGeld, leesGeld, schrijfGeld } from "@/lib/geld-invoer";
export function GeldInvoer({ value, onChange, label, className = "", placeholder }) {
    useTranslation(); // opnieuw tekenen bij taalwissel
    const geldig = !value || leesGeld(value) !== null;
    return <div className={`flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-3 focus-within:border-brand ${className}`}>
    <span aria-hidden="true" className="text-ink-soft">€</span>
    <input aria-label={label} aria-invalid={!geldig} inputMode="decimal" value={value} placeholder={placeholder ?? schrijfGeld(60)} onChange={(e) => onChange(e.target.value)} onFocus={() => { const n = leesGeld(value); if (n !== null)
        onChange(bewerkGeld(n)); }} onBlur={() => { const n = leesGeld(value); if (n !== null)
        onChange(schrijfGeld(n)); }} className="min-w-0 w-full bg-transparent py-2.5 text-sm outline-none"/>
  </div>;
}
