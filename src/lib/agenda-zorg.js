import i18n, { taalLocale } from "@/i18n";
import { dt, plusDagen } from "./agenda-datum";
import { zorgOp } from "./zorg-store";
import { actieveVakantie } from "./vakantie-store";
/** Kijker-relatief: "sanne" = de ingelogde ouder, "joris" = de andere ouder (zoals overal in de agenda). */
export const ouderLabel = (ouder, kijker = "sanne") => ouder ? (ouder === kijker ? i18n.t("lib.agendaZorg.bijJou") : i18n.t("lib.agendaZorg.bijAnder")) : i18n.t("lib.agendaZorg.nietIngevuld");
/** Repeating periods are projected, never inserted as duplicate calendar appointments. */
export function vakantieDelenOp(v, datum, kind) {
    const a = actieveVakantie(v);
    if (!a || !a.vanDatum || !a.totDatum || (a.kinderen && !a.kinderen.includes(kind)))
        return [];
    const jaar = Number(datum.slice(0, 4)), bronJaar = Number(a.vanDatum.slice(0, 4));
    const jaren = a.herhaal && a.herhaal !== "eenmalig" ? [jaar - 1, jaar] : [bronJaar];
    return jaren.flatMap((j) => {
        if (j < bronJaar)
            return [];
        const verplaats = (s) => `${Number(s.slice(0, 4)) + j - bronJaar}${s.slice(4)}`;
        const van = verplaats(a.vanDatum ?? ""), tot = verplaats(a.totDatum ?? "");
        if (datum < van || datum > tot)
            return [];
        const delen = a.verdeling?.length ? a.verdeling : a.ouder === "Sanne" || a.ouder === "Joris" || a.ouder === "Samen" ? [{ van: a.vanDatum ?? "", tot: a.totDatum ?? "", ouder: a.ouder }] : [];
        return delen.filter((d) => datum >= verplaats(d.van) && datum <= verplaats(d.tot)).map((d) => ({ ...d, van: verplaats(d.van), tot: verplaats(d.tot), ouder: a.herhaal === "afwisselend" && (j - bronJaar) % 2 !== 0 ? d.ouder === "Sanne" ? "Joris" : d.ouder === "Joris" ? "Sanne" : "Samen" : d.ouder }));
    });
}
/**
 * Wie heeft de kinderen op deze datum: basisregeling (versie die dan geldt) → geaccepteerde uitzondering →
 * afgesproken vakantie/bijzondere dag. Eén afleiding voor Agenda, Home en Overdracht.
 */
export function agendaZorgOp(zorg, vakanties, start, datum, gekozen = "alle", kijker = "sanne") {
    const profielen = start.kinderen ?? [];
    const lees = (dag) => profielen.filter((k) => gekozen === "alle" || gekozen === k.id).map((k) => {
        const basis = zorgOp(zorg, k.id, dag);
        const bijzonder = vakanties.map((v) => ({ v, delen: vakantieDelenOp(v, dag, k.id) })).filter((x) => x.delen.length);
        const ouders = new Set(bijzonder.flatMap((x) => x.delen.map((d) => d.ouder)));
        const overlap = bijzonder.length > 1 && ouders.size > 1 ? bijzonder.map((x) => x.v.naam) : [];
        const delen = bijzonder.flatMap((x) => x.delen);
        const laatste = delen.at(-1);
        const ouder = overlap.length ? undefined : laatste ? laatste.ouder === "Samen" ? undefined : laatste.ouder === "Sanne" ? kijker : "joris" : basis.ouder;
        const tijd = laatste?.wisseltijd || basis.tijd;
        return { ...basis, tijd, id: k.id, naam: k.naam, ouder, ...(bijzonder.length ? { uitzondering: bijzonder.map((x) => x.v.naam).join(" · "), delen } : {}), overlap };
    });
    const kinderen = lees(datum), gisteren = lees(plusDagen(datum, -1));
    const wissels = kinderen.flatMap((k) => { const oud = gisteren.find((x) => x.id === k.id); return k.ouder && oud?.ouder && k.ouder !== oud.ouder ? [{ ...k, van: oud.ouder, naar: k.ouder }] : []; });
    const bekend = kinderen.every((k) => k.ouder);
    const kleur = !kinderen.length ? "onbekend" : kinderen.some((k) => k.delen && new Set(k.delen.map((d) => d.ouder)).size > 1) || kinderen.some((k) => k.overlap.length) ? "gemengd" : !bekend ? "onbekend" : kinderen.every((k) => k.ouder === kijker) ? "ik" : kinderen.every((k) => k.ouder !== kijker) ? "ander" : "gemengd";
    return { kinderen, wissels, kleur };
}
/**
 * Wisselmomenten vanaf `van` (inclusief), afgeleid uit dezelfde zorgverdeling — er wordt geen apart
 * wisselrecord opgeslagen. id = datum (YYYY-MM-DD): daaraan hangen paklijst en overdracht op de server.
 * Een geaccepteerd tijdvoorstel ("Ik ben later") voor die datum verschuift alleen de tijd.
 */
export function wisselMomenten(zorg, vakanties, start, van, dagen = 42, kijker = "sanne") {
    const uit = [];
    for (let i = 0; i < dagen; i++) {
        const datum = plusDagen(van, i);
        const g = agendaZorgOp(zorg, vakanties, start, datum, "alle", kijker);
        if (!g.wissels.length)
            continue;
        const later = zorg.voorstellen.filter((v) => v.status === "geaccepteerd" && v.aanleiding === "moment" && v.moment?.datum === datum && v.moment?.tijd).at(-1);
        const eerste = g.wissels[0];
        const naar = eerste.naar;
        uit.push({
            id: datum, datum, soort: "wissel", tijd: later?.moment.tijd || eerste.tijd || "", plek: eerste.plek || "", kindIds: g.wissels.map((k) => k.id),
            namen: g.wissels.map((k) => k.naam), van: eerste.van, naar, naarMij: naar === kijker,
            get dag() { return dt(datum).toLocaleDateString(taalLocale(), { weekday: "long", day: "numeric", month: "long" }); },
        });
    }
    return uit;
}
export function magOverdrachtVoorbereiden(datum, tijd, nu, aan) {
    if (!aan || !tijd)
        return false;
    const moment = dt(datum);
    const [h, m] = tijd.split(":").map(Number);
    if (h === undefined || m === undefined)
        return false;
    moment.setHours(h, m, 0, 0);
    const uren = (moment.getTime() - nu.getTime()) / 3600000;
    return uren >= 0 && uren <= 24;
}
