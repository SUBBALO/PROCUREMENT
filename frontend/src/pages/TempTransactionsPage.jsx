import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import api from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import BackLink from "../components/BackLink";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Camera, Trash, Image as ImageIcon, ArrowsClockwise, CheckCircle, CircleNotch, WarningCircle, X, DeviceMobile } from "@phosphor-icons/react";

const inputCls = "h-8 w-full border border-slate-300 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600 text-sm px-2 rounded-none";
const UNIT_OPTIONS = ["Ea", "Pcs", "Set", "Lot", "Kg", "Ltr", "Mtr", "Box", "Roll"];

/** Transaksi Sementara — hasil AI baca foto nota. Tabel mirip Bulk Transaksi.
 *  Tidak ada yang auto-masuk sistem: user cek/koreksi lalu commit satu per satu. */
export default function TempTransactionsPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [processing, setProcessing] = useState(0);
  const [loading, setLoading] = useState(true);
  const [photoView, setPhotoView] = useState(null); // {photo_id, photo_name}
  const [busyId, setBusyId] = useState(null);
  const [sos, setSos] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const pollRef = useRef(null);
  const dirtyRef = useRef(new Set()); // id baris yang sedang diedit (jangan ditimpa polling)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get("/temp-transactions");
      setRows((prev) => {
        const dirty = dirtyRef.current;
        return (data.items || []).map((srv) => {
          if (dirty.has(srv.id)) {
            const local = prev.find((p) => p.id === srv.id);
            if (local) return local; // pertahankan editan lokal yang belum tersimpan
          }
          return srv;
        });
      });
      setProcessing(data.processing || 0);
    } catch (e) {
      if (!silent) toast.error(e.response?.data?.detail || "Gagal memuat");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Autocomplete sumber sama seperti Bulk Transaksi
  useEffect(() => {
    api.get("/sales-orders").then((r) => setSos((r.data || []).map((s) => s.so_no).filter(Boolean))).catch(() => {});
    api.get("/master/vendors").then((r) => setVendors(r.data || [])).catch(() => {});
    api.get("/master/items").then((r) => setItems((r.data || []).map((it) => it.item_name || it._id).filter(Boolean))).catch(() => {});
  }, []);

  // Poll selama ada foto yang masih dibaca AI
  useEffect(() => {
    if (processing > 0 && !pollRef.current) {
      pollRef.current = setInterval(() => load(true), 3000);
    }
    if (processing === 0 && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [processing, load]);

  const setRow = (id, patch) => {
    dirtyRef.current.add(id);
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      if ("qty" in patch || "unit_price" in patch) {
        const q = Number(next.qty) || 0;
        const p = Number(next.unit_price) || 0;
        next.total_price = q * p;
      }
      return next;
    }));
  };

  const saveRow = async (r) => {
    try {
      const { data } = await api.put(`/temp-transactions/${r.id}`, {
        invoice_date: r.invoice_date,
        project_no: r.project_no || "",
        po_no: r.po_no || "",
        vendor_name: r.vendor_name || "",
        item_name: r.item_name || "",
        qty: Number(r.qty) || 0,
        unit: r.unit || "Ea",
        unit_price: Number(r.unit_price) || 0,
        total_price: Number(r.total_price) || 0,
        invoice_no: r.invoice_no || "",
        stock_mode: r.stock_mode || "none",
      });
      dirtyRef.current.delete(r.id);
      setRows((prev) => prev.map((x) => (x.id === r.id ? data : x)));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal simpan koreksi");
    }
  };

  const rowValid = (r) => (r.vendor_name || "").trim() && (r.item_name || "").trim() && Number(r.qty) > 0;

  const commit = async (r) => {
    if (!rowValid(r)) return toast.error("Lengkapi Supplier, Nama Barang, dan Qty > 0 dulu");
    const label = { stock: "MASUK STOK", log: "LOG ONLY", none: "TANPA STOK & LOG" }[r.stock_mode || "none"];
    if (!window.confirm(`Masukkan "${r.item_name}" (${r.qty} ${r.unit}) ke sistem sebagai ${label}?\nFoto nota akan dihapus setelah masuk.`)) return;
    setBusyId(r.id);
    try {
      await saveRow(r); // pastikan koreksi terakhir tersimpan dulu
      await api.post(`/temp-transactions/${r.id}/commit`, { stock_mode: r.stock_mode || "none" });
      toast.success(`✓ "${r.item_name}" masuk sistem (${label})`);
      dirtyRef.current.delete(r.id);
      load(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal commit");
    } finally {
      setBusyId(null);
    }
  };

  const discard = async (r) => {
    if (!window.confirm(`Buang draft "${r.item_name || r.photo_name}"? Foto ikut terhapus.`)) return;
    try {
      await api.delete(`/temp-transactions/${r.id}`);
      dirtyRef.current.delete(r.id);
      toast.success("Draft dibuang");
      load(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal hapus");
    }
  };

  const retry = async (r) => {
    try {
      await api.post(`/temp-transactions/${r.id}/retry`);
      toast.success("Dibaca ulang oleh AI...");
      load(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal retry");
    }
  };

  const readyCount = useMemo(() => rows.filter((r) => r.status === "ready").length, [rows]);

  return (
    <div className="space-y-4">
      <BackLink />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
            Transaksi Sementara
          </h1>
          <p className="text-xs text-slate-500 max-w-3xl mt-1">
            Hasil AI baca foto nota. <b>Tidak ada yang otomatis masuk sistem</b> — cek & koreksi tiap baris, pilih tujuan
            (Masuk Stok / Log / Tidak), lalu klik <b>Masuk Sistem</b>. Klik ikon foto untuk membandingkan dengan nota asli.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="goto-upload" onClick={() => nav("/purchasing/temp-upload")} className="rounded-none h-9 bg-sky-700 hover:bg-sky-800 text-white text-xs uppercase tracking-[0.1em] font-bold">
            <Camera size={14} weight="bold" className="mr-1.5" /> Upload Foto Nota
          </Button>
        </div>
      </div>

      {processing > 0 && (
        <Card className="rounded-none border-sky-300 bg-sky-50 shadow-none p-3 flex items-center gap-2" data-testid="processing-banner">
          <CircleNotch size={16} weight="bold" className="text-sky-600 animate-spin" />
          <span className="text-xs text-sky-900"><b>{processing}</b> foto masih dibaca AI — list akan ter-update otomatis.</span>
        </Card>
      )}

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <DeviceMobile size={14} weight="bold" className="text-slate-400" />
        Upload dari HP: buka <span className="font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 select-all">{window.location.origin}/purchasing/temp-upload</span> di browser HP (login seperti biasa).
      </div>

      <Card className="rounded-none border-slate-200 shadow-none overflow-visible bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] uppercase tracking-[0.05em] font-bold text-slate-500">
                <th className="p-2 w-14 text-center">Foto</th>
                <th className="p-2 text-left min-w-[110px]">Tanggal</th>
                <th className="p-2 text-left min-w-[100px]">SO No</th>
                <th className="p-2 text-left min-w-[90px]">PO No</th>
                <th className="p-2 text-left min-w-[150px]">Supplier *</th>
                <th className="p-2 text-left min-w-[200px]">Nama Barang *</th>
                <th className="p-2 text-right min-w-[70px]">Qty *</th>
                <th className="p-2 text-left min-w-[65px]">Unit</th>
                <th className="p-2 text-right min-w-[100px]">Unit Price</th>
                <th className="p-2 text-right min-w-[110px]">Total Price</th>
                <th className="p-2 text-left min-w-[95px]">Invoice</th>
                <th className="p-2 text-center min-w-[130px]">Masuk Stok?*</th>
                <th className="p-2 text-center min-w-[150px]">Aksi</th>
              </tr>
            </thead>
            <tbody data-testid="temp-rows">
              {loading && (<tr><td colSpan={13} className="p-6 text-center text-slate-400">Memuat...</td></tr>)}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={13} className="p-10 text-center text-slate-400">
                  <Camera size={24} weight="duotone" className="inline-block mr-2 text-slate-300" />
                  Belum ada draft. Klik <b>Upload Foto Nota</b> untuk mulai.
                </td></tr>
              )}
              {rows.map((r) => {
                const isProc = r.status === "processing";
                const isFail = r.status === "failed";
                const disabled = isProc || busyId === r.id;
                return (
                  <tr key={r.id} className={`border-b border-slate-100 ${isProc ? "bg-sky-50/50" : isFail ? "bg-red-50/50" : ""}`} data-testid={`temp-row-${r.id}`}>
                    <td className="p-1 text-center">
                      <button
                        data-testid={`photo-btn-${r.id}`}
                        onClick={() => setPhotoView({ photo_id: r.photo_id, photo_name: r.photo_name })}
                        className="p-1.5 hover:bg-sky-100 text-sky-700"
                        title={`Lihat foto: ${r.photo_name}`}
                      >
                        <ImageIcon size={16} weight="duotone" />
                      </button>
                    </td>
                    {isProc ? (
                      <td colSpan={10} className="p-2 text-sky-800 text-xs">
                        <CircleNotch size={13} weight="bold" className="inline animate-spin mr-1.5" />
                        AI sedang membaca <b>{r.photo_name}</b>...
                      </td>
                    ) : (
                      <>
                        <td className="p-1"><Input disabled={disabled} type="date" data-testid={`t-date-${r.id}`} className={inputCls} value={r.invoice_date || ""} onChange={(e) => setRow(r.id, { invoice_date: e.target.value })} onBlur={() => saveRow(rows.find((x) => x.id === r.id))} /></td>
                        <td className="p-1"><Input disabled={disabled} list={`tso-${r.id}`} data-testid={`t-so-${r.id}`} className={inputCls} value={r.project_no || ""} onChange={(e) => setRow(r.id, { project_no: e.target.value })} onBlur={() => saveRow(rows.find((x) => x.id === r.id))} placeholder="—" />
                          <datalist id={`tso-${r.id}`}>{sos.slice(0, 300).map((s) => <option key={s} value={s} />)}</datalist>
                        </td>
                        <td className="p-1"><Input disabled={disabled} data-testid={`t-po-${r.id}`} className={inputCls} value={r.po_no || ""} onChange={(e) => setRow(r.id, { po_no: e.target.value })} onBlur={() => saveRow(rows.find((x) => x.id === r.id))} placeholder="—" /></td>
                        <td className="p-1"><Input disabled={disabled} list={`tvd-${r.id}`} data-testid={`t-vendor-${r.id}`} className={inputCls} value={r.vendor_name || ""} onChange={(e) => setRow(r.id, { vendor_name: e.target.value })} onBlur={() => saveRow(rows.find((x) => x.id === r.id))} placeholder="Nama Supplier" />
                          <datalist id={`tvd-${r.id}`}>{vendors.slice(0, 300).map((v) => <option key={v} value={v} />)}</datalist>
                        </td>
                        <td className="p-1"><Input disabled={disabled} list={`tit-${r.id}`} data-testid={`t-item-${r.id}`} className={inputCls} value={r.item_name || ""} onChange={(e) => setRow(r.id, { item_name: e.target.value })} onBlur={() => saveRow(rows.find((x) => x.id === r.id))} placeholder="Nama Barang" />
                          <datalist id={`tit-${r.id}`}>{items.slice(0, 500).map((n) => <option key={n} value={n} />)}</datalist>
                        </td>
                        <td className="p-1"><Input disabled={disabled} type="number" step="any" data-testid={`t-qty-${r.id}`} className={`${inputCls} text-right`} value={r.qty ?? ""} onChange={(e) => setRow(r.id, { qty: e.target.value })} onBlur={() => saveRow(rows.find((x) => x.id === r.id))} /></td>
                        <td className="p-1">
                          <select disabled={disabled} data-testid={`t-unit-${r.id}`} className={inputCls} value={r.unit || "Ea"} onChange={(e) => { setRow(r.id, { unit: e.target.value }); }} onBlur={() => saveRow(rows.find((x) => x.id === r.id))}>
                            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="p-1"><Input disabled={disabled} type="number" step="any" data-testid={`t-price-${r.id}`} className={`${inputCls} text-right`} value={r.unit_price ?? ""} onChange={(e) => setRow(r.id, { unit_price: e.target.value })} onBlur={() => saveRow(rows.find((x) => x.id === r.id))} /></td>
                        <td className="p-1"><Input disabled data-testid={`t-total-${r.id}`} className={`${inputCls} text-right bg-slate-50`} value={r.total_price ? Number(r.total_price).toLocaleString("id-ID") : ""} readOnly /></td>
                        <td className="p-1"><Input disabled={disabled} data-testid={`t-invoice-${r.id}`} className={inputCls} value={r.invoice_no || ""} onChange={(e) => setRow(r.id, { invoice_no: e.target.value })} onBlur={() => saveRow(rows.find((x) => x.id === r.id))} placeholder="—" /></td>
                        <td className="p-1">
                          <select disabled={disabled} data-testid={`t-stok-${r.id}`} className={inputCls} value={r.stock_mode || "none"} onChange={(e) => { setRow(r.id, { stock_mode: e.target.value }); }} onBlur={() => saveRow(rows.find((x) => x.id === r.id))}>
                            <option value="none">✕ Tidak (tanpa stok & log)</option>
                            <option value="stock">✓ Ya, Masuk Stok</option>
                            <option value="log">✎ Log Only</option>
                          </select>
                        </td>
                      </>
                    )}
                    <td className="p-1 text-center whitespace-nowrap">
                      {isFail && (
                        <div className="text-left px-1">
                          <div className="text-[10px] text-red-700 max-w-[140px] leading-tight mb-1" title={r.error}>
                            <WarningCircle size={11} weight="fill" className="inline mr-0.5" />
                            {(r.error || "Gagal dibaca").slice(0, 60)}...
                          </div>
                          <button data-testid={`retry-${r.id}`} onClick={() => retry(r)} className="text-[10px] uppercase font-bold text-sky-700 hover:underline mr-2">
                            <ArrowsClockwise size={11} weight="bold" className="inline mr-0.5" />Ulangi AI
                          </button>
                        </div>
                      )}
                      {!isProc && (
                        <div className="inline-flex items-center gap-1">
                          {!isFail && (
                            <Button
                              data-testid={`commit-${r.id}`}
                              onClick={() => commit(r)}
                              disabled={disabled || !rowValid(r)}
                              className="rounded-none h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] uppercase tracking-[0.05em] font-bold"
                              title={rowValid(r) ? "Masukkan baris ini ke sistem" : "Lengkapi Supplier, Barang, Qty dulu"}
                            >
                              {busyId === r.id ? "..." : <><CheckCircle size={12} weight="bold" className="mr-1" />Masuk Sistem</>}
                            </Button>
                          )}
                          <button data-testid={`discard-${r.id}`} onClick={() => discard(r)} className="p-1.5 hover:bg-red-100 text-red-600" title="Buang draft ini">
                            <Trash size={13} weight="bold" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {readyCount > 0 && (
          <div className="p-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600">
            <b>{readyCount}</b> baris siap dicek. Ingat: baris hanya masuk sistem setelah Anda klik <b>Masuk Sistem</b> satu per satu.
          </div>
        )}
      </Card>

      {/* Dialog lihat foto nota */}
      {photoView && (
        <div className="fixed inset-0 z-[90] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPhotoView(null)} data-testid="photo-dialog">
          <div className="bg-white max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
              <div className="text-sm font-bold text-slate-800 truncate">{photoView.photo_name}</div>
              <button onClick={() => setPhotoView(null)} className="text-slate-500 hover:text-slate-900" data-testid="photo-dialog-close">
                <X size={16} weight="bold" />
              </button>
            </div>
            <div className="overflow-auto p-2 bg-slate-100 flex-1">
              <img
                src={`${api.defaults.baseURL}/temp-transactions/photo/${photoView.photo_id}`}
                alt={photoView.photo_name}
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
