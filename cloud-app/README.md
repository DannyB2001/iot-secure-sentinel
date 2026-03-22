# cloud-app

Tato slozka je vyhrazena pro uuApp cloudovou vrstvu projektu IoT Secure Sentinel.

## Doporucena minimalni struktura

- frontend v Reactu pro prehled zarizeni, teplot a alarmu
- backend use case endpointy pro `telemetry/create` a `alarm/create`
- DTO a validacni logika mapovane na kontrakt v `docs/api_contract.md`

## MVP cile cloudove vrstvy

- prijmout agregovanou telemetrii z gateway
- prijmout prioritni alarmove udalosti
- zobrazit historii mereni a seznam alarmu
- zachovat naming a JSON struktury kompatibilni s uuApp business request stylem

## Navazujici prace

Pri zakladani uuApp projektu pouzij datovy kontrakt popsany v `docs/api_contract.md` jako zdroj pro DTO a aplikacni use case navrh.
