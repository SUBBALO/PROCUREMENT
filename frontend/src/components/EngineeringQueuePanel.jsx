import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import DrfDetailModal from "./DrfDetailModal";
import EngLeaderReviewDialog from "./EngLeaderReviewDialog";
import {
  PaperPlaneTilt, ArrowRight, ArrowClockwise,
  CheckCircle, Gear, Tray, Tray as TrayIcon, ListChecks, Eye, MagnifyingGlass,
  SealCheck, Signature,
} from "@phosphor-icons/react";

const TYPE_LABEL = { new_order: "New", repeat_order: "Repeat" };

// Badge Due Date: merah = lewat/overdue, kuning = ≤3 hari lagi, hijau = masih lama.
function DueBadge({ value }) {
  if (!value) return <span className="text-[11px] text-slate-300">—</span>;
  const t = Date.parse(value);
  if (isNaN(t)) return <span className="text-[11px] text-slate-400">{value}</span>;
  const now = Date.now();
  const days = Math.ceil((t - now) / 86400000);
  const label = new Date(t).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  let cls = "bg-emerald-50 text-emerald-700 border-emerald-300";
  let suffix = "";
  if (days < 0) { cls = "bg-rose-100 text-rose-800 border-rose-300"; suffix = ` · telat ${Math.abs(days)}h`; }
  else if (days === 0) { cls = "bg-rose-50 text-rose-700 border-rose-300"; suffix = " · hari ini"; }
  else if (days <= 3) { cls = "bg-amber-50 text-amber-800 border-amber-300"; suffix = ` · ${days}h lagi`; }
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold border whitespace-nowrap ${cls}`} title={`Due: ${label}`}>
      {label}{suffix}
    </span>
  );
}

const STATUS_META = {
  submitted: { label: "Perlu Diterima", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  accepted: { label: "Diterima", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  in_progress: { label: "Dikerjakan", cls: "bg-violet-100 text-violet-800 border-violet-300" },
};

/**
 * EngineeringQueuePanel — pusat antrian portal Engineering.
 * Untuk Leader (isHead) tampil sebagai 2 tab antrian:
 *   1. "Antrian Drawing Request & Inquiry" — DRF + Inquiry dari Sales (filter + list).
 *   2. "Menunggu Verifikasi Leader" — DRF/SO yang punya drawing pending_eng_head.
 *      Klik item langsung membuka EngLeaderReviewDialog (Review Dokumen SO).
 * Untuk eng staff non-leader: tetap fokus tile "Tugas Saya".
 */
export default function EngineeringQueuePanel({ isHead, isEngUser }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("incoming"); // "incoming" | "leader"
  const [drfs, setDrfs] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [detailDrf, setDetailDrf] = useState(null);

  // Antrian "Menunggu Verifikasi Leader"
  const [leaderRows, setLeaderRows] = useState([]);
  const [leaderLoading, setLeaderLoading] = useState(true);
  const [reviewTarget, setReviewTarget] = useState(null); // {drf_id, bom_id, bom_no, so_no}

  const fetchAll = useCallback(async () => {
    try {
      const jobs = [];
      if (isHead) {
        jobs.push(
          api.get("/drawing-requests", { params: { scope: "for_engineering" } })
            .then(({ data }) => setDrfs(data?.items || [])).catch(() => {}),
          api.get("/inquiries")
            .then(({ data }) => setInquiries(data?.items || [])).catch(() => {}),
        );
      }
      await Promise.all(jobs);
    } finally {
      setLoading(false);
    }
  }, [isHead]);

  const fetchLeaderQueue = useCallback(async () => {
    if (!isHead) { setLeaderLoading(false); return; }
    try {
      const { data } = await api.get("/engineering/pending-leader-verification");
      setLeaderRows(data?.items || []);
    } catch (e) {
      // panel opsional
    } finally {
      setLeaderLoading(false);
    }
  }, [isHead]);

  useEffect(() => {
    fetchAll();
    fetchLeaderQueue();
    const t = setInterval(() => { fetchAll(); fetchLeaderQueue(); }, 45000);
    return () => clearInterval(t);
  }, [fetchAll, fetchLeaderQueue]);

  // Buka tab "Menunggu Verifikasi Leader" saat kartu menu di-klik / hash #verifikasi
  useEffect(() => {
    if (!isHead) return;
    const openLeader = () => setTab("leader");
    if (typeof window !== "undefined" && window.location.hash === "#verifikasi") openLeader();
    window.addEventListener("open-leader-queue", openLeader);
    return () => window.removeEventListener("open-leader-queue", openLeader);
  }, [isHead]);

  // Normalisasi DRF + Inquiry → satu daftar antrian ("rows"), dibedakan via _kind
  const drfRows = drfs.map((d) => ({
    id: d.id, _kind: "drawing", _raw: d,
    form_no: d.form_no,
    subtype: TYPE_LABEL[d.request_type] || d.request_type,
    so_no: d.so_no || "-",
    customer_name: d.customer_name, project_name: d.project_name,
    engineer: d.assigned_engineer_name,
    status: d.status,
    due: d.expected_due_date || d.due_date,
  }));
  const normInqStatus = (s) => (s === "submitted" ? "submitted" : (s === "accepted" ? "accepted" : "in_progress"));
  const inqRows = inquiries
    .filter((q) => !["draft", "completed", "rejected", "cancelled"].includes(q.status))
    .map((q) => ({
      id: q.id, _kind: "inquiry", _raw: q,
      form_no: q.inquiry_no || q.title || q.id,
      subtype: q.category || "Costing",
      so_no: "-",
      customer_name: q.customer_name, project_name: q.project_name || q.title,
      engineer: q.assigned_to_name,
      status: normInqStatus(q.status),
      due: q.due_date || q.target_date || "",
    }));
  const rows = [...drfRows, ...inqRows];

  const counts = {
    all: rows.length,
    submitted: rows.filter((r) => r.status === "submitted").length,
    accepted: rows.filter((r) => r.status === "accepted").length,
    in_progress: rows.filter((r) => r.status === "in_progress").length,
  };

  const FILTERS = [
    { key: "all", label: "Semua Antrian", icon: TrayIcon, accent: "text-slate-700", ring: "border-l-slate-400" },
    { key: "submitted", label: "Perlu Diterima", icon: PaperPlaneTilt, accent: "text-amber-600", ring: "border-l-amber-500" },
    { key: "accepted", label: "Diterima", icon: CheckCircle, accent: "text-sky-600", ring: "border-l-sky-500" },
    { key: "in_progress", label: "Sedang Dikerjakan", icon: Gear, accent: "text-violet-600", ring: "border-l-violet-500" },
  ];

  // PRIORITAS: due date terdekat dulu (kosong paling akhir), lalu status.
  const order = { submitted: 0, accepted: 1, in_progress: 2 };
  const dueMs = (r) => {
    const v = r.due || "";
    if (!v) return Infinity;
    const t = Date.parse(v);
    return isNaN(t) ? Infinity : t;
  };
  const sorted = [...rows].sort((a, b) => {
    const da = dueMs(a), dbb = dueMs(b);
    if (da !== dbb) return da - dbb;
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });
  const qLower = search.trim().toLowerCase();
  const filtered = sorted.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (!qLower) return true;
    return [r.form_no, r.so_no, r.customer_name, r.project_name, r.engineer]
      .some((x) => (x || "").toLowerCase().includes(qLower));
  });

  const leaderCount = leaderRows.reduce((s, r) => s + (r.pending_count || 0), 0);

  const refreshEverything = () => { fetchAll(); fetchLeaderQueue(); };

  // ── Non-head (eng staff): fokus Tugas Saya (tanpa tab) ──
  if (!isHead) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm" data-testid="eng-queue-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Tray size={16} weight="fill" className="text-amber-600" />
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-800" style={{ fontFamily: "Chivo, sans-serif" }}>
              Antrian Engineering
            </h2>
          </div>
        </div>
        <div className="p-4">
          <button
            onClick={() => navigate("/engineering/work-orders")}
            className="w-full flex items-center justify-between p-4 border-l-4 border-l-teal-500 bg-white hover:bg-slate-50 transition-colors"
            data-testid="eng-queue-mytasks-tile"
          >
            <div className="flex items-center gap-3">
              <ListChecks size={22} weight="duotone" className="text-teal-600" />
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-500">Tugas Saya</div>
                <div className="text-sm text-slate-700">DRF yang ditugaskan ke Anda — klik untuk mengerjakan</div>
              </div>
            </div>
            <ArrowRight size={16} weight="bold" className="text-slate-400" />
          </button>
        </div>
      </div>
    );
  }

  // ── Leader / Admin: 2 tab antrian ──
  return (
    <div className="bg-white border border-slate-200 shadow-sm" data-testid="eng-queue-panel">
      {/* Tab header */}
      <div className="flex items-stretch border-b border-slate-200 bg-slate-50" role="tablist" data-testid="eng-queue-tabs">
        <TabButton
          active={tab === "incoming"}
          onClick={() => setTab("incoming")}
          icon={Tray}
          label="Antrian Drawing Request & Inquiry"
          count={counts.all}
          activeCls="border-amber-500 text-amber-700"
          badgeCls="bg-amber-600"
          testid="eng-queue-tab-incoming"
        />
        <TabButton
          active={tab === "leader"}
          onClick={() => setTab("leader")}
          icon={SealCheck}
          label="Menunggu Verifikasi Leader"
          count={leaderCount}
          activeCls="border-emerald-500 text-emerald-700"
          badgeCls="bg-emerald-600"
          testid="eng-queue-tab-leader"
        />
        <button
          onClick={refreshEverything}
          className="px-3 text-slate-500 hover:text-slate-800 hover:bg-slate-200 border-b-2 border-transparent"
          title="Segarkan"
          data-testid="eng-queue-refresh"
        >
          <ArrowClockwise size={14} weight="bold" />
        </button>
      </div>

      {/* ── TAB 1: Antrian Drawing Request & Inquiry ── */}
      {tab === "incoming" && (
        <div data-testid="eng-queue-incoming">
          {/* Filter tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200" data-testid="eng-queue-filters">
            {FILTERS.map((f) => {
              const Icon = f.icon;
              const activeF = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-left p-3 border-l-4 ${f.ring} transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${activeF ? "bg-amber-50" : "bg-white hover:bg-slate-50"}`}
                  data-testid={`eng-queue-filter-${f.key}`}
                  aria-pressed={activeF}
                >
                  <div className="flex items-center justify-between">
                    <Icon size={18} weight="duotone" className={f.accent} />
                    <span className="text-2xl font-bold tabular-nums text-slate-900" data-testid={`eng-queue-count-${f.key}`}>{counts[f.key]}</span>
                  </div>
                  <div className={`text-[10px] uppercase tracking-[0.1em] font-bold mt-1 ${activeF ? "text-amber-700" : "text-slate-500"}`}>{f.label}</div>
                </button>
              );
            })}
          </div>

          {/* List (terfilter) */}
          <div className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400">
                {filter === "all" ? "Semua antrian (Drawing & Inquiry)" : `Filter: ${STATUS_META[filter]?.label || filter}`} · {filtered.length}
                <span className="ml-2 normal-case tracking-normal text-slate-400 font-normal">(urut: due date terdekat)</span>
                {loading && <span className="ml-2 text-slate-400 animate-pulse normal-case">memuat…</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <MagnifyingGlass size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari form / SO / customer / engineer..."
                    className="h-8 w-[230px] max-w-full pl-7 pr-2 text-xs border border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    data-testid="eng-queue-search"
                  />
                </div>
                {filter !== "all" && (
                  <button onClick={() => setFilter("all")} className="text-[10px] uppercase tracking-widest font-bold text-amber-700 hover:text-amber-900" data-testid="eng-queue-clear-filter">
                    Semua
                  </button>
                )}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400" data-testid="eng-queue-empty">
                <CheckCircle size={16} weight="fill" className="text-emerald-500" />
                {filter === "all" ? "Tidak ada antrian (Drawing/Inquiry) saat ini." : `Tidak ada item pada filter "${STATUS_META[filter]?.label || filter}".`}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[340px] overflow-y-auto border border-slate-100">
                <table className="w-full text-sm" data-testid="eng-queue-list">
                  <thead className="sticky top-0 bg-white z-[1]">
                    <tr className="text-[9px] uppercase tracking-[0.1em] font-bold text-slate-400 border-b border-slate-100">
                      <th className="text-left py-1.5 px-2">Form / No</th>
                      <th className="text-left py-1.5 px-2">Due Date</th>
                      <th className="text-left py-1.5 px-2">Jenis / Tipe</th>
                      <th className="text-left py-1.5 px-2">SO</th>
                      <th className="text-left py-1.5 px-2">Customer / Project</th>
                      <th className="text-left py-1.5 px-2">Engineer</th>
                      <th className="text-left py-1.5 px-2">Status</th>
                      <th className="py-1.5 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const meta = STATUS_META[r.status] || { label: r.status, cls: "bg-slate-100 text-slate-700 border-slate-300" };
                      const dv = r.due;
                      const dt = dv ? Date.parse(dv) : NaN;
                      const isOverdue = !isNaN(dt) && (dt - Date.now()) / 86400000 < 0 && r.status !== "completed";
                      const isInquiry = r._kind === "inquiry";
                      const openRow = () => (isInquiry ? navigate(`/engineering/inquiries?open=${r.id}`) : setDetailDrf(r._raw));
                      return (
                        <tr
                          key={`${r._kind}-${r.id}`}
                          className={`border-b cursor-pointer ${isOverdue ? "bg-rose-50 hover:bg-rose-100 border-rose-200" : "border-slate-50 hover:bg-amber-50/50"}`}
                          onClick={openRow}
                          data-testid={`eng-queue-row-${r.form_no}`}
                        >
                          <td className="py-1.5 px-2 font-mono text-xs font-semibold whitespace-nowrap">
                            {isOverdue && <span className="mr-1 text-rose-600" title="Lewat due date">⚠</span>}
                            <span className={isOverdue ? "text-rose-800" : "text-slate-800"}>{r.form_no}</span>
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap"><DueBadge value={r.due} /></td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${isInquiry ? "bg-sky-50 text-sky-700 border-sky-300" : "bg-amber-50 text-amber-700 border-amber-300"}`}>
                              {isInquiry ? "Inquiry" : "Drawing"}
                            </span>
                            {r.subtype ? <span className="ml-1 text-[10px] text-slate-400">{r.subtype}</span> : null}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-xs text-slate-600 whitespace-nowrap">{r.so_no || "-"}</td>
                          <td className="py-1.5 px-2 text-xs text-slate-700 max-w-[220px] truncate" title={`${r.customer_name || ""} ${r.project_name || ""}`}>
                            <span className="font-medium">{r.customer_name || "-"}</span>
                            {r.project_name ? <span className="text-slate-400"> · {r.project_name}</span> : null}
                          </td>
                          <td className="py-1.5 px-2 text-xs text-slate-600 whitespace-nowrap">{r.engineer || <span className="text-slate-300">—</span>}</td>
                          <td className="py-1.5 px-2">
                            <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${meta.cls}`}>{meta.label}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); openRow(); }}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-bold uppercase tracking-wider ${isInquiry ? "bg-sky-600 hover:bg-sky-700" : "bg-amber-600 hover:bg-amber-700"}`}
                              data-testid={`eng-queue-open-${r.form_no}`}
                            >
                              {isInquiry ? <><ArrowRight size={11} weight="bold" /> Buka Inquiry</> : <><Eye size={11} weight="bold" /> Buka</>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: Menunggu Verifikasi Leader ── */}
      {tab === "leader" && (
        <div className="p-3" data-testid="eng-queue-leader">
          <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-2">
            SO/DRF dengan drawing menunggu review &amp; TTD Anda · {leaderRows.length} SO
            <span className="ml-2 normal-case tracking-normal text-slate-400 font-normal">(urut: paling lama menunggu)</span>
            {leaderLoading && <span className="ml-2 text-slate-400 animate-pulse normal-case">memuat…</span>}
          </div>
          {leaderRows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400" data-testid="eng-queue-leader-empty">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Tidak ada dokumen yang menunggu verifikasi Anda.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto border border-slate-100">
              <table className="w-full text-sm" data-testid="eng-queue-leader-list">
                <thead className="sticky top-0 bg-white z-[1]">
                  <tr className="text-[9px] uppercase tracking-[0.1em] font-bold text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1.5 px-2">SO</th>
                    <th className="text-left py-1.5 px-2">Form DRF</th>
                    <th className="text-left py-1.5 px-2">Customer / Project</th>
                    <th className="text-left py-1.5 px-2">BOM</th>
                    <th className="text-center py-1.5 px-2">Perlu TTD</th>
                    <th className="py-1.5 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {leaderRows.map((r) => {
                    const openReview = () => setReviewTarget(r);
                    return (
                      <tr
                        key={r.drf_id || r.so_no}
                        className="border-b border-slate-50 hover:bg-emerald-50/50 cursor-pointer"
                        onClick={openReview}
                        data-testid={`eng-leader-row-${r.so_no}`}
                      >
                        <td className="py-1.5 px-2 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap">{r.so_no || "-"}</td>
                        <td className="py-1.5 px-2 font-mono text-[11px] text-slate-600 whitespace-nowrap">{r.form_no || "—"}</td>
                        <td className="py-1.5 px-2 text-xs text-slate-700 max-w-[240px] truncate" title={`${r.customer_name || ""} ${r.project_name || ""}`}>
                          <span className="font-medium">{r.customer_name || "-"}</span>
                          {r.project_name ? <span className="text-slate-400"> · {r.project_name}</span> : null}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-[11px] text-slate-600 whitespace-nowrap">{r.bom_no || "—"}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-300">
                            {r.pending_count} / {r.total_drawings}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); openReview(); }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-wider"
                            data-testid={`eng-leader-review-${r.so_no}`}
                          >
                            <Signature size={11} weight="bold" /> Review &amp; TTD
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {detailDrf && (
        <DrfDetailModal
          drf={detailDrf}
          isHead={isHead}
          onClose={() => setDetailDrf(null)}
          onChanged={refreshEverything}
        />
      )}

      {reviewTarget && (
        <EngLeaderReviewDialog
          open={!!reviewTarget}
          onClose={() => setReviewTarget(null)}
          drfId={reviewTarget.drf_id}
          bomId={reviewTarget.bom_id}
          bomNo={reviewTarget.bom_no}
          soNo={reviewTarget.so_no}
          onReload={fetchLeaderQueue}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count, activeCls, badgeCls, testid }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${active ? `bg-white ${activeCls}` : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}
      data-testid={testid}
    >
      <Icon size={16} weight={active ? "fill" : "duotone"} />
      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.08em]" style={{ fontFamily: "Chivo, sans-serif" }}>{label}</span>
      {count > 0 && (
        <span className={`min-w-[20px] h-5 px-1 flex items-center justify-center text-[11px] font-bold rounded-full text-white ${active ? badgeCls : "bg-slate-400"}`}>{count}</span>
      )}
    </button>
  );
}
