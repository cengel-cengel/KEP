import { useTranslations } from 'next-intl';
import { Container } from '@/components/ui/Container';
import { STATS } from '@/lib/constants';

export function StatsStrip() {
  const t = useTranslations('Stats');

  return (
    <section className="border-y border-slate-200 bg-white">
      <Container>
        <dl className="grid grid-cols-2 divide-y divide-slate-200 md:grid-cols-4 md:divide-y-0 md:divide-x">
          {STATS.map((stat, idx) => (
            <div
              key={stat.key}
              className={
                'flex flex-col items-start gap-1 py-8 md:py-10 3xl:py-14 4xl:py-16 ' +
                (idx === 0 ? 'md:pl-0 md:pr-8 3xl:pr-12' : 'md:px-8 3xl:px-12')
              }
            >
              <dt className="order-2 text-sm text-slate-600 3xl:text-base">{t(stat.key)}</dt>
              <dd className="order-1 text-display-md font-bold text-brand 3xl:text-5xl 4xl:text-6xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
