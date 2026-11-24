import { describe, expect, test, beforeEach } from "bun:test";
import { accepteerHulp, hulpKandidaten, hulpState, resetHulpVoorTest, takenState, vraagHulp } from "./taken-store";
import { geenRechten, zetPersonenVoorTest } from "./kring-store";
// De kring komt nu van de server (geen voorbeeldpersonen meer): zet hier dezelfde drie personen neer.
const r = (p) => ({ ...geenRechten(), ...p });
const persoon = (id, rol, rechten, periode = { type: "doorlopend" }) => ({ id, naam: id, rol, periode, ingetrokken: false, uitgenodigd: true, bevestigd: true, rechten });
beforeEach(() => {
    zetPersonenVoorTest([
        persoon("marja", "Oma", { emma: r({ wissel: "bekijken", momentjes: "bijdragen", taken: "bekijken", spullen: "bekijken", agenda: "bekijken", nood: "bekijken" }), noah: r({ wissel: "bekijken", momentjes: "bekijken" }) }),
        persoon("peter", "Opa", { emma: r({ momentjes: "bekijken" }), noah: r({ momentjes: "bekijken" }) }),
        persoon("lisa", "Oppas", { emma: r({ wissel: "bekijken", nood: "bekijken", agenda: "bekijken" }), noah: r({ wissel: "bekijken", nood: "bekijken" }) }, { type: "tot", eind: "2099-07-24" }),
    ]);
    resetHulpVoorTest();
});
describe("hulpverzoek", () => {
    test("alleen bevoegde kringpersonen ontvangen het verzoek", () => {
        expect(hulpKandidaten("emma").map((p) => p.id)).toEqual(["marja", "lisa"]);
        const id = vraagHulp({ kind: "emma", wat: "Emma ophalen", datum: "2027-03-12", tijd: "15:00", ontvangers: ["marja", "peter"] });
        expect(hulpState().find((h) => h.id === id).ontvangers).toEqual(["marja"]);
    });
    test("eerste acceptatie wint, tweede wordt geweigerd", () => {
        const id = vraagHulp({ kind: "emma", wat: "Emma ophalen", datum: "2027-03-12", tijd: "15:00", ontvangers: ["marja", "lisa"] });
        expect(accepteerHulp(id, "lisa")).toBe(true);
        expect(accepteerHulp(id, "marja")).toBe(false);
        const h = hulpState().find((x) => x.id === id);
        expect(h.geaccepteerdDoor).toBe("lisa");
        expect(takenState().taken.filter((t) => t.id === h.taakId && t.wie === "lisa")).toHaveLength(1);
    });
});
