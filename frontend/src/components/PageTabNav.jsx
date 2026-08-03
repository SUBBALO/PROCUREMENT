import React from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * PageTabNav — bar tab navigasi lintas-halaman (ringan).
 * Menautkan beberapa halaman yang sudah ada agar terasa seperti satu layar bertab,
 * tanpa membongkar logika masing-masing halaman.
 *
 * Props:
 *   tabs: [{ key, label, to, icon?, badge? }]
 */
export default function PageTabNav({ tabs = [] }) {
  const { pathname } = useLocation();
  if (!tabs.length) return null;
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200" data-testid="page-tab-nav">
      {tabs.map((t) => {
        const active = pathname === t.to || pathname.startsWith(t.to + "/");
        return (
          <Link
            key={t.key || t.to}
            to={t.to}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors ${
              active
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
            data-testid={`page-tab-${t.key || ""}`}
          >
            {t.icon ? <t.icon size={15} weight="bold" /> : null}
            {t.label}
            {t.badge ? (
              <span className="ml-1 text-[10px] font-bold bg-rose-500 text-white rounded-full px-1.5 py-0.5 tabular-nums">
                {t.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
