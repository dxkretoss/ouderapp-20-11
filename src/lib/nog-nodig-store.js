import { useSyncExternalStore } from "react";
import { api, foutTekst } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
import { meldFout } from "@/lib/feedback";
import { startState, useStart } from "@/lib/start-store";
import { kindTekst } from "@/lib/kosten-store";
/**
 * "Nog nodig" van het eigen gezin (manage-still-needed). Gedeelde lijst van beide ouders; een item
 * houdt alleen een optionele budgetId bij en wordt nooit vanzelf een uitgave of budget.
 * Zelfde bedieningsvorm als useLijst (KleineLijst): { lijst, voegToe, toggle, verwijder, zetKoper, koppelBudget }.
 */
let ruw = [];
let ik = null;
let geladenVoor = null;
let bezig = null;
let laatste = 0;
const luisteraars = new Set();
const meld = () => luisteraars.forEach((l) => l());
const fout = (e) => { if (e?.code !== "UNAUTHORIZED") meldFout(foutTekst(e)); };
let gekoppeld = false;
function koppel() {
    if (gekoppeld || typeof window === "undefined")
        return;
    gekoppeld = true;
    opAuth(() => {
        const g = authState().gebruiker;
        if (geladenVoor && (!g || g.id !== geladenVoor || authState().status !== "aan")) {
            ruw = [];
            geladenVoor = null;
            meld();
        }
    });
    window.addEventListener("focus", () => { if (geladenVoor && Date.now() - laatste > 10000)
        laadNogNodig(); });
}
export async function laadNogNodig() {
    const a = authState();
    if (a.status !== "aan" || !a.gebruiker || bezig)
        return bezig;
    const voor = a.gebruiker.id;
    laatste = Date.now();
    bezig = (async () => {
        try {
            const r = await api("manage-still-needed", "list");
            if (authState().gebruiker?.id !== voor)
                return;
            ruw = r.items ?? [];
            ik = voor;
        }
        catch (e) {
            fout(e);
        }
        finally {
            geladenVoor = voor;
            bezig = null;
            meld();
        }
    })();
    return bezig;
}
function zorg() {
    koppel();
    const a = authState();
    if (a.status === "aan" && a.gebruiker && geladenVoor !== a.gebruiker.id && !bezig)
        laadNogNodig();
}
let cache = null;
let sleutel = [];
function lijst() {
    const kinderen = startState().kinderen;
    if (cache && sleutel[0] === ruw && sleutel[1] === kinderen)
        return cache;
    cache = ruw.map((i) => ({
        id: i.id,
        tekst: i.title,
        wie: i.category ?? "Nodig",
        kindIds: i.child_ids ?? [],
        kind: kindTekst(i.child_ids, kinderen),
        klaar: !!i.is_purchased,
        ...(i.budget_id ? { budgetId: i.budget_id } : {}),
        ...(i.buyer_id ? { koper: i.buyer_id === ik ? "ik" : "ander" } : {}),
        ...(i.deadline ? { deadline: i.deadline } : {}),
        gedeeld: !!i.other_parent_id,
    }));
    sleutel = [ruw, kinderen];
    return cache;
}
const vervang = (item) => { ruw = ruw.map((x) => (x.id === item.id ? item : x)); meld(); };
async function wijzig(id, patch, actie, velden) {
    const oud = ruw.find((x) => x.id === id);
    if (!oud)
        return false;
    vervang({ ...oud, ...patch });
    try {
        const r = await api("manage-still-needed", actie, { id, ...velden });
        if (r.item)
            vervang(r.item);
        return true;
    }
    catch (e) {
        ruw = ruw.some((x) => x.id === id) ? ruw.map((x) => (x.id === id ? oud : x)) : [oud, ...ruw];
        meld();
        fout(e);
        return false;
    }
}
export const nogNodig = {
    /** Nieuw item: tekst, soort ("Nodig"|"Boodschap"), kindIds, al gekocht? Geeft (async) het id of null. */
    voegToe: async (tekst, wie, kindIds = [], klaar = false, budgetId) => {
        const tijdelijk = { id: `tmp-${Date.now()}`, title: tekst, category: wie, child_ids: kindIds, is_purchased: klaar, budget_id: budgetId ?? null, other_parent_id: null };
        ruw = [tijdelijk, ...ruw];
        meld();
        try {
            const r = await api("manage-still-needed", "create", { title: tekst, category: wie, child_ids: kindIds, is_purchased: klaar, budget_id: budgetId ?? null });
            ruw = ruw.map((x) => (x.id === tijdelijk.id ? r.item : x));
            meld();
            return r.item.id;
        }
        catch (e) {
            ruw = ruw.filter((x) => x.id !== tijdelijk.id);
            meld();
            fout(e);
            return null;
        }
    },
    toggle: (id) => { const i = ruw.find((x) => x.id === id); return i ? wijzig(id, { is_purchased: !i.is_purchased }, "toggle", { is_purchased: !i.is_purchased }) : false; },
    koppelBudget: (id, budgetId) => wijzig(id, { budget_id: budgetId }, "link_budget", { budget_id: budgetId }),
    /** Alleen "ik koop het" of ongedaan maken; de andere ouder aanwijzen kan niet. */
    zetKoper: (id, koper) => wijzig(id, { buyer_id: koper === "ik" ? ik : null }, "set_buyer", { buyer: koper === "ik" ? "me" : null }),
    verwijder: async (id) => {
        const oud = ruw.find((x) => x.id === id);
        if (!oud)
            return false;
        ruw = ruw.filter((x) => x.id !== id);
        meld();
        try {
            await api("manage-still-needed", "delete", { id });
            return true;
        }
        catch (e) {
            ruw = [oud, ...ruw];
            meld();
            fout(e);
            return false;
        }
    },
};
/** Koppeling vanuit een budgetvoorstel aan het item waar het voorstel vandaan kwam. */
export const koppelNogNodigBudget = (id, budgetId) => nogNodig.koppelBudget(id, budgetId);
export function useNogNodig() {
    useStart();
    const l = useSyncExternalStore((f) => { luisteraars.add(f); zorg(); return () => luisteraars.delete(f); }, lijst, lijst);
    return { lijst: l, geladen: geladenVoor !== null, ...nogNodig };
}
