# Professionele communicatie: aansluitvoorwaarden

## Bestaand en nu toegevoegd
- Eén bestaande professionalsroute, dossierwerkruimte, professionele rechten, journaal, privénotities en takenbron behouden.
- AI-schrijfhulp bestaat, maar levert geen betrouwbare, blijvende interventiegebeurtenissen met grondslag voor professionals. Oudergesprekken zijn niet veilig gekoppeld aan professionele accounts.
- Het bestaande overzicht heeft nu bovenaan actieve voorbeelddossiers, ontbrekende communicatiemetingen en ontbrekende AI-aantallen. Onbekend is nooit nul.
- Eén gedeeld afgeschermd communicatieonderdeel opent vanuit Home de bestaande dossierwerkruimte. Het toont geen berichten, trends, fragmenten, diagnoses of fictieve signalen.
- Toestemmingsinformatie is beschikbaar; er wordt geen aanvraag verstuurd, geen toestemming gesimuleerd en geen lokaal toegangsrecht toegevoegd.
- Oude hardcoded drukmetingen worden niet meer aan het cockpit/dossier doorgegeven. Bestaande professionele berichten en werkfuncties blijven behouden; dit zijn geen ouder-onderling gesprekken.

## Blokkerende aansluitingen
Er is geen online account-/ouderkoppeling of serverautorisatie. De huidige omgeving blijft een uitdrukkelijk gemarkeerde voorbeeldomgeving; bestaande lokale rechten zijn geen beveiliging voor echte cliëntdata.

1. Authenticeer twee verschillende ouders en de specifieke professional. Controleer gezinslidmaatschap en actieve professionele bevoegdheid op elke serveraanroep. Rollen zijn labels, geen toestemming. Hergebruik bestaande kind-/gezinsrelaties: geen tweede dossierregistratie.
2. Bewaar toestemmingsverzoeken server-side, met professional-ID, organisatie, gezin-ID, exacte gesprek-ID's, geschiedenisbereik, doel, ingangs-/einddatum en afzonderlijke vastgelegde ouderbesluiten. Geen automatisch aangevinkte toestemming. Beide geldige toestemmingen én bevoegdheid zijn vereist. Weigering/intrekking/afloop blokkeert lezen; heraanvraag vereist nieuwe expliciete besluiten.
3. Statistieken/AI-signalen hebben een afzonderlijke doelgebonden autorisatie en juridische grondslag; toegang tot inhoud mag deze niet impliciet verlenen. Geen gevoelige bron laden voordat servercontrole geslaagd is. Geen previews, export, zoekresultaten, samenvattingen of caches via een omweg.
4. Op iedere inhoud/statistiek/exportaanroep controleert de server scope, identiteit, besluiten en periode opnieuw. URL/ID-wijzigingen mogen nooit andere families opleveren. Gebruik RLS plus handlercontrole. Intrekking ongeldig maken voor reeds geopende views en caches; geen nieuwe gegevens of heropening toestaan.
5. Gebruik bestaande verzonden berichten, chronologisch met afzender en echt tijdstip, alleen-lezen. Geen concepten, oorspronkelijke privéversies, professionele notities of AI-prompts opslaan/delen voor signalering.
6. Voeg minimale metadata aan de bestaande AI-flow toe nadat de juridische inrichting is beoordeeld: opaque interventie-ID, gezin/gesprek-ID, tijdstip, gebeurtenis (aangeboden, bekeken, aangepast, oorspronkelijk verstuurd, controle niet beschikbaar). Tel unieke aangeboden interventie-ID's; bekeken/geopend/herhaald laden tellen niet opnieuw. Geen teksthash als afleidbare conceptkopie; geen private tekstvelden. Een aanpassing is geen bewijs dat AI is overgenomen; leg alleen bevestigde acties vast.
7. Bereken berichten alleen uit werkelijk verzonden, scoped berichten met echte datums. Geen trend zonder twee complete vergelijkbare periodes. Herhaalde open afstemmingsvragen alleen uit bestaande betrouwbare bronstatussen. Configureer en beoordeel eventuele drempels expliciet; er zijn nu geen drempels of diagnoses toegevoegd.
8. Beveiligde, append-only toestemmings-/toegangslogs met serverklok en echte actor. Professionele opvolging en korte interne notities moeten bestaande pro-journaal-store/acties gebruiken, geen nieuwe lijst. Zonder beschikbare signalen geen fictieve opvolgingsstatus.
9. Juridische beoordeling vóór echt gebruik: AVG, beroepsgeheim, juridische grondslag per doel, geldigheid van toestemming in hulpverlening, bewaartermijnen, informatieplicht, verwijdering/retentie, providerverwerking en mogelijkheid van onterechte signalen.

## Teststatus
Browsercontrole betreft uitsluitend de expliciet gemarkeerde voorbeeldinterface; dit is geen beveiligingstest met echte accounts.
Niet uitvoerbaar zonder bovenstaande aansluitingen: twee onafhankelijke toestemmingen, weigering, onmiddellijke intrekking, onbevoegde/directe URL-aanvallen op serverdata, veilige toegangslogs en deduplicatie van echte AI-gebeurtenissen. Er zijn geen AI-aanroepen gedaan voor dit dashboard.
De bestaande tests voor interne notities/ouderprojecties worden herhaald. Het nieuwe onderdeel ontvangt uitsluitend dossier-ID en naam, geen gevoelige inhoud of signaalbron.