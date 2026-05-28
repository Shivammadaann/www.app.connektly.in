import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

export const onboardingMotion = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
  },
  slideUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  },
};

export function OnboardingStepLayout({
  eyebrow,
  title,
  description,
  icon,
  progressLabel,
  progressValue,
  maxWidthClassName = 'max-w-[560px]',
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: ReactNode;
  progressLabel?: string;
  progressValue?: number;
  maxWidthClassName?: string;
  children: ReactNode;
}) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className={`relative z-10 w-full ${maxWidthClassName}`}
    >
      {typeof progressValue === 'number' ? (
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-500">
            <span>{progressLabel || 'Progress'}</span>
            <span>{progressValue}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
            <motion.div
              animate={{ width: `${progressValue}%` }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="h-full rounded-full bg-[#1381FF]"
            />
          </div>
        </div>
      ) : null}

      <div className="text-center">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1381FF]">{eyebrow}</p>
        ) : null}
        {icon ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-[#1381FF]"
          >
            {icon}
          </motion.div>
        ) : null}
        <h1 className="mt-6 text-[32px] font-semibold leading-10 tracking-tight text-gray-950">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-5 text-gray-500">{description}</p>
      </div>

      {children}
    </motion.main>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      {title || description ? (
        <div className="mb-4">
          {title ? <h3 className="text-sm font-semibold text-gray-950">{title}</h3> : null}
          {description ? <p className="mt-1 text-xs leading-4 text-gray-500">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function FormField({
  label,
  helper,
  error,
  children,
}: {
  label: string;
  helper?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium leading-4 text-gray-700">{label}</span>
      {children}
      {error ? (
        <div className="mt-2 text-xs leading-4 text-red-600">{error}</div>
      ) : helper ? (
        <div className="mt-2 text-xs leading-4 text-gray-500">{helper}</div>
      ) : null}
    </label>
  );
}

type StepCTAProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'facebook';
};

export function StepCTA({
  loading = false,
  icon,
  variant = 'primary',
  disabled,
  children,
  className = '',
  ...props
}: StepCTAProps) {
  const variantClassName =
    variant === 'facebook'
      ? 'bg-[#1877F2] text-white shadow-lg shadow-[#1877F2]/20 hover:bg-[#166FE5]'
      : variant === 'success'
        ? 'bg-[#25D366] text-white shadow-lg shadow-[#25D366]/20 hover:bg-[#20bd5a]'
        : variant === 'secondary'
          ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          : 'bg-[#1381FF] text-white shadow-lg shadow-sky-500/20 hover:bg-[#0F6FEA]';

  return (
    <motion.button
      whileHover={!disabled ? { y: -1 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      disabled={disabled}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClassName} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}
