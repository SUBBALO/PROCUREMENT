import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import PaginationBar, { usePagination } from "../components/PaginationBar";
import { ArrowClockwise, MagnifyingGlass, Archive, ArrowSquareOut, Clock, PencilSimpleLine, Factory, ShieldCheck, X } from "@phosphor-icons/react";

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
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [quick, setQuick] = useState(null); // {type:'kind'|'stat', value} — filter cepat klik (client-side)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = [];
      if (q.trim()) params.push(`q=${encodeURIComponent(q.trim())}`);
      if (kindFilter) params.push(`kind=${kindFilter}`);
      if (statusFilter) params.push(`status=${statusFilter}`);
      if (dateFrom) params.push(`date_from=${dateFrom}`);
      if (dateTo) params.push(`date_to=${dateTo}`);
      const { data } = await api.get(`/ecn-register${params.length ? `?${params.join("&")}` : ""}`);
      setItems(data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal muat data");
    } finally { setLoading(false); }
  }, [q, kindFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const ecnCount = items.filter((r) => r.kind === "ecn").length;
  const ecrCount = items.filter((r) => r.kind === "ecr").length;

  // Predikat status ECN (dipakai untuk hitung ringkasan & filter-cepat klik)
  const STAT_PRED = {
    pending: (r) => r.kind === "ecn" && r.status === "pending",
    revising: (r) => r.kind === "ecn" && r.status === "in_progress" && !r.ack_stage,
    prod: (r) => r.kind === "ecn" && r.ack_stage === "production",
    qc: (r) => r.kind === "ecn" && r.ack_stage === "qa_qc",
    done: (r) => r.kind === "ecn" && (r.ack_stage === "done" || r.ack_doc_control),
  };

  // Ringkasan status ECN (perubahan drawing) — dipindah dari dashboard ke sini
  const ecnSummary = [
    { key: "pending", label: "Menunggu Leader", icon: Clock, cls: "border-amber-300 text-amber-700 bg-amber-50/60" },
    { key: "revising", label: "Sedang Revisi", icon: PencilSimpleLine, cls: "border-teal-300 text-teal-700 bg-teal-50/60" },
    { key: "prod", label: "Menunggu Produksi", icon: Factory, cls: "border-orange-300 text-orange-700 bg-orange-50/60" },
    { key: "qc", label: "Menunggu QA/QC", icon: ShieldCheck, cls: "border-sky-300 text-sky-700 bg-sky-50/60" },
    { key: "done", label: "Selesai (Distribusi)", icon: Archive, cls: "border-emerald-300 text-emerald-700 bg-emerald-50/60" },
  ].map((s) => ({ ...s, value: items.filter(STAT_PRED[s.key]).length }));

  // Filter-cepat client-side: klik chip jenis / kotak statistik → saring tabel
  const quickMatch = (r) => {
    if (!quick) return true;
    if (quick.type === "kind") return r.kind === quick.value;
    if (quick.type === "stat") return (STAT_PRED[quick.value] || (() => true))(r);
    return true;
  };
  const displayItems = items.filter(quickMatch);
  const pag = usePagination(displayItems, 20);
  const toggleQuick = (type, value) =>
    setQuick((cur) => (cur && cur.type === type && cur.value === value ? null : { type, value }));
  const quickLabel = quick
    ? (quick.type === "kind"
        ? `Jenis: ${quick.value.toUpperCase()}`
        : `Status: ${(ecnSummary.find((s) => s.key === quick.value) || {}).label || quick.value}`)
    : "";

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
          <button
            type="button"
            onClick={() => toggleQuick("kind", "ecn")}
            className={`border px-3 py-2 text-center min-w-[80px] transition-colors ${quick?.type === "kind" && quick?.value === "ecn" ? "border-fuchsia-500 bg-fuchsia-100 ring-2 ring-fuchsia-300" : "border-fuchsia-300 bg-fuchsia-50 hover:bg-fuchsia-100"}`}
            data-testid="ecn-count"
            title="Klik untuk filter hanya ECN"
          >
            <div className="text-lg font-bold text-fuchsia-800">{ecnCount}</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-fuchsia-600">ECN</div>
          </button>
          <button
            type="button"
            onClick={() => toggleQuick("kind", "ecr")}
            className={`border px-3 py-2 text-center min-w-[80px] transition-colors ${quick?.type === "kind" && quick?.value === "ecr" ? "border-blue-500 bg-blue-100 ring-2 ring-blue-300" : "border-blue-300 bg-blue-50 hover:bg-blue-100"}`}
            data-testid="ecr-count"
            title="Klik untuk filter hanya ECR (permintaan customer)"
          >
            <div className="text-lg font-bold text-blue-800">{ecrCount}</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-blue-600">ECR</div>
          </button>
        </div>
      </div>

      {/* Ringkasan status ECN — Perubahan Drawing (dipindah dari dashboard, tampil langsung di sini) */}
      <div className="border border-indigo-200 bg-indigo-50/40 rounded-md p-3" data-testid="ecn-summary-strip">
        <div className="flex items-center gap-2 mb-2">
          <PencilSimpleLine size={14} weight="bold" className="text-indigo-700" />
          <span className="text-[11px] uppercase tracking-widest font-bold text-indigo-700">Ringkasan ECN — Perubahan Drawing</span>
          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{ecnCount} total</span>
          {quick && (
            <button
              type="button"
              onClick={() => setQuick(null)}
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800"
              data-testid="ecn-quick-clear"
            >
              <X size={12} weight="bold" /> Filter: {quickLabel} · Hapus
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {ecnSummary.map((s) => {
            const active = quick?.type === "stat" && quick?.value === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleQuick("stat", s.key)}
                className={`text-left border ${s.cls} px-3 py-2 rounded-md transition-all hover:shadow-sm ${active ? "ring-2 ring-offset-1 ring-indigo-400 shadow-sm" : ""}`}
                data-testid={`ecn-strip-stat-${s.key}`}
                title={`Klik untuk filter: ${s.label}`}
              >
                <div className="flex items-center gap-1.5">
                  <s.icon size={14} weight="bold" />
                  <span className="text-[10px] uppercase tracking-wider font-bold">{s.label}</span>
                </div>
                <div className="text-2xl font-bold mt-0.5 tabular-nums">{s.value}</div>
              </button>
            );
          })}
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
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 border border-slate-300 rounded-none text-sm px-2" data-testid="ecn-status-filter">
            <option value="">Semua Status</option>
            <option value="pending">Menunggu Leader</option>
            <option value="approved">Disetujui</option>
            <option value="in_progress">Sedang Revisi</option>
            <option value="completed">Selesai</option>
            <option value="rejected">Ditolak</option>
          </select>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span>Reg:</span>
            <Input type="date" className="h-9 rounded-none border-slate-300 w-[140px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="ecn-date-from" />
            <span>–</span>
            <Input type="date" className="h-9 rounded-none border-slate-300 w-[140px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="ecn-date-to" />
          </div>
          <Button variant="outline" onClick={load} className="rounded-none h-9" data-testid="ecn-apply-filter">Terapkan</Button>
          {(statusFilter || dateFrom || dateTo || kindFilter || q) && (
            <Button variant="ghost" onClick={() => { setQ(""); setKindFilter(""); setStatusFilter(""); setDateFrom(""); setDateTo(""); setTimeout(load, 0); }} className="rounded-none h-9 text-slate-500" data-testid="ecn-reset-filter">Reset</Button>
          )}
          <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh"><ArrowClockwise size={14} weight="bold" /></Button>
          <div className="flex-1" />
          <div className="text-xs text-slate-500"><b className="text-indigo-700">{displayItems.length}</b> record{quick ? ` (dari ${items.length})` : ""}</div>
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
                <th className="text-left p-3">Timeline (Reg → Distribusi)</th>
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
                  <td className="p-3 text-[11px] whitespace-nowrap">
                    {e.source === "drawing_revision" ? (
                      <div className="grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-0.5">
                        <span className="text-slate-400">Reg:</span><span className="text-slate-700 font-medium">{fmtDate(e.date_reg || e.at)}</span>
                        <span className="text-slate-400">Mulai:</span><span className={e.date_start ? "text-slate-700 font-medium" : "text-slate-300"}>{e.date_start ? fmtDate(e.date_start) : "—"}</span>
                        <span className="text-slate-400">Selesai:</span><span className={e.date_done ? "text-slate-700 font-medium" : "text-slate-300"}>{e.date_done ? fmtDate(e.date_done) : "—"}</span>
                        <span className="text-slate-400">Distribusi:</span><span className={e.date_doco ? "text-emerald-700 font-semibold" : "text-slate-300"}>{e.date_doco ? fmtDate(e.date_doco) : "—"}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500">{fmtDate(e.at)}</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest border ${STATUS[e.status] || STATUS.draft}`}>{STATUS_LABEL[e.status] || e.status}</span>
                    {e.source === "drawing_revision" && e.ack_stage && (
                      <div className="mt-1 flex items-center justify-center gap-0.5" title="Progress TTD: Produksi → QA/QC → Doc Control">
                        <span className={`w-2 h-2 rounded-full ${e.ack_production ? "bg-emerald-500" : "bg-slate-300"}`} />
                        <span className={`w-2 h-2 rounded-full ${e.ack_qa_qc ? "bg-emerald-500" : "bg-slate-300"}`} />
                        <span className={`w-2 h-2 rounded-full ${e.ack_doc_control ? "bg-emerald-500" : "bg-slate-300"}`} />
                      </div>
                    )}
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
