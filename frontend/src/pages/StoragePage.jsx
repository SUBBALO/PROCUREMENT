import React, { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import BackLink from "../components/BackLink";
import { HardDrives, Trash, DownloadSimple, ArrowClockwise, Broom, CircleNotch } from "@phosphor-icons/react";

const MODULE_LABELS = {
  bom_import: { label: "BOM Excel Import", color: "bg-amber-100 text-amber-800 border-amber-300" },
  transactions_import: { label: "Import Transaksi (Excel)", color: "bg-sky-100 text-sky-800 border-sky-300" },
  so_import: { label: "Import Master SO (Excel)", color: "bg-violet-100 text-violet-800 border-violet-300" },
  po_auto_read: { label: "Auto-Read PO (PDF/Image)", color: "bg-rose-100 text-rose-800 border-rose-300" },
  unknown: { label: "Lainnya", color: "bg-slate-100 text-slate-700 border-slate-300" },
};

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function StoragePage() {
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;
  const [data, setData] = useState({ items: [], stats_by_module: [], grand_total_size: 0 });
  const [loading, setLoading] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [purgeDays, setPurgeDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = moduleFilter ? { module: moduleFilter } : {};
      const { data } = await api.get("/storage/temp-files", { params });
      setData(data);
      setSelected(new Set());
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal memuat"); } finally { setLoading(false); }
  }, [moduleFilter]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };
  const toggleAll = () => {
    if (selected.size === data.items.length) setSelected(new Set());
    else setSelected(new Set(data.items.map((it) => it.id)));
  };

  const deleteOne = async (id) => {
    if (!window.confirm("Hapus file ini permanen?")) return;
    try {
      await api.delete(`/storage/temp-files/${id}`);
      toast.success("File terhapus");
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return toast.error("Belum ada file dipilih");
    if (!window.confirm(`Hapus ${selected.size} file secara permanen?`)) return;
    try {
      const { data: res } = await api.post("/storage/temp-files/bulk-delete", { ids: [...selected] });
      toast.success(`${res.deleted} file terhapus`);
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal bulk delete"); }
  };

  const purgeOld = async () => {
    if (!window.confirm(`Hapus SEMUA file lebih dari ${purgeDays} hari?`)) return;
    try {
      const { data: res } = await api.post(`/storage/temp-files/purge-older-than?days=${purgeDays}`);
      toast.success(`${res.deleted} file lama terhapus`);
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal purge"); }
  };

  const downloadOne = (id, filename) => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/storage/temp-files/${id}/download`;
    window.open(url, "_blank");
  };

  return (
    <div className="max-w-[1400px] mx-auto p-6 space-y-6">
      <BackLink to="/admin" label="Kembali ke Admin Panel" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500 mb-0.5 flex items-center gap-2">
            <HardDrives size={12} weight="fill" /> ADMIN &middot; STORAGE MANAGEMENT
          </div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Kelola Storage</h1>
          <p className="text-sm text-slate-500 mt-1">
            File temporer dari import: BOM Excel, Auto-Read PO (PDF/gambar), Master List XLSX. <b>Attachment Inquiry/Engineering tidak tercatat disini</b> (dokumen bisnis permanen).
          </p>
        </div>
        <Button variant="outline" onClick={load} className="rounded-none h-9"><ArrowClockwise size={14} weight="bold" className="mr-1" /> Refresh</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="storage-stats-grid">
        <Card className="rounded-none border-slate-300 p-3">
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Total File</div>
          <div className="text-3xl font-bold tabular-nums leading-none mt-1.5" style={{ fontFamily: "Chivo, sans-serif" }}>{(data.stats_by_module || []).reduce((s, m) => s + m.count, 0)}</div>
        </Card>
        <Card className="rounded-none border-slate-300 p-3">
          <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">Total Size</div>
          <div className="text-3xl font-bold tabular-nums leading-none mt-1.5" style={{ fontFamily: "Chivo, sans-serif" }}>{formatBytes(data.grand_total_size)}</div>
        </Card>
        {(data.stats_by_module || []).slice(0, 2).map((m) => (
          <Card key={m.module} className="rounded-none border-slate-300 p-3">
            <div className="text-[10px] uppercase tracking-[0.1em] font-bold text-slate-500">{MODULE_LABELS[m.module]?.label || m.module}</div>
            <div className="text-lg font-bold leading-none mt-1.5">{m.count} · {formatBytes(m.total_size)}</div>
          </Card>
        ))}
      </div>

      {/* Filter + bulk actions */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Filter Modul</div>
          <select data-testid="storage-module-filter" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="h-9 rounded-none border border-slate-300 px-2 text-sm">
            <option value="">Semua Modul</option>
            {Object.entries(MODULE_LABELS).filter(([k]) => k !== "unknown").map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        {isSuperAdmin && (
          <>
            <Button data-testid="storage-bulk-delete" onClick={bulkDelete} disabled={selected.size === 0} className="rounded-none bg-red-600 hover:bg-red-700 text-white h-9">
              <Trash size={13} weight="bold" className="mr-1" /> Hapus Terpilih ({selected.size})
            </Button>
            <div className="flex items-end gap-1 ml-4 border-l border-slate-300 pl-4">
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Purge &gt;</div>
                <input type="number" min="1" value={purgeDays} onChange={(e) => setPurgeDays(parseInt(e.target.value) || 30)} className="h-9 w-20 rounded-none border border-slate-300 px-2 text-sm text-right" />
              </div>
              <span className="text-xs text-slate-500 pb-2">hari</span>
              <Button data-testid="storage-purge-old" onClick={purgeOld} className="rounded-none bg-amber-600 hover:bg-amber-700 text-white h-9">
                <Broom size={13} weight="bold" className="mr-1" /> Purge File Lama
              </Button>
            </div>
          </>
        )}
        {!isSuperAdmin && (
          <div className="text-xs text-slate-500 italic">Hanya Super Admin (susanto) yang bisa hapus / purge file storage.</div>
        )}
      </div>

      {/* Files table */}
      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
          File Temporer — {data.items.length} entri
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="storage-files-table">
            <thead className="bg-white border-b border-slate-200">
              <tr className="text-xs uppercase tracking-[0.1em] font-bold text-slate-500">
                {isSuperAdmin && (
                  <th className="text-center p-3 w-8">
                    <input type="checkbox" checked={selected.size > 0 && selected.size === data.items.length} onChange={toggleAll} className="w-4 h-4 accent-red-600" data-testid="storage-select-all" />
                  </th>
                )}
                <th className="text-left p-3">Nama File</th>
                <th className="text-left p-3">Modul</th>
                <th className="text-left p-3">Related</th>
                <th className="text-right p-3">Size</th>
                <th className="text-left p-3">Upload</th>
                <th className="text-left p-3">Oleh</th>
                <th className="text-center p-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td colSpan={isSuperAdmin ? 8 : 7} className="p-6 text-center text-slate-400"><CircleNotch size={18} className="inline animate-spin" /></td></tr>)}
              {!loading && data.items.length === 0 && (<tr><td colSpan={isSuperAdmin ? 8 : 7} className="p-8 text-center text-slate-400">Belum ada file temporer.</td></tr>)}
              {data.items.map((f) => {
                const meta = MODULE_LABELS[f.module] || MODULE_LABELS.unknown;
                return (
                  <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                    {isSuperAdmin && (
                      <td className="p-3 text-center">
                        <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="w-4 h-4 accent-red-600" data-testid={`storage-select-${f.id}`} />
                      </td>
                    )}
                    <td className="p-3 text-slate-900 font-medium max-w-[300px] truncate" title={f.filename}>{f.filename}</td>
                    <td className="p-3">
                      <span className={`text-[10px] uppercase tracking-[0.05em] font-bold px-2 py-0.5 border ${meta.color}`}>{meta.label}</span>
                    </td>
                    <td className="p-3 text-slate-700 text-xs">{f.related_entity || "-"}</td>
                    <td className="p-3 text-right tabular-nums text-slate-700">{formatBytes(f.size)}</td>
                    <td className="p-3 text-slate-500 text-xs tabular-nums">{(f.uploaded_at || "").slice(0, 16).replace("T", " ")}</td>
                    <td className="p-3 text-slate-500 text-xs">{f.uploaded_by_name}</td>
                    <td className="p-3 text-center">
                      <div className="inline-flex gap-1">
                        <button onClick={() => downloadOne(f.id, f.filename)} title="Download" data-testid={`storage-download-${f.id}`} className="p-1 text-slate-700 hover:bg-slate-100 border border-slate-300"><DownloadSimple size={12} weight="bold" /></button>
                        {isSuperAdmin && (
                          <button onClick={() => deleteOne(f.id)} title="Hapus" data-testid={`storage-delete-${f.id}`} className="p-1 text-red-700 hover:bg-red-100 border border-red-300"><Trash size={12} weight="bold" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
