/**
 * Onderdelen die buiten Milestone 1–2 vallen en nog alleen voorbeeldgegevens tonen. Tot ze echt
 * gebouwd zijn, zijn ze verborgen: geen menu-ingang, en een directe link gaat terug naar Home.
 * - /gesprekken: bellen en gespreksverslagen (uitgesloten in deze fase)
 * - /abonnement: abonnementen (Milestone 3, Stripe)
 * - /professionals, /begeleider-gesprek: professionele omgeving (Milestone 3)
 * - e-mailkoppeling: externe e-mail in Berichten (uitgesloten in deze fase)
 */
export const NIET_IN_DEZE_FASE = ["/gesprekken", "/abonnement", "/professionals", "/begeleider-gesprek"];
export const emailKoppelingAan = false;
export const professionalsAan = false;
export const isNietInDezeFase = (pad) => NIET_IN_DEZE_FASE.some((p) => pad === p || pad.startsWith(p + "/"));
