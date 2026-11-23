import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function AccessibleDialog({ children, className = "", backdropClassName = "", labelId, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector(FOCUSABLE_SELECTOR)?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={`modal-backdrop ${backdropClassName}`.trim()} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className={`modal-card ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={labelId}>
        {children}
      </div>
    </div>
  );
}

export default AccessibleDialog;
