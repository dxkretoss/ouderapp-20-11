import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Loader2, Mail, Send, UserCheck } from "lucide-react";
import { taalLocale } from "@/i18n";
import { start, useStart } from "@/lib/start-store";
import { foutTekst } from "@/lib/api";
import { bevestig, meldFout } from "@/lib/feedback";
import { ProfielBeeld } from "@/components/ProfielBeeld";
import { Vinkje } from "@/components/Tekens";
import { VELD } from "@/lib/ui-stijl";
const N = "components.AndereOuderUitnodigen.";
const OPEN = ["sent", "pending", "viewed"];
const veld = `mt-1 w-full font-normal ${VELD}`;
const knop = "flex w-full items-center justify-center gap-2 min-h-12 rounded-full bg-brand py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40";
/**
 * De andere ouder uitnodigen (send-invitation) en de stand tonen: gekoppelde ouder (list-connected)
 * en verstuurde uitnodigingen (list-sent), met intrekken. Alles via start-store, dat de server spiegelt.
 * `zonderGekoppeld`: de gekoppelde ouders niet tonen (Verbonden personen toont ze zelf, met ontkoppelen).
 */
export function AndereOuderUitnodigen({ zonderGekoppeld = false } = {}) {
    const { t } = useTranslation();
    const st = useStart();
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [kindIds, setKindIds] = useState(null);
    const [bezig, setBezig] = useState(false);
    const [fout, setFout] = useState(null);
    const [verstuurd, setVerstuurd] = useState(null);
    const [gekopieerd, setGekopieerd] = useState(false);
    // Bij openen de actuele stand ophalen (de andere ouder kan intussen geaccepteerd hebben).
    useEffect(() => { start.hydrateer(); }, []);
    const kinderen = st.kinderen.filter((k) => !String(k.id).startsWith("tmp-") && k.kanBewerken !== false);
    const gekozen = kindIds ?? kinderen.map((k) => k.id);
    const openUitnodigingen = st.uitnodigingen.filter((u) => OPEN.includes(u.status) && new Date(u.expires_at) > new Date());
    // Afgewezen of verlopen (laatste 60 dagen) blijven zichtbaar, zodat je weet wat er gebeurde en
    // opnieuw kunt uitnodigen. Niet als er voor hetzelfde adres al een nieuwe uitnodiging open staat.
    const sinds = Date.now() - 60 * 864e5;
    const openAdressen = new Set(openUitnodigingen.map((u) => u.to_email));
    const geslotenUitnodigingen = st.uitnodigingen.filter((u) => {
        const afgewezen = u.status === "declined" || u.status === "rejected";
        const verlopen = u.status === "expired" || (OPEN.includes(u.status) && new Date(u.expires_at) <= new Date());
        return (afgewezen || verlopen) && !openAdressen.has(u.to_email) && new Date(u.created_at ?? u.expires_at).getTime() > sinds;
    }).filter((u, i, l) => l.findIndex((x) => x.to_email === u.to_email) === i);
    const [opnieuwUitnodigenBezig, setOpnieuwUitnodigenBezig] = useState(null);
    const opnieuwUitnodigen = async (u) => {
        if (opnieuwUitnodigenBezig)
            return;
        setOpnieuwUitnodigenBezig(u.id);
        try {
            const kids = (u.child_ids ?? []).filter((id) => kinderen.some((k) => k.id === id));
            const r = await start.uitnodigen(u.to_email, kids.length ? kids : kinderen.map((k) => k.id));
            if (r.email_sent === false)
                meldFout(t(N + "mailMislukt"));
            else
                bevestig(t(N + "verstuurdKort"));
        }
        catch (e) {
            meldFout(foutTekst(e));
        }
        finally {
            setOpnieuwUitnodigenBezig(null);
        }
    };
    const geldig = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
    const naam = (id) => st.kinderen.find((k) => k.id === id)?.naam;
    const namen = (ids) => ids.map(naam).filter(Boolean).join(", ");
    const datum = (iso) => new Date(iso).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" });
    const versturen = async () => {
        if (!geldig || !gekozen.length)
            return;
        setBezig(true);
        setFout(null);
        try {
            const r = await start.uitnodigen(email, gekozen);
            setVerstuurd({ email: r.invitation.to_email, link: r.invite_link, mislukt: r.email_sent === false });
            if (r.email_sent === false)
                meldFout(t(N + "mailMislukt"));
            else
                bevestig(t(N + "verstuurdKort"));
            setEmail("");
            setOpen(false);
        }
        catch (e) {
            setFout(e.code ?? "SERVER");
        }
        setBezig(false);
    };
    // Opnieuw versturen (bijv. als de e-mail niet aankwam of niet verstuurd kon worden).
    const [opnieuwBezig, setOpnieuwBezig] = useState(null);
    const opnieuw = async (u) => {
        if (opnieuwBezig)
            return;
        setOpnieuwBezig(u.id);
        try {
            const r = await start.opnieuwUitnodigen(u.id);
            if (r.email_sent === false)
                meldFout(t(N + "mailMislukt"));
            else
                bevestig(t(N + "opnieuwVerstuurd"));
        }
        catch (e) {
            meldFout(foutTekst(e));
        }
        finally {
            setOpnieuwBezig(null);
        }
    };
    const kopieer = async (link) => {
        try {
            await navigator.clipboard.writeText(link);
            setGekopieerd(true);
            setTimeout(() => setGekopieerd(false), 2000);
        }
        catch { /* geen klembord */ }
    };
    return (<div className="mt-3 space-y-3">
      {(zonderGekoppeld ? [] : st.coOuders).map((c) => (<div key={c.id} className="flex items-center gap-3 rounded-md bg-card px-3 py-2.5">
          <ProfielBeeld beeld={c.avatar ?? undefined} naam={c.name} maat={36}/>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><UserCheck className="size-4 text-brand" strokeWidth={1.8} aria-hidden="true"/>{t(N + "gekoppeld", { naam: c.name })}</p>
            <p className="text-xs text-ink-soft">{c.child_ids?.length ? t(N + "deelt", { kinderen: namen(c.child_ids) }) : t(N + "sinds", { datum: datum(c.connected_at) })}</p>
          </div>
        </div>))}

      {geslotenUitnodigingen.length ? (<div>
          <p className="text-xs font-semibold text-ink-soft">{t(N + "geslotenKop")}</p>
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {geslotenUitnodigingen.map((u) => {
                const afgewezen = u.status === "declined" || u.status === "rejected";
                return (<li key={u.id} className="py-3">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-ink-soft" strokeWidth={1.6} aria-hidden="true"/>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{u.to_email}</p>
                    <p className={`mt-1 text-xs font-semibold leading-snug ${afgewezen ? "text-destructive" : "text-ink-soft"}`}>{afgewezen ? t(N + "afgewezen") : t(N + "verlopen")}{u.child_ids?.length ? ` · ${namen(u.child_ids)}` : ""}</p>
                  </div>
                </div>
                {kinderen.length ? (<div className="mt-3">
                    <button type="button" onClick={() => opnieuwUitnodigen(u)} disabled={opnieuwUitnodigenBezig === u.id} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft px-3 text-xs font-semibold text-brand disabled:opacity-60">
                      {opnieuwUitnodigenBezig === u.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/> : <Send className="size-3.5" strokeWidth={1.8} aria-hidden="true"/>}
                      {opnieuwUitnodigenBezig === u.id ? t(N + "opnieuwBezig") : t(N + "opnieuwUitnodigen")}
                    </button>
                  </div>) : null}
              </li>);
            })}
          </ul>
        </div>) : null}

      {openUitnodigingen.length ? (<div>
          <p className="text-xs font-semibold text-ink-soft">{t(N + "openKop")}</p>
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {openUitnodigingen.map((u) => (<li key={u.id} className="py-3">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.6} aria-hidden="true"/>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{u.to_email}</p>
                    {u.email_status === "failed"
                    ? <p className="mt-1 text-xs font-semibold leading-snug text-destructive">{t(N + "nietVerstuurd")}{u.child_ids?.length ? ` · ${namen(u.child_ids)}` : ""}</p>
                    : <p className="mt-1 text-xs leading-snug text-ink-soft">{t(N + "wacht", { datum: datum(u.expires_at) })}{u.child_ids?.length ? ` · ${namen(u.child_ids)}` : ""}</p>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => opnieuw(u)} disabled={opnieuwBezig === u.id} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft px-3 text-xs font-semibold text-brand disabled:opacity-60">
                    {opnieuwBezig === u.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/> : <Send className="size-3.5" strokeWidth={1.8} aria-hidden="true"/>}
                    {opnieuwBezig === u.id ? t(N + "opnieuwBezig") : t(N + "opnieuw")}
                  </button>
                  <button type="button" onClick={() => start.annuleerUitnodiging(u.id)} disabled={opnieuwBezig === u.id} className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-ink-soft disabled:opacity-60">{t(N + "intrekken")}</button>
                </div>
              </li>))}
          </ul>
        </div>) : null}

      {verstuurd ? (<div role="status" className="rounded-md bg-card px-3 py-2.5 text-xs">
          {verstuurd.mislukt
                ? <p className="text-destructive">{t(N + "mailMisluktLink", { email: verstuurd.email })}</p>
                : <p className="flex items-start gap-1 text-brand"><Vinkje className="mt-px size-3.5 shrink-0"/><span>{t(N + "verstuurd", { email: verstuurd.email })}</span></p>}
          {verstuurd.link ? <button type="button" onClick={() => kopieer(verstuurd.link)} className="mt-1 flex min-h-10 items-center gap-2 font-semibold text-brand"><Copy className="size-4" strokeWidth={1.6} aria-hidden="true"/>{gekopieerd ? t(N + "gekopieerd") : t(N + "kopieer")}</button> : null}
        </div>) : null}

      {!kinderen.length ? <p className="text-xs text-ink-soft">{t(N + "eerstKind")}</p> : !open ? (<button type="button" onClick={() => setOpen(true)} className={knop}>{st.coOuders.length || openUitnodigingen.length ? t(N + "nogEen") : t("routes.solo.samen.knop")}</button>) : (<form noValidate className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); versturen(); }}>
          <label className="block text-xs font-semibold text-ink-soft">{t(N + "email")}
            <input type="email" autoFocus autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setFout(null); }} aria-invalid={fout ? true : undefined} placeholder={t("routes.registreren.emailPlaceholder")} className={veld}/>
          </label>
          <fieldset>
            <legend className="text-xs font-semibold text-ink-soft">{t(N + "welkeKinderen")}</legend>
            <div className="mt-1 space-y-1">
              {kinderen.map((k) => (<label key={k.id} className="flex min-h-10 items-center gap-2">
                  <input type="checkbox" checked={gekozen.includes(k.id)} onChange={() => setKindIds(gekozen.includes(k.id) ? gekozen.filter((x) => x !== k.id) : [...gekozen, k.id])} className="size-4 accent-[var(--brand)]"/>
                  {k.naam}
                </label>))}
            </div>
          </fieldset>
          <p className="text-[11px] text-ink-soft">{t(N + "uitleg")}</p>
          {fout ? <p role="alert" className="text-xs font-semibold text-[#A4533E]">{foutTekst(fout)}</p> : null}
          <button type="submit" disabled={!geldig || !gekozen.length || bezig} className={knop}>{bezig ? <Loader2 className="size-4 animate-spin" aria-hidden="true"/> : null}{t(N + "versturen")}</button>
          <button type="button" onClick={() => { setOpen(false); setFout(null); }} className="w-full text-center text-xs font-semibold text-ink-soft">{t("common.annuleren")}</button>
        </form>)}
    </div>);
}
