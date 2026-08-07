import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, ArrowLeft, Sparkle } from "@phosphor-icons/react";

/**
 * Reusable department sub-portal (LIGHT theme, 1-screen compact).
 */
export default function DeptPortal({ deptLabel, deptTagline, accentColor = "sky", cards, groups, children, compactCards = false, cardsFirst = false, cardsLabel = "Menu" }) {
  const navigate = useNavigate();

  const gridCls = compactCards
    ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 auto-rows-fr"
    : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3";

  const renderCards = (list) => (
    <div className={gridCls}>
      {list.map((c, idx) => (
        <Card
          key={c.key}
          card={c}
          compact={compactCards}
          onEnter={() => {
            if (c.comingSoon) return;
            if (typeof c.onClick === "function") { c.onClick(); return; }
            if (c.href && c.href !== "#") navigate(c.href);
          }}
          delay={idx * 60}
        />
      ))}
    </div>
  );

  const cardsBlock = (
    <>
      {Array.isArray(groups) && groups.length > 0 ? (
        <div className="space-y-4" data-testid="dept-portal-groups">
          {groups.filter((g) => (g.cards || []).length > 0).map((g) => (
            <div key={g.key} data-testid={`dept-group-${g.key}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">{g.label}</div>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              {renderCards(g.cards)}
            </div>
          ))}
        </div>
      ) : (
        <>
          {compactCards && (
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 mb-2">{cardsLabel}</div>
          )}
          {renderCards(cards || [])}
        </>
      )}
    </>
  );

  const childrenBlock = children && <div className={cardsFirst ? "mt-6" : "mb-5"}>{children}</div>;

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 text-slate-900 relative overflow-hidden -mx-6 -my-6">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className={`absolute -top-40 -left-40 w-96 h-96 bg-${accentColor}-200/40 blur-3xl rounded-full pointer-events-none`} />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-rose-200/30 blur-3xl rounded-full pointer-events-none" />

      <div className="relative max-w-[1400px] mx-auto px-6 py-5">
        <Link to="/" className="inline-flex items-center gap-2 px-3 h-9 text-xs uppercase tracking-[0.1em] font-bold text-slate-800 bg-white border-2 border-slate-400 shadow-sm hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors duration-150 active:translate-y-[1px] mb-4">
          <ArrowLeft size={16} weight="bold" /> Kembali ke Portal Utama
        </Link>

        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkle size={14} weight="fill" className="text-amber-500" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-slate-500">{deptLabel} Sub-Portal</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            {deptLabel}
          </h1>
          {deptTagline && <p className="mt-1.5 text-xs text-slate-600">{deptTagline}</p>}
        </div>

        {cardsFirst ? (
          <>
            {cardsBlock}
            {childrenBlock}
          </>
        ) : (
          <>
            {childrenBlock}
            {cardsBlock}
          </>
        )}
      </div>
    </div>
  );
}


function Card({ card, onEnter, delay, compact = false }) {
  const Icon = card.icon;
  // Convert -400 text tokens to -600 for readability on white
  const accentText = (card.accentText || "").replace(/-4\d\d/, "-600");
  if (compact) {
    return (
      <button
        data-testid={`subcard-${card.key}`}
        onClick={onEnter}
        disabled={card.comingSoon || (!card.href && typeof card.onClick !== "function") || card.href === "#"}
        className="group relative flex items-center gap-2.5 text-left bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors duration-200 overflow-hidden disabled:cursor-not-allowed px-3 py-2.5 min-h-[56px]"
        title={card.description}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${card.accent}`} />
        <div className="w-8 h-8 shrink-0 flex items-center justify-center bg-slate-50 border border-slate-200 group-hover:bg-white transition-colors">
          <Icon size={16} weight="duotone" className={accentText} />
        </div>
        <h3 className="text-[12px] font-bold tracking-tight text-slate-900 leading-tight flex-1 pr-5" style={{ fontFamily: "Chivo, sans-serif" }}>{card.label}</h3>
        {!card.comingSoon && card.badgeCount > 0 && (
          <div className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-600 text-white text-[10px] font-bold rounded-full" data-testid={`subcard-badge-${card.key}`}>
            {card.badgeCount > 99 ? "99+" : card.badgeCount}
          </div>
        )}
      </button>
    );
  }
  return (
    <button
      data-testid={`subcard-${card.key}`}
      onClick={onEnter}
      disabled={card.comingSoon || (!card.href && typeof card.onClick !== "function") || card.href === "#"}
      className="group relative text-left bg-white border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-300 overflow-hidden disabled:cursor-not-allowed hover:-translate-y-0.5"
      style={{ animationDelay: `${delay}ms`, animationName: "fadeSlideIn", animationDuration: "500ms", animationFillMode: "backwards" }}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent} opacity-70 group-hover:opacity-100 transition-opacity`} />
      {card.comingSoon && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-[8px] uppercase tracking-[0.15em] font-bold text-slate-600">
          Soon
        </div>
      )}
      {!card.comingSoon && card.badgeCount > 0 && (
        <div
          className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-red-600 text-white text-[11px] font-bold rounded-full animate-pulse shadow-md"
          data-testid={`subcard-badge-${card.key}`}
          title={`${card.badgeCount} item menunggu tindakan Anda`}
        >
          {card.badgeCount > 99 ? "99+" : card.badgeCount}
        </div>
      )}
      <div className="p-4 pt-5">
        <div className="w-11 h-11 flex items-center justify-center bg-slate-50 border border-slate-200 mb-3 group-hover:bg-slate-100 transition-colors">
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
