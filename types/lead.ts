export const SERVICE_TYPES = [
  'sammelgut',
  'direkt',
  'uk',
  'lager',
  'other',
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export interface Lead {
  firstName: string;
  lastName: string;
  company: string;
  position?: string;
  email: string;
  phone?: string;
  serviceType: ServiceType;
  message: string;
  consent: boolean;
}

export interface LeadResponse {
  success: boolean;
  leadId?: string;
  error?: string;
}
