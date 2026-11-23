import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
export function VoorstelIntrekken({ onBevestig }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    return <>
    <Button variant="ghost" size="sm" className="text-ink-soft" onClick={() => setOpen(true)}>{t("common.voorstelIntrekken")}</Button>
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-xl shadow-none sm:max-w-md">
        <AlertDialogTitle>{t("components.VoorstelIntrekken.titel")}</AlertDialogTitle>
        <AlertDialogDescription>{t("components.VoorstelIntrekken.beschrijving")}</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel>{t("common.terug")}</AlertDialogCancel><AlertDialogAction onClick={onBevestig}>{t("components.VoorstelIntrekken.ja")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
