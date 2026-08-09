import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, ArrowLeft, Sparkle } from "@phosphor-icons/react";

/**
 * Reusable department sub-portal (LIGHT theme) — minimalist launcher.
 *
 * Redesigned per design_guidelines.md: setiap GROUP jadi container tipis berisi
 * grid "tile mini" (bukan kartu besar per item). Accent hanya berupa rail 2px +
 * tint ikon; subtitle disembunyikan agar tidak ramai. API props tidak berubah.
 */
export default function DeptPortal({ deptLabel, deptTagline, accentColor = "sky", cards, groups, children, compactCards = false, cardsFirst = false, cardsLabel = "Menu", sidebarMenu = false }) {
  const navigate = useNavigate();

  const go = (c) => {
    if (c.comingSoon) return;
    if (typeof c.onClick === "function") { c.onClick(); return; }
    if (c.href && c.href !== "#") navigate(c.href);
  };

  const tileGrid = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2";

  const renderTiles = (list) => (
    <div className={tileGrid}>
      {list.map((c) => <LauncherTile key={c.key} card={c} onEnter={() => go(c)} />)}
    </div>
  );

  // Kartu besar (klasik) — dipakai untuk portal departemen non-Engineering
  const bigGrid = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3";
  const renderBigCards = (list) => (
    <div className={bigGrid}>
      {list.map((c, idx) => <BigCard key={c.key} card={c} onEnter={() => go(c)} delay={idx * 60} />)}
    </div>
  );

  const cardsBlock = (
    <>
      {Array.isArray(groups) && groups.length > 0 ? (
        <div className="space-y-3" data-testid="dept-portal-groups">
          {groups.filter((g) => (g.cards || []).length > 0).map((g) => (
            <section
              key={g.key}
              data-testid={`dept-portal-group-${g.key}`}
              className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-[2px]"
            >
              <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                <h2 className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-slate-500">{g.label}</h2>
                <span className="text-[10px] font-semibold text-slate-300 tabular-nums">{(g.cards || []).length}</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>
              <div className="px-3 pb-3">{renderTiles(g.cards)}</div>
            </section>
          ))}
        </div>
      ) : (
        compactCards ? (
          <div className="rounded-xl border border-slate-200 bg-white/80">
            <div className="px-4 pt-3 pb-1.5 text-[10.5px] uppercase tracking-[0.16em] font-bold text-slate-500">{cardsLabel}</div>
            <div className="px-3 pb-3">{renderTiles(cards || [])}</div>
          </div>
        ) : (
          renderBigCards(cards || [])
        )
      )}
    </>
  );

  const childrenBlock = children && <div className={cardsFirst ? "mt-5" : "mb-5"} data-testid="dept-portal-children">{children}</div>;

  // Sidebar menu (kompak, vertikal) — dipakai bila sidebarMenu=true & ada children.
  const sidebarGroups = Array.isArray(groups) && groups.length > 0
    ? groups.filter((g) => (g.cards || []).length > 0)
    : (cards && cards.length > 0 ? [{ key: "_all", label: cardsLabel, cards }] : []);

  const sidebarBlock = (
    <aside className="order-2 lg:order-1 w-full lg:w-[288px] shrink-0 lg:sticky lg:top-4 self-start space-y-3" data-testid="dept-portal-groups">
      {sidebarGroups.map((g) => (
        <section key={g.key} data-testid={`dept-portal-group-${g.key}`} className="rounded-xl border border-slate-200 bg-white/80">
          <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2">
            <h2 className="text-[10px] font-bold tracking-[0.16em] uppercase text-slate-500">{g.label}</h2>
            <span className="text-[10px] font-semibold text-slate-300 tabular-nums">{(g.cards || []).length}</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <div className="px-2 pb-2 space-y-1">
            {g.cards.map((c) => <LauncherTile key={c.key} card={c} onEnter={() => go(c)} dense />)}
          </div>
        </section>
      ))}
    </aside>
  );

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 text-slate-900 relative overflow-hidden -mx-6 -my-6">
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className={`absolute -top-40 -left-40 w-96 h-96 bg-${accentColor}-200/30 blur-3xl rounded-full pointer-events-none`} />

      <div className="relative max-w-[1200px] 2xl:max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <Link
          to="/"
          data-testid="dept-portal-back-link"
          className="inline-flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-300 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px] mb-3"
        >
          <ArrowLeft size={16} weight="bold" /> Kembali ke Portal Utama
        </Link>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkle size={13} weight="fill" className="text-amber-500" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-slate-400">{deptLabel} Sub-Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            {deptLabel}
          </h1>
          {deptTagline && <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-snug">{deptTagline}</p>}
        </div>

        {sidebarMenu && children ? (
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {sidebarBlock}
            <main className="order-1 lg:order-2 flex-1 min-w-0 w-full" data-testid="dept-portal-children">{children}</main>
          </div>
        ) : (
          cardsFirst ? (<>{cardsBlock}{childrenBlock}</>) : (<>{childrenBlock}{cardsBlock}</>)
        )}
      </div>
    </div>
  );
}


