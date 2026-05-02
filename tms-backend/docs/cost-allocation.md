# Kostenkalkulation Sammelgutausgang – Vorlauf, Hauptlauf und Nachlauf

## Ziel

Ermittlung der verursachungsgerechten Gesamtkosten je Sendung im Stückgut-/Sammelgutausgang.

## Gesamtlogik

```
MATERIALAUFWAND JE SENDUNG =
  VORLAUFKOSTEN
  + HAUPTLAUFKOSTEN
  + NACHLAUFKOSTEN
```

## 1. Vorlaufkosten (Eigener Nahverkehr / Abholung)

### Definition

Der Kunde befindet sich im eigenen Nahverkehrsgebiet. Die Abholung erfolgt durch eigenen Nahverkehr. Mehrere Sendungen befinden sich auf einer Tour.

### Gesamte Tourkosten

| Position | Betrag |
|---|---|
| Fahrerkosten (Tagessatz / Pauschale) | 280 € |
| Fahrzeugkosten | 90 € |
| Kraftstoff / Energie | 70 € |
| Disposition | 30 € |
| Sonstige operative Kosten | 10 € |
| **Gesamte Tourkosten** | **480 €** |

### Verteilung der Vorlaufkosten

| Faktor | Anteil |
|---|---|
| Stop-Anteil | 35 % |
| Zeit-Anteil | 25 % |
| Routing-Anteil | 20 % |
| Kapazitäts-Anteil | 20 % |

### A) Stop-Anteil (35 %)

Annahme: Jeder Kundenstopp erzeugt fixe operative Kosten.

```
Kostenblock: 480 € × 35 % = 168 €

Stopkosten = 168 € × (Stopps Kunde / Gesamtstopps Tour)
```

Beispiel: 12 Gesamtstopps, 1 Kundenstopp → 168 € × (1/12) = 14,00 €

### B) Zeit-Anteil (25 %)

Annahme: Zeitkosten basieren auf Servicezeit + Prozesskomplexität + Routingzeit.

Kostenblock: 480 € × 25 % = 120 €

#### Basis-Servicezeit

| Sendungstyp | Zeit |
|---|---|
| Kleinware / Paket | 5 Min |
| 1 Palette | 8 Min |
| 2–4 Paletten | 12 Min |
| Mehr als 4 Paletten | 18 Min |

#### Service-Zuschläge

| Zuschlag | Zeit |
|---|---|
| Hebebühne | +3 Min |
| Avisierung / Anmeldung | +4 Min |
| Schwierige Zufahrt | +5 Min |
| Bekannte Wartezeit | +5 bis +10 Min |

#### Routingzeit

| Klasse | Zeit |
|---|---|
| Stammroute | +0 Min |
| Kleiner Umweg | +5 Min |
| Mittlerer Umweg | +10 Min |
| Randgebiet | +15 Min |

Beispiel: 1 Pal (8) + Anmeldung (+4) + kl. Umweg (+5) = 17 Min, Tourzeit 240 Min
→ 120 € × (17/240) = 8,50 €

### C) Routing-Anteil (20 %)

Annahme: Misst zusätzliche Netzbelastung.

Kostenblock: 480 € × 20 % = 96 €

| Klasse | Anteil |
|---|---|
| Stammroute | 0 % |
| Kleiner Schlenker | 25 % |
| Mittlerer Umweg | 50 % |
| Separater Tourast | 100 % |

Beispiel: kleiner Schlenker → 96 € × 25 % = 24,00 €

### D) Kapazitäts-Anteil (20 %)

Annahme: Misst reale Fahrzeugauslastung.

Kostenblock: 480 € × 20 % = 96 €

Maßgebend ist der höchste Wert aus:
- Gewichtsanteil = Sendungsgewicht / Gesamtgewicht Tour
- Volumengewicht = (L × B × H in cm) / 5000
- Lademeteranteil = Lademeter Sendung / Lademeter Tour

Beispiel: Sendungsgewicht 400 kg, Tour 4.000 kg = 10 % → 96 € × 10 % = 9,60 €

### Gesamtkosten Vorlauf

| Position | Betrag |
|---|---|
| Stopkosten | 14,00 € |
| Zeitkosten | 8,50 € |
| Routingkosten | 24,00 € |
| Kapazitätskosten | 9,60 € |
| **Vorlaufkosten** | **56,10 €** |

