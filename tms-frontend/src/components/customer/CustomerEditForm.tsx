/**
 * M-1.1: CustomerEditForm — Stammdaten-Editor pro Customer.
 *
 * Felder via InlineEdit (Auto-save per Field, onBlur/Enter):
 *   - customer_number (read-only)
 *   - name, name2, vat_id
 *   - priority_tier (Select VIP/A/B/C/—)
 *   - payment_term_days (number)
 *   - credit_limit (number — Decimal-Render serverseitig)
 *   - invoice_email
 *   - min_contribution_pct (number)
 *   - notes (textarea)
 *   - is_active (Toggle)
 */
import { useCustomerMutation } from '../../hooks/useCustomerMutation';
import { TIER_OPTIONS } from '../../lib/customerTier';
import type { CustomerDetail } from '../../types/customer';
import InlineEdit from '../panel/InlineEdit';
import CustomerTierBadge from './CustomerTierBadge';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-xs items-center">
      <div className="text-gray-500">{label}</div>
      <div>{children}</div>
    </div>
  );
}

/** Wandelt InlineEdit-String → number|null für numerische Felder. */
function toNum(v: string): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function CustomerEditForm({
  customer,
}: {
  customer: CustomerDetail;
}) {
  const mut = useCustomerMutation(customer.id);
  // InlineEdit.onSave erwartet void; mutateAsync<CustomerDetail> → wrap.
  const mutAsync = async (
    body: Parameters<typeof mut.mutateAsync>[0],
  ): Promise<void> => {
    await mut.mutateAsync(body);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b">
        <span className="font-mono text-sm font-semibold text-gray-700">
          {customer.customer_number}
        </span>
        <span className="text-sm text-gray-700">{customer.name}</span>
        <CustomerTierBadge tier={customer.priority_tier} />
        {!customer.is_active && (
          <span className="ml-auto text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            inaktiv
          </span>
        )}
      </div>

      <Row label="Kunden-Nr.">
        <span className="font-mono text-gray-700">
          {customer.customer_number}
        </span>
      </Row>
      <Row label="Name">
        <InlineEdit
          value={customer.name}
          onSave={(v) => mutAsync({ name: v })}
          type="text"
          label="Name"
        />
      </Row>
      <Row label="Name 2">
        <InlineEdit
          value={customer.name2}
          onSave={(v) => mutAsync({ name2: v || null })}
          type="text"
          label="Name 2"
        />
      </Row>
      <Row label="USt-ID">
        <InlineEdit
          value={customer.vat_id}
          onSave={(v) => mutAsync({ vatId: v || null })}
          type="text"
          label="USt-ID"
        />
      </Row>
      <Row label="Tier">
        <InlineEdit
          value={customer.priority_tier ?? ''}
          options={[...TIER_OPTIONS]}
          onSave={(v) =>
            mutAsync({
              priorityTier: v === '' ? null : (v as 'VIP' | 'A' | 'B' | 'C'),
            })
          }
          type="select"
          label="Tier"
        />
      </Row>
      <Row label="Zahlungsziel (Tage)">
        <InlineEdit
          value={customer.payment_term_days}
          onSave={(v) => mutAsync({ paymentTermDays: toNum(v) ?? undefined })}
          type="number"
          label="Zahlungsziel"
        />
      </Row>
      <Row label="Kreditlimit (€)">
        <InlineEdit
          value={
            customer.credit_limit != null ? String(customer.credit_limit) : ''
          }
          onSave={(v) => mutAsync({ creditLimit: toNum(v) })}
          type="number"
          label="Kreditlimit"
        />
      </Row>
      <Row label="Rechnungs-Email">
        <InlineEdit
          value={customer.invoice_email}
          onSave={(v) => mutAsync({ invoiceEmail: v || null })}
          type="text"
          label="Rechnungs-Email"
        />
      </Row>
      <Row label="Mindest-DB (%)">
        <InlineEdit
          value={
            customer.min_contribution_pct != null
              ? String(customer.min_contribution_pct)
              : ''
          }
          onSave={(v) => mutAsync({ minContributionPct: toNum(v) })}
          type="number"
          label="Mindest-DB"
        />
      </Row>
      <Row label="Notizen">
        <InlineEdit
          value={customer.notes}
          onSave={(v) => mutAsync({ notes: v || null })}
          type="textarea"
          label="Notizen"
        />
      </Row>
      <Row label="Aktiv">
        <button
          type="button"
          onClick={() => mut.mutate({ isActive: !customer.is_active })}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${
            customer.is_active
              ? 'bg-green-50 border-green-300 text-green-700'
              : 'bg-gray-100 border-gray-300 text-gray-500'
          }`}
          aria-pressed={customer.is_active}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              customer.is_active ? 'bg-green-500' : 'bg-gray-400'
            }`}
            aria-hidden
          />
          {customer.is_active ? 'Aktiv' : 'Inaktiv'}
        </button>
      </Row>
    </div>
  );
}