function LauncherTile({ card, onEnter, dense = false }) {
  const Icon = card.icon;
  const accentText = (card.accentText || "text-slate-500").replace(/-4\d\d/, "-600");
  const disabled = card.comingSoon || (!card.href && typeof card.onClick !== "function") || card.href === "#";
  const hasBadge = !card.comingSoon && card.badgeCount > 0;

  return (
    <button
      type="button"
      data-testid={`dept-portal-nav-item-${card.key}`}
      onClick={onEnter}
      disabled={disabled}
      title={card.description || card.label}
      className={`group relative flex items-center text-left rounded-lg border bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:opacity-50 disabled:cursor-not-allowed ${dense ? "gap-2.5 border-slate-200/80 pl-3 pr-2.5 min-h-[44px] py-1.5" : "gap-3 border-slate-200 pl-4 pr-3 h-[54px]"}`}
    >
      {/* rail accent 2px */}
      <span className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-gradient-to-b ${card.accent || "from-slate-300 to-slate-400"} opacity-80`} />
      <span className={`grid place-items-center rounded-md bg-slate-50 border border-slate-200 shrink-0 group-hover:bg-white transition-colors duration-150 ${dense ? "w-7 h-7" : "w-8 h-8"}`}>
        <Icon size={dense ? 16 : 18} weight="duotone" className={accentText} />
      </span>
      <span className={`min-w-0 flex-1 font-semibold text-slate-900 leading-tight ${dense ? "text-[12.5px] line-clamp-2" : "text-[13px] line-clamp-1"}`} style={{ fontFamily: "Chivo, sans-serif" }}>
        {card.label}
      </span>
      {hasBadge && (
        <span
          data-testid={`dept-portal-nav-badge-${card.key}`}
          aria-label={`${card.badgeCount} item menunggu`}
          className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 tabular-nums min-w-[22px] h-[18px] px-1.5 text-[11px] font-bold shrink-0"
        >
          {card.badgeCount > 99 ? "99+" : card.badgeCount}
        </span>
      )}
      {card.comingSoon && (
        <span className="text-[8px] uppercase tracking-[0.15em] font-bold text-slate-400 border border-slate-200 px-1.5 py-0.5 shrink-0">Soon</span>
      )}
      {!disabled && !hasBadge && (
        <ArrowRight size={14} weight="bold" className="text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-[opacity,transform] duration-150 shrink-0" />
      )}
    </button>
  );
}


/* Kartu besar klasik (deskripsi + stats) — portal departemen non-Engineering */
function BigCard({ card, onEnter, delay }) {
  const Icon = card.icon;
  const accentText = (card.accentText || "text-slate-500").replace(/-4\d\d/, "-600");
  const disabled = card.comingSoon || (!card.href && typeof card.onClick !== "function") || card.href === "#";
  return (
    <button
      type="button"
      data-testid={`dept-portal-nav-item-${card.key}`}
      onClick={onEnter}
      disabled={disabled}
      className="group relative text-left bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-lg transition-[box-shadow,border-color,transform] duration-200 overflow-hidden disabled:cursor-not-allowed disabled:opacity-60 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
      style={{ animationDelay: `${delay}ms`, animationName: "fadeSlideIn", animationDuration: "500ms", animationFillMode: "backwards" }}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent || "from-slate-300 to-slate-400"} opacity-70 group-hover:opacity-100 transition-opacity`} />
      {card.comingSoon && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-[8px] uppercase tracking-[0.15em] font-bold text-slate-600">
          Soon
        </div>
      )}
      {!card.comingSoon && card.badgeCount > 0 && (
        <div
          className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-rose-600 text-white text-[11px] font-bold rounded-full shadow-md"
          data-testid={`dept-portal-nav-badge-${card.key}`}
          title={`${card.badgeCount} item menunggu tindakan Anda`}
        >
          {card.badgeCount > 99 ? "99+" : card.badgeCount}
        </div>
      )}
      <div className="p-4 pt-5">
        <div className="w-11 h-11 flex items-center justify-center bg-slate-50 border border-slate-200 mb-3 rounded-md group-hover:bg-slate-100 transition-colors">
          <Icon size={22} weight="duotone" className={accentText} />
        </div>
        <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1">{card.stats || ""}</div>
        <h3 className="text-lg font-bold tracking-tight text-slate-900 mb-1.5" style={{ fontFamily: "Chivo, sans-serif" }}>{card.label}</h3>
        <p className="text-[11px] text-slate-600 leading-snug mb-3 min-h-[42px]">{card.description}</p>
        <div className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-bold ${accentText} group-hover:gap-2 transition-all`}>
          {card.comingSoon ? "Segera" : "Buka"}
          {!card.comingSoon && <ArrowRight size={12} weight="bold" />}
        </div>
      </div>
    </button>
  );
}
