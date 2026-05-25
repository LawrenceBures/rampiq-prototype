// RampIQ — Canonical operational action button.
// Presentation-only. No side effects beyond emitting onClick callback.
// Consolidates .act-btn, .csr-btn, .next-step, .sec-btn patterns.

interface ActionButtonProps {
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

/**
 * Operational action button. Used for acknowledge, resolve, escalate,
 * dispatch, and other operational actions.
 *
 * Variants:
 * - default: neutral background, standard border
 * - primary: amber background, black text (primary action)
 * - danger: red text, red border (destructive/escalation)
 * - ghost: transparent background, subtle border
 *
 * Sizes:
 * - sm: compact (6px 10px) — used in card action rows
 * - md: standard (8px 14px) — used in detail panels
 * - lg: large (12px 20px) — used in mobile agent flows
 */
export function ActionButton({
  label,
  onClick,
  variant = 'default',
  size = 'sm',
  disabled = false,
  className = '',
}: ActionButtonProps) {
  const padding = size === 'lg' ? '12px 20px' : size === 'md' ? '8px 14px' : '6px 10px';
  const fontSize = size === 'lg' ? 12 : 10;

  const baseStyle: React.CSSProperties = {
    padding,
    fontFamily: 'var(--rq-mono, monospace)',
    fontSize,
    fontWeight: variant === 'primary' ? 700 : 400,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: disabled ? 'default' : 'pointer',
    borderRadius: 3,
    border: '1px solid',
    transition: 'all 0.1s',
    opacity: disabled ? 0.5 : 1,
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      background: 'var(--rq-bg-3, #1a212c)',
      borderColor: 'var(--rq-line-2, #2a3442)',
      color: 'var(--rq-ink, #e8ecf2)',
    },
    primary: {
      background: 'var(--rq-amber, #f5b13d)',
      borderColor: 'var(--rq-amber, #f5b13d)',
      color: '#000',
    },
    danger: {
      background: 'transparent',
      borderColor: 'var(--rq-red-dim, #7a1f1f)',
      color: 'var(--rq-red, #ff5c5c)',
    },
    ghost: {
      background: 'transparent',
      borderColor: 'var(--rq-line, #1f2733)',
      color: 'var(--rq-ink-3, #6b7585)',
    },
  };

  return (
    <button
      className={className}
      style={{ ...baseStyle, ...variantStyles[variant] }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      type="button"
    >
      {label}
    </button>
  );
}
