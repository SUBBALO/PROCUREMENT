import React, { useEffect, useRef, useState, useCallback } from "react";
import { ArrowsOut, ArrowsIn } from "@phosphor-icons/react";

/*
 * Papan Progress Sales Order untuk Smart TV.
 * PUBLIK (tanpa login) — hanya menampilkan status tahapan proses per SO.
 * Auto-refresh tiap 30 detik + auto-scroll bila baris banyak.
 */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const PAGE_SIZE = 8;          // baris SO per halaman di layar TV
const PAGE_ROTATE_MS = 60000; // ganti halaman tiap 1 menit
const STAGES = [
  { key: "engineering", label: "Engineering" },
  { key: "doccon", label: "DocCon" },
  { key: "produksi", label: "Produksi" },
  { key: "qc", label: "QC" },
  { key: "delivery", label: "Delivery" },
];

const fmtDate = (iso) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(iso).slice(0, 10);
  }
};

// Format ringkas untuk 2 kolom deadline (mis. "02 Agu")
const fmtDateShort = (iso) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  } catch {
    return String(iso).slice(5, 10);
  }
};

// Tanggal + jam update terakhir (mis. "05 Feb 2026 · 14:30")
const fmtDateTime = (iso) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const tgl = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    const jam = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    return `${tgl} · ${jam}`;
  } catch {
    return null;
  }
};

// Info deadline: sisa hari & level alarm (past / soon <=2 hari / ok)
const deadlineInfo = (iso) => {
  if (!iso) return { days: null, level: "none" };
  const d = new Date(String(iso).slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d - today) / 86400000);
  let level = "ok";
  if (days < 0) level = "past";
  else if (days <= 2) level = "soon";
  return { days, level };
};

// Ambil level terparah dari 2 deadline (Drawing & Pengiriman) untuk alarm/kedip.
const LEVEL_RANK = { none: 0, ok: 1, soon: 2, past: 3 };
const worseLevel = (a, b) => (LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b);
const isAllDone = (so) => (so.stages || []).every((x) => x.status === "done");
// Level gabungan SO: terparah antara deadline drawing & pengiriman (0 bila sudah selesai).
const soLevel = (so) => {
  if (isAllDone(so)) return "ok";
  return worseLevel(deadlineInfo(so.deadline_drawing).level, deadlineInfo(so.deadline_delivery).level);
};

const STATUS_STYLE = {
  done: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
  progress: "bg-sky-500/20 text-sky-300 ring-sky-500/40",
  waiting: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
  revision: "bg-rose-500/20 text-rose-300 ring-rose-500/40",
  pending: "bg-slate-600/30 text-slate-300 ring-slate-500/30",
};

function StageCell({ stage, isCurrent }) {
  const st = stage?.status || "pending";
  const map = {
    done: { dot: "bg-emerald-400", text: "text-emerald-300", label: "OK" },
    in_progress: { dot: "bg-amber-400 animate-pulse", text: "text-amber-300", label: "Proses" },
    pending: { dot: "bg-slate-600", text: "text-slate-500", label: "-" },
  };
  const s = map[st] || map.pending;
  return (
    <td className={`px-1.5 py-1.5 text-center ${isCurrent ? "bg-white/5" : ""}`} data-testid={`tv-stage-${stage?.key}`}>
      <div className="flex flex-col items-center gap-0.5">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${s.dot}`} />
        <span className={`text-[0.6rem] font-semibold ${s.text}`}>{s.label}</span>
      </div>
    </td>
  );
}

// Satu badge deadline (dipakai untuk sub-kolom Drawing & Delivery).
// active = deadline yang relevan dgn tahap berjalan (diberi garis tepi indigo).
function DeadlineMini({ iso, active }) {
  if (!iso) return <div className="flex items-center justify-center text-slate-600 text-[10px] py-1">-</div>;
  const dl = deadlineInfo(iso);
  const cls = dl.level === "past"
    ? "bg-rose-500/25 text-rose-200 ring-1 ring-rose-500/50 tv-alarm-badge"
    : dl.level === "soon"
      ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/50"
      : "bg-slate-700/40 text-slate-300";
  const tag = dl.level === "past" ? `LEWAT ${Math.abs(dl.days)}h`
    : dl.level === "soon" ? (dl.days === 0 ? "HARI INI" : `H-${dl.days}`) : "";
  return (
    <div className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded ${cls} ${active ? "outline outline-1 outline-indigo-400/70" : ""}`}>
      <span className="text-[10px] font-bold tabular-nums leading-none">{fmtDateShort(iso)}</span>
      {tag && <span className="text-[8px] font-black uppercase leading-none">{tag}</span>}
    </div>
  );
}


