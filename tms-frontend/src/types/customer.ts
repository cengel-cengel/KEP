export interface Customer {
  id: string;
  name: string;
  customer_number?: string;
}

/** M-1.1: Vollständiger Customer-Type für Stammdaten-Edit-Tab. */
export interface CustomerDetail {
  id: string;
  customer_number: string;
  name: string;
  name2?: string | null;
  vat_id?: string | null;
  payment_term_days?: number | null;
  credit_limit?: string | number | null;
  datev_account?: string | null;
  default_incoterm?: string | null;
  invoice_email?: string | null;
  edi_partner_id?: string | null;
  min_contribution_pct?: string | number | null;
  notes?: string | null;
  priority_tier?: 'VIP' | 'A' | 'B' | 'C' | string | null;
  is_active: boolean;
}

/** M-1.1: PATCH-Body (camelCase, matched BE-DTO). */
export interface CustomerUpdateBody {
  name?: string;
  name2?: string | null;
  vatId?: string | null;
  paymentTermDays?: number | null;
  creditLimit?: number | null;
  datevAccount?: string | null;
  defaultIncoterm?: string | null;
  invoiceEmail?: string | null;
  ediPartnerId?: string | null;
  minContributionPct?: number | null;
  notes?: string | null;
  priorityTier?: 'VIP' | 'A' | 'B' | 'C' | null;
  isActive?: boolean;
}
