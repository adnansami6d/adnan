"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/Button";

/**
 * Submit button for forms that use a server action ("use server"), where there is no client state (milestone M1).
 * MUST be placed inside the <form>. While the form is being sent it shows a spinner and stays locked.
 *
 *   <form action={saveAction}>
 *     ...
 *     <SubmitButton>সেভ করুন</SubmitButton>
 *   </form>
 *
 * Double-tap protection: the first tap locks the button in the DOM right away (React needs a moment to
 * report "pending"), so a very fast second tap cannot send the form twice.
 */
type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export default function SubmitButton({
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  onClick,
  children,
  ...rest
}: Props) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  pendingRef.current = pending;

  // form finished -> unlock
  useEffect(() => {
    if (!pending && ref.current) delete ref.current.dataset.locked;
  }, [pending]);

  return (
    <button
      {...rest}
      ref={ref}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={(e) => {
        const el = e.currentTarget;
        if (el.dataset.locked === "1") {
          e.preventDefault();
          return;
        }
        onClick?.(e);
        if (e.defaultPrevented) return;
        el.dataset.locked = "1";
        // if the browser stops the submit (e.g. a required field is empty) nothing becomes pending: unlock after 0.7s
        window.setTimeout(() => {
          if (!pendingRef.current) delete el.dataset.locked;
        }, 700);
      }}
      className={buttonClasses(variant, size, className)}
    >
      {children}
      {pending && <span className="sr-only">অপেক্ষা করুন...</span>}
    </button>
  );
}
