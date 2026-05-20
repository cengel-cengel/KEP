import { describe, expect, it } from 'vitest';
import { applyBodyToSnake } from './useCustomerMutation';
import type { CustomerDetail } from '../types/customer';

const base: CustomerDetail = {
  id: 'c1',
  customer_number: 'C00001',
  name: 'Alpha GmbH',
  vat_id: 'DE123',
  payment_term_days: 30,
  credit_limit: 5000,
  invoice_email: 'a@b.de',
  min_contribution_pct: 10,
  notes: null,
  priority_tier: 'A',
  is_active: true,
};

describe('applyBodyToSnake', () => {
  it('camelCase-Body → snake_case-Merge', () => {
    const next = applyBodyToSnake(base, {
      name: 'Beta AG',
      vatId: 'DE999',
      paymentTermDays: 14,
      creditLimit: 9000,
      priorityTier: 'VIP',
    });
    expect(next.name).toBe('Beta AG');
    expect(next.vat_id).toBe('DE999');
    expect(next.payment_term_days).toBe(14);
    expect(next.credit_limit).toBe(9000);
    expect(next.priority_tier).toBe('VIP');
  });
  it('Unbeteiligte Felder bleiben unverändert', () => {
    const next = applyBodyToSnake(base, { name: 'New' });
    expect(next.vat_id).toBe('DE123');
    expect(next.payment_term_days).toBe(30);
  });
  it('null-Werte werden übernommen (Field-Clear)', () => {
    const next = applyBodyToSnake(base, {
      vatId: null,
      invoiceEmail: null,
    });
    expect(next.vat_id).toBeNull();
    expect(next.invoice_email).toBeNull();
  });
  it('isActive Toggle', () => {
    const next = applyBodyToSnake(base, { isActive: false });
    expect(next.is_active).toBe(false);
  });
});
