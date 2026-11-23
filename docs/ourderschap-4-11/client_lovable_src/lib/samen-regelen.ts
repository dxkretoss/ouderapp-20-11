import type { Voorstel } from "./zorg-store";
import { nodig, wachtOpMij, type Afspraak } from "./afspraken-store";
import type { Budget } from "./budget-store";
import type { Vakantie } from "./vakantie-store";

export type ReactieStatus = "Wacht op jou" | "Wacht op de ander" | "Afgerond";
export const zorgReactie = (v: Voorstel): ReactieStatus => v.status !== "open" ? "Afgerond" : v.van === "Sanne" ? "Wacht op de ander" : "Wacht op jou";
export const afspraakReactie = (a: Afspraak): ReactieStatus => !a.voorstel || !nodig(a.voorstel).length ? "Afgerond" : wachtOpMij(a) ? "Wacht op jou" : "Wacht op de ander";
export const budgetReactie = (b: Budget): ReactieStatus => b.status !== "wacht" && b.status !== "tegenvoorstel" ? "Afgerond" : b.aanZet === "Sanne" ? "Wacht op jou" : "Wacht op de ander";
export const vakantieReactie = (v: Vakantie): ReactieStatus => v.status !== "voorstel" ? "Afgerond" : v.van === "Sanne" ? "Wacht op de ander" : "Wacht op jou";