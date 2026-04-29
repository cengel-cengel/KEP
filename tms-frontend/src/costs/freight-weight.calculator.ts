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

  const cbm = (lengthCm * widthCm * heightCm * packageCount) / 1_000_000;
  const volumeWeightCbm = cbm * 250;
  const volumeWeightLdm = ldm >= 1.5 ? ldm * 1250 : 0;
  const maxVolumeWeight = Math.max(volumeWeightCbm, volumeWeightLdm);
  const chargeableWeight = Math.max(weightKg, maxVolumeWeight);

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

