'use client';

import { useEffect, useState } from 'react';
import { FormProvider, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Send } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { StepIndicator } from './StepIndicator';
import { Step1Recipient } from './Step1Recipient';
import { Step2Pickup } from './Step2Pickup';
import { Step3Packages } from './Step3Packages';
import { Step4Options } from './Step4Options';
import { newShipmentSchema, type NewShipmentInput } from '@/lib/validators';
import type { AddressBookEntry } from '@/types/addressBook';

const DRAFT_KEY = 'ked_shipment_draft_v1';
const AUTOSAVE_DELAY_MS = 1500;

type Step = 1 | 2 | 3 | 4;

const STEP_FIELDS: Record<Step, ReadonlyArray<FieldPath<NewShipmentInput>>> = {
  1: ['recipient'],
  2: ['pickup.date', 'pickup.timeWindow'],
  3: ['packages'],
  4: ['options', 'freightTerms', 'acceptTerms', 'confirmCorrect'],
};

const DEFAULT_VALUES: NewShipmentInput = {
  recipient: {
    company: '',
    contact: '',
    street: '',
    addressAddition: '',
    zip: '',
    city: '',
    country: 'DE',
    phone: '',
    email: '',
    notes: '',
    saveToBook: false,
  },
  pickup: {
    date: '',
    timeWindow: 'afternoon',
    differentPickupAddress: false,
    deliveryDate: '',
    deliveryTimeWindow: '',
  },
  packages: [
    {
      count: 1,
      type: 'euro_pallet',
      lengthCm: 120,
      widthCm: 80,
      heightCm: 100,
      weightKgPerUnit: 100,
      stackable: true,
    },
  ],
  options: {
    adr: false,
    adrUnNumber: '',
    adrClass: '',
    adrPackingGroup: '',
    express: false,
    notify: false,
    fixedTimeWindow: false,
    liftgate: false,
    noTruckInside: false,
  },
  freightTerms: 'prepaid',
  reference: '',
  notes: '',
  acceptTerms: false as unknown as true,
  confirmCorrect: false as unknown as true,
};

function loadDraft(): NewShipmentInput | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NewShipmentInput;
  } catch {
    return null;
  }
}

function saveDraft(data: NewShipmentInput) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DRAFT_KEY);
}

export function ShipmentFormClient({
  addressBook,
}: {
  addressBook: ReadonlyArray<AddressBookEntry>;
}) {
  const t = useTranslations('PortalNewShipment');
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialStep = Math.min(
    4,
    Math.max(1, Number(searchParams.get('step')) || 1),
  ) as Step;

  const [step, setStep] = useState<Step>(initialStep);
  const [reached, setReached] = useState<number>(initialStep);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const methods = useForm<NewShipmentInput>({
    resolver: zodResolver(newShipmentSchema),
    defaultValues: loadDraft() ?? DEFAULT_VALUES,
    mode: 'onTouched',
  });

  // Autosave: speichere Form-State debounced in localStorage
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = methods.watch((data) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveDraft(data as NewShipmentInput);
        setSavedAt(Date.now());
      }, AUTOSAVE_DELAY_MS);
    });
    return () => {
      sub.unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [methods]);

  // URL-Sync: ?step=N
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    sp.set('step', String(step));
    const url = `${window.location.pathname}?${sp}`;
    window.history.replaceState(null, '', url);
  }, [step]);

  // Browser-Back/Forward unterstützen
  useEffect(() => {
    function onPop() {
      const sp = new URLSearchParams(window.location.search);
      const next = Math.min(4, Math.max(1, Number(sp.get('step')) || 1)) as Step;
      setStep(next);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  async function nextStep() {
    setSubmitError(null);
    const valid = await methods.trigger(STEP_FIELDS[step] as FieldPath<NewShipmentInput>[]);
    if (!valid) return;
    const newStep = Math.min(4, step + 1) as Step;
    setStep(newStep);
    setReached((r) => Math.max(r, newStep));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function prevStep() {
    setSubmitError(null);
    const newStep = Math.max(1, step - 1) as Step;
    setStep(newStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(values: NewShipmentInput) {
    setSubmitError(null);
    try {
      const res = await fetch('/api/portal/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { success: boolean; id?: string };
      if (!res.ok || !data.success || !data.id) {
        setSubmitError(t('error_message'));
        return;
      }
      clearDraft();
      router.push({
        pathname: '/portal/sendungen/[id]',
        params: { id: data.id },
      });
    } catch {
      setSubmitError(t('error_message'));
    }
  }

  return (
    <FormProvider {...methods}>
      <form noValidate onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-brand">{t('page_title')}</h1>
            <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
          </div>
          {savedAt && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              {t('autosave_indicator')}
            </span>
          )}
        </div>

        <StepIndicator current={step} reached={reached} />

        <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200 sm:p-8">
          {step === 1 && <Step1Recipient addressBook={addressBook} />}
          {step === 2 && <Step2Pickup />}
          {step === 3 && <Step3Packages />}
          {step === 4 && <Step4Options />}
        </div>

        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={step === 1}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            {t('back')}
          </Button>

          {step < 4 ? (
            <Button
              type="button"
              onClick={nextStep}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              {t('next')}
            </Button>
          ) : (
            <Button
              type="submit"
              loading={methods.formState.isSubmitting}
              leftIcon={<Send className="h-4 w-4" />}
            >
              {methods.formState.isSubmitting ? t('submitting') : t('submit')}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
