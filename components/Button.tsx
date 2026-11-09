import type { ButtonHTMLAttributes, MouseEvent } from "react";

/**
 * Taz Fashion button (design system M0). The look lives in app/globals.css (.btn, .btn-primary ...).
 *
 *   primary  -> dark raised button for the main action (order, login, pay)
 *   outline  -> white raised button for normal actions (this is the "secondary" style)
 *   danger   -> red button (cancel, delete)
 *   ghost    -> plain text action, no shadow and no border
 *
 * Built-in protection against double requests:
 *  1. `loading` disables the button and shows a spinner (the size does not change).
 *  2. Right after the first tap the button locks itself in the DOM, so a very fast double tap
 *     cannot slip through before React has re-rendered.
 *  3. If onClick returns a Promise, the button shows the spinner and stays locked until it finishes.
 */

export type ButtonVariant = "primary" | "outline" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  outline: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

const sizes: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "btn-md",
  lg: "btn-lg",
};

/** Use this to style a <Link> like a button: <Link className={buttonClasses("primary")} ...> */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return `btn ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

function isPromise(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as PromiseLike<unknown>).then === "function";
}

function guardedClick(onClick: Props["onClick"], e: MouseEvent<HTMLButtonElement>) {
  const el = e.currentTarget;

  // a second tap while the first one is still being handled: ignore it
  if (el.dataset.locked === "1") {
    e.preventDefault();
    return;
  }

  const result: unknown = onClick?.(e);

  if (isPromise(result)) {
    // async handler: spinner + lock until it finishes (success or error)
    el.dataset.locked = "1";
    el.dataset.pending = "true";
    const release = () => {
      delete el.dataset.locked;
      delete el.dataset.pending;
    };
    result.then(release, release);
  } else if (el.type === "submit" && !e.defaultPrevented) {
    // form submit: block fast double taps until the parent sets `loading` (or 0.7s passes)
    el.dataset.locked = "1";
    window.setTimeout(() => {
      delete el.dataset.locked;
    }, 700);
  }
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  type = "button",
  className = "",
  disabled,
  onClick,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => guardedClick(onClick, e)}
      className={buttonClasses(variant, size, className)}
    >
      {children}
      {loading && <span className="sr-only">অপেক্ষা করুন...</span>}
    </button>
  );
}
