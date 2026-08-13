import { useEffect, useRef } from "react";


interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export default function Drawer({ open, title, onClose, children, returnFocusRef }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      window.requestAnimationFrame(() => close.current?.focus());
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      returnFocusRef?.current?.focus();
    }
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="drawer-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header>
          <h2 id="drawer-title">{title}</h2>
          <button ref={close} type="button" onClick={onClose} aria-label={`Close ${title}`}>
            Close
          </button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  );
}
