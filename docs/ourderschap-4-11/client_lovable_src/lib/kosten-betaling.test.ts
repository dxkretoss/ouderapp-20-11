import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startVerrekening, reageerOpVerrekening, deelBetaalverzoek, useKosten, useVerrekenInstellingen, type Kost } from "./kosten-store";
import type { Verrekening } from "./verrekening";
const lees = () => {
  let kosten: Kost[] = []; let historie: Verrekening[] = [];
  function Bron() { kosten = useKosten(); historie = useVerrekenInstellingen().historie; return null; }
  renderToStaticMarkup(createElement(Bron));
  return { kosten, historie };
};
test("dezelfde posten krijgen geen tweede verrekening", () => {
  const eerste = startVerrekening("maand");
  expect(eerste).not.toBeNull();
  expect(startVerrekening("maand")?.id).toBe(eerste?.id);
});
test("link delen alleen door ontvanger en verandert kosten niet", () => {
  const v = startVerrekening("maand"); if (!v) throw new Error("Verrekening ontbreekt");
  const voor = JSON.stringify(lees().kosten);
  expect(deelBetaalverzoek(v.id, v.van, "https://tikkie.me/pay/test")).toBe(false);
  expect(deelBetaalverzoek(v.id, v.aan, "https://tikkie.me/pay/test")).toBe(true);
  expect(JSON.stringify(lees().kosten)).toBe(voor);
});
test("betaalmelding wijzigt geen kosten; ontvangst alleen gekoppelde posten, één keer", () => {
  const v = startVerrekening("maand"); if (!v) throw new Error("Verrekening ontbreekt");
  const voor = lees().kosten;
  expect(reageerOpVerrekening(v.id, v.van, "aangegeven")).toBe(true);
  expect(lees().kosten).toEqual(voor);
  expect(startVerrekening("maand")?.id).toBe(v.id);
  expect(reageerOpVerrekening(v.id, v.van, "ontvangen")).toBe(false);
  expect(reageerOpVerrekening(v.id, v.aan, "ontvangen")).toBe(true);
  expect(reageerOpVerrekening(v.id, v.aan, "ontvangen")).toBe(false);
  expect(lees().kosten.filter((k) => v.kostIds?.includes(k.id)).every((k) => k.status === "betaald")).toBe(true);
  expect(lees().kosten.filter((k) => !v.kostIds?.includes(k.id))).toEqual(voor.filter((k) => !v.kostIds?.includes(k.id)));
  expect(reageerOpVerrekening(v.id, v.aan, "afronden")).toBe(true);
  expect(reageerOpVerrekening(v.id, v.aan, "afronden")).toBe(false);
});