import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import BackLink from "../components/BackLink";
import api, { formatDateID } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import {
  MagnifyingGlass,
  ClipboardText,
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  ArrowLeft,
  ArrowClockwise,
  ClipboardText as ClipboardIcon,
} from "@phosphor-icons/react";
import PaginationBar, { usePagination } from "../components/PaginationBar";

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-amber-600 text-sm";

const STATUS_BADGE = {
  draft: { bg: "bg-slate-200", text: "text-slate-800", label: "DRAFT", icon: ClipboardIcon },
  pending_review: { bg: "bg-amber-200", text: "text-amber-900", label: "MENUNGGU REVIEW", icon: Clock },
  approved: { bg: "bg-emerald-200", text: "text-emerald-800", label: "APPROVED", icon: CheckCircle },
};

export default function EngineeringMasterListPage() {
  const { user } = useAuth();
  const role = user?.role;
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // default: tampil semua (draft + pending + approved)
  const [items, setItems] = useState([]);
  const [drawingsBySo, setDrawingsBySo] = useState({}); // {so_no: [drawings]}
  const [loading, setLoading] = useState(false);

  const isEngLeader = ["eng_leader", "eng_head", "engineering", "admin", "super_admin", "supervisor"].includes(role);

  const [counts, setCounts] = useState({ draft: 0, pending_review: 0, approved: 0, total: 0 });
  const pag = usePagination(items, 20);

  const load = async () => {
    setLoading(true);
    try {
      // Parallel fetch: filtered list (for display) + full stats (for stat cards)
      const [listRes, statsRes] = await Promise.all([
        api.get("/bom", { params: { engineering_status: statusFilter, q: q.trim() || undefined, limit: 300 } }),
        api.get("/bom", { params: { engineering_status: "all", limit: 500 } }),
      ]);
      const boms = listRes.data.items || [];
      setItems(boms);

      // Global counts from all BOMs (regardless of current filter)
      const allBoms = statsRes.data.items || [];
      const c = { draft: 0, pending_review: 0, approved: 0, total: allBoms.length };
      allBoms.forEach((b) => {
        const s = b.engineering_status || "approved";
        if (c[s] !== undefined) c[s] += 1;
      });
      setCounts(c);

      // Fetch drawings for each unique SO in parallel (limit ke visible SOs)
      const soSet = [...new Set(boms.map((b) => b.so_no).filter(Boolean))];
      if (soSet.length > 0) {
        const results = await Promise.all(
          soSet.map((so) =>
            api.get("/drawings", { params: { so_no: so, limit: 20 } })
              .then((r) => [so, r.data.items || []])
              .catch(() => [so, []])
          )
        );
        const map = {};
        results.forEach(([so, drs]) => { map[so] = drs; });
        setDrawingsBySo(map);
      } else {
        setDrawingsBySo({});
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  return (
    <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-4">
      <BackLink />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link to="/engineering" className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
            <ArrowLeft size={14} weight="bold" /> Kembali ke Engineering Portal
          </Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">
            <ClipboardText className="inline-block mr-2 mb-1" size={26} weight="bold" />
            BOM Preparation & Approval
          </h1>
          <div className="text-xs text-slate-500">
            Ruang kerja Engineering untuk siapkan & review BOM sebelum masuk ke Purchasing. Setelah <b>Approved oleh Engineering Leader</b>, BOM otomatis muncul di halaman <Link to="/bom" className="underline text-amber-700">Bill of Material (BOM)</Link>.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/engineering/drawings"
            className="inline-flex items-center gap-1 px-3 h-9 bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold"
            data-testid="eml-goto-drawings"
          >
            <FileText size={14} weight="bold" /> Master Drawing
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="space-y-1">
        <div className="text-[10px] text-slate-500 italic">
          💡 Angka di kartu = <b>total di seluruh sistem</b>. Tabel di bawah = hasil filter yang aktif. Klik kartu untuk ganti filter, atau pakai dropdown di kanan.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Total (Semua)" value={counts.total} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          <StatCard label="Draft" value={counts.draft} color="slate" active={statusFilter === "draft"} onClick={() => setStatusFilter("draft")} />
          <StatCard label="Menunggu Review" value={counts.pending_review} color="amber" active={statusFilter === "pending_review"} onClick={() => setStatusFilter("pending_review")} />
          <StatCard label="Approved" value={counts.approved} color="emerald" active={statusFilter === "approved"} onClick={() => setStatusFilter("approved")} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-[240px]">
          <MagnifyingGlass size={14} weight="bold" className="text-slate-400" />
          <Input
            className={inputCls + " flex-1"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Cari BOM No, SO No, Project, Customer..."
            data-testid="eml-search"
          />
        </div>
        <select
          className={inputCls + " w-52"}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="eml-status-filter"
        >
          <option value="active">Aktif (Draft + Pending)</option>
          <option value="draft">Draft</option>
          <option value="pending_review">Menunggu Review</option>
          <option value="approved">Approved</option>
          <option value="all">Semua</option>
        </select>
        <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh">
          <ArrowClockwise size={14} weight="bold" />
        </Button>
      </div>

      {/* List */}
      <div className="bg-white border-2 border-slate-300 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="p-2 text-left text-[11px] font-bold">Status</th>
              <th className="p-2 text-left text-[11px] font-bold">BOM No</th>
              <th className="p-2 text-left text-[11px] font-bold">SO No</th>
              <th className="p-2 text-left text-[11px] font-bold">Customer / Project</th>
              <th className="p-2 text-left text-[11px] font-bold">Drawing(s) Terkait</th>
              <th className="p-2 text-center text-[11px] font-bold">Items</th>
              <th className="p-2 text-left text-[11px] font-bold">Prepared By</th>
              <th className="p-2 text-center text-[11px] font-bold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Memuat...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-slate-400">
                Belum ada BOM di status ini. Register drawing baru di <Link to="/engineering/drawings" className="underline text-violet-700">Master Drawing</Link> untuk memulai.
              </td></tr>
            )}
            {items.length > 0 && pag.pagedData.map((b) => {
              const st = b.engineering_status || "approved";
              const badge = STATUS_BADGE[st] || STATUS_BADGE.approved;
              const drs = drawingsBySo[b.so_no] || [];
              return (
                <tr key={b.id} className="border-b border-slate-200 hover:bg-amber-50/40">
                  <td className="p-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.bg.replace("bg-", "border-")}`}>
                      <badge.icon size={11} weight="bold" /> {badge.label}
                    </span>
                  </td>
                  <td className="p-2 font-mono font-bold text-slate-900">{b.bom_no}</td>
                  <td className="p-2 font-mono text-slate-700">{b.so_no || "-"}</td>
                  <td className="p-2 text-xs text-slate-700">
                    <div className="font-semibold">{b.customer || "-"}</div>
                    <div className="text-slate-500">{b.project_name || "-"}</div>
                  </td>
                  <td className="p-2 text-xs">
                    {drs.length === 0 ? (
                      <span className="text-slate-400 italic">-</span>
                    ) : (
                      <div className="space-y-0.5">
                        {drs.slice(0, 3).map((d) => (
                          <div key={d.id} className="flex items-center gap-1">
                            <FileText size={11} className="text-violet-600" />
                            <span className="font-mono text-[10px]">{d.drawing_no}</span>
                            {d.class_material && (
                              <span className="text-[9px] text-slate-500 truncate" title={d.class_material}>· {d.class_material}</span>
                            )}
                          </div>
                        ))}
                        {drs.length > 3 && <div className="text-[10px] text-slate-500">+{drs.length - 3} drawing lain</div>}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-center text-xs">
                    <span className="inline-block px-2 py-0.5 bg-slate-100 rounded font-mono">{(b.items || []).length}</span>
                  </td>
                  <td className="p-2 text-xs text-slate-600">{b.prepared_by || b.uploaded_by_name || "-"}</td>
                  <td className="p-2 text-center">
                    <Link
                      to={`/engineering/bom-entry/${b.id}`}
                      className={`inline-flex items-center gap-1 px-3 h-8 text-white text-[11px] font-bold ${
                        st === "draft" ? "bg-slate-700 hover:bg-slate-800" :
                        st === "pending_review" ? (isEngLeader ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700") :
                        "bg-slate-500 hover:bg-slate-600"
                      }`}
                      data-testid={`eml-open-${b.id}`}
                    >
                      {st === "draft" ? "Isi Data" : st === "pending_review" ? (isEngLeader ? "Review" : "Lihat") : "Lihat"}
                      <ArrowRight size={12} weight="bold" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <PaginationBar {...pag} label="BOM" testIdPrefix="eml-pag" />
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "slate", active, onClick }) {
  const bg = active ? `bg-${color}-100 border-${color}-500` : "bg-white border-slate-200";
  return (
    <button
      onClick={onClick}
      className={`border-2 p-3 text-left transition ${bg} hover:border-${color}-400`}
      data-testid={`eml-stat-${label.toLowerCase().replace(/ /g, "-")}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </button>
  );
}
