import i18n from "@/i18n";
import { api, foutTekst } from "@/lib/api";
/**
 * Alle AI van Co loopt via edge functions (`api(functie, actie, …)`): de prompts en de OpenAI-sleutel staan
 * alleen op de server, die ook de sessie en een limiet per gebruiker controleert. Deze helper zet een
 * serverfout om in de bestaande, vertaalde melding van de aanroepende functie (`${ns}.fout.<sleutel>`),
 * zodat schermen ongewijzigd `e.message` kunnen tonen.
 * `sleutels`: { druk, nietIngesteld, onleesbaar?, anders } — namen van bestaande vertaalsleutels.
 */
export async function aiAanroep(functie, actie, velden, ns, sleutels) {
    try {
        return await api(functie, actie, velden);
    }
    catch (e) {
        const code = e?.code;
        const sleutel = code === "RATE_LIMITED" ? sleutels.druk
            : code === "NOT_CONFIGURED" ? sleutels.nietIngesteld
                : code === "VALIDATION" && sleutels.onleesbaar ? sleutels.onleesbaar
                    : code === "UNAUTHORIZED" || code === "FORBIDDEN" || code === "NOT_FOUND" ? null
                        : sleutels.anders;
        const bericht = sleutel ? i18n.t(`${ns}.fout.${sleutel}`, sleutels.opties ?? {}) : foutTekst(e);
        const fout = new Error(bericht);
        fout.code = code;
        throw fout;
    }
}
