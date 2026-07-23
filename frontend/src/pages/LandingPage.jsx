import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  Storefront, Wrench, ShoppingBag, Package, ClipboardText, ArrowRight, Sparkle
} from "@phosphor-icons/react";

/* -------------------- Department Definitions -------------------- */
const DEPARTMENTS = [
  {
    key: "sales",
    label: "Sales",
    tagline: "Inquiry · Quotation",
    description: "Kirim permintaan costing ke Engineering, buat quotation PDF, dan pantau status order (on-bidding, confirmed, cancelled).",
    icon: Storefront,
    href: "/sales",
    accent: "from-rose-500 via-red-500 to-orange-500",
    accentSolid: "bg-rose-600",
    accentText: "text-rose-600",
    accentBorder: "border-rose-300",
    stats: "Inquiry · Quotation",
    roles: ["admin", "finance", "sales"],
  },
  {
    key: "engineering",
    label: "Engineering",
    tagline: "Costing · Drawing · BOM",
    description: "Kelola BOM per SO dengan sistem revisi otomatis, respon permintaan costing dari Sales, dan simpan drawing pendukung.",
    icon: Wrench,
    href: "/bom",
    accent: "from-amber-500 via-yellow-500 to-lime-500",
    accentSolid: "bg-amber-600",
    accentText: "text-amber-600",
    accentBorder: "border-amber-300",
    stats: "Costing · Drawing · BOM",
    roles: ["admin", "finance", "engineering"],
  },
  {
    key: "purchasing",
    label: "Purchasing",
    tagline: "Input Transaksi · Vendor · Master List",
    description: "Input transaksi pembelian multi-currency, tarik PO dari AI PDF, kelola master item, dan export laporan Excel.",
    icon: ShoppingBag,
    href: "/master",
    accent: "from-sky-500 via-blue-500 to-indigo-500",
    accentSolid: "bg-sky-600",
    accentText: "text-sky-600",
    accentBorder: "border-sky-300",
    stats: "Transaksi · Master · Vendor",
    roles: ["admin", "finance", "staff"],
  },
  {
    key: "store",
    label: "Store",
    tagline: "Terima Barang · Stock · Keluar Barang",
    description: "GRN & Delivery Order, kelola FIFO stock, cetak Material Control Label, dan laporan incoming/outgoing.",
    icon: Package,
    href: "/store/stock",
    accent: "from-emerald-500 via-teal-500 to-cyan-500",
    accentSolid: "bg-emerald-600",
    accentText: "text-emerald-600",
    accentBorder: "border-emerald-300",
    stats: "Stock · GRN · Delivery",
    roles: ["admin", "finance", "store"],
  },
  {
    key: "qc",
    label: "Quality Control",
    tagline: "Inspection · Material Approval",
    description: "Inspection incoming material, approve/reject sebelum masuk stock, history inspection & non-conformance report.",
    icon: ClipboardText,
    href: "#",
    accent: "from-violet-500 via-purple-500 to-fuchsia-500",
    accentSolid: "bg-violet-600",
    accentText: "text-violet-600",
    accentBorder: "border-violet-300",
    stats: "Coming Soon",
    roles: ["admin", "finance", "qc"],
    comingSoon: true,
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || "";

  // Filter departments visible to this user
  const visible = DEPARTMENTS.filter((d) => d.roles.includes(role));

  const now = new Date();
  const greeting = now.getHours() < 11 ? "Selamat pagi" : now.getHours() < 15 ? "Selamat siang" : now.getHours() < 18 ? "Selamat sore" : "Selamat malam";

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-950 text-white relative overflow-hidden">
      {/* Grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Ambient glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-sky-500/20 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-rose-500/10 blur-3xl rounded-full pointer-events-none" />

      <div className="relative max-w-[1400px] mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-14">
          <div className="flex items-center gap-2 mb-3">
            <Sparkle size={14} weight="fill" className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-slate-400">Department Portal</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white" style={{ fontFamily: "Chivo, sans-serif" }}>
            {greeting}, <span className="italic text-amber-400 font-normal">{(user?.name || user?.username || "user").split(" ")[0]}</span>.
          </h1>
          <p className="mt-3 text-sm text-slate-400 max-w-2xl">
            Pilih departemen untuk mulai. Anda punya akses ke <b className="text-white">{visible.length} departemen</b> dari total 5.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((d, idx) => (
            <DeptCard key={d.key} dept={d} onEnter={() => !d.comingSoon && d.href !== "#" && navigate(d.href)} delay={idx * 60} />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-slate-800 text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <div>Developed by Purchasing Department &copy; {new Date().getFullYear()} — PT. Mitra Karya Sarana</div>
          <div className="text-slate-600">
            Peran Anda: <span className="text-slate-300">{role.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}


function DeptCard({ dept, onEnter, delay }) {
  const Icon = dept.icon;
  return (
    <button
      data-testid={`dept-card-${dept.key}`}
      onClick={onEnter}
      disabled={dept.comingSoon || dept.href === "#"}
      className="group relative text-left bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all duration-300 overflow-hidden disabled:cursor-not-allowed opacity-100 hover:-translate-y-1"
      style={{
        animationDelay: `${delay}ms`,
        animationName: "fadeSlideIn",
        animationDuration: "500ms",
        animationFillMode: "backwards",
      }}
    >
      {/* Gradient glow band on hover */}
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${dept.accent} opacity-60 group-hover:opacity-100 transition-opacity`} />

      {/* Coming Soon ribbon */}
      {dept.comingSoon && (
        <div className="absolute top-3 right-3 px-2 py-0.5 bg-slate-700 border border-slate-600 text-[9px] uppercase tracking-[0.15em] font-bold text-slate-300">
          Coming Soon
        </div>
      )}

      <div className="p-6 pt-8">
        {/* Icon */}
        <div className={`w-14 h-14 flex items-center justify-center bg-slate-800 border ${dept.accentBorder}/30 group-hover:bg-slate-800/50 mb-5 transition-colors`}>
          <Icon size={26} weight="duotone" className={dept.accentText} />
        </div>

        {/* Text */}
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500 mb-1.5">{dept.stats}</div>
        <h3 className="text-2xl font-bold tracking-tight text-white mb-2" style={{ fontFamily: "Chivo, sans-serif" }}>{dept.label}</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-6 min-h-[54px]">{dept.description}</p>

        {/* Enter button */}
        <div className={`inline-flex items-center gap-2 text-xs uppercase tracking-[0.15em] font-bold ${dept.accentText} group-hover:gap-3 transition-all`}>
          {dept.comingSoon ? "Segera Hadir" : "Masuk Departemen"}
          {!dept.comingSoon && <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-1" />}
        </div>
      </div>

      {/* Bottom accent line */}
      <div className={`h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent`} />
    </button>
  );
}

// Inject entrance animation keyframes once
if (typeof document !== "undefined" && !document.getElementById("landing-anim-style")) {
  const style = document.createElement("style");
  style.id = "landing-anim-style";
  style.textContent = `
    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
