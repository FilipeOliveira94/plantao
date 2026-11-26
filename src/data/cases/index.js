import internalMedicine from './internal-medicine.js';
import pediatrics from './pediatrics.js';
import picu from './picu.js';

export const CASES = [...internalMedicine, ...pediatrics, ...picu];

export const casesFor = (specialty, unitType) =>
  CASES.filter((c) => c.specialty === specialty && c.settings.includes(unitType));
