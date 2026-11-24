import { describe, expect, test } from "bun:test";
// Phase 2: de prompts staan server-side (supabase/functions/_shared); de test leest ze daar.
import { coPersoonlijkheid } from "../../supabase/functions/_shared/ai-co-persoonlijkheid.js";
import { bouwCoachVerzoek } from "../../supabase/functions/_shared/ai-coach-prompts.js";
import { systeem as verhaalSysteem } from "../../supabase/functions/_shared/ai-verhaal-prompts.js";
describe("Co-persoonlijkheid", () => {
    test("bevat de kern van de vaste stijl", () => {
        for (const kern of ["Je bent Co", "BIFF", "EAR", "je\" en \"jij", "0800-2000", "112", "geen reactie niet automatisch akkoord", "verstuurt nooit zelfstandig berichten"]) {
            expect(coPersoonlijkheid).toContain(kern);
        }
    });
    test("verbiedt partij kiezen en moreel drukmiddel over het kind", () => {
        expect(coPersoonlijkheid).toContain("kies geen partij");
        expect(coPersoonlijkheid).toContain("moreel drukmiddel");
    });
    test("zit in de schrijfhulp-instructies (schrijven én antwoorden)", () => {
        const schrijven = bouwCoachVerzoek({ tekst: "hoi", stijl: "Rustiger" });
        const antwoorden = bouwCoachVerzoek({ tekst: "hoi", stijl: "antwoord" });
        expect(schrijven.instructions).toContain("Je bent Co");
        expect(antwoorden.instructions).toContain("Je bent Co");
    });
    test("zit in de verhaal-instructies van Co", () => {
        expect(verhaalSysteem).toContain("Je bent Co");
        expect(verhaalSysteem).toContain("BIFF");
    });
});
describe("Co volgens de feedback van de opdrachtgever", () => {
    test("erkent eerst gevoelens, dan praktische suggesties, en voert nooit zelf iets uit", () => {
        expect(verhaalSysteem).toContain("Erken eerst kort en echt wat de ouder voelt");
        expect(verhaalSysteem).toContain("Geef daarna één of twee praktische suggesties");
        expect(verhaalSysteem).toContain("respectvol bericht");
        expect(coPersoonlijkheid).toContain("wijzigt nooit zelf de agenda, de zorgregeling of afspraken");
    });
});