export default function TvSoProgressPage() {
  const [items, setItems] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(() => {
    const v = parseFloat(localStorage.getItem("tvZoom") || "0.8");
    return isNaN(v) ? 0.8 : Math.min(1.3, Math.max(0.5, v));
  });
  const scrollRef = useRef(null);

  useEffect(() => { localStorage.setItem("tvZoom", String(zoom)); }, [zoom]);
  const zoomBy = (d) => setZoom((z) => Math.min(1.3, Math.max(0.5, Math.round((z + d) * 100) / 100)));

  const toggleFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
    }
  };
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/so-progress?limit=100`, { credentials: "omit" });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      setItems(data.items || []);
      setUpdatedAt(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  // initial + auto refresh 30s
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const doneCount = items.filter((s) => (s.current_stage || "") === "Delivery" && (s.stages || []).every((x) => x.status === "done")).length;

  // Peringkat urgensi: lewat deadline (0) → mendekati <=2 hari (1) → lainnya (2).
  // SO yang sudah selesai (semua tahap done) tidak dianggap urgent.
  const urgencyRank = (so) => {
    const allDone = (so.stages || []).every((x) => x.status === "done");
    if (allDone) return 2;
    const lvl = soLevel(so);
    return lvl === "past" ? 0 : lvl === "soon" ? 1 : 2;
  };

  const soonCount = items.filter((s) => soLevel(s) === "soon").length;
  const overdueCount = items.filter((s) => soLevel(s) === "past").length;

  // Sisa hari untuk tiebreak: ambil yang paling dekat dari 2 deadline
  const soDays = (so) => {
    const ds = [deadlineInfo(so.deadline_drawing).days, deadlineInfo(so.deadline_delivery).days]
      .filter((x) => x !== null && x !== undefined);
    return ds.length ? Math.min(...ds) : 9999;
  };

  // Satu list: SO mendekati/lewat deadline diurutkan paling atas (paling mendesak dulu),
  // sisanya urut update terbaru.
  const sortedItems = [...items].sort((a, b) => {
    const ra = urgencyRank(a);
    const rb = urgencyRank(b);
    if (ra !== rb) return ra - rb;
    if (ra < 2) return soDays(a) - soDays(b);
    return String(b.last_update || "").localeCompare(String(a.last_update || ""));
  });

  // Bagi ke beberapa halaman, tepat 8 baris/halaman, rotasi otomatis.
  const pageCount = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const safePage = page % pageCount;
  const displayItems = sortedItems.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Rotasi halaman (hanya jika lebih dari 1 halaman)
  useEffect(() => {
    if (pageCount <= 1) {
      setPage(0);
      return;
    }
    const t = setInterval(() => setPage((p) => (p + 1) % pageCount), PAGE_ROTATE_MS);
    return () => clearInterval(t);
  }, [pageCount]);


  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 flex flex-col overflow-hidden" style={{ fontFamily: "Figtree, sans-serif", zoom }} data-testid="tv-so-progress">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-3 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img src="/assets/logo-mks.png" alt="MKS" className="w-10 h-10 object-contain shrink-0" onError={(e) => { e.target.style.display = "none"; }} />
          <div>
            <h1 className="text-2xl font-black tracking-tight leading-none" style={{ fontFamily: "Chivo, sans-serif" }}>MONITORING PROGRESS SALES ORDER</h1>
            <p className="text-slate-400 text-xs mt-0.5">PT. Mitra Karya Sarana · Live Production Board · deadline terdekat di atas</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-lg bg-white/5 border border-white/10 overflow-hidden" data-testid="tv-zoom-controls">
            <button onClick={() => zoomBy(-0.05)} className="px-2.5 py-1.5 text-slate-200 hover:bg-white/15 transition-colors text-sm font-bold" data-testid="tv-zoom-out" title="Perkecil">A−</button>
            <span className="px-1.5 text-[11px] text-slate-400 tabular-nums select-none">{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomBy(0.05)} className="px-2.5 py-1.5 text-slate-200 hover:bg-white/15 transition-colors text-sm font-bold" data-testid="tv-zoom-in" title="Perbesar">A+</button>
          </div>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-200 border border-white/10 transition-colors"
            data-testid="tv-fullscreen-btn"
            title={isFs ? "Keluar layar penuh" : "Layar penuh (Smart TV)"}
          >
            {isFs ? <ArrowsIn size={18} weight="bold" /> : <ArrowsOut size={18} weight="bold" />}
            <span className="text-sm font-semibold hidden sm:inline">{isFs ? "Keluar" : "Layar Penuh"}</span>
          </button>
          <div className="text-right">
            <div className="text-3xl font-black tabular-nums leading-none" style={{ fontFamily: "Chivo, sans-serif" }}>
              {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="text-slate-400 text-xs mt-0.5">
              {now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>
      </header>

      {/* Legend + stats */}
      <div className="flex items-center justify-between px-8 py-2 bg-slate-900/60 border-b border-white/5 text-sm">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-md font-bold uppercase tracking-wide text-xs bg-indigo-600 text-white" data-testid="tv-total-so">
            SO Aktif ({items.length})
          </span>
          {soonCount > 0 && (
            <span className="px-3 py-1 rounded-md font-bold uppercase tracking-wide text-xs bg-amber-500 text-slate-900 flex items-center gap-1.5" data-testid="tv-deadline-count">
              <span className="w-2 h-2 rounded-full bg-slate-900 animate-pulse" /> Mendekati Deadline ({soonCount})
            </span>
          )}
          {overdueCount > 0 && (
            <span className="px-3 py-1 rounded-md font-bold uppercase tracking-wide text-xs bg-rose-600 text-white flex items-center gap-1.5 tv-alarm-badge" data-testid="tv-overdue-count">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Melewati / Overdue ({overdueCount})
            </span>
          )}
          <span className="hidden xl:flex items-center gap-4 ml-2 text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Selesai</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" /> Proses</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-600" /> Menunggu</span>
          </span>
        </div>
        <div className="flex items-center gap-5 text-slate-300 text-xs">
          {pageCount > 1 && (
            <span className="flex items-center gap-1.5 text-indigo-300 font-semibold" data-testid="tv-page-indicator">
              Halaman {safePage + 1}/{pageCount}
              <span className="flex gap-1 ml-1">
                {Array.from({ length: pageCount }).map((_, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full transition-colors ${i === safePage ? "bg-indigo-400" : "bg-slate-600"}`} />
                ))}
              </span>
            </span>
          )}
          <span>Delivery selesai: <b className="text-emerald-400 tabular-nums">{doneCount}</b></span>
          <span className="text-slate-500">Update: {updatedAt ? updatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "…"}</span>
          {error && <span className="text-rose-400" data-testid="tv-error">● Koneksi terputus</span>}
        </div>
      </div>

      {/* Table */}
      <div ref={scrollRef} className="flex-1 overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300 text-[0.72rem] uppercase tracking-wider">
            <tr className="border-b-2 border-white/10">
              <th className="px-4 py-2 text-left w-[9%]">No. SO</th>
              <th className="px-3 py-2 text-left w-[16%]">Customer</th>
              <th className="px-2 py-1.5 text-center w-[12%]">
                <div>Deadline</div>
                <div className="grid grid-cols-2 gap-1 text-[0.58rem] text-slate-500 mt-0.5 normal-case font-semibold">
                  <span>Drawing</span><span>Delivery</span>
                </div>
              </th>
              {STAGES.map((s) => (
                <th key={s.key} className="px-1.5 py-2 text-center w-[6%]">{s.label}</th>
              ))}
              <th className="px-3 py-2 text-left w-[27%]">Status Saat Ini</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {displayItems.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-24 text-slate-500 text-2xl">
                Belum ada data Sales Order
              </td></tr>
            ) : displayItems.map((so) => {
              const rowLvl = soLevel(so);                 // gabungan 2 deadline → kedip baris
              const allDone = isAllDone(so);
              const stStyle = STATUS_STYLE[so.status_kind] || STATUS_STYLE.pending;
              const alarmCls = !allDone && rowLvl === "past" ? "tv-alarm-past" : (!allDone && rowLvl === "soon" ? "tv-alarm-soon" : (allDone ? "bg-emerald-950/30" : "hover:bg-white/5"));
              return (
                <tr key={so.so_no} className={`${alarmCls} transition-colors`} data-testid={`tv-row-${so.so_no}`}>
                  <td className="px-4 py-1.5">
                    <div className="text-lg font-black text-white tabular-nums leading-tight" style={{ fontFamily: "Chivo, sans-serif" }}>{so.so_no}</div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="text-sm font-semibold text-slate-100 truncate max-w-[18vw]">{so.customer || "-"}</div>
                    {so.description ? <div className="text-[11px] text-slate-400 truncate max-w-[18vw]">{so.description}</div> : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="grid grid-cols-2 gap-1" data-testid={`tv-deadline-${so.so_no}`}>
                      <DeadlineMini iso={so.deadline_drawing} active={so.deadline_kind === "drawing"} />
                      <DeadlineMini iso={so.deadline_delivery} active={so.deadline_kind === "delivery"} />
                    </div>
                  </td>
                  {STAGES.map((s) => {
                    const stage = (so.stages || []).find((x) => x.key === s.key) || { key: s.key, status: "pending" };
                    return <StageCell key={s.key} stage={stage} isCurrent={so.current_stage === s.label} />;
                  })}
                  <td className="px-3 py-1.5" data-testid={`tv-status-${so.so_no}`}>
                    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-sm font-bold ring-1 ${stStyle}`}>
                      {so.status_kind === "revision" && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />}
                      {so.status_now || so.current_stage}
                    </span>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {so.pic ? <span className="text-[10px] text-slate-300" data-testid={`tv-pic-${so.so_no}`}><span className="text-slate-500">PIC:</span> <b className="text-slate-200">{so.pic}</b></span> : null}
                      {fmtDateTime(so.last_update) && (
                        <span className="text-[10px] text-slate-500 tabular-nums" data-testid={`tv-updated-${so.so_no}`}>· {fmtDateTime(so.last_update)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
