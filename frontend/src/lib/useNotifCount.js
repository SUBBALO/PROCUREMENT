import { useEffect, useState } from "react";
import api from "./api";

/**
 * useNotifCount(categoryKey) — subscribe ke global /notifications endpoint
 * dan return count untuk category tertentu (mis. "drawing_pending_approval").
 * Poll setiap 45 detik.
 */
export function useNotifCount(categoryKey) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get("/notifications");
        if (cancelled) return;
        const cat = (data.categories || []).find((c) => c.key === categoryKey);
        setCount(cat?.count || 0);
      } catch { /* silent */ }
    };
    tick();
    const id = setInterval(tick, 45000);
    return () => { cancelled = true; clearInterval(id); };
  }, [categoryKey]);

  return count;
}
