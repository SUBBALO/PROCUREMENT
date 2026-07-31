import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Iter 22 — Auto-logout kalau user idle terlalu lama.
 * Default: warning 5 menit sebelum timeout, logout 30 menit idle total.
 * Track events: mousemove, keydown, click, scroll, touchstart.
 *
 * Usage di App shell:
 *   useIdleLogout({ timeoutMinutes: 30, onLogout: () => authLogout() });
 */
export function useIdleLogout({ timeoutMinutes = 30, warnMinutes = 5, onLogout }) {
  const timerRef = useRef(null);
  const warnRef = useRef(null);
  const warned = useRef(false);

  useEffect(() => {
    const totalMs = timeoutMinutes * 60 * 1000;
    const warnMs = Math.max(1, timeoutMinutes - warnMinutes) * 60 * 1000;

    const reset = () => {
      warned.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);

      warnRef.current = setTimeout(() => {
        if (warned.current) return;
        warned.current = true;
        toast.warning(`Anda idle. Auto-logout dalam ${warnMinutes} menit jika tidak ada aktivitas.`,
                      { duration: 8000, id: "idle-warn" });
      }, warnMs);

      timerRef.current = setTimeout(() => {
        toast.error("Session berakhir karena idle terlalu lama. Silakan login ulang.",
                    { duration: 5000, id: "idle-logout" });
        onLogout?.();
      }, totalMs);
    };

    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "click"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset(); // start

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
    };
  }, [timeoutMinutes, warnMinutes, onLogout]);
}
