import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import SoProgressTracker from "../components/SoProgressTracker";
import BossApprovalPanel from "../components/BossApprovalPanel";
import {
  Storefront, Wrench, ShoppingBag, Package, ClipboardText, FileText, Factory, ArrowRight, Sparkle, Stamp, WarningCircle, Bank, Coins
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
    roles: ["admin", "super_admin", "supervisor", "finance", "sales", "sales_head"],
  },
  {
    key: "engineering",
    label: "Engineering",
    tagline: "Costing · Drawing · BOM",
    description: "Kelola BOM per SO dengan sistem revisi otomatis, respon permintaan costing dari Sales, dan simpan drawing pendukung.",
    icon: Wrench,
    href: "/engineering",
    accent: "from-amber-500 via-yellow-500 to-lime-500",
    accentSolid: "bg-amber-600",
    accentText: "text-amber-600",
    accentBorder: "border-amber-300",
    stats: "Costing · Drawing · BOM",
    roles: ["admin", "super_admin", "supervisor", "finance", "engineering", "eng_leader", "eng_head", "eng_staff", "purchasing"],
  },
  {
    key: "purchasing",
    label: "Purchasing",
    tagline: "Input Transaksi · Vendor · Master List",
    description: "Input transaksi pembelian multi-currency, tarik PO dari AI PDF, kelola master item, dan export laporan Excel.",
    icon: ShoppingBag,
    href: "/purchasing",
    accent: "from-sky-500 via-blue-500 to-indigo-500",
    accentSolid: "bg-sky-600",
    accentText: "text-sky-600",
    accentBorder: "border-sky-300",
    stats: "Transaksi · Master · Vendor",
    roles: ["admin", "super_admin", "supervisor", "finance", "staff", "purchasing"],
  },
  {
    key: "store",
    label: "Store",
    tagline: "Terima Barang · Stock · Keluar Barang",
    description: "GRN & Delivery Order, kelola FIFO stock, cetak Material Control Label, dan laporan incoming/outgoing.",
    icon: Package,
    href: "/store",
    accent: "from-emerald-500 via-teal-500 to-cyan-500",
    accentSolid: "bg-emerald-600",
    accentText: "text-emerald-600",
    accentBorder: "border-emerald-300",
    stats: "Stock · GRN · Delivery",
    roles: ["admin", "super_admin", "supervisor", "finance", "store"],
  },
  {
    key: "qc",
    label: "Quality Control",
    tagline: "Material Incoming Inspection · MII",
    description: "Inspection material incoming (MKS-F-QAD-002): isi form MII per receipt, catat dimension/visual/hasil OK-NG, cetak PDF ISO.",
    icon: ClipboardText,
    href: "/qc",
    accent: "from-violet-500 via-purple-500 to-fuchsia-500",
    accentSolid: "bg-violet-600",
    accentText: "text-violet-600",
    accentBorder: "border-violet-300",
    stats: "Inspection · MII",
    roles: ["admin", "super_admin", "supervisor", "finance", "qc"],
  },
  {
    key: "document-control",
    label: "Document Control",
    tagline: "Distribution Record · DC Stamp · SO Stamp Produksi",
    description: "Kelola verifikasi & stamp digital drawing yang sudah approved. Distribusi resmi controlled document + SO Stamp untuk Produksi.",
    icon: FileText,
    href: "/document-control",
    accent: "from-red-500 via-rose-500 to-pink-500",
    accentSolid: "bg-red-700",
    accentText: "text-red-700",
    accentBorder: "border-red-300",
    stats: "DC Stamp · SO Stamp · Controlled Copy",
    roles: ["admin", "super_admin", "supervisor", "doc_control", "document_control"],
  },
  {
    key: "controlled-drawings",
    label: "Controlled Drawing Database",
    tagline: "Master Repository Drawing Ter-Verifikasi",
    description: "Akses seluruh drawing yang sudah melalui Document Control. Search, preview, print (dgn watermark bila bukan DC).",
    icon: FileText,
    href: "/drawings/controlled",
    accent: "from-indigo-500 via-blue-500 to-cyan-500",
    accentSolid: "bg-indigo-700",
    accentText: "text-indigo-700",
    accentBorder: "border-indigo-300",
    stats: "Search · Preview · Print",
    roles: ["admin", "super_admin", "supervisor", "finance", "engineering", "eng_leader", "eng_head", "eng_staff", "purchasing", "qc", "sales", "sales_head", "doc_control", "document_control", "store", "staff"],
  },
  {
    key: "produksi",
    label: "PRODUCTION",
    tagline: "Acknowledge ECN · TTD Digital · Controlled Drawing",
    description: "Modul produksi: acknowledge/TTD perubahan drawing (ECN) yang menunggu tanda tangan Produksi, dan akses Controlled Drawing Database.",
    icon: Factory,
    href: "/produksi",
    accent: "from-orange-500 via-red-500 to-rose-500",
    accentSolid: "bg-orange-600",
    accentText: "text-orange-600",
    accentBorder: "border-orange-300",
    stats: "TTD ECN · Controlled Drawing",
    roles: ["admin", "super_admin", "supervisor", "production", "produksi"],
  },
  {
    key: "transfer-request",
    label: "Transfer / Finance",
    tagline: "Transfer Request Form · CRF-TT",
    description: "Ajukan pembayaran ke Finance (CRF-TT). Multi-vendor & multi-baris, auto-isi rekening dari Master Bank Vendor, PPh & valas fleksibel, preview & cetak PDF.",
    icon: Bank,
    href: "/transfer-request",
    accent: "from-sky-500 via-cyan-500 to-blue-500",
    accentSolid: "bg-sky-600",
    accentText: "text-sky-600",
    accentBorder: "border-sky-300",
    stats: "TRF · Vendor Bank · PDF",
    roles: ["admin", "super_admin", "sales_head", "finance"],
  },
  {
    key: "finance",
    label: "Finance",
    tagline: "Departemen Finance",
    description: "Portal Finance. Untuk sekarang berisi Daily Production Report — Biaya Tenaga Kerja (rate/jam × jam kerja) & Master Rate Karyawan. Rate hanya terlihat Finance & Admin.",
    icon: Coins,
    href: "/finance",
    accent: "from-emerald-500 via-green-500 to-teal-500",
    accentSolid: "bg-emerald-600",
    accentText: "text-emerald-600",
    accentBorder: "border-emerald-300",
    stats: "Biaya Tenaga Kerja · Rate",
    roles: ["admin", "super_admin", "finance"],
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || "";

  // Filter departments visible to this user.
  // Direktur (sales_head / Asiong) = akses view semua modul → tampilkan semua kartu.
  const visible = role === "sales_head"
    ? DEPARTMENTS
    : DEPARTMENTS.filter((d) => d.roles.includes(role));

  const now = new Date();
  const greeting = now.getHours() < 11 ? "Selamat pagi" : now.getHours() < 15 ? "Selamat siang" : now.getHours() < 18 ? "Selamat sore" : "Selamat malam";

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 text-slate-900 relative overflow-hidden">
      {/* Subtle grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Soft ambient glow (light theme) */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-sky-200/40 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-rose-200/40 blur-3xl rounded-full pointer-events-none" />

      <div className="relative max-w-[1400px] mx-auto px-6 py-5">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkle size={14} weight="fill" className="text-amber-500" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-slate-500">Command Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            {greeting}, <span className="italic text-amber-600 font-normal">{(user?.name || user?.username || "user").split(" ")[0]}</span>.
          </h1>
        </div>

        {/* 2 kolom: sidebar departemen (kiri) + SO Progress Tracker (utama) */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
          {/* Sidebar kiri — judul departemen */}
          <aside className="bg-white border border-slate-200" data-testid="dept-sidebar">
            <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
              Departemen ({visible.length})
            </div>
            <nav className="p-1.5 space-y-0.5">
              {visible.map((d) => {
                const Icon = d.icon;
                return (
                  <button
                    key={d.key}
                    data-testid={`dept-card-${d.key}`}
                    onClick={() => {
                      let href = d.href;
                      // Direktur: kartu Engineering langsung ke Monitor Beban Kerja
                      if (role === "sales_head" && d.key === "engineering") href = "/engineering/monitor";
                      if (href !== "#") navigate(href);
                    }}
                    className="group w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-slate-100 border-l-2 border-transparent hover:border-slate-900 transition-colors duration-150"
                  >
                    <span className={`w-8 h-8 flex items-center justify-center bg-slate-50 border ${d.accentBorder} shrink-0`}>
                      <Icon size={16} weight="duotone" className={d.accentText} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-slate-800 truncate" style={{ fontFamily: "Chivo, sans-serif" }}>{d.label}</span>
                      <span className="block text-[9px] uppercase tracking-wider text-slate-400 truncate">{d.tagline}</span>
                    </span>
                    <ArrowRight size={13} weight="bold" className="text-slate-300 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Area utama — Approval Direktur (di atas) + SO Progress Tracker */}
          <main>
            {role === "sales_head" && <BossApprovalPanel />}
            <SoProgressTracker />
          </main>
        </div>

        {/* Footer — MKS ERP branding */}
        <div className="mt-8 pt-6 border-t border-slate-200 text-center space-y-1.5">
          <div className="text-base font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Chivo, sans-serif" }}>
            MKS Management System <span className="text-sky-700">(ERP)</span>
          </div>
          <div className="text-sm text-slate-700">
            Integrated Enterprise Resource Planning System
          </div>
          <div className="text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-500">
            Sales <span className="text-sky-500">•</span> Engineering <span className="text-sky-500">•</span> Procurement <span className="text-sky-500">•</span> Store <span className="text-sky-500">•</span> Quality Control <span className="text-sky-500">•</span> Document Control <span className="text-sky-500">•</span> Production
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 pt-2">
            Developed by Purchasing Department &copy; {new Date().getFullYear()} — PT. Mitra Karya Sarana
          </div>
          <div className="text-[10px] text-slate-400">Peran Anda: <span className="text-slate-600 font-semibold">{role.toUpperCase()}</span></div>
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
      className="group relative text-left bg-white border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-300 overflow-hidden disabled:cursor-not-allowed opacity-100 hover:-translate-y-0.5"
      style={{
        animationDelay: `${delay}ms`,
        animationName: "fadeSlideIn",
        animationDuration: "500ms",
        animationFillMode: "backwards",
      }}
    >
      {/* Gradient glow band on hover */}
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${dept.accent} opacity-70 group-hover:opacity-100 transition-opacity`} />

      {/* Coming Soon ribbon */}
      {dept.comingSoon && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-[8px] uppercase tracking-[0.15em] font-bold text-slate-600">
          Soon
        </div>
      )}

      <div className="p-4 pt-5">
        {/* Icon */}
        <div className={`w-11 h-11 flex items-center justify-center bg-slate-50 border ${dept.accentBorder} mb-3 transition-colors group-hover:bg-slate-100`}>
          <Icon size={22} weight="duotone" className={dept.accentText} />
        </div>

        {/* Text */}
        <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-1">{dept.stats}</div>
        <h3 className="text-lg font-bold tracking-tight text-slate-900 mb-1.5" style={{ fontFamily: "Chivo, sans-serif" }}>{dept.label}</h3>
        <p className="text-[11px] text-slate-600 leading-snug mb-3 min-h-[48px]">{dept.description}</p>

        {/* Enter button */}
        <div className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-bold ${dept.accentText} group-hover:gap-2 transition-all`}>
          {dept.comingSoon ? "Segera Hadir" : "Masuk"}
          {!dept.comingSoon && <ArrowRight size={12} weight="bold" className="transition-transform group-hover:translate-x-1" />}
        </div>
      </div>

      {/* Bottom accent line */}
      <div className={`h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent`} />
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
