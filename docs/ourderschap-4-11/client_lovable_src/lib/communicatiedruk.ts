/**
 * Communicatiedruk: een praktische attentie-indicator op basis van objectieve signalen.
 * Zegt alleen iets over het gemeten communicatiepatroon — nooit over gevoelens, schuld of wie gelijk heeft.
 * Wordt alleen berekend voor gesprekken waartoe de kijker volgens de bestaande rechten toegang heeft.
 */
export type DrukNiveau = "rustig" | "veel" | "hoog";

export type DrukSignalen = {
  periode: string;          // bijv. "Afgelopen 60 minuten"
  berichten: number;        // aantal berichten in die periode
  overEnWeer: number;       // aantal keer dat de afzender wisselde
  taalwaarschuwingen: number; // keren dat de bestaande veiligheidscheck afging
  zelfdeOnderwerp: number;  // berichten rond één onderwerp
};

/** Configureerbare drempels; later beheerbaar. */
export const drukDrempels = { veelBerichten: 8, hoogBerichten: 14, veelWissels: 4, hoogWissels: 6, onderwerp: 10 };

export function drukNiveau(s: DrukSignalen, d = drukDrempels): DrukNiveau {
  let punten = 0;
  if (s.berichten >= d.hoogBerichten) punten += 2; else if (s.berichten >= d.veelBerichten) punten += 1;
  if (s.overEnWeer >= d.hoogWissels) punten += 2; else if (s.overEnWeer >= d.veelWissels) punten += 1;
  if (s.taalwaarschuwingen >= 2) punten += 1;
  if (s.zelfdeOnderwerp >= d.onderwerp) punten += 1;
  return punten >= 3 ? "hoog" : punten >= 1 ? "veel" : "rustig";
}

export const drukLabel: Record<DrukNiveau, string> = { rustig: "Rustig", veel: "Veel communicatie", hoog: "Hoge communicatiedruk" };
export const drukUitleg: Record<DrukNiveau, string> = {
  rustig: "Normale hoeveelheid communicatie.",
  veel: "Meer berichten over en weer dan gebruikelijk.",
  hoog: "Veel communicatie in korte tijd, op basis van meerdere gemeten signalen.",
};

/** Leesbare redenen, zodat de indicator altijd uitlegbaar is. */
export function drukRedenen(s: DrukSignalen): string[] {
  return [
    `${s.berichten} berichten`,
    `${s.overEnWeer} reacties over en weer`,
    ...(s.taalwaarschuwingen ? [`${s.taalwaarschuwingen} ${s.taalwaarschuwingen === 1 ? "bericht" : "berichten"} waarbij de taalwaarschuwing werd geactiveerd`] : []),
    ...(s.zelfdeOnderwerp >= drukDrempels.onderwerp ? [`${s.zelfdeOnderwerp} berichten over hetzelfde onderwerp`] : []),
  ];
}

/* ---------- Pauze bij snel heen-en-weer (ouderkant) ---------- */
export type Tik = { van: string; ts: number };
/** Configureerbare regel: kijk naar het werkelijke patroon, niet naar een vast aantal zinnen. */
export const pauzeRegel = { vensterMs: 5 * 60_000, wisselsVoorWaarschuwing: 4, wisselsVoorPauze: 6, pauzeMs: 10 * 60_000 };

export function wisselsInVenster(tikken: Tik[], nu = Date.now(), r = pauzeRegel) {
  const recent = tikken.filter((t) => nu - t.ts <= r.vensterMs);
  let w = 0;
  for (let i = 1; i < recent.length; i++) if (recent[i]!.van !== recent[i - 1]!.van) w++;
  const beideKanten = new Set(recent.map((t) => t.van)).size > 1;
  return beideKanten ? w : 0;
}

export function pauzeAdvies(tikken: Tik[], nu = Date.now(), r = pauzeRegel): "geen" | "waarschuwen" | "pauze" {
  const w = wisselsInVenster(tikken, nu, r);
  if (w >= r.wisselsVoorPauze) return "pauze";
  if (w >= r.wisselsVoorWaarschuwing) return "waarschuwen";
  return "geen";
}
