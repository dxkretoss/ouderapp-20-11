import i18n from "@/i18n";
const t = (k) => i18n.t(`lib.besluitenData.${k}`);
// Tekst via getters, zodat de taal pas bij het lezen wordt bepaald. `soort` is een opgeslagen waarde (label in routes.beslissingen.soort).
// `wanneer` blijft een Nederlandse bronwaarde ("2 mrt 09:30 uur"): exporteren leest die terug; tonen vertaalt de maand.
const log = (id, n, wanneer, wie) => ({ wanneer, wie, get wat() { return t(`log.b${id}.r${n}`); } });
export const start = [
    { id: 1, get titel() { return t("titel.b1"); }, soort: "Schoolkeuze", kind: "emma", sanne: "akkoord", modus: "goedkeuring", log: [log(1, 0, "10 mrt 20:14", "Sanne")] },
    { id: 2, get titel() { return t("titel.b2"); }, soort: "Medisch", kind: "noah", sanne: "akkoord", joris: "akkoord", modus: "goedkeuring", log: [
            log(2, 0, "2 mrt 09:30 uur", "Joris"),
            log(2, 1, "3 mrt 18:02 uur", "Sanne"),
            log(2, 2, "3 mrt 18:05 uur", "Joris"),
        ] },
];