## 2. Hauptlaufkosten (Linienverkehr / Partnernetz)

### Definition

Transport vom eigenen Depot zum Netzwerkpartner.

### Gesamte Linienkosten

Beispiel: 1.000 €

### Verteilung

| Faktor | Anteil |
|---|---|
| Kapazität | 40 % |
| Relation / Distanz | 30 % |
| Auslastung | 20 % |
| Zuschläge | 10 % |

### A) Kapazität (40 %)

Kostenblock: 1.000 € × 40 % = 400 €

Maßgebend: max aus Gewicht, Volumen, Lademeter
Beispiel: Sendungsanteil 8 % → 400 € × 8 % = 32,00 €

### B) Relation / Distanz (30 %)

Kostenblock: 1.000 € × 30 % = 300 €

| Zone | Anteil |
|---|---|
| Zone A (nah) | 25 % |
| Zone B (regional) | 50 % |
| Zone C (fern) | 75 % |
| Zone D (lang) | 100 % |

Beispiel: Zone B → 300 € × 50 % = 150,00 €

### C) Auslastung (20 %)

Kostenblock: 1.000 € × 20 % = 200 €

| Auslastung | Anteil |
|---|---|
| Sehr gut (>90 %) | 50 % |
| Normal (70–90 %) | 75 % |
| Schwach (<70 %) | 100 % |

Beispiel: Normal → 200 € × 75 % = 150,00 €

### D) Zuschläge (10 %)

Kostenblock: 1.000 € × 10 % = 100 €
Beispiel: Sendungsanteil 8 % → 100 € × 8 % = 8,00 €

### Gesamtkosten Hauptlauf

| Position | Betrag |
|---|---|
| Kapazität | 32,00 € |
| Relation | 150,00 € |
| Auslastung | 150,00 € |
| Zuschläge | 8,00 € |
| **Hauptlaufkosten** | **340,00 €** |

## 3. Nachlaufkosten (Partner-Zustellung)

### Definition

Der Netzwerkpartner übernimmt die Zustellung und belastet diese Kosten zurück.

### Partnerkosten

Beispiel: 80 €

### Verteilung

| Faktor | Anteil |
|---|---|
| Stop-/Service-Anteil | 50 % |
| Gebiets-/Routing-Anteil | 30 % |
| Kapazitäts-Anteil | 20 % |

### A) Stop-/Service-Anteil (50 %)

Kostenblock: 80 € × 50 % = 40 €

Servicezeit-Tabelle und Service-Zuschläge analog zu Vorlauf B.
Beispiel Standardzustellung: 40 € × 100 % = 40,00 €

### B) Gebiets-/Routing-Anteil (30 %)

Kostenblock: 80 € × 30 % = 24 €

| Gebiet | Anteil |
|---|---|
| Ballungsraum | 50 % |
| Standardgebiet | 75 % |
| Ländliches Gebiet | 100 % |

Beispiel: Ländlich → 24 € × 100 % = 24,00 €

### C) Kapazitäts-Anteil (20 %)

Kostenblock: 80 € × 20 % = 16 €

Maßgebend: max aus Gewicht, Volumen, Lademeter
Beispiel: Sendungsanteil 10 % → 16 € × 10 % = 1,60 €

### Gesamtkosten Nachlauf

| Position | Betrag |
|---|---|
| Service | 40,00 € |
| Gebiet | 24,00 € |
| Kapazität | 1,60 € |
| **Nachlaufkosten** | **65,60 €** |

## 4. Gesamter Materialaufwand

| Position | Betrag |
|---|---|
| Vorlauf | 56,10 € |
| Hauptlauf | 340,00 € |
| Nachlauf | 65,60 € |
| **Gesamter Materialaufwand** | **461,70 €** |

## Strategischer Hinweis

Dieses Modell dient zur:
- Kundenprofitabilitätsanalyse
- Vertriebskalkulation
- Mindestfrachtdefinition
- Netzwerksteuerung
- Identifikation unprofitabler Relationen
- Transparenz über echte Cost Driver

Das Modell ist deutlich belastbarer als eine reine kg-, Umsatz- oder Kilometerverteilung.
