import i18n from "@/i18n";
import { nodig, wachtOpMij } from "./afspraken-store";
const AFGEROND = () => i18n.t("lib.samenRegelen.afgerond");
const ANDER = () => i18n.t("lib.samenRegelen.wachtOpAnder");
const JOU = () => i18n.t("lib.samenRegelen.wachtOpJou");
export const zorgReactie = (v) => v.status !== "open" ? AFGEROND() : v.van === "Sanne" ? ANDER() : JOU();
export const afspraakReactie = (a) => !a.voorstel || !nodig(a.voorstel).length ? AFGEROND() : wachtOpMij(a) ? JOU() : ANDER();
export const budgetReactie = (b) => b.status !== "wacht" && b.status !== "tegenvoorstel" ? AFGEROND() : b.aanZet === "Sanne" ? JOU() : ANDER();
export const vakantieReactie = (v) => v.status !== "voorstel" ? AFGEROND() : v.van === "Sanne" ? ANDER() : JOU();
