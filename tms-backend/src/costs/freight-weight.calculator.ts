export function calculateChargeableWeight(params: {
  weightKg: number; // tatsächliches Gewicht
  lengthCm: number; // Länge in cm
  widthCm: number; // Breite in cm
  heightCm: number; // Höhe in cm
  ldm: number; // Lademeter
  packageCount: number; // Anzahl Packstücke
}): {
  actualWeight: number;
  cbm: number;
  volumeWeightCbm: number;
  volumeWeightLdm: number;
  chargeableWeight: number;
  calculationMethod: string;
} {
  const { weightKg, lengthCm, widthCm, heightCm, ldm, packageCount } = params;

  // CBM berechnen (Gesamtvolumen aller Packstücke)
  const cbm = (lengthCm * widthCm * heightCm * packageCount) / 1_000_000;

  // Volumengewicht nach CBM
  const volumeWeightCbm = cbm * 250;

  // Volumengewicht nach ldm (nur wenn ldm >= 1.5)
  const volumeWeightLdm = ldm >= 1.5 ? ldm * 1250 : 0;

  // Höchstes Volumengewicht
  const maxVolumeWeight = Math.max(volumeWeightCbm, volumeWeightLdm);

  // FPG = höchster Wert
  const chargeableWeight = Math.max(weightKg, maxVolumeWeight);

  // Berechnungsmethode dokumentieren
  let calculationMethod = 'ACTUAL_WEIGHT';
  if (chargeableWeight === volumeWeightLdm && ldm >= 1.5) {
    calculationMethod = 'LDM_VOLUME';
  } else if (chargeableWeight === volumeWeightCbm) {
    calculationMethod = 'CBM_VOLUME';
  }

  return {
    actualWeight: weightKg,
    cbm: Math.round(cbm * 1000) / 1000,
    volumeWeightCbm: Math.round(volumeWeightCbm * 10) / 10,
    volumeWeightLdm: Math.round(volumeWeightLdm * 10) / 10,
    chargeableWeight: Math.round(chargeableWeight * 10) / 10,
    calculationMethod,
  };
}

export function calculateFreightCost(chargeableWeight: number, ratePerHundredKg: number): number {
  return Math.round((chargeableWeight / 100) * ratePerHundredKg * 100) / 100;
}

export type PackageLineInput = {
  quantity: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  stackable: boolean;
};

/** Lademeter-Beitrag pro Zeile: bei stapelbar reduzierte Stellplätze (vereinfachte Trailerhöhe ~240 cm). */
export function lineLdmContribution(line: PackageLineInput): number {
  const q = Math.max(1, line.quantity);
  const L = Math.max(1, line.length_cm) / 100;
  const W = Math.max(1, line.width_cm) / 100;
  const floorM2 = L * W;
  const perUnitLdm = floorM2 / 2.4;
  if (!line.stackable) {
    return Math.round(perUnitLdm * q * 1000) / 1000;
  }
  const h = Math.max(1, line.height_cm);
  const maxPerStack = Math.max(1, Math.floor(240 / h));
  const stacks = Math.ceil(q / maxPerStack);
  return Math.round(perUnitLdm * stacks * 1000) / 1000;
}

export function aggregatePackageLines(lines: PackageLineInput[]): {
  totalWeightKg: number;
  totalQuantity: number;
  cbm: number;
  ldm: number;
  maxLengthCm: number;
  maxWidthCm: number;
  maxHeightCm: number;
} {
  if (!lines.length) {
    return {
      totalWeightKg: 0,
      totalQuantity: 0,
      cbm: 0,
      ldm: 0,
      maxLengthCm: 0,
      maxWidthCm: 0,
      maxHeightCm: 0,
    };
  }
  let totalWeightKg = 0;
  let totalQuantity = 0;
  let cbm = 0;
  let ldm = 0;
  let maxL = 0;
  let maxW = 0;
  let maxH = 0;
  for (const line of lines) {
    const q = Math.max(1, line.quantity);
    totalQuantity += q;
    totalWeightKg += Number(line.weight_kg);
    cbm += (line.length_cm * line.width_cm * line.height_cm * q) / 1_000_000;
    ldm += lineLdmContribution(line);
    maxL = Math.max(maxL, line.length_cm);
    maxW = Math.max(maxW, line.width_cm);
    maxH = Math.max(maxH, line.height_cm);
  }
  return {
    totalWeightKg: Math.round(totalWeightKg * 100) / 100,
    totalQuantity,
    cbm: Math.round(cbm * 1000) / 1000,
    ldm: Math.round(ldm * 1000) / 1000,
    maxLengthCm: maxL,
    maxWidthCm: maxW,
    maxHeightCm: maxH,
  };
}

/** FPG aus aggregierten Packstücken (statt eines homogenen Packstücks). */
export function calculateChargeableWeightFromAggregates(params: {
  totalWeightKg: number;
  cbm: number;
  ldm: number;
  totalQuantity: number;
}): {
  actualWeight: number;
  cbm: number;
  volumeWeightCbm: number;
  volumeWeightLdm: number;
  chargeableWeight: number;
  calculationMethod: string;
} {
  const { totalWeightKg, cbm, ldm, totalQuantity } = params;
  const volumeWeightCbm = cbm * 250;
  const volumeWeightLdm = ldm >= 1.5 ? ldm * 1250 : 0;
  const maxVolumeWeight = Math.max(volumeWeightCbm, volumeWeightLdm);
  const chargeableWeight = Math.max(totalWeightKg, maxVolumeWeight);
  let calculationMethod = 'ACTUAL_WEIGHT';
  if (chargeableWeight === volumeWeightLdm && ldm >= 1.5) {
    calculationMethod = 'LDM_VOLUME';
  } else if (chargeableWeight === volumeWeightCbm) {
    calculationMethod = 'CBM_VOLUME';
  }
  return {
    actualWeight: Math.round(totalWeightKg * 10) / 10,
    cbm: Math.round(cbm * 1000) / 1000,
    volumeWeightCbm: Math.round(volumeWeightCbm * 10) / 10,
    volumeWeightLdm: Math.round(volumeWeightLdm * 10) / 10,
    chargeableWeight: Math.round(chargeableWeight * 10) / 10,
    calculationMethod: `${calculationMethod}_MULTI_PKG`,
  };
}

