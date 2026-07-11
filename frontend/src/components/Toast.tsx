import { Check, X } from "lucide-react";

export const Toast = ({ message, onDismiss }: { message: string; onDismiss?: () => void }) => {
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="surface-raised page-enter fixed bottom-5 left-1/2 z-[100] flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 px-4 py-3 text-sm">
      <Check className="shrink-0 text-success" size={16} />
      <span className="flex-1">{message}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="text-muted-foreground hover:text-foreground"><X size={15} /></button>}
    </div>
  );
};
