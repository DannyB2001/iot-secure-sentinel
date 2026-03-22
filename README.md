# IoT Secure Sentinel

Semestralni projekt pro predmet Internet veci (uuklient).

## Cil projektu

Vytvoreni zabezpecovaciho uzlu pro detekci neopravnene manipulace a monitoring prostredi v kritickych prostorach, jako jsou trezory, serverovny nebo technicke mistnosti. Reseni kombinuje senzorovy uzel postaveny na platforme HARDWARIO, lokalni gateway vrstvu v Node-RED a navaznost na cloudovou aplikaci postavenou nad uuApp.

## Hlavni scenar pouziti

Zarizeni prubezne meri fyzikalni podminky okoli a sleduje manipulaci s objektem pomoci akcelerometru. Pokud dojde k prekroceni definovaneho prahu zrychleni, system vyhodnoti stav jako potencialni naruseni a odesle alarm bez cekani na bezny interval sberu dat. Soucasne uklada telemetrii do lokalni databaze pro dalsi analyzu, audit a vizualizaci.

## Architektura reseni

Projekt je rozdelen do ctyr logickych vrstev:

1. `hw-node`
   Firmware pro HARDWARIO Core Module, ktery cte data ze senzoru a odesila je pres radio nebo USB.
2. `gateway`
   Node-RED flow zajistujici prijem zprav, zakladni zpracovani dat, downsampling, alarmovou logiku a persistenci do MongoDB.
3. `cloud-app`
   Prostor pro uuApp aplikaci urcenou pro spravu zarizeni, zobrazeni historie a integraci do sirsiho ekosystemu.
4. `docs`
   Projektova dokumentace, business zadani, technicke poznamky a schemata.

## Technologie

- **Hardware:** HARDWARIO Core Module, akcelerometr, teplotni senzor
- **Gateway:** Raspberry Pi nebo PC s Node-RED
- **Persistence:** lokalni MongoDB
- **Cloud:** uuApp Framework, React frontend a Node.js backend
- **Protokoly:** Radio nebo USB mezi node a gateway, MQTT uvnitr gateway, HTTPS/JSON smerem do cloudu

## Predpokladane hardwarove komponenty

Minimalni technicka konfigurace projektu:

- HARDWARIO Core Module
- akcelerometr pro detekci otresu a manipulace
- teplotni senzor
- USB nebo radio komunikacni rozhrani
- Raspberry Pi nebo PC pro beh Node-RED gateway
- lokalni MongoDB instance

## Tok dat

1. Senzorovy uzel nacita telemetrii z akcelerometru a teplotniho senzoru.
2. Firmware vytvori normalizovanou JSON zpravu a odesle ji pres USB nebo radio.
3. Node-RED zpravu prijme, validuje a vyhodnoti.
4. Alarmove udalosti se pri prekroceni prahu preposilaji okamzite.
5. Teplotni data se agreguji pomoci klouzaveho prumeru.
6. Vsechna relevantni data se ukladaji do lokalni MongoDB.
7. Cloudova vrstva muze nad ulozenymi daty poskytovat dalsi business logiku a vizualizaci.

## Datovy format mezi node a gateway

MVP payload je navrzen jako jeden JSON objekt na zpravu:

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-03-22T10:15:00Z",
  "temperatureC": 24.7,
  "accelG": 0.18,
  "alarm": false,
  "batteryVoltage": 2.95,
  "transport": "radio"
}
```

Vyznam poli:

- `deviceId`: jednoznacny identifikator uzlu
- `timestamp`: cas mereni ve formatu ISO 8601
- `temperatureC`: aktualni teplota ve stupnich Celsia
- `accelG`: velikost zrychleni nebo odchylky v jednotkach g
- `alarm`: priznak kriticke udalosti
- `batteryVoltage`: orientacni napeti napajeni
- `transport`: pouzity prenosovy kanal, typicky `radio` nebo `usb`

## Struktura repozitare

```text
iot-secure-sentinel/
|-- docs/                 # Dokumentace, business a technicky navrh
|-- hw-node/              # Zdrojovy kod pro HARDWARIO Core Module
|-- gateway/              # Konfigurace Node-RED a pomocne skripty
|   |-- flows.json        # Exportovany Node-RED flow
|   |-- scripts/          # Pomocne JS skripty pro zpracovani dat
|   `-- data/             # Lokalni konfigurace a datove artefakty
|-- cloud-app/            # Zdrojovy kod a kontrakt uuApp vrstvy
`-- README.md             # Hlavni prehled projektu
```

## Node-RED gateway: zakladni spusteni

### 1. Instalace zavislosti

Je potreba mit nainstalovano:

- Node.js 18+ nebo novejsi LTS
- Node-RED
- MongoDB
- Node-RED moduly pro serial, MQTT a MongoDB podle zvolene instalace

Priklad instalace Node-RED globalne:

```bash
npm install -g --unsafe-perm node-red
```

### 2. Spusteni MongoDB

Ujisti se, ze bezi lokalni MongoDB instance, napriklad na vychozim portu `27017`.

### 3. Spusteni Node-RED

```bash
node-red
```

Po spusteni je standardne dostupne rozhrani na adrese `http://localhost:1880`.

### 4. Import flow

1. Otevri editor Node-RED.
2. Zvol `Menu -> Import`.
3. Nahraj obsah souboru `gateway/flows.json`.
4. Uprav vstupni uzel podle pouzite komunikace, napriklad serial nebo MQTT.
5. Nakonfiguruj pripojeni k MongoDB podle lokalniho prostredi.

### 5. Overeni funkce

Po pripojeni zarizeni by mela gateway:

- prijimat telemetrii z uzlu,
- pocitat klouzavy prumer teploty,
- okamzite zpracovat alarm pri prekroceni prahu zrychleni,
- ukladat alarmy i agregovanou telemetrii do databaze.

## Aktualni stav repozitare

Repozitar nyni obsahuje:

- projektovy prehled v `README.md`
- business dokumentaci v `docs/business_requests.md`
- technicky kontrakt mezi vrstvami v `docs/api_contract.md`
- MVP firmware v `hw-node/main.c`
- MVP Node-RED flow v `gateway/flows.json`
- zaklad cloudove vrstvy v `cloud-app/README.md`

## Dalsi doporucene kroky

- napojit firmware na konkretni HARDWARIO SDK a realne ovladace senzoru
- importovat a otestovat `gateway/flows.json` v lokalnim Node-RED
- doplnit cloudove endpointy uuApp podle kontraktu
- pridat schema zapojeni a provozni scenare do `docs`
