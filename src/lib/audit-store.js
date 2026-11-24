import { useSyncExternalStore } from "react";
import i18n, { taalLocale } from "@/i18n";
import { api } from "@/lib/api";
import { authState } from "@/lib/auth-store";
import { startState } from "@/lib/start-store";
import { serverBron } from "@/lib/praktisch-sync";
const t = (k, o) => i18n.t(`lib.auditStore.${k}`, o);
/** Weergavenaam per soort; getters zodat de taal pas bij het lezen telt. */
export const soortLabel = {
    get afspraak() { return t("soort.afspraak"); }, get schema() { return t("soort.schema"); }, get besluit() { return t("soort.besluit"); },
    get kosten() { return t("soort.kosten"); }, get taak() { return t("soort.taak"); }, get spul() { return t("soort.spul"); }, get dossier() { return t("soort.dossier"); },
    get document() { return t("soort.document"); }, get vakantie() { return t("soort.vakantie"); }, get overdracht() { return t("soort.overdracht"); }, get kring() { return t("soort.kring"); }, get spullen() { return t("soort.spul"); },
    get budget() { return t("soort.budget"); }, get verrekening() { return t("soort.verrekening"); }, get kostenafspraak() { return t("soort.kostenafspraak"); }, get vaste_last() { return t("soort.vasteLast"); }, get caregiver() { return t("soort.kring"); },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Naam bij een profiel-id: jij / de naam van de andere ouder (of "de andere ouder"). */
function persoon(id, fallback = "") {
    const ik = authState().gebruiker;
    if (ik && id === ik.id)
        return ik.name || i18n.t("common.jij");
    const ander = (startState().coOuders ?? []).find((c) => c.id === id);
    return ander?.name || fallback || i18n.t("common.deAndereOuder");
}
/** Waarde in een wijziging leesbaar maken: profiel-id → naam, bekende ids → vertaling. */
function waarde(veld, v) {
    if (v === null || v === undefined || v === "")
        return veld === "verantwoordelijke" || veld === "wieRegelt" ? t("waarde.niemand") : "—";
    if (UUID.test(v))
        return persoon(v);
    const sleutel = `waarde.${veld}.${v}`;
    return i18n.exists(`lib.auditStore.${sleutel}`) ? t(sleutel) : i18n.exists(`lib.auditStore.waarde.${v}`) ? t(`waarde.${v}`) : v;
}
const veldLabel = (v) => (i18n.exists(`lib.auditStore.veld.${v}`) ? t(`veld.${v}`) : v);
const kindNamen = (ids) => ids.map((id) => startState().kinderen.find((k) => k.id === id)?.naam).filter(Boolean);
/** Server-event → het bestaande weergavemodel (bevroren). */
function vanServer(e) {
    const actorId = e.actor_id;
    const wijzigingen = (e.changes ?? []).map((w) => Object.freeze({ get veld() { return veldLabel(w.veld); }, get oud() { return waarde(w.veld, w.oud); }, get nieuw() { return waarde(w.veld, w.nieuw); }, veldId: w.veld }));
    return Object.freeze({
        eventId: e.id,
        soort: e.section,
        itemId: e.entity_id ?? "",
        itemNaam: e.label ?? "",
        actorId,
        get actorNaam() { return persoon(actorId, e.actor_name); },
        get actorRol() { return t("rol.ouder"); },
        actie: e.action,
        moment: e.created_at,
        wijzigingen: Object.freeze(wijzigingen),
        kindIds: Object.freeze([...(e.child_ids ?? [])]),
        get kinderen() { return kindNamen(e.child_ids ?? []); },
        meta: Object.freeze({ ...(e.meta ?? {}) }),
        lokaal: !!e.lokaal,
    });
}
/** Echte geschiedenis: van de server (log-audit list). Er staan hier bewust geen voorbeeldgebeurtenissen in. */
let events = Object.freeze([]);
const listeners = new Set();
const meld = () => listeners.forEach((l) => l());
const zetEvents = (l) => { events = Object.freeze([...l].sort((a, b) => a.moment.localeCompare(b.moment))); meld(); };
const sync = serverBron({
    laad: async () => {
        const r = await api("log-audit", "list", { limit: 1000 });
        const lokaal = events.filter((e) => e.lokaal);
        zetEvents([...(r.events ?? []).map(vanServer), ...lokaal]);
    },
    wis: () => zetEvents([]),
});
/** Opnieuw ophalen (na een actie van een andere store die server-side heeft gelogd). */
export const verversAudit = () => sync.ververs();
const oudeActie = { toegevoegd: "CREATED", gewijzigd: "UPDATED", verwijderd: "DELETED" };
/** Kindnamen of -ids → server-ids (onbekende namen vallen weg). */
function kindIdsUit(extra) {
    if (extra?.kindIds)
        return extra.kindIds;
    const kids = startState().kinderen;
    return [...new Set((extra?.kinderen ?? []).map((n) => kids.find((k) => k.id === n || k.naam === n)?.id).filter(Boolean))];
}
/**
 * Enige schrijfactie vanuit de browser (voor stores zonder eigen serverfunctie): een nieuw event.
 * De actor is altijd de ingelogde ouder (server). Privé-items (extra.prive) worden nooit gelogd.
 * Stores MET een eigen serverfunctie loggen server-side (_shared/practical-audit.ts) en roepen dit niet aan.
 */
export function leg(soort, itemId, itemNaam, actie, wijziging, _door, extra) {
    if (extra?.prive)
        return;
    if (wijziging && wijziging.oud === wijziging.nieuw)
        return;
    let code = oudeActie[actie] ?? actie;
    if (code === "UPDATED" && wijziging?.veld === "status") {
        if (wijziging.nieuw === "geaccepteerd")
            code = "ACCEPTED";
        else if (wijziging.nieuw === "geweigerd")
            code = "DECLINED";
    }
    stuur({ section: soort, item_id: itemId ?? null, item_label: itemNaam ?? null, audit_action: code, changes: wijziging ? [{ veld: wijziging.veld, oud: String(wijziging.oud ?? ""), nieuw: String(wijziging.nieuw ?? "") }] : [], child_ids: kindIdsUit(extra), meta: extra?.meta ?? {} });
}
/** Vergelijk twee versies van een item veld voor veld en leg de verschillen vast als één event. */
export function legVerschillen(soort, itemId, itemNaam, oud, nieuw, velden, _door, extra) {
    const wijzigingen = Object.keys(velden)
        .map((k) => ({ veld: velden[k], oud: String(oud[k] ?? "—"), nieuw: String(nieuw[k] ?? "—") }))
        .filter((x) => x.oud !== x.nieuw);
    if (!wijzigingen.length || extra?.prive)
        return;
    const status = wijzigingen.find((x) => x.veld === "status")?.nieuw;
    const actie = status === "geaccepteerd" ? "ACCEPTED" : status === "geweigerd" ? "DECLINED" : "UPDATED";
    stuur({ section: soort, item_id: itemId ?? null, item_label: itemNaam ?? null, audit_action: actie, changes: wijzigingen, child_ids: kindIdsUit(extra), meta: extra?.meta ?? {} });
}
/** Direct lokaal tonen (append-only), daarna naar de server; het serverevent vervangt het lokale. */
function stuur(body) {
    const ik = authState().gebruiker;
    const lokaalId = `lokaal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const ev = vanServer({ id: lokaalId, actor_id: ik?.id ?? "", actor_name: ik?.name ?? "", section: body.section, entity_id: body.item_id, label: body.item_label, action: body.audit_action, changes: body.changes, child_ids: body.child_ids, meta: body.meta, created_at: new Date().toISOString(), lokaal: true });
    zetEvents([...events, ev]);
    if (!ik || typeof window === "undefined")
        return;
    api("log-audit", "log", body).then((r) => {
        zetEvents([...events.filter((e) => e.eventId !== lokaalId), ...(r.event ? [vanServer(r.event)] : [])]);
    }).catch(() => { });
}
export function useAudit() {
    sync.zorg();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => events, () => events);
}
export const alleRegels = () => { sync.zorg(); return events; };
export const momentTekst = (iso) => new Date(iso).toLocaleString(taalLocale(), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(" om", " ·").replace(" at", " ·");
// Actiecodes (CREATED, …) → tekst via lib.auditStore.actie.<code>.
/** Korte, feitelijke kop voor een event (zonder interpretatie). */
export function eventKop(e) {
    if (e.actie === "UPDATED" && e.wijzigingen.length === 1)
        return t("kopWijzigde", { actor: e.actorNaam, veld: e.wijzigingen[0].veld });
    return t("kop", { soort: soortLabel[e.soort] ?? e.soort, actie: t(`actie.${e.actie}`), actor: e.actorNaam });
}
/** Regels "oud → nieuw" voor weergave. */
export const eventWijzigingen = (e) => e.wijzigingen.map((x) => `${x.veld}: ${x.oud} → ${x.nieuw}`);
export function regelTekst(e) {
    const wz = eventWijzigingen(e);
    return wz.length ? `${eventKop(e)} · ${wz.join(" · ")}` : eventKop(e);
}
