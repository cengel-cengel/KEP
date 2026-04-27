import { z } from 'zod';
import { SERVICE_TYPES } from '@/types/lead';

/**
 * Zod-Schema für eingehende Lead-Anfragen.
 * Erlaubt das Übergeben übersetzter Fehlermeldungen.
 */
export interface LeadMessages {
  first_name_required: string;
  last_name_required: string;
  company_required: string;
  email_required: string;
  email_invalid: string;
  service_required: string;
  message_required: string;
  consent_required: string;
}

/**
 * Telefon-Pattern: Ziffern, Leerzeichen, +, (, ), -, max 30 Zeichen.
 * Greift sowohl für DE/EU als auch internationale Formate.
 */
const PHONE_REGEX = /^[\d\s+()-]{6,30}$/;

/**
 * Verbietet HTML-Tags und schützt grob vor XSS-Versuchen
 * in Freitextfeldern. (Server-Side parst kein HTML, das ist
 * Defense-in-Depth gegen Echo in Logs/Mails.)
 */
const NO_HTML_REGEX = /^[^<>]*$/;

export function buildLeadSchema(m: LeadMessages) {
  return z.object({
    firstName: z.string().trim().min(1, m.first_name_required).max(100).regex(NO_HTML_REGEX),
    lastName: z.string().trim().min(1, m.last_name_required).max(100).regex(NO_HTML_REGEX),
    company: z.string().trim().min(1, m.company_required).max(200).regex(NO_HTML_REGEX),
    position: z.string().trim().max(100).regex(NO_HTML_REGEX).optional().or(z.literal('')),
    email: z
      .string()
      .trim()
      .min(1, m.email_required)
      .max(254) // RFC 5321
      .email(m.email_invalid),
    phone: z
      .string()
      .trim()
      .regex(PHONE_REGEX)
      .optional()
      .or(z.literal('')),
    serviceType: z.enum(SERVICE_TYPES, { message: m.service_required }),
    message: z
      .string()
      .trim()
      .min(10, m.message_required)
      .max(5000)
      .regex(NO_HTML_REGEX),
    consent: z.literal(true, { message: m.consent_required }),
    // Honeypot: muss leer sein, sonst Bot
    website: z.string().max(0).optional().or(z.literal('')),
  });
}

/**
 * Server-seitiges Schema mit englischen Fallback-Messages
 * (für API-Validierung, falls Client-Validierung umgangen wird).
 */
export const serverLeadSchema = buildLeadSchema({
  first_name_required: 'First name is required',
  last_name_required: 'Last name is required',
  company_required: 'Company is required',
  email_required: 'Email is required',
  email_invalid: 'Invalid email address',
  service_required: 'Service type is required',
  message_required: 'Message must be at least 10 characters',
  consent_required: 'Consent is required',
});

/**
 * Schema für eine Sendungserfassung über das Kundenportal.
 * Server-Seite akzeptiert das per POST /api/portal/shipments.
 */
const addressSchema = z.object({
  company: z.string().trim().min(1),
  contact: z.string().trim().min(1),
  street: z.string().trim().min(1),
  addressAddition: z.string().trim().optional().or(z.literal('')),
  zip: z.string().trim().min(2),
  city: z.string().trim().min(1),
  country: z.string().trim().length(2),
  phone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
});

export const PACKAGE_TYPES = [
  'euro_pallet',
  'industry_pallet',
  'one_way_pallet',
  'box',
  'cage',
  'other',
] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

const packageRowSchema = z.object({
  count: z.coerce.number().int().min(1).max(999),
  type: z.enum(PACKAGE_TYPES),
  typeNote: z.string().trim().optional().or(z.literal('')),
  lengthCm: z.coerce.number().int().min(1).max(1500),
  widthCm: z.coerce.number().int().min(1).max(300),
  heightCm: z.coerce.number().int().min(1).max(300),
  weightKgPerUnit: z.coerce.number().min(0.1).max(30000),
  stackable: z.boolean(),
});

export const newShipmentSchema = z.object({
  recipient: addressSchema.extend({
    addressBookId: z.string().optional(),
    saveToBook: z.boolean().optional(),
  }),
  pickup: z.object({
    date: z.string().min(8),
    timeWindow: z.enum(['morning', 'afternoon', 'allday']),
    differentPickupAddress: z.boolean(),
    pickupAddress: addressSchema.optional(),
    deliveryDate: z.string().optional().or(z.literal('')),
    deliveryTimeWindow: z.enum(['morning', 'afternoon', 'allday', '']).optional(),
  }),
  packages: z.array(packageRowSchema).min(1, 'min_one_package'),
  options: z.object({
    adr: z.boolean(),
    adrUnNumber: z.string().optional().or(z.literal('')),
    adrClass: z.string().optional().or(z.literal('')),
    adrPackingGroup: z.enum(['I', 'II', 'III', '']).optional(),
    express: z.boolean(),
    notify: z.boolean(),
    fixedTimeWindow: z.boolean(),
    liftgate: z.boolean(),
    noTruckInside: z.boolean(),
  }),
  freightTerms: z.enum(['prepaid', 'collect']),
  reference: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  acceptTerms: z.literal(true, { message: 'accept_terms_required' }),
  confirmCorrect: z.literal(true, { message: 'confirm_correct_required' }),
});

export type NewShipmentInput = z.infer<typeof newShipmentSchema>;
