/**
 * M-1.1: useCustomerMutation — PATCH /customers/:id mit Optimistic-Update.
 *
 * Optimistic-Scope (decision 4A):
 *   - setQueryData(['customers','detail',id], merge body→camel→snake)
 *   - setQueryData(['customers','list'], item-Replace in Array)
 * Rollback bei Error + Toast.
 * Invalidate on Settled: stale-Coherence (Shipment-Cache, Best-Match).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CustomerDetail, CustomerUpdateBody } from '../types/customer';

const DETAIL_KEY = (id: string) => ['customers', 'detail', id] as const;
const LIST_KEY = ['customers', 'list'] as const;

/** Wandelt camelCase-PATCH-Body in snake_case-DB-Field-Merge. */
function applyBodyToSnake(
  prev: CustomerDetail,
  body: CustomerUpdateBody,
): CustomerDetail {
  const next: CustomerDetail = { ...prev };
  if (body.name !== undefined) next.name = body.name;
  if (body.name2 !== undefined) next.name2 = body.name2;
  if (body.vatId !== undefined) next.vat_id = body.vatId;
  if (body.paymentTermDays !== undefined) next.payment_term_days = body.paymentTermDays;
  if (body.creditLimit !== undefined) next.credit_limit = body.creditLimit;
  if (body.datevAccount !== undefined) next.datev_account = body.datevAccount;
  if (body.defaultIncoterm !== undefined) next.default_incoterm = body.defaultIncoterm;
  if (body.invoiceEmail !== undefined) next.invoice_email = body.invoiceEmail;
  if (body.ediPartnerId !== undefined) next.edi_partner_id = body.ediPartnerId;
  if (body.minContributionPct !== undefined)
    next.min_contribution_pct = body.minContributionPct;
  if (body.notes !== undefined) next.notes = body.notes;
  if (body.priorityTier !== undefined) next.priority_tier = body.priorityTier;
  if (body.isActive !== undefined) next.is_active = body.isActive;
  return next;
}

export function useCustomerMutation(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CustomerUpdateBody) => {
      const { data } = await api.patch<CustomerDetail>(
        `/customers/${customerId}`,
        body,
      );
      return data;
    },
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: DETAIL_KEY(customerId) });
      const prevDetail = qc.getQueryData<CustomerDetail>(DETAIL_KEY(customerId));
      const prevList = qc.getQueryData<CustomerDetail[]>(LIST_KEY);
      if (prevDetail) {
        qc.setQueryData<CustomerDetail>(
          DETAIL_KEY(customerId),
          applyBodyToSnake(prevDetail, body),
        );
      }
      if (prevList) {
        qc.setQueryData<CustomerDetail[]>(
          LIST_KEY,
          prevList.map((c) =>
            c.id === customerId ? applyBodyToSnake(c, body) : c,
          ),
        );
      }
      return { prevDetail, prevList };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prevDetail) {
        qc.setQueryData(DETAIL_KEY(customerId), ctx.prevDetail);
      }
      if (ctx?.prevList) {
        qc.setQueryData(LIST_KEY, ctx.prevList);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: DETAIL_KEY(customerId) });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['shipments'] });
      qc.invalidateQueries({ queryKey: ['fv-eligible'] });
      qc.invalidateQueries({ queryKey: ['nv-elig'] });
      qc.invalidateQueries({ queryKey: ['shipment-best-match'] });
    },
  });
}

export { applyBodyToSnake };
