import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function Hero({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={`hero ${className}`}>{children}</h1>;
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="lede">{children}</p>;
}

export function Button({
  children,
  href,
  variant = 'primary',
  className = '',
  type = 'button',
  onClick,
  disabled,
}: {
  children: ReactNode;
  href?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  disabled?: boolean;
}) {
  const cls = `btn btn-${variant} ${className}`;
  if (href) {
    return (
      <Link className={cls} href={href}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Card({
  children,
  soft = false,
  className = '',
}: {
  children: ReactNode;
  soft?: boolean;
  className?: string;
}) {
  return <div className={`card ${soft ? 'card-soft' : ''} ${className}`}>{children}</div>;
}

/** Compact panel failure — title + optional body + retry/action. */
export function ErrorState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" data-testid="error-state">
      <p className="text-[13px] text-[color:var(--accent)] m-0 mb-2">{title}</p>
      {body ? <p className="text-[13px] text-[color:var(--muted)] m-0 mb-3">{body}</p> : null}
      {action ?? null}
    </div>
  );
}
