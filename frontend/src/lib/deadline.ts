import { useEffect, useState } from "react";

export const useDeadlineSeconds = (deadline: number | null, intervalMs = 500) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [deadline, intervalMs]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
};
