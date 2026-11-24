import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Copy, Mail, MessageCircle, Share2 } from "lucide-react";
import { useStart } from "@/lib/start-store";
import { mailUitnodiging, persoonLabel, rolNaam } from "@/lib/kring-store";
/** Deelt een unieke uitnodigingslink. De link alleen geeft geen toegang: de ontvanger moet inloggen en bevestigen. */
export function UitnodigingDelen({ p }) {
    const { t } = useTranslation();
    const [origin, setOrigin] = useState("");
    const [gekopieerd, setGekopieerd] = useState(false);
    const [kanDelen, setKanDelen] = useState(false);
    const [mail, setMail] = useState(null); // null | "bezig" | "ok" | "fout"
    const { kinderen } = useStart();
    useEffect(() => { setOrigin(window.location.origin); setKanDelen(typeof navigator.share === "function"); }, []);
    // Zonder sleutel (nog niet opgeslagen of al geaccepteerd/ingetrokken) is er niets te delen.
    if (!p.sleutel)
        return null;
    const link = `${origin}/uitnodiging?t=${encodeURIComponent(p.sleutel)}`;
    const kids = kinderen.filter((k) => p.rechten[k.id]).map((k) => k.naam).join(t("components.UitnodigingDelen.en"));
    const tekst = t("components.UitnodigingDelen.tekst", { naam: p.naam, rol: rolNaam(p.rol).toLowerCase(), kinderen: kids, link });
    const rij = "flex w-full items-center gap-3 py-3 text-left text-sm font-semibold";
    return (<div>
      <p className="mt-1 text-xs text-ink-soft">{t("components.UitnodigingDelen.voor", { naam: persoonLabel(p), rol: rolNaam(p.rol), kinderen: kids })}</p>
      <div className="mt-3 divide-y divide-border border-y border-border">
        {p.email ? <button className={rij} disabled={mail === "bezig" || mail === "ok"} onClick={async () => { setMail("bezig"); try {
        const r = await mailUitnodiging(p.id);
        setMail(r.email_sent ? "ok" : "fout");
    }
    catch {
        setMail("fout");
    } }}><Mail className="size-4 text-brand" strokeWidth={1.6}/>{mail === "ok" ? t("components.UitnodigingDelen.mailVerstuurd", { email: p.email }) : mail === "fout" ? t("components.UitnodigingDelen.mailMislukt") : t("components.UitnodigingDelen.email")}</button>
          : <a className={rij} href={`mailto:?subject=${encodeURIComponent(t("components.UitnodigingDelen.onderwerp"))}&body=${encodeURIComponent(tekst)}`}><Mail className="size-4 text-brand" strokeWidth={1.6}/>{t("components.UitnodigingDelen.email")}</a>}
        <a className={rij} href={`https://wa.me/?text=${encodeURIComponent(tekst)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4 text-brand" strokeWidth={1.6}/>{t("components.UitnodigingDelen.whatsapp")}</a>
        <button className={rij} onClick={async () => { try {
        await navigator.clipboard.writeText(link);
        setGekopieerd(true);
        setTimeout(() => setGekopieerd(false), 2000);
    }
    catch { /* geen klembord */ } }}>
          <Copy className="size-4 text-brand" strokeWidth={1.6}/>{gekopieerd ? t("components.UitnodigingDelen.gekopieerd") : t("components.UitnodigingDelen.kopieren")}
        </button>
        {kanDelen ? <button className={rij} onClick={() => navigator.share({ title: t("components.UitnodigingDelen.onderwerp"), text: tekst, url: link }).catch(() => { })}><Share2 className="size-4 text-brand" strokeWidth={1.6}/>{t("components.UitnodigingDelen.delen")}</button> : null}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">{t("components.UitnodigingDelen.uitleg", { naam: p.naam })}</p>
    </div>);
}
