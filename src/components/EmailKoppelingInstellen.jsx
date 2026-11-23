import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/AppShell";
import { MetChevron } from "@/components/Tekens";
import { geldigEmail, stelKoppelingIn, stopKoppeling, useEmailKoppeling, wijzigAdres } from "@/lib/email-koppeling-store";
/** Solo → Communicatie: e-mail van andere ouder koppelen, wijzigen of stoppen. */
export function EmailKoppelingInstellen() {
    const { t } = useTranslation();
    const { koppeling, archief } = useEmailKoppeling();
    const [email, setEmail] = useState("");
    const [naam, setNaam] = useState("");
    const [modus, setModus] = useState("rust");
    const invoer = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-normal text-ink";
    return (<Card className="mt-3" id="email-koppeling">
      <p className="text-sm font-semibold">{t("components.EmailKoppelingInstellen.titel")}</p>
      <p className="mt-1 text-xs text-ink-soft">{t("components.EmailKoppelingInstellen.uitleg")}</p>

      {!koppeling ? (<form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (geldigEmail(email)) {
            stelKoppelingIn(email, naam);
            setEmail("");
            setNaam("");
        } }}>
          <label className="block text-xs font-semibold text-ink-soft">{t("components.EmailKoppelingInstellen.emailAndereOuder")}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("components.EmailKoppelingInstellen.placeholderEmail")} className={invoer}/>
          </label>
          <label className="block text-xs font-semibold text-ink-soft">{t("components.EmailKoppelingInstellen.naamOptioneel")}
            <input value={naam} onChange={(e) => setNaam(e.target.value)} className={invoer}/>
          </label>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-ink-soft">
            <li>{t("components.EmailKoppelingInstellen.punt1")}</li>
            <li>{t("components.EmailKoppelingInstellen.punt2")}</li>
            <li>{t("components.EmailKoppelingInstellen.punt3")}</li>
          </ul>
          <button disabled={!geldigEmail(email)} className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">{t("components.EmailKoppelingInstellen.instellen")}</button>
        </form>) : (<div className="mt-3 space-y-2">
          <div className="rounded-md bg-surface px-3 py-2.5">
            <p className="text-[11px] text-ink-soft">{t("components.EmailKoppelingInstellen.gekoppeld")}</p>
            <p className="text-sm font-semibold">{koppeling.email}</p>
            {koppeling.naam ? <p className="text-xs text-ink-soft">{koppeling.naam}</p> : null}
          </div>
          <Link to="/berichten" className="inline-flex min-h-10 items-center text-xs font-semibold text-brand"><MetChevron>{t("components.EmailKoppelingInstellen.naarConversatie")}</MetChevron></Link>
          {modus === "rust" ? (<div className="flex gap-2">
              <button onClick={() => setModus("wijzig")} className="flex-1 rounded-md border border-border py-2 text-xs font-semibold">{t("components.EmailKoppelingInstellen.wijzigen")}</button>
              <button onClick={() => setModus("stop")} className="flex-1 rounded-md border border-border py-2 text-xs font-semibold">{t("components.EmailKoppelingInstellen.stoppen")}</button>
            </div>) : null}
          {modus === "wijzig" ? (<form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (geldigEmail(email)) {
                wijzigAdres(email);
                setEmail("");
                setModus("rust");
            } }}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("components.EmailKoppelingInstellen.placeholderNieuw")} className={invoer}/>
              <p className="text-[11px] text-ink-soft">{t("components.EmailKoppelingInstellen.archiefUitleg")}</p>
              <div className="flex gap-2">
                <button disabled={!geldigEmail(email)} className="flex-1 rounded-md bg-brand py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">{t("common.opslaan")}</button>
                <button type="button" onClick={() => setModus("rust")} className="flex-1 rounded-md border border-border py-2 text-xs">{t("common.annuleren")}</button>
              </div>
            </form>) : null}
          {modus === "stop" ? (<div className="space-y-2 rounded-md bg-surface p-3">
              <p className="text-xs">{t("components.EmailKoppelingInstellen.naStoppen")}</p>
              <button onClick={() => { stopKoppeling(true); setModus("rust"); }} className="w-full rounded-md bg-brand py-2 text-xs font-semibold text-primary-foreground">{t("components.EmailKoppelingInstellen.stopBewaren")}</button>
              <button onClick={() => { stopKoppeling(false); setModus("rust"); }} className="w-full rounded-md border border-border py-2 text-xs font-semibold">{t("components.EmailKoppelingInstellen.stopVerwijderen")}</button>
              <p className="text-[11px] text-ink-soft">{t("components.EmailKoppelingInstellen.verwijderenUitleg")}</p>
              <button onClick={() => setModus("rust")} className="w-full py-1 text-xs text-ink-soft">{t("common.annuleren")}</button>
            </div>) : null}
        </div>)}
      {archief.length ? <p className="mt-2 text-[11px] text-ink-soft">{t("components.EmailKoppelingInstellen.archief", { count: archief.length })}</p> : null}
    </Card>);
}
