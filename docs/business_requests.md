# Business Requests

## Nazev reseni

IoT Secure Sentinel

## Business zamer

Cilem reseni je monitorovat kriticke prostory a chranena aktiva pomoci lokalniho IoT uzlu, ktery dokaze rozpoznat neopravnenou manipulaci a zaroven merit zakladni parametry prostredi. System ma minimalizovat falesne alarmy, poskytovat lokalni persistenci pri vypadku spojeni a umoznit nasledne napojeni na cloudovou vrstvu uuApp.

## Business problem

Organizace potrebuji levny a jednoduse nasaditelny dohled nad misty, kde je dulezita fyzicka bezpecnost a zakladni environmentalni monitoring. Ciste cloudove reseni je nevhodne v pripadech, kdy musi system fungovat i pri omezene konektivite nebo pri kratkodobem vypadku internetu.

## Scope

Soucasti reseni je:

- sber dat o teplote a pohybu nebo otresech
- lokalni vyhodnoceni alarmoveho stavu
- lokalni agregace beznych dat
- ukladani do MongoDB
- priprava integrace do uuApp

Mimo scope aktualni MVP iterace je:

- viceuzivatelska sprava opravneni
- notifikacni kanaly typu SMS nebo e-mail
- pokrocila analytika nad historickymi daty
- vzdalena sprava firmware OTA

## Hlavni business pozadavky

### BR1: Detekce neopravnene manipulace

System musi vyhodnotit prekroceni prahu zrychleni jako alarmovou udalost a predat ji prioritne ke zpracovani.

### BR2: Monitoring prostredi

System musi pravidelne merit teplotu v monitorovanem prostoru a uchovavat jeji historii.

### BR3: Omezeni objemu prenasenych dat

Bezna telemetrie nesmi byt bezduvodne odesilana do cloudove vrstvy v plnem rozliseni. Musi byt agregovana jiz na gateway.

### BR4: Lokalni dostupnost dat

Gateway musi ukladat alarmove i provozni zaznamy do lokalni MongoDB tak, aby data nebyla ztracena pri vypadku pripojeni do cloudu.

### BR5: Pripravenost na cloudovou integraci

Datovy model musi byt navrzen tak, aby sel bez zasadnich zmen prenaset do uuApp backendu pres JSON API.

## Hlavni akteri

- spravce objektu
- bezpecnostni operator
- servisni technik
- cloudova aplikace uuApp

## Klicove scenare

### Scenar 1: Standardni sber telemetrie

Uzel odesle mereni teploty a akcelerace. Gateway data validuje, vypocita klouzavy prumer a ulozi vysledek do MongoDB.

### Scenar 2: Alarm pri manipulaci

Akcelerometr prekroci nastaveny prah. Uzel odesle alarmovou zpravu. Gateway zpravu neagreguje, ale ihned ji oznaci jako alarm a ulozi i publikuje s prioritou.

### Scenar 3: Vypadek cloudove konektivity

Cloudova vrstva neni dostupna. Gateway pokracuje v lokalnim provozu a uklada data do MongoDB bez ztraty funkce zakladniho monitoringu.

## Nefunkcni pozadavky

- citelnost a modularita firmware i flow logiky
- jednoduche lokalni nasazeni na Raspberry Pi
- auditovatelny zaznam alarmovych udalosti
- moznost pozdejsiho rozsireni o dalsi senzory

## Metriky uspechu

- alarmova udalost je zpracovana bez cekani na downsampling
- bezna telemetrie je ukladana v agregovane podobe
- data jsou dostupna lokalne i bez cloudu
- datovy model je konzistentni mezi node, gateway a cloud vrstvou
