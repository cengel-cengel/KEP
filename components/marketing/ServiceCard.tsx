import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

interface ServiceCardProps {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  href: '/leistungen';
  hash?: string;
  className?: string;
}

export function ServiceCard({
  title,
  description,
  image,
  imageAlt,
  href,
  hash,
  className,
}: ServiceCardProps) {
  const t = useTranslations('Services');

  return (
    <Link
      href={hash ? { pathname: href, hash } : { pathname: href }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl bg-white',
        'ring-1 ring-slate-200 transition duration-300',
        'hover:-translate-y-1 hover:ring-slate-300 hover:shadow-[0_20px_40px_-20px_rgba(15,39,68,0.25)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        className,
      )}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-50">
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-brand-950/30 to-transparent"
        />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-semibold text-brand">{title}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{description}</p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
          {t('more')}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}
