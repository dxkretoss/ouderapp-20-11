# Openstaande voorstellen — wat Kretoss-backend nog moet leveren

Deze frontend toont het overzicht "Openstaande voorstellen / Wacht op reactie" volledig afgeleid uit de bestaande bronnen (zorgregeling, afspraken, budgetten, vakanties, losse kosten, aanwezigheid). Er is géén tweede voorstelsysteem gebouwd en er zijn geen backend-wijzigingen gedaan.

## Wat de frontend al doet
- Eén overzicht op Samen regelen: "Wacht op jouw reactie" en "Mijn voorstellen" met filters (Wacht op reactie / Reactie ontvangen / Afgerond / Alle).
- Statussen: Wacht op reactie, Meer tijd gevraagd, Tegenvoorstel ontvangen, Reactiedatum verstreken, Akkoord, Niet akkoord, Ingetrokken, Afgerond.
- Vrijwillige gewenste reactiedatum bij zorg- en budgetvoorstellen (verzoek, nooit bindend; verstrijken verandert nooit automatisch iets).
- Reactie "Meer tijd nodig" bij zorg- en budgetvoorstellen; het voorstel blijft open zonder instemming.
- Vriendelijke herinneringen, begrensd: max. 1 vóór en max. 1 ná de reactiedatum; pauzeerbaar via Instellingen (bijv. bij veiligheidsafspraken). Herinneringen zijn in-app, geen push.
- Home toont "Alles is afgestemd." als er niets open staat.
- Professionals: feitelijk Afstemmingsoverzicht (alleen aantallen en statussen, geen gedragsoordeel), zichtbaar binnen bestaande rechten (agenda/regeling).

## Wat Kretoss moet realiseren (nog niet beschikbaar)
1. **Twee gekoppelde ouderaccounts**: reacties, tegenvoorstellen en herinneringen moeten echt tussen twee accounts reizen; nu is alles demo/lokaal.
2. **Herinneringslevering**: server-side begrenzing afdwingen (max 1 vóór/na reactiedatum), rusttijden respecteren, pauze per gezin afdwingen bij veiligheids- of contactafspraken, en auditlogging van elke herinnering.
3. **Toegangscontrole**: professionals zien het afstemmingsoverzicht alleen binnen hun bevoegdheden per gezin/sectie/periode; nooit berichtinhoud of privénotities.
4. **Onveranderlijke historie**: intrekken, afwijzen en herinneringen blijven zichtbaar; niets wordt verwijderd of stil overschreven.
5. **Geen stilzwijgend akkoord**: de backend mag nooit een afspraak, betaling of zorgregeling wijzigen op basis van een verstreken reactiedatum of uitblijvende reactie.
