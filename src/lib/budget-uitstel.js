import i18n, { taalLocale } from "../i18n";
export function uitstelMoment(keuze, nu = new Date()) {
    const moment = new Date(nu);
    moment.setHours(20, 0, 0, 0);
    if (keuze === "morgen")
        moment.setDate(moment.getDate() + 1);
    if (keuze === "drie-dagen")
        moment.setDate(moment.getDate() + 3);
    return moment > nu ? moment.toISOString() : undefined;
}
export function geldigUitstelMoment(moment, nu = new Date()) {
    return Number.isFinite(new Date(moment).getTime()) && new Date(moment) > nu;
}
export function toonUitstelMoment(moment) {
    return i18n.t("lib.budgetUitstel.moment", { moment: new Date(moment).toLocaleString(taalLocale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) });
}
