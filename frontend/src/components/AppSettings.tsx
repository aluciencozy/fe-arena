import { Info } from "lucide-react";

export const AppSettings = () => (
  <span title="FE Arena is an unofficial study tool and is not affiliated with UCF" className="flex items-center gap-2 text-xs text-[var(--muted)]">
    <Info size={14} /> <span className="hidden sm:inline">unofficial study tool</span>
  </span>
);
