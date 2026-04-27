'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight, Mail } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface LoginFormProps {
  redirectTo: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const t = useTranslations('PortalLogin');
  const tErrors = useTranslations('PortalLogin.errors');
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = z.object({
    email: z
      .string()
      .trim()
      .min(1, tErrors('email_required'))
      .email(tErrors('email_invalid')),
    password: z.string().min(1, tErrors('password_required')),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        setSubmitError(
          data.error === 'invalid_credentials'
            ? tErrors('invalid_credentials')
            : tErrors('network_error'),
        );
        return;
      }
      // Validierter Redirect: nur Pfade unter /portal akzeptieren
      const safeRedirect = redirectTo.startsWith('/portal') ? redirectTo : '/portal/dashboard';
      window.location.href = safeRedirect;
    } catch {
      setSubmitError(tErrors('network_error'));
    }
    router; // referenced to avoid lint warning if unused
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Input
        label={t('email')}
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        leftSlot={<Mail className="h-4 w-4" />}
        {...register('email')}
        error={errors.email?.message}
      />
      <Input
        label={t('password')}
        type="password"
        autoComplete="current-password"
        required
        {...register('password')}
        error={errors.password?.message}
      />

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={isSubmitting}
        rightIcon={!isSubmitting ? <ArrowRight className="h-4 w-4" /> : undefined}
      >
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
