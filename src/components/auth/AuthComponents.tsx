import type { InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import BrandMark from '../BrandMark';
import connectionsMapImage from '../../../assets/connections-map.png';

export const authMotion = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  },
  slideUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  },
  buttonPress: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.97 },
  },
};

type AuthLayoutMode = 'login' | 'signup';
const MAIN_WEBSITE_URL = 'https://connektly.in/';
const AUTH_FOOTER_LINKS = [
  { label: 'Privacy Policy', href: 'https://connektly.in/privacy-policy/' },
  { label: 'Terms of Use', href: 'https://connektly.in/terms-of-service/' },
  { label: 'Data Deletion', href: 'https://connektly.in/data-deletion/' },
  { label: 'Help Center', href: 'https://connektly.in/help/' },
] as const;

export function AuthLayout({
  heroTitle,
  heroDescription,
  switchText,
  switchHref,
  switchLabel,
  children,
}: {
  mode: AuthLayoutMode;
  heroTitle: ReactNode;
  heroDescription: string;
  switchText: string;
  switchHref: string;
  switchLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#F8FAFC] text-[#0F172A]">
      <div className="mx-auto flex min-h-dvh max-w-[1280px]">
        <motion.aside
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.04, ease: [0.4, 0, 0.2, 1] }}
          className="hidden w-[48%] min-w-0 flex-col bg-[#F8FAFC] px-12 py-12 lg:flex"
        >
          <a
            href={MAIN_WEBSITE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-3"
          >
            <BrandMark className="h-10 w-10 shrink-0" />
            <span className="text-xl font-semibold tracking-tight text-[#0F172A]">Connektly</span>
          </a>

          <div className="mt-8 max-w-[440px]">
            <h1 className="text-[32px] font-semibold leading-10 tracking-tight text-[#0F172A]">{heroTitle}</h1>
            <p className="mt-4 text-sm leading-5 text-[#64748B]">{heroDescription}</p>
          </div>

          <motion.img
            src={connectionsMapImage}
            alt="Connektly dashboard preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className="mt-8 w-full max-w-[620px] -translate-x-24 object-contain"
            referrerPolicy="no-referrer"
          />
        </motion.aside>

        <main className="flex min-h-dvh w-full min-w-0 flex-1 flex-col rounded-b-[24px] border-x border-b border-[#E2E8F0] bg-white px-7 pt-5 pb-4 shadow-sm sm:m-6 sm:min-h-[calc(100dvh-3rem)] sm:rounded-[32px] sm:border sm:px-10 sm:py-4 lg:my-6 lg:mr-6 lg:ml-0 lg:w-[52%] lg:px-12 lg:py-10">
          <div className="flex items-center justify-center gap-4 text-sm sm:justify-between">
            <a
              href={MAIN_WEBSITE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center sm:gap-2 lg:hidden"
            >
              <BrandMark className="h-20 w-32 shrink-0 sm:h-9 sm:w-9" />
              <span className="hidden font-semibold tracking-tight text-[#0F172A] sm:inline">Connektly</span>
            </a>
            <div className="ml-auto hidden text-[#64748B] sm:block">
              <span>{switchText}</span>
              <Link to={switchHref} className="ml-1 font-semibold text-[#1381FF] transition hover:text-[#0F6FEA]">
                {switchLabel}
              </Link>
            </div>
          </div>

          <div className="flex flex-1 items-start justify-start pt-2 pb-8 sm:items-center sm:justify-center sm:py-8">
            <div className="w-full min-w-0 max-w-[320px] sm:max-w-[400px]">
              {children}

              <div className="mt-7 text-center text-sm text-[#64748B] sm:hidden">
                <span>{switchText}</span>
                <Link to={switchHref} className="ml-1 font-semibold text-[#1381FF] transition hover:text-[#0F6FEA]">
                  {switchLabel}
                </Link>
              </div>
            </div>
          </div>

          <footer className="border-t border-[#E2E8F0] pt-5">
            <nav aria-label="Auth footer links" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-x-4">
              {AUTH_FOOTER_LINKS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-medium text-[#64748B] transition hover:text-[#1381FF] sm:text-xs"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </footer>
        </main>
      </div>
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}

export function AuthForm({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <AuthCard>
      <motion.div {...authMotion.slideUp}>
        {eyebrow ? <p className="text-center text-xs font-medium leading-4 text-[#64748B] sm:text-left">{eyebrow}</p> : null}
        <h2 className={`${eyebrow ? 'mt-2' : ''} text-center text-[32px] font-semibold leading-10 tracking-tight text-[#0F172A] sm:text-left`}>{title}</h2>
        {description ? <p className="mt-2 text-center text-sm leading-5 text-[#64748B] sm:text-left">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </motion.div>
    </AuthCard>
  );
}

export function AuthAlert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: tone === 'error' ? -2 : 0 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      className={`rounded-lg border px-3 py-2 text-sm leading-5 ${
        tone === 'success'
          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
          : 'border-red-100 bg-red-50 text-red-700'
      }`}
    >
      {children}
    </motion.div>
  );
}

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  rightElement?: ReactNode;
};

export function InputField({ label, rightElement, className = '', id, ...props }: InputFieldProps) {
  const inputId = id || `auth-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-2 block text-xs font-medium leading-4 text-[#475569]">{label}</span>
      <div className="relative">
        <input
          id={inputId}
          {...props}
          className={`h-9 w-full rounded-2xl border border-[#8AC2FF] bg-white px-3 text-sm leading-5 text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#1381FF] focus:ring-2 focus:ring-[#1381FF]/20 sm:h-11 ${rightElement ? 'pr-11' : ''} ${className}`}
        />
        {rightElement}
      </div>
    </label>
  );
}

export function PasswordField({
  label,
  showCapsLockWarning = false,
  ...props
}: Omit<InputFieldProps, 'type' | 'rightElement'> & {
  showCapsLockWarning?: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  return (
    <div>
      <InputField
        {...props}
        label={label}
        type={isVisible ? 'text' : 'password'}
        onKeyUp={(event) => {
          setIsCapsLockOn(event.getModifierState('CapsLock'));
          props.onKeyUp?.(event);
        }}
        onBlur={(event) => {
          setIsCapsLockOn(false);
          props.onBlur?.(event);
        }}
        rightElement={
          <button
            type="button"
            onClick={() => setIsVisible((current) => !current)}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0F172A] sm:h-8 sm:w-8"
            aria-label={isVisible ? 'Hide password' : 'Show password'}
          >
            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
      />
      {showCapsLockWarning && isCapsLockOn ? (
        <motion.p {...authMotion.fadeIn} className="mt-2 text-xs leading-4 text-amber-600">
          Caps Lock is on.
        </motion.p>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.03 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.88v2.27h3.34l-.53 3.49h-2.81V24C19.61 23.1 24 18.1 24 12.07z"
      />
      <path
        fill="#FFFFFF"
        d="M16.67 15.56l.53-3.49h-3.34V9.8c0-.95.47-1.88 1.96-1.88h1.51V4.95s-1.37-.24-2.68-.24c-2.74 0-4.53 1.67-4.53 4.7v2.66H7.08v3.49h3.05V24c.61.09 1.23.14 1.87.14s1.26-.05 1.87-.14v-8.44h2.8z"
      />
    </svg>
  );
}

export function SocialLoginButton({
  provider,
  loading,
  disabled,
  children,
  onClick,
}: {
  provider: 'google' | 'facebook';
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      {...authMotion.buttonPress}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 min-w-0 w-full items-center justify-center gap-2 rounded-full border border-[#8AC2FF] bg-white px-3 text-sm font-medium text-[#0F172A] transition hover:border-[#1381FF] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:px-4"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : provider === 'google' ? <GoogleIcon /> : <FacebookIcon />}
      <span>{children}</span>
    </motion.button>
  );
}

export function Divider({ label = 'OR' }: { label?: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="h-px flex-1 bg-[#E2E8F0]" />
      <span className="text-xs font-medium leading-4 text-[#94A3B8]">{label}</span>
      <div className="h-px flex-1 bg-[#E2E8F0]" />
    </div>
  );
}

export function PrimaryAuthButton({
  loading,
  disabled,
  loadingLabel,
  children,
}: {
  loading?: boolean;
  disabled?: boolean;
  loadingLabel: string;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="submit"
      {...authMotion.buttonPress}
      disabled={disabled}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[#1381FF] px-4 text-sm font-medium text-white transition hover:bg-[#0F6FEA] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] sm:h-11"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {loading ? loadingLabel : children}
    </motion.button>
  );
}
