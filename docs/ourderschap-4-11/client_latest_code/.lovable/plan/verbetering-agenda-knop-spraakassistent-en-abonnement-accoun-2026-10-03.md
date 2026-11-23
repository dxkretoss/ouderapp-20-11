# Verbetering Agenda, + knop, spraakassistent en abonnement/account

Alles bouwt verder op wat er al is: geen tweede agenda, voorstel- of abonnementssysteem.

## Deel 1 — Afspraken beheren vanuit de Agenda
- Tik op een afspraak: detailvenster met rechtsboven een rustige ••• knop.
- Opties alleen als ze passen: Aanpassen, Verplaatsen, Verwijderen, Herhalen aanpassen, Voorstel tot wijziging doen.
- Persoonlijke afspraak (alleen jij / solo): direct opslaan.
- Gedeelde afspraak: wijzigen, verplaatsen en verwijderen worden een voorstel ("Reactie open"). De agenda verandert pas na akkoord. Geen reactie = geen akkoord.
- Verwijderen van een gedeelde afspraak: "Afspraak verwijderen?" met Alleen uit mijn weergave / Verwijdering voorstellen / Annuleren.
- Verplaatsen toont Huidig (bijv. woensdag 15:30) naast Nieuw.
- Bij een herhalende afspraak altijd eerst: Alleen deze / Deze en toekomstige / Hele reeks.
- Wisselmomenten blijven via de bestaande zorgregeling-voorstellen lopen.
- Definitieve wijzigingen gaan in de bestaande wijzigingsgeschiedenis.

## Deel 2 — + op Home: Voorstel doen
- "Voorstel doen" opent meteen "Wat wil je regelen?": Wisselmoment aanpassen, Tijd wijzigen, Dag ruilen, Extra dag/nacht, Nieuwe afspraak, Vakantie voorstellen, Ophalen of brengen, Kosten/budget afstemmen, Nieuwe afspraak die rust geeft, Anders.
- Elke keuze opent direct de bestaande flow, al ingevuld waar mogelijk.

## Deel 3 — Spraakassistent
- Gesproken tekst verschijnt direct in het tekstveld en blijft daar staan, volledig aan te passen.
- De assistent herkent: nieuwe afspraak, afspraak wijzigen, wisselmoment wijzigen, voorstel, taak, Momentje, kosten, vakantie, persoon aan de kring, informatie zoeken, document zoeken, bericht starten. De lijst is uitbreidbaar.
- Onduidelijk ("Ik wil vrijdag iets veranderen")? Dan vraagt de assistent: Wisselmoment / Afspraak / Ophalen/brengen / Anders. Niet gokken.
- Vóór iets gebeurt: "Dit wil je regelen" met huidig en voorstel, en knoppen Voorstel versturen / Aanpassen. Bijvoorbeeld "oma toevoegen" opent de kring met rol Oma vooraf gekozen.

## Deel 4 — Abonnement
- Instellingen → Abonnement: huidig plan, maand/jaar, prijs, volgende verlengdatum, betaalmethode, beheren.
- "Abonnement opzeggen" duidelijk zichtbaar, met uitleg en Abonnement behouden / Doorgaan met opzeggen.
- Instellingen → Juridisch & privacy: Algemene voorwaarden, Privacyverklaring, Cookie-informatie, Abonnementsvoorwaarden, leesbaar in de app (voorbeeldteksten, door jou te vervangen).

## Deel 5 — Account en gegevens bewaren
- Abonnement opzeggen en Account verwijderen zijn twee aparte, duidelijk verschillende acties.
- Optie "Je gegevens bewaren" (voorbeeldprijs €2 per maand, instelbaar): precies wat bewaard blijft, wat nog werkt, wat uit gaat, hoe lang, hoe je hervat en hoe je toch kunt laten verwijderen.
- Nooit verplicht: verwijderen blijft altijd mogelijk.
- "Welkom terug" met Volledig abonnement hervatten.

## Goed om te weten
- Het blijft een demo: er wordt nog niet echt betaald of opgezegd, en de andere ouder kan niet echt reageren (er blijft een demo-knop voor akkoord).
- Ook de open vraag over oma Marja bij het ophalen op vrijdag zet ik recht.

## Technisch
- Agenda-afspraken krijgen een gedeeld/persoonlijk-kenmerk en een voorstel-wachtrij in de bestaande agenda-state; acceptatie past de afspraak toe en logt via audit-store.
- ContextToevoegen hergebruiken voor ••• en het voorstelmenu.
- Assistent: intent-register (config-array) in assistent.functions.ts, nieuwe actie `verduidelijk` met opties; navigatie met bestaande search-params; kring krijgt `rol` search-param.
- abonnement.ts uitbreiden met status, verlengdatum, betaalmethode en een configureerbaar bewaarplan; juridische documenten als config in juridische-bronnen.ts; nieuwe route /juridisch.
