const SLEUTEL = "evaluaties-v1";
export function leesEvaluaties() {
    try {
        const r = localStorage.getItem(SLEUTEL);
        return r ? JSON.parse(r) : [];
    }
    catch {
        return [];
    }
}
export function schrijfEvaluaties(l) {
    try {
        localStorage.setItem(SLEUTEL, JSON.stringify(l));
    }
    catch { /* alleen deze sessie */ }
}
/** Tijd voor een nieuwe evaluatie: de laatste is een half jaar (182 dagen) of langer geleden. */
export function evaluatieNodig(l, nu = new Date()) {
    const laatste = l[0];
    if (!laatste)
        return false;
    return (nu.getTime() - new Date(laatste.datum).getTime()) / 864e5 >= 182;
}
