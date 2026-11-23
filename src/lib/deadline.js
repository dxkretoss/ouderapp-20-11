const maanden = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Engelse varianten: "by 18 October", "before Friday 3 Nov", "deadline: October 18th". */
function vindEngels(t) {
    const dagEerst = t.match(/\b(?:by|before|no later than|deadline:?|due(?: by| on)?|please by)\s+(?:\w+day,?\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,})/);
    if (dagEerst) {
        const mi = months.findIndex((x) => x.startsWith(dagEerst[2].slice(0, 3)));
        if (mi >= 0)
            return { mi, dag: Number(dagEerst[1]) };
    }
    const maandEerst = t.match(/\b(?:by|before|no later than|deadline:?|due(?: by| on)?|please by)\s+(?:\w+day,?\s+)?([a-z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (maandEerst) {
        const mi = months.findIndex((x) => x.startsWith(maandEerst[1].slice(0, 3)));
        if (mi >= 0)
            return { mi, dag: Number(maandEerst[2]) };
    }
    return null;
}
/** Herkent "uiterlijk 18 oktober" / "vóór 3 nov" (en Engelse varianten) in tekst. Alleen een voorstel; slaat zelf niets op. */
export function vindDeadline(tekst, vandaag = new Date()) {
    const t = tekst.toLowerCase();
    const m = t.match(/(?:uiterlijk|v[oó]{2}r|deadline|graag voor)\s+(?:\w+dag\s+)?(\d{1,2})\s+([a-z]{3,})/);
    let mi = m ? maanden.findIndex((x) => x.startsWith(m[2].slice(0, 3))) : -1;
    let dag = m ? Number(m[1]) : 0;
    if (mi < 0) {
        const e = vindEngels(t);
        if (!e)
            return null;
        mi = e.mi;
        dag = e.dag;
    }
    let jaar = vandaag.getFullYear();
    const d = new Date(Date.UTC(jaar, mi, dag));
    if (d.getTime() < vandaag.getTime() - 864e5)
        jaar += 1;
    return `${jaar}-${String(mi + 1).padStart(2, "0")}-${String(dag).padStart(2, "0")}`;
}
