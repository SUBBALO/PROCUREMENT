import React, { useEffect, useRef, useState, useCallback } from "react";
import { ArrowsOut, ArrowsIn } from "@phosphor-icons/react";

/*
 * Papan Progress Sales Order untuk Smart TV.
 * PUBLIK (tanpa login) — hanya menampilkan status tahapan proses per SO.
 * Auto-refresh tiap 30 detik + auto-scroll bila baris banyak.
 */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
    <td className={`px-1.5 py-2 text-center ${isCurrent ? "bg-white/5" : ""}`} data-testid={`tv-stage-${stage?.key}`}>
      <div className="flex flex-col items-center gap-0.5">
        <span className={`inline-block w-3 h-3 rounded-full ${s.dot}`} />
        <span className={`text-[0.7rem] font-semibold ${s.text}`}>{s.label}</span>
      </div>
    </td>
  );
}

export default function TvSoProgressPage() {
  const [items, setItems] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState(false);
  const [view, setView] = useState("active"); // 'active' | 'deadline'
  const [isFs, setIsFs] = useState(false);
  const scrollRef = useRef(null);

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

  // auto-scroll berkala: turun ~1 layar tiap 6 detik, balik ke atas saat mentok bawah
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const t = setInterval(() => {
      if (el.scrollHeight <= el.clientHeight + 8) return; // muat 1 layar → tak perlu scroll
      const max = el.scrollHeight - el.clientHeight;
      const next = el.scrollTop + el.clientHeight * 0.9;
      if (next >= max - 4) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        el.scrollTo({ top: next, behavior: "smooth" });
      }
    }, 6000);
    return () => clearInterval(t);
  }, [items.length]);

  const doneCount = items.filter((s) => (s.current_stage || "") === "Delivery" && (s.stages || []).every((x) => x.status === "done")).length;

  // SO mendekati / lewat deadline (level past atau soon <=2 hari), diurut paling mendesak
  const deadlineItems = items
    .filter((s) => ["past", "soon"].includes(deadlineInfo(s.deadline).level))
    .sort((a, b) => (deadlineInfo(a.deadline).days ?? 9999) - (deadlineInfo(b.deadline).days ?? 9999));

  // Rotasi halaman tiap 20 detik: SO Aktif <-> SO Mendekati Deadline
  useEffect(() => {
    const t = setInterval(() => setView((v) => (v === "active" ? "deadline" : "active")), 20000);
    return () => clearInterval(t);
  }, []);
  // reset scroll ke atas saat ganti halaman
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);

  const displayItems = view === "deadline" ? deadlineItems : items;

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 flex flex-col overflow-hidden" style={{ fontFamily: "Figtree, sans-serif" }} data-testid="tv-so-progress">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-2xl font-black" style={{ fontFamily: "Chivo, sans-serif" }}>SO</div>
          <div>
            <h1 className="text-3xl font-black tracking-tight leading-none" style={{ fontFamily: "Chivo, sans-serif" }}>MONITORING PROGRESS SALES ORDER</h1>
            <p className="text-slate-400 text-sm mt-1">PT. Mitra Karya Sarana · Live Production Board · urut update terbaru</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/15 text-slate-200 border border-white/10 transition-colors"
            data-testid="tv-fullscreen-btn"
            title={isFs ? "Keluar layar penuh" : "Layar penuh (Smart TV)"}
          >
            {isFs ? <ArrowsIn size={20} weight="bold" /> : <ArrowsOut size={20} weight="bold" />}
            <span className="text-sm font-semibold hidden sm:inline">{isFs ? "Keluar" : "Layar Penuh"}</span>
          </button>
          <div className="text-right">
            <div className="text-4xl font-black tabular-nums leading-none" style={{ fontFamily: "Chivo, sans-serif" }}>
              {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="text-slate-400 text-sm mt-1">
              {now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>
      </header>

      {/* View tabs (rotasi) + Legend + stats */}
      <div className="flex items-center justify-between px-8 py-2.5 bg-slate-900/60 border-b border-white/5 text-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("active")} className={`px-3 py-1 rounded-md font-bold uppercase tracking-wide text-xs transition-colors ${view === "active" ? "bg-indigo-600 text-white" : "bg-white/5 text-slate-400"}`} data-testid="tv-tab-active">
            SO Aktif ({items.length})
          </button>
          <button onClick={() => setView("deadline")} className={`px-3 py-1 rounded-md font-bold uppercase tracking-wide text-xs transition-colors ${view === "deadline" ? "bg-rose-600 text-white" : "bg-white/5 text-slate-400"}`} data-testid="tv-tab-deadline">
            Mendekati Deadline ({deadlineItems.length})
          </button>
          <span className="hidden xl:flex items-center gap-4 ml-3 text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-400" /> Selesai</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" /> Proses</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-600" /> Menunggu</span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-slate-300">
          <span>Delivery selesai: <b className="text-emerald-400 tabular-nums">{doneCount}</b></span>
          <span className="text-slate-500">Update: {updatedAt ? updatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "…"}</span>
          {error && <span className="text-rose-400" data-testid="tv-error">● Koneksi terputus</span>}
        </div>
      </div>

      {/* Table */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300 text-[0.95rem] uppercase tracking-wider">
            <tr className="border-b-2 border-white/10">
              <th className="px-4 py-2.5 text-left w-[11%]">No. SO</th>
              <th className="px-3 py-2.5 text-left w-[18%]">Customer</th>
              <th className="px-2 py-2.5 text-left w-[9%]">Deadline</th>
              {STAGES.map((s) => (
                <th key={s.key} className="px-1.5 py-2.5 text-center w-[6%]">{s.label}</th>
              ))}
              <th className="px-3 py-2.5 text-left w-[24%]">Status Saat Ini</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {displayItems.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-24 text-slate-500 text-2xl">
                {view === "deadline" ? "Tidak ada SO yang mendekati / lewat deadline 🎉" : "Belum ada data Sales Order"}
              </td></tr>
            ) : displayItems.map((so) => {
              const dl = deadlineInfo(so.deadline);
              const allDone = (so.stages || []).every((x) => x.status === "done");
              const stStyle = STATUS_STYLE[so.status_kind] || STATUS_STYLE.pending;
              const alarmCls = !allDone && dl.level === "past" ? "tv-alarm-past" : (!allDone && dl.level === "soon" ? "tv-alarm-soon" : (allDone ? "bg-emerald-950/30" : "hover:bg-white/5"));
              const dlBadge = dl.level === "past"
                ? { cls: "bg-rose-500/25 text-rose-200 ring-1 ring-rose-500/50", txt: `LEWAT ${Math.abs(dl.days)} hr` }
                : dl.level === "soon"
                  ? { cls: "bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/50", txt: dl.days === 0 ? "HARI INI" : `H-${dl.days}` }
                  : { cls: "bg-slate-700/50 text-slate-200", txt: fmtDate(so.deadline) };
              return (
                <tr key={so.so_no} className={`${alarmCls} transition-colors`} data-testid={`tv-row-${so.so_no}`}>
                  <td className="px-4 py-2">
                    <div className="text-xl font-black text-white tabular-nums leading-tight" style={{ fontFamily: "Chivo, sans-serif" }}>{so.so_no}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-lg font-semibold text-slate-100 truncate max-w-[20vw]">{so.customer || "-"}</div>
                    {so.description ? <div className="text-xs text-slate-400 truncate max-w-[20vw]">{so.description}</div> : null}
                  </td>
                  <td className="px-2 py-2">
                    <div className={`inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded ${dlBadge.cls}`}>
                      <span className="text-[11px] font-bold tabular-nums leading-none">{fmtDate(so.deadline)}</span>
                      {dl.level !== "ok" && dl.level !== "none" && <span className="text-[10px] font-black uppercase tracking-wide leading-none">{dlBadge.txt}</span>}
                    </div>
                  </td>
                  {STAGES.map((s) => {
                    const stage = (so.stages || []).find((x) => x.key === s.key) || { key: s.key, status: "pending" };
                    return <StageCell key={s.key} stage={stage} isCurrent={so.current_stage === s.label} />;
                  })}
                  <td className="px-3 py-2" data-testid={`tv-status-${so.so_no}`}>
                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-base font-bold ring-1 ${stStyle}`}>
                      {so.status_kind === "revision" && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />}
                      {so.status_now || so.current_stage}
                    </span>
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
