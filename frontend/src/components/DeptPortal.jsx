import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, ArrowLeft, Sparkle } from "@phosphor-icons/react";

/**
 * Reusable department sub-portal.
 * Renders a set of function cards, mimicking the top-level Landing but scoped to one dept.
 */
export default function DeptPortal({ deptLabel, deptTagline, accentColor = "sky", cards }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-950 text-white relative overflow-hidden -mx-6 -my-6">
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className={`absolute -top-40 -left-40 w-96 h-96 bg-${accentColor}-500/20 blur-3xl rounded-full pointer-events-none`} />

      <div className="relative max-w-[1400px] mx-auto px-8 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.15em] text-slate-400 hover:text-white transition-colors mb-8">
          <ArrowLeft size={12} weight="bold" /> Kembali ke Portal Utama
        </Link>

        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkle size={14} weight="fill" className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-slate-400">{deptLabel} Sub-Portal</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white" style={{ fontFamily: "Chivo, sans-serif" }}>
            {deptLabel}
          </h1>
          {deptTagline && <p className="mt-2 text-sm text-slate-400">{deptTagline}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((c, idx) => (
            <Card key={c.key} card={c} onEnter={() => c.href && c.href !== "#" && !c.comingSoon && navigate(c.href)} delay={idx * 60} />
          ))}
        </div>
      </div>
    </div>
  );
}


function Card({ card, onEnter, delay }) {
  const Icon = card.icon;
  return (
    <button
      data-testid={`subcard-${card.key}`}
      onClick={onEnter}
      disabled={card.comingSoon || !card.href || card.href === "#"}
      className="group relative text-left bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all duration-300 overflow-hidden disabled:cursor-not-allowed hover:-translate-y-1"
      style={{ animationDelay: `${delay}ms`, animationName: "fadeSlideIn", animationDuration: "500ms", animationFillMode: "backwards" }}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent} opacity-60 group-hover:opacity-100 transition-opacity`} />
      {card.comingSoon && (
        <div className="absolute top-3 right-3 px-2 py-0.5 bg-slate-700 border border-slate-600 text-[9px] uppercase tracking-[0.15em] font-bold text-slate-300">
          Coming Soon
        </div>
      )}
      <div className="p-6 pt-8">
        <div className={`w-12 h-12 flex items-center justify-center bg-slate-800 border border-slate-700 mb-5`}>
          <Icon size={22} weight="duotone" className={card.accentText} />
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5">{card.stats || ""}</div>
        <h3 className="text-xl font-bold tracking-tight text-white mb-2" style={{ fontFamily: "Chivo, sans-serif" }}>{card.label}</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-5 min-h-[40px]">{card.description}</p>
        <div className={`inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] font-bold ${card.accentText} group-hover:gap-3 transition-all`}>
          {card.comingSoon ? "Segera" : "Buka"}
          {!card.comingSoon && <ArrowRight size={13} weight="bold" />}
        </div>
      </div>
    </button>
  );
}
