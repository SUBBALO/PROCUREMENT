import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import { ClipboardText, ArrowClockwise, MagnifyingGlass, Archive, ArrowSquareOut } from "@phosphor-icons/react";

const STATUS = {
  draft: "bg-slate-200 text-slate-700 border-slate-400",
  submitted: "bg-amber-100 text-amber-800 border-amber-500",
  pending: "bg-amber-100 text-amber-800 border-amber-500",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-500",
  in_progress: "bg-teal-100 text-teal-800 border-teal-500",
  completed: "bg-indigo-100 text-indigo-800 border-indigo-500",
  rejected: "bg-rose-100 text-rose-800 border-rose-500",
};
const STATUS_LABEL = {
  draft: "Draft", submitted: "Submitted", pending: "Menunggu Leader",
  approved: "Disetujui", in_progress: "Sedang Revisi", completed: "Selesai", rejected: "Ditolak",
};
const KIND_CLS = {
  ecr: "bg-blue-100 text-blue-800 border-blue-400",
  ecn: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-400",
};

function fmtDate(iso) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "-"; }
}

export default function ECNPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const pag = usePagination(items, 20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`);
      if (kindFilter) params.push(`kind=${kindFilter}`);
      const { data } = await api.get(`/ecn-register${params.length ? `?${params.join("&")}` : ""}`);
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat data");
    } finally { setLoading(false); }
  }, [q, kindFilter]);

  useEffect(() => { load(); }, [load]);

  const ecnCount = items.filter((r) => r.kind === "ecn").length;
  const ecrCount = items.filter((r) => r.kind === "ecr").length;

  return (
    <div className="p-4 max-w-[1300px] mx-auto space-y-4">
      <BackLink />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-600 mb-1">
            <Archive size={14} weight="fill" /> Engineering · Record
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Master List ECN &amp; ECR
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Arsip <b>read-only</b> seluruh perubahan drawing. <b>ECN</b> otomatis tercatat di sini setiap kali
            revisi diajukan dari <b>Master Drawing List</b> (Form MKS-F-ENG-004). <b>ECR</b> = permintaan perubahan dari customer.
            Drawing hasil revisi tetap diperbarui di <b>Master Drawing List</b> — halaman ini hanya untuk <b>record</b>.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="border border-fuchsia-300 bg-fuchsia-50 px-3 py-2 text-center min-w-[80px]" data-testid="ecn-count">
            <div className="text-lg font-bold text-fuchsia-800">{ecnCount}</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-fuchsia-600">ECN</div>
          </div>
          <div className="border border-blue-300 bg-blue-50 px-3 py-2 text-center min-w-[80px]" data-testid="ecr-count">
            <div className="text-lg font-bold text-blue-800">{ecrCount}</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-blue-600">ECR</div>
          </div>
        </div>
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <MagnifyingGlass size={14} className="text-slate-500" />
          <Input className="h-9 rounded-none border-slate-300 w-72" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Cari No / Drawing / SO / Customer / Pemohon..." data-testid="ecn-search" />
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="h-9 border border-slate-300 rounded-none text-sm px-2" data-testid="ecn-kind-filter">
            <option value="">Semua Jenis</option>
            <option value="ecn">ECN (Internal MKS)</option>
            <option value="ecr">ECR (Customer)</option>
          </select>
          <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh"><ArrowClockwise size={14} weight="bold" /></Button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500"><b className="text-indigo-700">{items.length}</b> record</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
                <th className="text-left p-3">No</th>
                <th className="text-left p-3">Jenis</th>
                <th className="text-left p-3">Drawing / Target</th>
                <th className="text-left p-3">SO</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Perubahan</th>
                <th className="text-left p-3">Pemohon</th>
                <th className="text-left p-3">Tanggal</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3"></th>
              </tr>
            </thead>
            <tbody data-testid="ecn-list">
              {loading && <tr><td colSpan={10} className="p-8 text-center text-slate-400">Memuat...</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={10} className="p-12 text-center text-slate-400">Belum ada record ECN/ECR. ECN tercatat otomatis saat revisi drawing diajukan dari Master Drawing List.</td></tr>}
              {!loading && pag.pagedData.map((e, idx) => (
                <tr key={`${e.no}-${idx}`} className="border-b border-slate-100 hover:bg-indigo-50/40" data-testid={`ecn-row-${e.no}`}>
                  <td className="p-3 font-mono font-bold text-slate-900 text-xs">{e.no}</td>
                  <td className="p-3"><span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${KIND_CLS[e.kind] || KIND_CLS.ecn}`}>{(e.kind || "ecn").toUpperCase()}</span></td>
                  <td className="p-3 text-xs font-mono">{e.drawing_no || "-"}{e.rev_no != null && <span className="ml-1 text-slate-400">Rev {e.rev_no}</span>}</td>
                  <td className="p-3 text-xs font-mono">{e.so_no || "-"}</td>
                  <td className="p-3 text-xs">{e.customer || "-"}</td>
                  <td className="p-3 text-xs max-w-[240px]">
                    {e.proposed_desc ? (
                      <span title={`Dari: ${e.current_desc || "-"}\nMenjadi: ${e.proposed_desc}`} className="line-clamp-2">{e.reason || e.proposed_desc}</span>
                    ) : (<span className="truncate" title={e.reason}>{e.reason || "-"}</span>)}
                  </td>
                  <td className="p-3 text-xs">{e.requested_by || "-"}</td>
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(e.at)}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest border ${STATUS[e.status] || STATUS.draft}`}>{STATUS_LABEL[e.status] || e.status}</span>
                  </td>
                  <td className="p-3 text-center">
                    {e.drawing_id && (
                      <Link to={`/engineering/work-order/${e.drawing_id}`} className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline" data-testid={`ecn-open-${e.no}`}>
                        <ArrowSquareOut size={12} weight="bold" /> Drawing
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pag} label="record" testIdPrefix="ecn-pag" />
      </Card>
    </div>
  );
}
