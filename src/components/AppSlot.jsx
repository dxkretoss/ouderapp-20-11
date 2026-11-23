import { useTranslation } from "react-i18next";
import { AppLogo } from "@/components/AppLogo";
import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { ontgrendel } from "@/lib/app-slot";
import { pasThemaToe, useVoorkeuren } from "@/lib/voorkeuren-store";
const SESSIE = "onzeapp-ontgrendeld";
const NA_ACHTERGROND_MS = 60_000;
/** Rustig slotscherm; verschijnt alleen als "App vergrendelen" aanstaat. */
export function AppSlot() {
    const { t } = useTranslation();
    const { vergrendelId, thema } = useVoorkeuren();
    const [op, setOp] = useState(false);
    const [fout, setFout] = useState(false);
    useEffect(() => {
        pasThemaToe();
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const f = () => pasThemaToe();
        mq.addEventListener("change", f);
        return () => mq.removeEventListener("change", f);
    }, [thema]);
    useEffect(() => {
        if (!vergrendelId) {
            setOp(false);
            return;
        }
        if (sessionStorage.getItem(SESSIE) !== "1")
            setOp(true);
        let weg = 0;
        const zicht = () => {
            if (document.hidden)
                weg = Date.now();
            else if (weg && Date.now() - weg > NA_ACHTERGROND_MS) {
                sessionStorage.removeItem(SESSIE);
                setOp(true);
            }
        };
        document.addEventListener("visibilitychange", zicht);
        return () => document.removeEventListener("visibilitychange", zicht);
    }, [vergrendelId]);
    if (!op || !vergrendelId)
        return null;
    const probeer = async () => {
        setFout(false);
        if (await ontgrendel(vergrendelId)) {
            sessionStorage.setItem(SESSIE, "1");
            setOp(false);
        }
        else
            setFout(true);
    };
    return (<div className="fixed inset-0 z-[100] bg-background">
      <div className="mx-auto grid h-full max-w-md place-items-center border-[color-mix(in_oklab,var(--foreground)_16%,transparent)] px-8 text-center min-[30rem]:border-x">
      <div className="max-w-xs">
        <AppLogo className="mx-auto mb-7 w-60"/>
        <LockKeyhole className="mx-auto size-8 text-brand" strokeWidth={1.5}/>
        <h1 className="mt-4 font-display text-2xl">{t("components.AppSlot.titel")}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t("components.AppSlot.uitleg")}</p>
        <button onClick={probeer} className="mt-6 w-full rounded-md bg-brand py-3 text-sm font-semibold text-primary-foreground">{t("components.AppSlot.ontgrendelen")}</button>
        {fout ? <p className="mt-3 text-xs text-ink-soft">{t("components.AppSlot.fout")}</p> : null}
      </div>
      </div>
    </div>);
}
