import { useEffect, useState } from "react";
/**
 * Onthoudt een kleine keuze op dit apparaat (zoals Samen/Emma/Noah), zodat de pagina
 * de volgende keer opent waar je was. Alleen gemak: zonder opslag werkt alles gewoon met de standaard.
 */
export function useOnthouden(sleutel, standaard, toegestaan) {
    const [waarde, setWaarde] = useState(standaard);
    useEffect(() => {
        try {
            const v = localStorage.getItem(`onthoud-${sleutel}`);
            if (v && toegestaan.includes(v))
                setWaarde(v);
        }
        catch { /* geen opslag */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sleutel]);
    const zet = (w) => {
        setWaarde(w);
        try {
            localStorage.setItem(`onthoud-${sleutel}`, w);
        }
        catch { /* geen opslag */ }
    };
    return [waarde, zet];
}
