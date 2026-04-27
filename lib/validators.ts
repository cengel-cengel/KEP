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

export function buildLeadSchema(m: LeadMessages) {
  return z.object({
    firstName: z.string().trim().min(1, m.first_name_required),
    lastName: z.string().trim().min(1, m.last_name_required),
    company: z.string().trim().min(1, m.company_required),
    position: z.string().trim().optional().or(z.literal('')),
    email: z
      .string()
      .trim()
      .min(1, m.email_required)
      .email(m.email_invalid),
    phone: z.string().trim().optional().or(z.literal('')),
    serviceType: z.enum(SERVICE_TYPES, { message: m.service_required }),
    message: z.string().trim().min(10, m.message_required),
    consent: z.literal(true, { message: m.consent_required }),
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
