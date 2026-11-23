# Plan: Meer rustiger en taakgericht maken

## Wat er verandert
- Herbouw **Meer** als vier compacte sectielijsten: **Voor jullie gezin**, **Planning & afspraken**, **Ondersteuning** en **App & account**.
- Vervang de losse grote kaarten en emoji’s door één consistente rijcomponent met rustige lijniconen, dunne scheidingslijnen en compacte tekst.
- Houd de onderste navigatie en alle bestaande functies intact.

## Nieuwe ingangen
- **Voor jullie gezin:** Kinderen, Taken & spullen, Momentjes, Documenten.
- **Planning & afspraken:** Zorgregeling, Samen regelen, Vakanties & bijzondere dagen.
- **Ondersteuning:** één rustige ingang naar Professional betrekken, Afspraken & veiligheid en Extra ondersteuning.
- **App & account:** Instellingen en Hulp & rondleiding.

## Nieuwe verzamelpagina’s
- Bouw **Samen regelen** als overzicht met openstaande zaken, acties voor dag ruilen/extra nacht/planning/nieuwe afspraak en een compacte selectie van bestaande afspraken. De bestaande Wisselassistent en Onze afspraken blijven bereikbaar.
- Bouw **Ondersteuning** als neutrale keuzepagina die doorlinkt naar de bestaande Professionals-, Afspraken & veiligheid- en Extra ondersteuning-pagina’s.

## Gezin & toegang
- Verplaats de zichtbare ingang voor **Solo gebruiken** naar **Instellingen → Gezin & toegang** met de keuze Samen gebruiken / Alleen gebruiken.
- Behoud de bestaande solo-pagina en werking; alleen de plek in de navigatie verandert.

## Bereikbaarheid en controle
- Behoud bestaande detailroutes en gegevens.
- Controleer dat Overdracht bereikbaar blijft via Home, Wissel/Zorgregeling en Taken & spullen; voeg alleen gerichte verwijzingen toe als er een gat blijkt.
- Controleer oud → nieuw voor iedere huidige ingang, mobiel formaat, terugknoppen en de volledige klikroute.
- Controleer na afloop de bouwstatus en de belangrijkste routes in de browser.

## Technische details
- Voeg routebestanden toe voor `/samen-regelen` en `/ondersteuning`, elk met eigen paginatitel en beschrijving.
- Werk de actieve status van **Meer** bij voor de nieuwe routes.
- Gebruik bestaande kleur- en typografietokens; geen wijzigingen aan andere pagina’s behalve Instellingen voor **Gezin & toegang** en eventuele noodzakelijke contextlinks.
