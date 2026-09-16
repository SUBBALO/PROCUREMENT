import React, { useCallback, useEffect, useState, useMemo } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Calculator, MagnifyingGlass, Plus, PencilSimple, Trash, ArrowClockwise, Wrench, PaintBucket, HardHat, DownloadSimple, UploadSimple, Info } from "@phosphor-icons/react";
import BackLink from "../components/BackLink";
import { useAuth } from "../lib/auth";
import { NPS_OPTIONS, PIPE_SCHEDULES, lookupPipeSchedule } from "../lib/pipeScheduleDB";
import PaginationBar, { usePagination } from "../components/PaginationBar";

// Full CRUD roles (Tambah/Edit/Hapus/Update Harga)
const FULL_ACCESS_ROLES = ["super_admin", "admin", "purchasing", "eng_leader", "eng_head"];
const canEditRole = (role) => FULL_ACCESS_ROLES.includes(role);

const inputCls = "h-9 rounded-none border-slate-300 focus:ring-2 focus:ring-sky-600 text-sm";

const CATEGORIES = [
  { key: "all", label: "Semua Kategori", icon: MagnifyingGlass, desc: "View gabungan semua kategori — ketik apapun (grade, part, cat, layanan)", accent: "slate" },
  { key: "raw_material", label: "Raw Material", icon: Calculator, desc: "Plate, Pipe, Beam, Bar, Profile — density-based costing", accent: "sky" },
  { key: "standard_part", label: "Standard Parts", icon: Wrench, desc: "Baut, mur, gasket, washer — per piece + catalog code + brand", accent: "amber" },
  { key: "consumable", label: "Consumables & Paint", icon: PaintBucket, desc: "Cat, thinner, elektroda, disk — per kaleng/box", accent: "emerald" },
  { key: "subcon", label: "Subcon Rate Card", icon: HardHat, desc: "Sandblast, painting, machining — per item / lumpsum", accent: "violet" },
];

const MATERIAL_TYPES = ["Plate", "Pipe", "Round Bar", "Square Bar", "Hollow Square", "Hollow Rect", "Angle L", "Channel U", "H-Beam", "WF", "IWF", "Wire Mesh", "Sheet"];
const GRADES = ["ASTM A36", "SS400", "S275JR", "S355JR", "Q235B", "Q345B", "SUS304", "SUS316", "SUS316L", "AL 6061", "AL 5052"];

// Standard Parts subtypes
const STDPART_TYPES = ["Bolt/Baut", "Nut/Mur", "Washer", "Gasket", "O-Ring", "Bearing", "Seal", "Screw", "Anchor", "Rivet", "Pin", "Coupling", "Fitting", "Valve", "Flange", "Lain-lain"];
// Consumable subtypes
const CONSUMABLE_TYPES = ["Cat/Paint", "Thinner", "Elektroda Las", "Kawat Las (Wire)", "Gas (Argon/CO2)", "Cutting Disc", "Grinding Disc", "Sandpaper", "Sarung Tangan", "Kuas/Roller", "Chemical", "Lain-lain"];
// Subcon services
const SUBCON_TYPES = ["Sandblasting", "Painting", "Powder Coating", "Galvanize", "Machining CNC", "Bubut", "Milling", "Bending", "Rolling", "Welding", "Heat Treatment", "NDT/Inspection", "Assembly", "Lain-lain"];

// Price cell with optional IDR-equivalent below (for non-IDR currencies)
function PriceCell({ value, currency, unit, valueIdr, className, unitClass = "text-[10px] text-slate-400", showUnit = true }) {
  const nonIdr = currency && currency !== "IDR";
  return (
    <>
      {fmtMoney(value, currency)}
      {showUnit && unit && <div className={unitClass}>/{unit}</div>}
      {nonIdr && valueIdr != null && (
        <div className="text-[10px] text-slate-500">≈ {fmtRp(valueIdr)}</div>
      )}
    </>
  );
}

const fmtRp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString("id-ID") : "-");

const CURRENCIES = [
  { code: "IDR", symbol: "Rp", default_rate: 1 },
  { code: "USD", symbol: "$", default_rate: 16000 },
  { code: "SGD", symbol: "S$", default_rate: 12000 },
  { code: "EUR", symbol: "€", default_rate: 17500 },
  { code: "CNY", symbol: "¥", default_rate: 2200 },
  { code: "JPY", symbol: "¥", default_rate: 105 },
  { code: "MYR", symbol: "RM", default_rate: 3500 },
];

const currencySym = (c) => (CURRENCIES.find((x) => x.code === c) || CURRENCIES[0]).symbol;
const fmtMoney = (n, currency = "IDR") => {
  const sym = currencySym(currency);
  const val = Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: currency === "IDR" ? 0 : 2 });
  return `${sym} ${val}`;
};

// Badge for last price update — "Hari ini" if same date as today
function PriceDateBadge({ dateStr }) {
  if (!dateStr) return <span className="text-slate-400">-</span>;
  const d = new Date(dateStr);
  const now = new Date();
  const same = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (same) return <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">Hari ini</span>;
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  const stale = diffDays > 90;
  return (
    <span className={`text-[10px] tabular-nums ${stale ? "text-rose-600 font-semibold" : "text-slate-600"}`} title={`${diffDays} hari lalu`}>
      {d.toLocaleDateString("id-ID")}
    </span>
  );
}

export default function MaterialCostingPage() {
  const { user } = useAuth();
  const canEdit = canEditRole(user?.role);
  const [activeCategory, setActiveCategory] = useState("raw_material");
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [priceItem, setPriceItem] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/material-costing/materials", {
        params: { category: activeCategory === "all" ? undefined : activeCategory, q: q.trim() || undefined },
      });
      setItems(data.items || []);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal muat"); }
    finally { setLoading(false); }
  }, [activeCategory, q]);

  useEffect(() => { load(); }, [load]);
  const pag = usePagination(items, 20);
  const pagedItems = pag.pagedData;

  const openDetail = (it) => setDetailItem(it);

  const openNew = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (it) => { setEditItem(it); setShowForm(true); };

  const downloadTemplate = async () => {
    try {
      const resp = await api.get(`/material-costing/materials/template/xlsx`, {
        params: { category: activeCategory },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `template_material_costing_${activeCategory}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Template Excel didownload — isi lalu upload kembali");
    } catch (e) { toast.error("Gagal download template"); }
  };

  const del = async (it) => {
    const label = it.service_name || it.catalog_code || it.grade || it.material_type;
    if (!window.confirm(`Hapus "${label} ${it.size_description || ""}"?`)) return;
    try {
      await api.delete(`/material-costing/materials/${it.id}`);
      toast.success("Terhapus");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal hapus"); }
  };

  const activeCat = CATEGORIES.find((c) => c.key === activeCategory);

  return (
    <div className="space-y-6">
      <BackLink />
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-sky-600 mb-1">
          <Calculator size={14} weight="fill" /> Engineering
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>
          Material Costing Reference Database
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Katalog harga referensi untuk costing Engineering. <b>Purchasing input harga</b> — sistem simpan sebagai reference lintas project. Bukan inventory/stock.
        </p>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const isActive = activeCategory === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCategory(c.key)}
              data-testid={`cat-${c.key}`}
              className={`text-left border rounded-none transition-all cursor-pointer bg-white px-3 py-1.5 ${
                isActive ? `border-${c.accent}-600 ring-2 ring-${c.accent}-200` : "border-slate-300 hover:border-slate-400"
              }`}
            >
              <div className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-bold text-${c.accent}-700`}>
                <Icon size={12} weight="bold" /> {c.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Price Averages Summary — shown for specific categories (not "all") */}
      {activeCategory !== "all" && <PriceAveragesBar category={activeCategory} refreshKey={items.length} />}

      {/* Filter row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px] max-w-md">
          <Label className="text-xs font-semibold text-slate-600 mb-1 block">Cari</Label>
          <Input data-testid="mc-search" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Ketik lalu Enter — grade, kode, brand, supplier..." />
        </div>
        <Button variant="outline" onClick={load} className="rounded-none h-9"><MagnifyingGlass size={14} weight="bold" className="mr-1" /> Cari</Button>
        <Button variant="ghost" onClick={load} className="rounded-none h-9" title="Refresh"><ArrowClockwise size={14} weight="bold" /></Button>
        <div className="flex-1"></div>
        {activeCategory !== "all" && canEdit && <>
          <Button variant="outline" onClick={downloadTemplate} className="rounded-none h-9" data-testid="mc-download-template" title={`Download template Excel untuk ${activeCat.label}`}>
            <DownloadSimple size={14} weight="bold" className="mr-1" /> Template
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)} className="rounded-none h-9" data-testid="mc-open-import" title="Upload Excel bulk">
            <UploadSimple size={14} weight="bold" className="mr-1" /> Upload Excel
          </Button>
          <Button data-testid="mc-add" onClick={openNew} className={`rounded-none h-9 bg-${activeCat.accent}-700 hover:bg-${activeCat.accent}-800 text-white`}>
            <Plus size={14} weight="bold" className="mr-1" /> Tambah {activeCat.label}
          </Button>
        </>}
        {activeCategory !== "all" && !canEdit && (
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-slate-100 px-3 h-9 border border-slate-300">
            <Info size={13} weight="bold" /> View only — hubungi Purchasing untuk perubahan
          </div>
        )}
        {activeCategory === "all" && (
          <div className="text-[11px] text-slate-500 italic">Pilih kategori spesifik untuk Tambah / Import Excel</div>
        )}
      </div>

      <Card className="rounded-none border-slate-200 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-500">
            {activeCat.label} — {items.length} entri
          </div>
          <div className="text-[10px] italic text-slate-400">Klik baris untuk lihat detail lengkap</div>
        </div>
        <div className="overflow-x-auto">
          {activeCategory === "all" && <CombinedTable items={pagedItems} loading={loading} openEdit={openEdit} del={del} openPrice={setPriceItem} canEdit={canEdit} openDetail={openDetail} />}
          {activeCategory === "raw_material" && <RawMaterialTable items={pagedItems} loading={loading} openEdit={openEdit} del={del} openPrice={setPriceItem} canEdit={canEdit} openDetail={openDetail} />}
          {activeCategory === "standard_part" && <StandardPartTable items={pagedItems} loading={loading} openEdit={openEdit} del={del} openPrice={setPriceItem} canEdit={canEdit} openDetail={openDetail} />}
          {activeCategory === "consumable" && <ConsumableTable items={pagedItems} loading={loading} openEdit={openEdit} del={del} openPrice={setPriceItem} canEdit={canEdit} openDetail={openDetail} />}
          {activeCategory === "subcon" && <SubconTable items={pagedItems} loading={loading} openEdit={openEdit} del={del} openPrice={setPriceItem} canEdit={canEdit} openDetail={openDetail} />}
        </div>
        <PaginationBar {...pag} label="material" testIdPrefix="mc-pag" />
      </Card>

      {showForm && (
        <MaterialForm
          category={activeCategory}
          initial={editItem}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {priceItem && (
        <UpdatePriceDialog
          item={priceItem}
          onClose={() => setPriceItem(null)}
          onSaved={() => { setPriceItem(null); load(); }}
        />
      )}

      {showImport && (
        <ImportExcelDialog
          category={activeCategory}
          categoryLabel={activeCat.label}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
          downloadTemplate={downloadTemplate}
        />
      )}

      {detailItem && (
        <MaterialDetailDialog
          item={detailItem}
          canEdit={canEdit}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setEditItem(detailItem); setDetailItem(null); setShowForm(true); }}
          onUpdatePrice={() => { setPriceItem(detailItem); setDetailItem(null); }}
        />
      )}
    </div>
  );
}

/* ============ TABLES PER CATEGORY ============ */

function EmptyRow({ colSpan, loading, msg }) {
  if (loading) return (<tr><td colSpan={colSpan} className="p-8 text-center text-slate-400">Memuat...</td></tr>);
  return (<tr><td colSpan={colSpan} className="p-8 text-center text-slate-400">{msg || "Belum ada data. Klik Tambah untuk mulai."}</td></tr>);
}

/* ============ PRICE AVERAGES BAR (basic reference per grade+jenis) ============ */

function PriceAveragesBar({ category, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get("/material-costing/price-summary", { params: { category } })
      .then(({ data }) => { if (alive) setRows(data.items || []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category, refreshKey]);

  const unitLabel = category === "raw_material" ? "/ Kg" : "/ Unit";
  const accent = ({ raw_material: "sky", standard_part: "amber", consumable: "emerald", subcon: "violet" })[category] || "slate";

  if (loading) {
    return (
      <div className="border border-slate-200 bg-white p-3 text-xs text-slate-400 italic">Memuat harga rata-rata…</div>
    );
  }
  if (!rows.length) {
    return (
      <div className="border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 italic">Belum ada data untuk dihitung rata-ratanya.</div>
    );
  }

  return (
    <div className={`border-2 border-${accent}-300 bg-gradient-to-br from-${accent}-50 to-white`} data-testid="price-averages">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/50"
      >
        <div className="flex items-center gap-2">
          <Calculator size={14} weight="bold" className={`text-${accent}-700`} />
          <span className={`text-[11px] uppercase tracking-[0.15em] font-bold text-${accent}-800`}>
            Harga Rata-rata {unitLabel} — Basic Reference per Grade + Jenis
          </span>
          <span className="text-[10px] text-slate-500">({rows.length} kombinasi)</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{collapsed ? "▸ Buka" : "▾ Sembunyikan"}</span>
      </button>
      {!collapsed && (
        <div className="px-2 pb-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1.5">
            {rows.map((r, i) => {
              const hasPrice = r.avg_price != null && r.avg_price > 0;
              return (
                <div key={i} className="bg-white border border-slate-200 px-1.5 py-1 hover:border-slate-400 transition-colors leading-tight" title={`${r.grade} · ${r.material_type} · ${r.count} entri${r.last_updated ? " · Upd " + fmtDate(r.last_updated) : ""}`}>
                  <div className="flex items-baseline justify-between gap-1">
                    <div className="text-[10px] font-mono font-bold text-slate-900 truncate">{r.grade}</div>
                    <span className={`text-[8px] font-bold text-${accent}-700 tabular-nums`}>×{r.count}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 truncate">{r.material_type}</div>
                  {hasPrice ? (
                    <div className={`text-xs font-bold text-${accent}-800 tabular-nums`}>{fmtRp(r.avg_price)}</div>
                  ) : (
                    <div className="text-[9px] text-slate-400 italic">-</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCell({ it, openEdit, del, openPrice, canEdit }) {
  if (!canEdit) {
    return <div className="text-center text-slate-300">—</div>;
  }
  return (
    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => openPrice(it)} data-testid={`mc-price-${it.id}`} className="p-1 text-emerald-700 hover:bg-emerald-50" title="Update Harga (quick)">
        <span className="inline-block font-bold text-[13px] leading-none">Rp</span>
      </button>
      <button onClick={() => openEdit(it)} data-testid={`mc-edit-${it.id}`} className="p-1 text-sky-600 hover:bg-sky-50" title="Edit lengkap"><PencilSimple size={13} /></button>
      <button onClick={() => del(it)} data-testid={`mc-del-${it.id}`} className="p-1 text-rose-600 hover:bg-rose-50" title="Hapus"><Trash size={13} /></button>
    </div>
  );
}

// Shared row className + click-to-detail handler
const rowCls = "border-b border-slate-100 hover:bg-sky-50/60 cursor-pointer";
const cellMarkupCls = "p-3 text-center tabular-nums bg-amber-50 text-amber-800 font-semibold";
const cellFinalCls = "p-3 text-right tabular-nums bg-emerald-50 font-bold text-emerald-800";

function CombinedTable({ items, loading, openEdit, del, openPrice, canEdit, openDetail }) {
  const catBadge = (cat) => {
    const map = {
      raw_material: { label: "Raw", color: "bg-sky-100 text-sky-800" },
      standard_part: { label: "Std Part", color: "bg-amber-100 text-amber-800" },
      consumable: { label: "Consumable", color: "bg-emerald-100 text-emerald-800" },
      subcon: { label: "Subcon", color: "bg-violet-100 text-violet-800" },
    };
    const m = map[cat] || { label: cat, color: "bg-slate-100 text-slate-700" };
    return <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold ${m.color} uppercase tracking-wider whitespace-nowrap`}>{m.label}</span>;
  };
  const nameFor = (it) => it.service_name || it.catalog_code || it.grade || "-";
  const extraFor = (it) => {
    if (it.category === "standard_part") return [it.brand, it.moq ? `MOQ ${it.moq}` : ""].filter(Boolean).join(" · ");
    if (it.category === "consumable") return [it.brand, it.pack_size].filter(Boolean).join(" · ");
    if (it.category === "subcon") return it.rate_unit ? `Rate: ${it.rate_unit}` : "";
    return it.grade && nameFor(it) !== it.grade ? it.grade : "";
  };
  return (
    <table className="w-full text-sm">
      <thead className="bg-white border-b border-slate-200">
        <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
          <th className="text-left p-3">Kategori</th>
          <th className="text-left p-3">Nama / Grade</th>
          <th className="text-left p-3">Jenis</th>
          <th className="text-left p-3">Ukuran / Spec</th>
          <th className="text-left p-3">Detail</th>
          <th className="text-right p-3">Harga Utuh</th>
          <th className="text-center p-3 bg-amber-50">Markup</th>
          <th className="text-right p-3 bg-emerald-50">Final Price</th>
          <th className="text-left p-3">Update Harga</th>
          <th className="text-center p-3">Aksi</th>
        </tr>
      </thead>
      <tbody data-testid="mc-list">
        {(loading || items.length === 0) && <EmptyRow colSpan={10} loading={loading} />}
        {items.map((it) => (
          <tr key={it.id} className={rowCls} onClick={() => openDetail(it)} data-testid={`mc-row-${it.id}`}>
            <td className="p-3">{catBadge(it.category)}</td>
            <td className="p-3 font-semibold text-slate-900">{nameFor(it)}</td>
            <td className="p-3 text-xs text-slate-700">{it.material_type || "-"}</td>
            <td className="p-3 text-xs text-slate-600 font-mono">{it.size_description || "-"}</td>
            <td className="p-3 text-xs text-slate-500">{extraFor(it) || "-"}</td>
            <td className="p-3 text-right tabular-nums text-slate-900">
              <PriceCell value={it.price_per_unit} currency={it.currency} unit={it.unit} valueIdr={it.price_per_unit_idr} />
            </td>
            <td className={cellMarkupCls}>{it.markup_pct || 0}%</td>
            <td className={cellFinalCls}>
              <PriceCell value={it.category === "raw_material" ? it.final_price_per_kg : it.final_price_per_unit} currency={it.currency} showUnit={false} valueIdr={it.category === "raw_material" ? it.final_price_per_kg_idr : it.final_price_per_unit_idr} />
              {it.category === "raw_material" && <div className="text-[9px] text-emerald-700/60 uppercase mt-0.5">/kg</div>}
            </td>
            <td className="p-3 text-[10px] text-slate-500"><PriceDateBadge dateStr={it.price_last_updated || it.updated_at} /><div className="text-slate-400 mt-0.5">{it.updated_by || "-"}</div></td>
            <td className="p-3 text-center"><ActionCell it={it} openEdit={openEdit} del={del} openPrice={openPrice} canEdit={canEdit} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


function RawMaterialTable({ items, loading, openEdit, del, openPrice, canEdit, openDetail }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-white border-b border-slate-200">
        <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
          <th className="text-left p-3">Grade</th>
          <th className="text-left p-3">Jenis</th>
          <th className="text-left p-3">Ukuran</th>
          <th className="text-right p-3">Harga Utuh</th>
          <th className="text-right p-3">Total Berat</th>
          <th className="text-right p-3">Harga/Kg</th>
          <th className="text-center p-3 bg-amber-50">Markup</th>
          <th className="text-right p-3 bg-emerald-50">Final /Kg</th>
          <th className="text-left p-3">Update Harga</th>
          <th className="text-center p-3">Aksi</th>
        </tr>
      </thead>
      <tbody data-testid="mc-list">
        {(loading || items.length === 0) && <EmptyRow colSpan={10} loading={loading} />}
        {items.map((it) => (
          <tr key={it.id} className={rowCls} onClick={() => openDetail(it)} data-testid={`mc-row-${it.id}`}>
            <td className="p-3 font-mono font-semibold text-slate-900">{it.grade}</td>
            <td className="p-3 text-slate-800">{it.material_type}</td>
            <td className="p-3 text-xs text-slate-600 font-mono">{it.size_description}</td>
            <td className="p-3 text-right tabular-nums text-slate-900">
              {fmtMoney(it.price_per_unit, it.currency)}
              <div className="text-[10px] text-slate-400">/{it.unit || "sheet"}</div>
              {(it.currency && it.currency !== "IDR") && (
                <div className="text-[10px] text-slate-500">≈ {fmtRp(it.price_per_unit_idr)} @ {Number(it.exchange_rate || 1).toLocaleString("id-ID")}</div>
              )}
            </td>
            <td className="p-3 text-right tabular-nums font-semibold text-slate-800">
              {Number(it.weight_kg || 0).toFixed(2)}
              <div className="text-[10px] text-slate-400 font-normal">Kg</div>
            </td>
            <td className="p-3 text-right tabular-nums text-slate-700">
              {fmtMoney(it.price_per_kg, it.currency)}
              {(it.currency && it.currency !== "IDR") && (
                <div className="text-[10px] text-slate-500">≈ {fmtRp(it.price_per_kg_idr)}</div>
              )}
            </td>
            <td className={cellMarkupCls}>{it.markup_pct || 0}%</td>
            <td className={cellFinalCls}>
              {fmtMoney(it.final_price_per_kg, it.currency)}
              {(it.currency && it.currency !== "IDR") && (
                <div className="text-[10px] text-emerald-700/70">≈ {fmtRp(it.final_price_per_kg_idr)}</div>
              )}
            </td>
            <td className="p-3 text-[10px] text-slate-500"><PriceDateBadge dateStr={it.price_last_updated || it.updated_at} /><div className="text-slate-400 mt-0.5">{it.updated_by || "-"}</div></td>
            <td className="p-3 text-center"><ActionCell it={it} openEdit={openEdit} del={del} openPrice={openPrice} canEdit={canEdit} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StandardPartTable({ items, loading, openEdit, del, openPrice, canEdit, openDetail }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-white border-b border-slate-200">
        <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
          <th className="text-left p-3">Kode Katalog</th>
          <th className="text-left p-3">Nama</th>
          <th className="text-left p-3">Jenis</th>
          <th className="text-left p-3">Spec/Size</th>
          <th className="text-left p-3">Brand</th>
          <th className="text-right p-3">MOQ</th>
          <th className="text-right p-3">Harga /Pcs</th>
          <th className="text-center p-3 bg-amber-50">Markup</th>
          <th className="text-right p-3 bg-emerald-50">Final Price</th>
          <th className="text-left p-3">Update Harga</th>
          <th className="text-center p-3">Aksi</th>
        </tr>
      </thead>
      <tbody data-testid="mc-list">
        {(loading || items.length === 0) && <EmptyRow colSpan={11} loading={loading} />}
        {items.map((it) => (
          <tr key={it.id} className={rowCls} onClick={() => openDetail(it)} data-testid={`mc-row-${it.id}`}>
            <td className="p-3 font-mono text-xs font-semibold text-slate-900">{it.catalog_code || "-"}</td>
            <td className="p-3 text-slate-800">{it.grade}</td>
            <td className="p-3 text-xs text-slate-600">{it.material_type}</td>
            <td className="p-3 text-xs text-slate-600 font-mono">{it.size_description}</td>
            <td className="p-3 text-xs text-slate-700">{it.brand || "-"}</td>
            <td className="p-3 text-right tabular-nums text-xs">{it.moq ? Number(it.moq).toLocaleString("id-ID") : "-"}</td>
            <td className="p-3 text-right tabular-nums text-slate-900"><PriceCell value={it.price_per_unit} currency={it.currency} unit={it.unit || "pcs"} valueIdr={it.price_per_unit_idr} /></td>
            <td className={cellMarkupCls}>{it.markup_pct || 0}%</td>
            <td className={cellFinalCls}><PriceCell value={it.final_price_per_unit} currency={it.currency} showUnit={false} valueIdr={it.final_price_per_unit_idr} /></td>
            <td className="p-3 text-[10px] text-slate-500"><PriceDateBadge dateStr={it.price_last_updated || it.updated_at} /><div className="text-slate-400 mt-0.5">{it.updated_by || "-"}</div></td>
            <td className="p-3 text-center"><ActionCell it={it} openEdit={openEdit} del={del} openPrice={openPrice} canEdit={canEdit} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConsumableTable({ items, loading, openEdit, del, openPrice, canEdit, openDetail }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-white border-b border-slate-200">
        <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
          <th className="text-left p-3">Nama</th>
          <th className="text-left p-3">Jenis</th>
          <th className="text-left p-3">Spec</th>
          <th className="text-left p-3">Pack Size</th>
          <th className="text-left p-3">Brand</th>
          <th className="text-right p-3">Harga /Unit</th>
          <th className="text-center p-3 bg-amber-50">Markup</th>
          <th className="text-right p-3 bg-emerald-50">Final Price</th>
          <th className="text-left p-3">Update Harga</th>
          <th className="text-center p-3">Aksi</th>
        </tr>
      </thead>
      <tbody data-testid="mc-list">
        {(loading || items.length === 0) && <EmptyRow colSpan={10} loading={loading} />}
        {items.map((it) => (
          <tr key={it.id} className={rowCls} onClick={() => openDetail(it)} data-testid={`mc-row-${it.id}`}>
            <td className="p-3 font-semibold text-slate-900">{it.grade}</td>
            <td className="p-3 text-xs text-slate-600">{it.material_type}</td>
            <td className="p-3 text-xs text-slate-600">{it.size_description || "-"}</td>
            <td className="p-3 text-xs text-slate-700 font-mono">{it.pack_size || "-"}</td>
            <td className="p-3 text-xs text-slate-700">{it.brand || "-"}</td>
            <td className="p-3 text-right tabular-nums text-slate-900"><PriceCell value={it.price_per_unit} currency={it.currency} unit={it.unit || "kaleng"} valueIdr={it.price_per_unit_idr} /></td>
            <td className={cellMarkupCls}>{it.markup_pct || 0}%</td>
            <td className={cellFinalCls}><PriceCell value={it.final_price_per_unit} currency={it.currency} showUnit={false} valueIdr={it.final_price_per_unit_idr} /></td>
            <td className="p-3 text-[10px] text-slate-500"><PriceDateBadge dateStr={it.price_last_updated || it.updated_at} /><div className="text-slate-400 mt-0.5">{it.updated_by || "-"}</div></td>
            <td className="p-3 text-center"><ActionCell it={it} openEdit={openEdit} del={del} openPrice={openPrice} canEdit={canEdit} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SubconTable({ items, loading, openEdit, del, openPrice, canEdit, openDetail }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-white border-b border-slate-200">
        <tr className="text-[10px] uppercase tracking-[0.08em] font-bold text-slate-500">
          <th className="text-left p-3">Layanan</th>
          <th className="text-left p-3">Jenis</th>
          <th className="text-left p-3">Spec/Detail</th>
          <th className="text-left p-3">Unit Rate</th>
          <th className="text-right p-3">Harga /Item</th>
          <th className="text-center p-3 bg-amber-50">Markup</th>
          <th className="text-right p-3 bg-emerald-50">Final Price</th>
          <th className="text-left p-3">Update Harga</th>
          <th className="text-center p-3">Aksi</th>
        </tr>
      </thead>
      <tbody data-testid="mc-list">
        {(loading || items.length === 0) && <EmptyRow colSpan={9} loading={loading} />}
        {items.map((it) => (
          <tr key={it.id} className={rowCls} onClick={() => openDetail(it)} data-testid={`mc-row-${it.id}`}>
            <td className="p-3 font-semibold text-slate-900">{it.service_name || it.grade}</td>
            <td className="p-3 text-xs text-slate-600">{it.material_type}</td>
            <td className="p-3 text-xs text-slate-600">{it.size_description || "-"}</td>
            <td className="p-3 text-xs text-violet-700 font-mono uppercase">{it.rate_unit || "per_item"}</td>
            <td className="p-3 text-right tabular-nums text-slate-900"><PriceCell value={it.price_per_unit} currency={it.currency} unit={it.unit || "item"} valueIdr={it.price_per_unit_idr} /></td>
            <td className={cellMarkupCls}>{it.markup_pct || 0}%</td>
            <td className={cellFinalCls}><PriceCell value={it.final_price_per_unit} currency={it.currency} showUnit={false} valueIdr={it.final_price_per_unit_idr} /></td>
            <td className="p-3 text-[10px] text-slate-500"><PriceDateBadge dateStr={it.price_last_updated || it.updated_at} /><div className="text-slate-400 mt-0.5">{it.updated_by || "-"}</div></td>
            <td className="p-3 text-center"><ActionCell it={it} openEdit={openEdit} del={del} openPrice={openPrice} canEdit={canEdit} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ============ DETAIL POPUP (READ-ONLY VIEW) ============ */

function MaterialDetailDialog({ item, canEdit, onClose, onEdit, onUpdatePrice }) {
  const [history, setHistory] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/material-costing/materials/${item.id}/price-history`);
        if (alive) setHistory(data.history || []);
      } catch { /* ignore */ }
      finally { if (alive) setLoadingHist(false); }
    })();
    return () => { alive = false; };
  }, [item.id]);

  const catLabel = ({
    raw_material: "Raw Material",
    standard_part: "Standard Part",
    consumable: "Consumable / Paint",
    subcon: "Subcon Service",
  })[item.category] || item.category;
  const catAccent = ({ raw_material: "sky", standard_part: "amber", consumable: "emerald", subcon: "violet" })[item.category] || "slate";
  const titleName = item.service_name || item.catalog_code || item.grade || "-";

  const Row = ({ k, v, mono }) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{k}</div>
      <div className={`text-sm text-slate-900 text-right ${mono ? "font-mono" : ""}`}>{v ?? <span className="text-slate-300">—</span>}</div>
    </div>
  );

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="mc-detail-dialog">
        <DialogHeader>
          <div className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-bold text-${catAccent}-600 mb-1`}>
            <Info size={13} weight="bold" /> {catLabel}
          </div>
          <DialogTitle className="text-xl">{titleName}</DialogTitle>
          <DialogDescription>Detail lengkap material. {canEdit ? "Anda dapat Edit atau Update Harga." : "Mode read-only."}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {/* Identifikasi */}
          <div className="border border-slate-200 p-3 bg-slate-50/40">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Identifikasi</div>
            <Row k="Grade" v={item.grade} mono />
            <Row k="Jenis" v={item.material_type} />
            <Row k="Ukuran / Spec" v={item.size_description} mono />
            {item.catalog_code && <Row k="Kode Katalog" v={item.catalog_code} mono />}
            {item.brand && <Row k="Brand" v={item.brand} />}
            {item.pack_size && <Row k="Pack Size" v={item.pack_size} mono />}
            {item.service_name && <Row k="Nama Layanan" v={item.service_name} />}
            {item.rate_unit && <Row k="Rate Unit" v={item.rate_unit} />}
            {item.moq != null && item.moq !== "" && <Row k="MOQ" v={Number(item.moq).toLocaleString("id-ID")} />}
            {item.remark && <Row k="Remark" v={item.remark} />}
          </div>

          {/* Dimensi & Berat (untuk raw_material) */}
          {item.category === "raw_material" && (
            <div className="border border-slate-200 p-3 bg-sky-50/40">
              <div className="text-[10px] uppercase tracking-wider font-bold text-sky-700 mb-2">Dimensi &amp; Berat</div>
              {item.length_mm ? <Row k="Panjang" v={`${item.length_mm} mm`} mono /> : null}
              {item.width_mm ? <Row k="Lebar" v={`${item.width_mm} mm`} mono /> : null}
              {item.thickness_mm ? <Row k="Tebal" v={`${item.thickness_mm} mm`} mono /> : null}
              {item.outer_diameter_mm ? <Row k="OD" v={`${item.outer_diameter_mm} mm`} mono /> : null}
              {item.wall_thickness_mm ? <Row k="Wall Thk" v={`${item.wall_thickness_mm} mm`} mono /> : null}
              <Row k="Density" v={item.density_g_cm3 ? `${item.density_g_cm3} g/cm³` : null} mono />
              <Row k="Total Berat" v={<b className="text-slate-900 tabular-nums">{Number(item.weight_kg || 0).toFixed(3)} Kg</b>} mono />
            </div>
          )}

          {/* Harga */}
          <div className="border border-slate-200 p-3 bg-emerald-50/40 md:col-span-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 mb-2">Harga &amp; Markup</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase text-slate-500">Currency</div>
                <div className="font-bold">{item.currency || "IDR"} {item.exchange_rate && item.currency !== "IDR" ? <span className="text-[10px] text-slate-500 font-normal">@ {Number(item.exchange_rate).toLocaleString("id-ID")}</span> : null}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Harga Utuh / {item.unit || "unit"}</div>
                <div className="font-bold tabular-nums">{fmtMoney(item.price_per_unit, item.currency)}</div>
                {item.currency && item.currency !== "IDR" && <div className="text-[10px] text-slate-500">≈ {fmtRp(item.price_per_unit_idr)}</div>}
              </div>
              {item.category === "raw_material" && (
                <div>
                  <div className="text-[10px] uppercase text-slate-500">Harga / Kg</div>
                  <div className="font-bold tabular-nums">{fmtMoney(item.price_per_kg, item.currency)}</div>
                  {item.currency && item.currency !== "IDR" && <div className="text-[10px] text-slate-500">≈ {fmtRp(item.price_per_kg_idr)}</div>}
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase text-slate-500">Markup</div>
                <div className="font-bold text-amber-800 tabular-nums">+{item.markup_pct || 0}%</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-[10px] uppercase text-slate-500">Final Price {item.category === "raw_material" ? "/ Kg" : `/ ${item.unit || "unit"}`}</div>
                <div className="text-lg font-bold text-emerald-800 tabular-nums">
                  {fmtMoney(item.category === "raw_material" ? item.final_price_per_kg : item.final_price_per_unit, item.currency)}
                </div>
                {item.currency && item.currency !== "IDR" && (
                  <div className="text-[11px] text-emerald-700/70">≈ {fmtRp(item.category === "raw_material" ? item.final_price_per_kg_idr : item.final_price_per_unit_idr)}</div>
                )}
              </div>
            </div>
          </div>

          {/* Supplier & Update Info */}
          <div className="border border-slate-200 p-3 bg-slate-50/40 md:col-span-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Supplier &amp; Update</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase text-slate-500">Supplier / Vendor</div>
                <div className="font-semibold">{item.supplier_name || <span className="text-slate-300">—</span>}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Last Update Harga</div>
                <div><PriceDateBadge dateStr={item.price_last_updated || item.updated_at} /></div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Diupdate Oleh</div>
                <div className="font-semibold">{item.updated_by || item.created_by || <span className="text-slate-300">—</span>}</div>
              </div>
            </div>
          </div>

          {/* Price History */}
          <div className="border border-slate-200 p-3 bg-white md:col-span-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Riwayat Harga ({history.length})</div>
            {loadingHist ? (
              <div className="text-xs text-slate-400 italic">Memuat...</div>
            ) : history.length === 0 ? (
              <div className="text-xs text-slate-400 italic">Belum ada riwayat perubahan harga.</div>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="text-left p-2">Tanggal</th>
                      <th className="text-right p-2">Harga</th>
                      <th className="text-left p-2">Supplier</th>
                      <th className="text-left p-2">Oleh</th>
                      <th className="text-left p-2">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="p-2 tabular-nums">{fmtDate(h.date || h.updated_at)}</td>
                        <td className="p-2 text-right tabular-nums font-semibold">{fmtMoney(h.price, h.currency || item.currency)}</td>
                        <td className="p-2">{h.supplier_name || "-"}</td>
                        <td className="p-2 text-slate-500">{h.updated_by || "-"}</td>
                        <td className="p-2 text-slate-500 italic">{h.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 mt-3">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Tutup</Button>
          {canEdit && (
            <>
              <Button type="button" onClick={onUpdatePrice} className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white" data-testid="mc-detail-update-price">
                <span className="font-bold mr-1">Rp</span> Update Harga
              </Button>
              <Button type="button" onClick={onEdit} className="rounded-none bg-sky-700 hover:bg-sky-800 text-white" data-testid="mc-detail-edit">
                <PencilSimple size={13} weight="bold" className="mr-1" /> Edit Lengkap
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ FORM ============ */

// SMART PASTE — compact 1-line, panduan collapsible
function SmartPasteBox({ onParse }) {
  const [text, setText] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  return (
    <div className="border-2 border-emerald-500 bg-emerald-50 p-2">
      <div className="flex gap-2 items-center">
        <label className="text-[10px] uppercase tracking-wider font-bold text-emerald-800 whitespace-nowrap">⚡ Smart Paste</label>
        <Input
          className={`${inputCls} font-mono flex-1`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onParse(text); } }}
          placeholder={`Paste: "S275JR | H Beam 125 x 125 x 6.5 x 9mm x 6M Lg"  ·  urutan: GRADE | JENIS | UKURAN`}
          data-testid="mf-smart-input"
        />
        <button
          type="button"
          onClick={() => onParse(text)}
          className="px-3 h-9 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold whitespace-nowrap"
          data-testid="mf-smart-parse"
        >⚡ Parse</button>
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="text-[10px] px-2 h-9 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
          title="Panduan format"
        >ℹ {showGuide ? "Tutup" : "Panduan"}</button>
      </div>
      {showGuide && (
        <div className="mt-2 bg-white border border-emerald-300 p-2 text-[11px] text-slate-700 space-y-1">
          <div className="font-bold">Urutan: <span className="font-mono text-emerald-800">GRADE | JENIS | UKURAN</span></div>
          <div><b>Grade:</b> S275JR, ASTM A36, SS400, API5L Gr. B, dll</div>
          <div><b>Jenis:</b> Plate, Pipe, H Beam, WF, IWF, Angle L, SHS, RHS, Channel, Round Bar, Wire Mesh</div>
          <div><b>Ukuran:</b> mm/cm/m/"/'  · akhiran Lg/Thk/M/Mtr · pipe support SCH lookup</div>
          <div className="pt-1 font-mono text-[10px] text-emerald-700">Contoh: <span className="mr-2">S275JR | H Beam 125 x 125 x 6.5 x 9mm x 6M Lg</span> · <span className="ml-1">API5L Gr. B Seamless Pipe 10" S80 x 6 Mtr</span></div>
        </div>
      )}
    </div>
  );
}

// PRICE INPUT — auto-format 1500000 → 1.500.000 (Indonesian standard: dot as thousand sep, comma as decimal)
function PriceInput({ value, onChange, placeholder, testid, className }) {
  const format = (v) => {
    if (v === "" || v === null || v === undefined) return "";
    const num = Number(v);
    if (isNaN(num) || num === 0) return "";
    // Indonesian format: 1.500.000 (or 1.500.000,50)
    return num.toLocaleString("id-ID", { maximumFractionDigits: 4 });
  };
  const [text, setText] = useState(format(value));
  useEffect(() => { setText(format(value)); }, [value]);

  const parse = (s) => {
    // Strip everything except digits and single decimal (comma or dot as last decimal)
    // Indonesian style: `.` = thousand, `,` = decimal
    let cleaned = String(s || "").trim();
    if (!cleaned) return 0;
    // Remove all dots (thousand separators)
    cleaned = cleaned.replace(/\./g, "");
    // Convert comma to dot (decimal)
    cleaned = cleaned.replace(",", ".");
    // Strip any non-numeric char except leading minus
    cleaned = cleaned.replace(/[^\d.-]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw); // show as typed
        onChange(parse(raw));
      }}
      onBlur={() => setText(format(value))} // reformat on blur
      placeholder={placeholder || "0"}
      data-testid={testid}
    />
  );
}

// SUPPLIER AUTOCOMPLETE — pilih dari supplier yang pernah diisi
function SupplierAutocompleteInput({ value, onChange, placeholder, testid, className }) {
  const [q, setQ] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState([]);
  const [hi, setHi] = useState(0);
  const wrapRef = React.useRef(null);
  useEffect(() => { setQ(value || ""); }, [value]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/material-costing/suppliers", { params: { q: q.trim() || undefined, limit: 20 } });
        setOpts(data.items || []); setHi(0);
      } catch { setOpts([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [open, q]);
  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const pick = (n) => { onChange(n); setQ(n); setOpen(false); };
  const onKey = (e) => {
    if (!open) { if (e.key === "ArrowDown") setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((v) => Math.min(v + 1, opts.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((v) => Math.max(v - 1, 0)); }
    else if (e.key === "Enter" && opts[hi]) { e.preventDefault(); pick(opts[hi].name); }
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <div ref={wrapRef} className="relative">
      <Input
        className={className}
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        data-testid={testid}
        autoComplete="off"
      />
      {open && opts.length > 0 && (
        <div className="absolute z-50 mt-1 left-0 right-0 max-h-52 overflow-y-auto bg-white border border-slate-300 shadow-lg">
          {opts.map((o, idx) => (
            <div
              key={o.name}
              onMouseDown={(e) => { e.preventDefault(); pick(o.name); }}
              onMouseEnter={() => setHi(idx)}
              className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between gap-2 ${idx === hi ? "bg-emerald-100" : "hover:bg-slate-50"}`}
            >
              <div className="min-w-0 flex-1 truncate">{o.name}</div>
              <div className="text-[10px] text-slate-400 tabular-nums">×{o.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// PIPE SCHEDULE SELECTOR — ASME B36.10M / B36.19M
function PipeScheduleSelector({ onApply }) {
  const [nps, setNps] = useState("");
  const [sch, setSch] = useState("");
  const [len, setLen] = useState(6); // meters, default 6m
  const [density, setDensity] = useState(7.85); // g/cm³, default carbon steel
  const result = useMemo(() => {
    if (!nps || !sch) return null;
    return lookupPipeSchedule(nps, sch, density * 1000);
  }, [nps, sch, density]);
  const totalWeight = result ? result.weight_per_meter_kg * len : null;
  return (
    <div className="border-2 border-violet-400 bg-violet-50/60 p-3 space-y-2" data-testid="mf-pipe-sch-panel">
      <div className="text-[10px] uppercase tracking-wider font-bold text-violet-800">
        📐 Pipe Schedule Lookup (ASME B36.10M / B36.19M)
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <FormField label="NPS (Nominal Pipe Size)">
          <select className={inputCls} value={nps} onChange={(e) => setNps(e.target.value)} data-testid="mf-pipe-nps">
            <option value="">— pilih —</option>
            {NPS_OPTIONS.map((n) => <option key={n} value={n}>{n}"</option>)}
          </select>
        </FormField>
        <FormField label="Schedule">
          <select className={inputCls} value={sch} onChange={(e) => setSch(e.target.value)} data-testid="mf-pipe-sch">
            <option value="">— pilih —</option>
            {PIPE_SCHEDULES.map((s) => <option key={s} value={s}>SCH {s}</option>)}
          </select>
        </FormField>
        <FormField label="Panjang (m)">
          <Input type="number" step="0.1" min="0" className={inputCls} value={len} onChange={(e) => setLen(parseFloat(e.target.value) || 0)} data-testid="mf-pipe-len" />
        </FormField>
        <FormField label="Density (g/cm³)">
          <Input type="number" step="0.01" className={inputCls} value={density} onChange={(e) => setDensity(parseFloat(e.target.value) || 7.85)} data-testid="mf-pipe-density" />
        </FormField>
        <button
          type="button"
          disabled={!result}
          onClick={() => result && onApply({ ...result, nps, sch })}
          className="h-9 px-3 bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="mf-pipe-apply"
        >
          ↓ Isi ke Form
        </button>
      </div>
      {nps && sch && !result && (
        <div className="text-[11px] text-rose-700">⚠ Kombinasi NPS {nps}" × SCH {sch} tidak ada di database ASME. Coba schedule lain (STD/40/80/XS/XXS umum).</div>
      )}
      {result && (
        <div className="grid grid-cols-4 gap-2 text-xs tabular-nums bg-white p-2 border border-violet-300">
          <div><div className="text-[10px] uppercase text-slate-500">OD</div><div className="font-bold text-slate-900">{result.od_mm} mm</div></div>
          <div><div className="text-[10px] uppercase text-slate-500">Wall Thickness</div><div className="font-bold text-slate-900">{result.wall_mm} mm</div></div>
          <div><div className="text-[10px] uppercase text-slate-500">Berat / meter</div><div className="font-bold text-emerald-700">{result.weight_per_meter_kg.toFixed(3)} kg/m</div></div>
          <div><div className="text-[10px] uppercase text-slate-500">Total Berat ({len}m)</div><div className="font-bold text-emerald-800">{totalWeight ? totalWeight.toFixed(3) : "-"} kg</div></div>
        </div>
      )}
    </div>
  );
}

function MaterialForm({ category, initial, onClose, onSaved }) {
  const [f, setF] = useState(() => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const commonDefaults = { price_effective_date: today, currency: "IDR", exchange_rate: 1 };
    if (initial) return { ...commonDefaults, ...initial, price_effective_date: initial.price_effective_date || initial.price_last_updated?.slice(0, 10) || today };
    // defaults per category
    if (category === "standard_part") return {
      category, material_type: "Bolt/Baut", grade: "", size_description: "",
      catalog_code: "", brand: "", moq: null,
      price_per_unit: 0, unit: "pcs", markup_pct: 0, supplier_name: "", remark: "",
      ...commonDefaults,
    };
    if (category === "consumable") return {
      category, material_type: "Cat/Paint", grade: "", size_description: "", pack_size: "", brand: "",
      price_per_unit: 0, unit: "kaleng", markup_pct: 0, supplier_name: "", remark: "",
      ...commonDefaults,
    };
    if (category === "subcon") return {
      category, material_type: "Sandblasting", service_name: "", grade: "", size_description: "",
      rate_unit: "per_item",
      price_per_unit: 0, unit: "item", markup_pct: 0, supplier_name: "", remark: "",
      ...commonDefaults,
    };
    // raw_material default
    return {
      category: "raw_material", material_type: "Plate", grade: "ASTM A36", size_description: "",
      length_mm: 0, width_mm: 0, thickness_mm: 0, outer_diameter_mm: 0, wall_thickness_mm: 0,
      price_per_unit: 0, unit: "sheet", weight_kg: 0, markup_pct: 0, supplier_name: "", remark: "",
      ...commonDefaults,
    };
  });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState({ weight_kg: 0, price_per_kg: 0, final_price_per_kg: 0, density: 0 });

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Live preview compute (raw_material — all shapes)
  useEffect(() => {
    if (category !== "raw_material") return;
    const compute = async () => {
      try {
        const { data } = await api.get("/material-costing/density-table");
        const grade = (f.grade || "").toUpperCase();
        const rec = (data || []).find((d) => d.grade === grade);
        const density = rec?.density_g_cm3 || 7.85; // g/cm³
        let weight = Number(f.weight_kg || 0);
        const mt = (f.material_type || "").toUpperCase();
        // Auto-calc only when user hasn't manually set weight_kg
        if (!weight) {
          const L = Number(f.length_mm || 0), W = Number(f.width_mm || 0), T = Number(f.thickness_mm || 0);
          const OD = Number(f.outer_diameter_mm || 0), WT = Number(f.wall_thickness_mm || 0);
          // Volume (cm³) → weight (kg) = V × density / 1000
          let vol_cm3 = 0;
          // === Strong-form matchers (specific first) ===
          if (mt.includes("H-BEAM") || mt.includes("HBEAM") || mt.includes("H BEAM") || mt.includes("WF") || mt.includes("IWF")) {
            // H-Beam / WF / IWF: OD=H, W=B, T=tf, WT=tw, L=length
            // Vol = (2·B·tf + (H − 2·tf)·tw) × L
            const H = OD, B = W, tf = T, tw = WT;
            if (H && B && tf && tw && L) {
              const web_h = H - 2 * tf;
              const area_cm2 = 2 * (B / 10) * (tf / 10) + Math.max(web_h, 0) / 10 * (tw / 10);
              vol_cm3 = area_cm2 * (L / 10);
            }
          } else if (mt.includes("CHANNEL") || mt.includes("UNP") || mt.includes("CNP")) {
            // Channel U: same as H-beam profile (2 flange + 1 web)
            const H = OD, B = W, tf = T, tw = WT;
            if (H && B && tf && tw && L) {
              const web_h = H - 2 * tf;
              const area_cm2 = 2 * (B / 10) * (tf / 10) + Math.max(web_h, 0) / 10 * (tw / 10);
              vol_cm3 = area_cm2 * (L / 10);
            }
          } else if (mt.includes("ANGLE") || mt.includes("SIKU")) {
            // Angle L: width_mm=leg, thickness_mm=t, length_mm=L
            // Area = 2·leg·t − t²  (subtract corner overlap)
            if (W && T && L) {
              const area_cm2 = 2 * (W / 10) * (T / 10) - (T / 10) ** 2;
              vol_cm3 = area_cm2 * (L / 10);
            }
          } else if (mt.includes("HOLLOW SQUARE") || mt.toUpperCase() === "SHS") {
            // SHS: width_mm=side, wall_thickness_mm=wall, length_mm=L
            if (W && WT && L) {
              const inner = W - 2 * WT;
              const area_cm2 = (W / 10) ** 2 - (Math.max(inner, 0) / 10) ** 2;
              vol_cm3 = area_cm2 * (L / 10);
            }
          } else if (mt.includes("HOLLOW RECT") || mt.toUpperCase() === "RHS") {
            // RHS: width_mm=w, thickness_mm=h, wall_thickness_mm=wall, length_mm=L
            if (W && T && WT && L) {
              const iw = W - 2 * WT, ih = T - 2 * WT;
              const area_cm2 = (W / 10) * (T / 10) - (Math.max(iw, 0) / 10) * (Math.max(ih, 0) / 10);
              vol_cm3 = area_cm2 * (L / 10);
            }
          } else if (mt.includes("PIPE") && OD && WT && L) {
            // Hollow cylinder: π/4 × (OD² − ID²) × L
            const ID = OD - 2 * WT;
            vol_cm3 = Math.PI / 4 * ((OD / 10) ** 2 - (ID / 10) ** 2) * (L / 10);
          } else if (mt.includes("ROUND") && OD && L) {
            vol_cm3 = Math.PI / 4 * ((OD / 10) ** 2) * (L / 10);
          } else if (mt.includes("SQUARE BAR") && W && L) {
            vol_cm3 = (W / 10) ** 2 * (L / 10);
          } else if ((mt.includes("PLATE") || mt.includes("SHEET")) && L && W && T) {
            vol_cm3 = (L / 10) * (W / 10) * (T / 10);
          } else if (mt.includes("WIRE MESH") && L && W) {
            vol_cm3 = (L / 10) * (W / 10) * ((T || 3) / 10);
          }
          if (vol_cm3 > 0) weight = vol_cm3 * density / 1000; // g → kg
        }
        const ppk = weight > 0 ? Number(f.price_per_unit || 0) / weight : 0;
        const markup = Number(f.markup_pct || 0);
        setPreview({ density, weight_kg: weight, price_per_kg: ppk, final_price_per_kg: ppk * (1 + markup / 100) });
      } catch { /* ignore */ }
    };
    compute();
  }, [category, f.grade, f.material_type, f.length_mm, f.width_mm, f.thickness_mm, f.outer_diameter_mm, f.wall_thickness_mm, f.weight_kg, f.price_per_unit, f.markup_pct]);

  const validate = () => {
    if (category === "raw_material") {
      if (!f.grade || !f.material_type || !f.size_description) return "Grade, Jenis, Ukuran wajib";
    }
    if (category === "standard_part") {
      if (!f.grade || !f.material_type) return "Jenis & Nama wajib";
    }
    if (category === "consumable") {
      if (!f.grade || !f.material_type) return "Jenis & Nama wajib";
    }
    if (category === "subcon") {
      if (!f.material_type || !(f.service_name || f.grade)) return "Jenis & Nama layanan wajib";
    }
    return null;
  };

  const save = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const payload = { ...f, category };
      // Backfill grade with service_name if empty (subcon)
      if (category === "subcon" && !payload.grade && payload.service_name) payload.grade = payload.service_name;
      if (initial?.id) {
        await api.put(`/material-costing/materials/${initial.id}`, payload);
        toast.success("Data di-update");
      } else {
        await api.post("/material-costing/materials", payload);
        toast.success("Data tersimpan");
      }
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  const title = initial ? "Edit" : "Tambah";
  const catLabel = CATEGORIES.find((c) => c.key === category)?.label;

  // Enter → pindah ke field berikutnya. Submit HANYA lewat klik tombol Simpan.
  const handleFormKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const tag = (e.target.tagName || "").toUpperCase();
    if (tag === "TEXTAREA") return;
    if (tag === "BUTTON") return; // biarkan Simpan / tombol lain berfungsi normal
    // Jika input punya handler Enter sendiri (mis. Size parser, Combobox), biarkan
    if (e.target.dataset && e.target.dataset.enterHandled === "true") return;
    e.preventDefault();
    const form = e.currentTarget;
    const focusables = Array.from(
      form.querySelectorAll('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
    ).filter((el) => el.offsetParent !== null); // hanya yang visible
    const idx = focusables.indexOf(e.target);
    if (idx === -1) return;
    const next = focusables[idx + 1];
    if (next) {
      next.focus();
      if (typeof next.select === "function") { try { next.select(); } catch {} }
    }
    // Kalau sudah field terakhir → tidak submit; user harus klik Simpan
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title} — {catLabel}</DialogTitle>
          <DialogDescription>Isi field yang relevan. Field bertanda * wajib. Tekan <b>Enter</b> untuk pindah ke kolom berikutnya. Klik <b>Simpan</b> untuk menyimpan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} onKeyDown={handleFormKeyDown} className="space-y-3">
          {category === "raw_material" && <RawMaterialFields f={f} set={set} preview={preview} />}
          {category === "standard_part" && <StandardPartFields f={f} set={set} />}
          {category === "consumable" && <ConsumableFields f={f} set={set} />}
          {category === "subcon" && <SubconFields f={f} set={set} />}

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Nama Supplier / Vendor">
              <SupplierAutocompleteInput
                className={inputCls}
                value={f.supplier_name || ""}
                onChange={(v) => set("supplier_name", v)}
                placeholder="Ketik / pilih dari daftar supplier"
                testid="mf-supplier"
              />
            </FormField>
            <FormField label="Markup % (ongkir/margin)">
              <Input type="number" step="any" className={inputCls} value={f.markup_pct} onChange={(e) => set("markup_pct", parseFloat(e.target.value) || 0)} data-testid="mf-markup" />
            </FormField>
            <FormField label="Tanggal Update Harga *">
              <Input type="date" className={inputCls} value={f.price_effective_date || new Date().toISOString().slice(0, 10)} onChange={(e) => set("price_effective_date", e.target.value)} data-testid="mf-date" />
            </FormField>
            <FormField label="Remark" full>
              <Input className={inputCls} value={f.remark || ""} onChange={(e) => set("remark", e.target.value)} placeholder="Opsional (finish, coating, dll)" />
            </FormField>
          </div>

          {/* Live preview only for raw_material */}
          {category === "raw_material" ? (
            <div className="border-2 border-emerald-500 bg-emerald-50 p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 mb-2">Hasil Perhitungan Otomatis (Live)</div>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div><div className="text-[10px] text-slate-500 uppercase">Berat</div><div className="font-bold tabular-nums">{preview.weight_kg.toFixed(3)} Kg</div></div>
                <div><div className="text-[10px] text-slate-500 uppercase">Harga/Kg</div><div className="font-bold tabular-nums">{fmtRp(preview.price_per_kg)}</div></div>
                <div><div className="text-[10px] text-slate-500 uppercase">Markup</div><div className="font-bold tabular-nums text-amber-700">+{f.markup_pct || 0}%</div></div>
                <div><div className="text-[10px] text-slate-500 uppercase">Final/Kg</div><div className="font-bold tabular-nums text-emerald-800 text-base">{fmtRp(preview.final_price_per_kg)}</div></div>
              </div>
            </div>
          ) : (
            <div className="border-2 border-emerald-500 bg-emerald-50 p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 mb-2">Final Price (setelah markup)</div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-[10px] text-slate-500 uppercase">Harga Utuh</div><div className="font-bold tabular-nums">{fmtRp(f.price_per_unit)}</div></div>
                <div><div className="text-[10px] text-slate-500 uppercase">Markup</div><div className="font-bold tabular-nums text-amber-700">+{f.markup_pct || 0}%</div></div>
                <div><div className="text-[10px] text-slate-500 uppercase">Final Price</div><div className="font-bold tabular-nums text-emerald-800 text-base">{fmtRp(Number(f.price_per_unit || 0) * (1 + Number(f.markup_pct || 0) / 100))}</div></div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
            <Button type="submit" disabled={saving} data-testid="mf-save" className="rounded-none bg-sky-700 hover:bg-sky-800 text-white">
              {saving ? "Menyimpan..." : (initial ? "Update" : "Simpan")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============ FORM FIELDSETS PER CATEGORY ============ */

function RawMaterialFields({ f, set, preview }) {
  const mtRaw = (f.material_type || "").toUpperCase();
  const isPlate = mtRaw.includes("PLATE") || mtRaw.includes("SHEET");
  const isPipe = mtRaw.includes("PIPE");
  const isRound = mtRaw.includes("ROUND");
  const isSquareBar = mtRaw.includes("SQUARE BAR");
  const isSHS = mtRaw.includes("HOLLOW SQUARE") || mtRaw === "SHS";
  const isRHS = mtRaw.includes("HOLLOW RECT") || mtRaw === "RHS";
  const isAngle = mtRaw.includes("ANGLE") || mtRaw.includes("SIKU");
  const isChannel = mtRaw.includes("CHANNEL") || mtRaw.includes("UNP") || mtRaw.includes("CNP");
  const isHBeam = mtRaw.includes("H-BEAM") || mtRaw.includes("HBEAM") || mtRaw.includes("H BEAM") || mtRaw === "WF" || mtRaw === "IWF" || mtRaw.includes("WF") || mtRaw.includes("IWF");
  const isStructural = isHBeam || isChannel;
  const [gradeOpts, setGradeOpts] = useState([]);
  const [showAddGrade, setShowAddGrade] = useState(false);
  const [newGrade, setNewGrade] = useState({ grade: "", density_g_cm3: 7.85 });
  const [sizeText, setSizeText] = useState(f.size_description || "");
  const [parseNote, setParseNote] = useState("");

  const loadGrades = useCallback(async () => {
    try {
      const { data } = await api.get("/material-costing/density-table");
      setGradeOpts(data || []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadGrades(); }, [loadGrades]);

  // Parse unit-aware size string. Returns list of {mm} values.
  // Supports: 4' x 8' x 5mm  (feet × mm),  Dia. 16mm x 6M  (M = meter),  OD60.3 × 3.2 × 6000
  const parseNumbers = (s) => {
    if (!s) return [];
    let cleaned = String(s)
      // strip common prefixes/labels
      .replace(/\b(Dia\.?|Diameter|Ø|OD|ID|wall|thickness|panjang|lebar|tebal|length|width)\b\s*[:.]?\s*/gi, "")
      // normalise separators
      .replace(/[×xX*✕]/g, " ")
      .replace(/[,;]/g, ".");
    const out = [];
    // Match: digits (optional decimal) then optional unit (mm/cm/m/M/'/inch/")
    const re = /(\d+(?:\.\d+)?)\s*(mm|cm|MM|CM|Mm|"|inch|IN|in|'|m|M)?/g;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      const n = parseFloat(m[1]);
      if (!(n > 0)) continue;
      const u = (m[2] || "").toLowerCase();
      let mm = n;
      if (u === "'") mm = n * 304.8;              // foot
      else if (u === '"' || u === "inch" || u === "in") mm = n * 25.4;
      else if (u === "cm") mm = n * 10;
      else if (u === "m") mm = n * 1000;
      // default (empty or "mm"/"MM") → mm as-is
      out.push(Math.round(mm * 100) / 100);
    }
    return out;
  };

  const parseAndCompute = (text, overrideType) => {
    setSizeText(text);
    set("size_description", text);
    const nums = parseNumbers(text);
    if (nums.length === 0) { setParseNote(""); return; }

    // Determine flags — allow override for smartParse flow where material_type just set (state not updated yet)
    const effMt = (overrideType || f.material_type || "").toUpperCase();
    const _isPlate = effMt.includes("PLATE") || effMt.includes("SHEET");
    const _isPipe = effMt.includes("PIPE");
    const _isRound = effMt.includes("ROUND");
    const _isSquareBar = effMt.includes("SQUARE BAR");
    const _isSHS = effMt.includes("HOLLOW SQUARE") || effMt === "SHS";
    const _isRHS = effMt.includes("HOLLOW RECT") || effMt === "RHS";
    const _isAngle = effMt.includes("ANGLE") || effMt.includes("SIKU");
    const _isChannel = effMt.includes("CHANNEL") || effMt.includes("UNP") || effMt.includes("CNP");
    const _isHBeam = effMt.includes("H-BEAM") || effMt.includes("HBEAM") || effMt.includes("H BEAM") || effMt === "WF" || effMt === "IWF" || effMt.includes("WF") || effMt.includes("IWF");
    const _isStructural = _isHBeam || _isChannel;

    // Assign per material type
    if (_isPlate) {
      // Convention: L × W × T (largest × second × smallest) OR user's order
      // Take user's order but if only 2 nums, assume L×W and thickness must be typed
      if (nums.length >= 3) {
        // Sort descending so smallest = thickness
        const sorted = [...nums].sort((a, b) => b - a);
        set("length_mm", sorted[0]);
        set("width_mm", sorted[1]);
        set("thickness_mm", sorted[2]);
        setParseNote(`✓ Terbaca: L=${sorted[0]} W=${sorted[1]} T=${sorted[2]} mm`);
      } else if (nums.length === 2) {
        set("length_mm", nums[0]);
        set("width_mm", nums[1]);
        setParseNote(`⚠ Hanya 2 angka — L=${nums[0]} W=${nums[1]} — tebal wajib`);
      } else {
        set("thickness_mm", nums[0]);
        setParseNote(`⚠ Hanya 1 angka — dianggap tebal ${nums[0]}mm`);
      }
    } else if (_isPipe) {
      if (nums.length >= 3) {
        // Assume order: OD, wall, length OR user typed OD × t × L
        // Heuristic: largest = length, smallest = wall, remaining = OD
        const sorted = [...nums].sort((a, b) => b - a);
        set("length_mm", sorted[0]);
        set("outer_diameter_mm", sorted[1]);
        set("wall_thickness_mm", sorted[2]);
        setParseNote(`✓ Terbaca: OD=${sorted[1]} wall=${sorted[2]} L=${sorted[0]} mm`);
      } else if (nums.length === 2) {
        set("outer_diameter_mm", nums[0]);
        set("wall_thickness_mm", nums[1]);
        setParseNote(`⚠ Hanya 2 angka — OD=${nums[0]} wall=${nums[1]} — panjang wajib`);
      }
    } else if (_isRound) {
      if (nums.length >= 2) {
        const sorted = [...nums].sort((a, b) => b - a);
        set("length_mm", sorted[0]);
        set("outer_diameter_mm", sorted[1]);
        setParseNote(`✓ Terbaca: Ø=${sorted[1]} L=${sorted[0]} mm`);
      } else {
        set("outer_diameter_mm", nums[0]);
        setParseNote(`⚠ Hanya 1 angka — dianggap Ø ${nums[0]}mm`);
      }
    } else if (_isSquareBar) {
      if (nums.length >= 2) {
        const sorted = [...nums].sort((a, b) => b - a);
        set("length_mm", sorted[0]);
        set("width_mm", sorted[1]);
        setParseNote(`✓ Terbaca: sisi=${sorted[1]} L=${sorted[0]} mm`);
      }
    } else if (_isStructural) {
      // H-Beam / Channel: H × B × tw × tf × L (5 numbers, panjang biasanya paling besar / ada suffix M)
      const L = nums.find((n) => n >= 1000) || (nums.length >= 5 ? Math.max(...nums) : 6000);
      const rest = nums.filter((n) => n !== L);
      const asc = [...rest].sort((a, b) => a - b);
      if (asc.length >= 4) {
        const [tw, tf, dimA, dimB] = asc;
        const H = Math.max(dimA, dimB);
        const B = Math.min(dimA, dimB);
        set("outer_diameter_mm", H);
        set("width_mm", B);
        set("wall_thickness_mm", tw);
        set("thickness_mm", tf);
        set("length_mm", L);
        setParseNote(`✓ ${_isHBeam ? "H-Beam" : "Channel"}: H=${H} B=${B} tw=${tw} tf=${tf} L=${L}mm`);
      } else if (asc.length === 3) {
        // Missing one — assume symmetric H=B
        const [tw, tf, dim] = asc;
        set("outer_diameter_mm", dim);
        set("width_mm", dim);
        set("wall_thickness_mm", tw);
        set("thickness_mm", tf);
        set("length_mm", L);
        setParseNote(`⚠ Asumsi H=B=${dim} · tw=${tw} tf=${tf} L=${L}mm`);
      } else {
        setParseNote(`⚠ H-Beam/Channel butuh 5 angka: H × B × tw × tf × L`);
      }
    } else if (_isAngle) {
      const L = nums.find((n) => n >= 1000) || (nums.length >= 4 ? Math.max(...nums) : 6000);
      const rest = nums.filter((n) => n !== L);
      const asc = [...rest].sort((a, b) => a - b);
      if (asc.length >= 3) {
        const [t, leg1, leg2] = asc;
        const leg = Math.max(leg1, leg2);
        set("width_mm", leg);
        set("thickness_mm", t);
        set("length_mm", L);
        setParseNote(`✓ Angle L: leg=${leg} t=${t} L=${L}mm`);
      } else if (asc.length === 2) {
        const [t, leg] = asc;
        set("width_mm", leg);
        set("thickness_mm", t);
        set("length_mm", L);
        setParseNote(`✓ Angle L: leg=${leg} t=${t} L=${L}mm (asumsi equal-leg)`);
      } else {
        setParseNote(`⚠ Angle butuh minimal 3 angka: leg × t × L`);
      }
    } else if (_isSHS) {
      const L = nums.find((n) => n >= 1000) || (nums.length >= 4 ? Math.max(...nums) : 6000);
      const rest = nums.filter((n) => n !== L);
      const asc = [...rest].sort((a, b) => a - b);
      if (asc.length >= 3) {
        const [wall, s1, s2] = asc;
        const side = Math.max(s1, s2);
        set("width_mm", side);
        set("wall_thickness_mm", wall);
        set("length_mm", L);
        setParseNote(`✓ SHS: side=${side} wall=${wall} L=${L}mm`);
      } else if (asc.length === 2) {
        const [wall, side] = asc;
        set("width_mm", side);
        set("wall_thickness_mm", wall);
        set("length_mm", L);
        setParseNote(`✓ SHS: side=${side} wall=${wall} L=${L}mm`);
      } else {
        setParseNote(`⚠ SHS butuh: side × wall × L`);
      }
    } else if (_isRHS) {
      const L = nums.find((n) => n >= 1000) || (nums.length >= 4 ? Math.max(...nums) : 6000);
      const rest = nums.filter((n) => n !== L);
      const asc = [...rest].sort((a, b) => a - b);
      if (asc.length >= 3) {
        const [wall, dimA, dimB] = asc;
        const w = Math.max(dimA, dimB);
        const h = Math.min(dimA, dimB);
        set("width_mm", w);
        set("thickness_mm", h); // reuse thickness_mm as height for RHS
        set("wall_thickness_mm", wall);
        set("length_mm", L);
        setParseNote(`✓ RHS: ${w}×${h} wall=${wall} L=${L}mm`);
      } else {
        setParseNote(`⚠ RHS butuh: w × h × wall × L`);
      }
    } else {
      setParseNote(`ℹ Angka terbaca: ${nums.join(" · ")}`);
    }
  };

  const onSizeKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); parseAndCompute(sizeText); }
  };

  useEffect(() => { setSizeText(f.size_description || ""); }, [f.size_description]);

  const saveNewGrade = async () => {
    const g = (newGrade.grade || "").trim().toUpperCase();
    const d = Number(newGrade.density_g_cm3);
    if (!g || !d || d <= 0) { toast.error("Grade & density wajib"); return; }
    try {
      await api.post("/material-costing/density-table", { grade: g, density_g_cm3: d });
      toast.success(`Grade ${g} tersimpan (density ${d})`);
      setShowAddGrade(false);
      setNewGrade({ grade: "", density_g_cm3: 7.85 });
      await loadGrades();
      set("grade", g);
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan grade"); }
  };

  // Helper hint text for size input placeholder per material type
  const sizeHint = isPlate ? `mis. 4' x 8' x 5mm  atau  1220x2440x5 (LxWxT — Enter untuk auto-hitung)`
    : isPipe ? `mis. OD 60.3 x 3.2 x 6M  (OD × wall × Length)`
    : isRound ? `mis. Dia. 16mm x 6M  (diameter × panjang)`
    : isSquareBar ? `mis. 50 x 6M  (sisi × Length)`
    : isSHS ? `mis. 100 x 100 x 4.5mm x 6M  (side × side × wall × L)`
    : isRHS ? `mis. 100 x 50 x 3mm x 6M  (w × h × wall × L)`
    : isAngle ? `mis. 65 x 65 x 6 x 6M  (leg × leg × t × L)`
    : isChannel ? `mis. 200 x 80 x 7.5 x 11 x 6M  (H × B × tw × tf × L)`
    : isHBeam ? `mis. 125 x 125 x 6.5 x 9mm x 6M  (H × B × tw × tf × L)`
    : `mis. 100 x 50 x 6M`;

  // Smart Parse — tinggal paste seluruh deskripsi material dari Excel/PO
  const smartParse = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return;
    // Split by pipe kalau ada, else deteksi grade di awal
    let gradePart = "", descPart = s;
    if (s.includes("|")) {
      const idx = s.indexOf("|");
      gradePart = s.slice(0, idx).trim();
      descPart = s.slice(idx + 1).trim();
    } else {
      // Try to detect grade at start (ASTM Axx, S275JR, API5L, SS400, etc.)
      const gm = s.match(/^((?:ASTM|API|AISI|JIS|DIN|EN)?\s*[A-Z][A-Z0-9]+(?:\s+Gr\.?\s*[A-Z0-9.]+)?)/i);
      if (gm) {
        gradePart = gm[1].trim();
        descPart = s.slice(gm[0].length).trim();
        // Remove trailing separator (space, dash)
        descPart = descPart.replace(/^[\s\-–|:]+/, "");
      }
    }
    // Detect jenis via keyword patterns
    const jenisPatterns = [
      { re: /\bh[\s\-]?beam\b/i, type: "H-Beam" },
      { re: /\biwf\b/i, type: "IWF" },
      { re: /\bwf\b/i, type: "WF" },
      { re: /\bangle\s*l?\b/i, type: "Angle L" },
      { re: /\bsiku\b/i, type: "Angle L" },
      { re: /\bshs\b/i, type: "Hollow Square" },
      { re: /\bhollow\s+square\b/i, type: "Hollow Square" },
      { re: /\brhs\b/i, type: "Hollow Rect" },
      { re: /\bhollow\s+rect(?:angular)?\b/i, type: "Hollow Rect" },
      { re: /\bchannel\b/i, type: "Channel U" },
      { re: /\bunp\b/i, type: "Channel U" },
      { re: /\bcnp\b/i, type: "Channel U" },
      { re: /\bseamless\s+pipe\b/i, type: "Pipe" },
      { re: /\bpipe\b/i, type: "Pipe" },
      { re: /\bplate\s+strip\b/i, type: "Plate" },
      { re: /\b(?:ms\s+)?plate\b/i, type: "Plate" },
      { re: /\bsheet\b/i, type: "Sheet" },
      { re: /\bround\s*bar\b/i, type: "Round Bar" },
      { re: /\bround\b/i, type: "Round Bar" },
      { re: /\bsquare\s*bar\b/i, type: "Square Bar" },
      { re: /\bwire\s*mesh\b/i, type: "Wire Mesh" },
      { re: /\bwiremesh\b/i, type: "Wire Mesh" },
    ];
    let jenis = "";
    for (const p of jenisPatterns) {
      if (p.re.test(descPart)) { jenis = p.type; break; }
    }

    // Detect Pipe SCH pattern (e.g., 2" Sch 40, 10" S80)
    const pipeSchMatch = descPart.match(/(\d+(?:[-/]\d+)?)\s*"\s*(?:SCH|Sch|sch|S)\s*(\d+[A-Za-z]*)/);

    // Set grade + jenis
    if (gradePart) set("grade", gradePart.toUpperCase());
    if (jenis) set("material_type", jenis);

    // For dimension parsing, strip the jenis keyword to leave only numbers
    let dimText = descPart;
    for (const p of jenisPatterns) dimText = dimText.replace(p.re, " ");
    // Remove common suffixes like "Lg", "Thk"
    dimText = dimText.replace(/\b(Lg|LG|Thk|THK|Long|Length|Mtr|Meter|Meters)\b/gi, " ").trim();

    // Also update size description field (visible to user)
    set("size_description", descPart);
    setSizeText(descPart);

    // Pipe with SCH — use lookup
    if (jenis === "Pipe" && pipeSchMatch) {
      const nps = pipeSchMatch[1];
      const sch = pipeSchMatch[2].toUpperCase();
      // Extract length after "x N M" or "N Mtr" etc.
      const lenM = (descPart.match(/x\s*(\d+(?:\.\d+)?)\s*(?:M\b|Mtr|Meter)/i) || [])[1];
      const lengthMm = lenM ? parseFloat(lenM) * 1000 : 6000;
      const res = lookupPipeSchedule(nps, sch);
      if (res) {
        set("outer_diameter_mm", res.od_mm);
        set("wall_thickness_mm", res.wall_mm);
        set("length_mm", lengthMm);
        setParseNote(`✓ Smart: ${gradePart} · Pipe ${nps}" SCH ${sch} · OD ${res.od_mm} wall ${res.wall_mm} · L ${lengthMm/1000}m · Berat/m ≈ ${res.weight_per_meter_kg.toFixed(3)} kg/m`);
        return;
      }
    }

    // Delegate dimension parsing — pass jenis sebagai override supaya tidak nunggu state update
    parseAndCompute(dimText, jenis);
    if (gradePart && jenis) {
      setParseNote((prev) => (prev.startsWith("✓") ? `✓ Smart: ${gradePart} · ${jenis} · ${prev.slice(2)}` : `✓ Smart: ${gradePart} · ${jenis}${prev ? " — " + prev : ""}`));
    }
  };

  return (
    <>
      {/* SMART PASTE — auto-detect Grade + Jenis + Dimensi dari 1 baris (compact) */}
      <SmartPasteBox onParse={smartParse} />

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Jenis Material *">
          <select className={inputCls} value={f.material_type} onChange={(e) => set("material_type", e.target.value)} data-testid="mf-type">
            {MATERIAL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Grade Material * (ketik untuk cari — spasi/case bebas)">
          <div className="flex gap-1">
            <div className="flex-1 relative">
              <GradeCombobox value={f.grade} onChange={(v) => set("grade", v)} options={gradeOpts} />
            </div>
            <button
              type="button"
              onClick={() => setShowAddGrade((v) => !v)}
              className="px-2 h-9 border border-slate-300 text-xs text-sky-700 hover:bg-sky-50"
              title="Tambah grade baru ke density table"
              data-testid="mf-add-grade-btn"
            >
              + Grade
            </button>
          </div>
          {f.grade && !showAddGrade && (() => {
            const rec = gradeOpts.find((g) => g.grade === (f.grade || "").toUpperCase());
            if (rec) return <div className="text-[10px] text-emerald-700 mt-1">✓ Density {rec.density_g_cm3} g/cm³ {rec.source === "override" ? "(custom)" : "(default)"}</div>;
            return <div className="text-[10px] text-amber-700 mt-1">⚠ Grade belum ada — akan pakai default 7.85. Klik "+ Grade".</div>;
          })()}
          {showAddGrade && (
            <div className="mt-2 p-2 border border-sky-300 bg-sky-50 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-sky-700">Tambah Grade Baru ke Density Table</div>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Grade (mis. TITANIUM GR5)" value={newGrade.grade} onChange={(e) => setNewGrade((p) => ({ ...p, grade: e.target.value }))} data-testid="mf-new-grade-name" />
                <input type="number" step="any" className={inputCls} placeholder="Density g/cm³" value={newGrade.density_g_cm3} onChange={(e) => setNewGrade((p) => ({ ...p, density_g_cm3: parseFloat(e.target.value) || 0 }))} data-testid="mf-new-grade-density" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowAddGrade(false)} className="px-2 h-7 text-xs border border-slate-300">Batal</button>
                <button type="button" onClick={saveNewGrade} className="px-2 h-7 text-xs bg-sky-700 text-white hover:bg-sky-800" data-testid="mf-new-grade-save">Simpan Grade</button>
              </div>
            </div>
          )}
        </FormField>
      </div>

      {/* PIPE SCHEDULE SELECTOR — ASME B36.10M / B36.19M */}
      {isPipe && (
        <PipeScheduleSelector
          onApply={(res) => {
            set("outer_diameter_mm", res.od_mm);
            set("wall_thickness_mm", res.wall_mm);
            // Update size_description if length known, otherwise show OD × wall × ? m
            const L = f.length_mm || 6000;
            const newDesc = `${res.nps} SCH ${res.sch} (OD ${res.od_mm}mm × wall ${res.wall_mm}mm) x ${L/1000}M`;
            set("size_description", newDesc);
            setSizeText(newDesc);
            set("length_mm", L);
            setParseNote(`✓ Applied ASME B36.10M: OD=${res.od_mm} wall=${res.wall_mm} · Berat/meter ≈ ${res.weight_per_meter_kg.toFixed(3)} kg/m`);
          }}
        />
      )}

      {/* PRIMARY: Ukuran Deskripsi — parse angka → auto hitung berat */}
      <div className="border-2 border-sky-500 bg-sky-50/60 p-3">
        <FormField label="Ukuran (Deskripsi) * — ketik lalu tekan Enter untuk auto-hitung berat">
          <div className="flex gap-2 items-center">
            <Input
              className={`${inputCls} font-mono flex-1`}
              value={sizeText}
              onChange={(e) => setSizeText(e.target.value)}
              onBlur={() => parseAndCompute(sizeText)}
              onKeyDown={onSizeKeyDown}
              placeholder={sizeHint}
              data-testid="mf-size"
            />
            <button
              type="button"
              onClick={() => parseAndCompute(sizeText)}
              className="px-3 h-9 bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold"
              data-testid="mf-size-parse"
            >
              ⏎ Hitung
            </button>
          </div>
          {parseNote && (
            <div className={`text-[11px] mt-1 ${parseNote.startsWith("✓") ? "text-emerald-700" : parseNote.startsWith("⚠") ? "text-amber-700" : "text-slate-600"}`}>
              {parseNote}
            </div>
          )}
          <div className="text-[10px] text-slate-500 mt-1">
            Pemisah bebas: <code>x</code>, <code>×</code>, <code>*</code>, spasi. Mendukung akhiran <code>mm</code>.
          </div>
        </FormField>

        {/* Live result box */}
        <div className="mt-2 grid grid-cols-4 gap-3 border-t border-sky-200 pt-2">
          <div><div className="text-[10px] text-slate-500 uppercase">Density</div><div className="text-sm tabular-nums text-slate-700">{preview.density} g/cm³</div></div>
          <div><div className="text-[10px] text-slate-500 uppercase">Berat Auto</div><div className="text-sm font-bold tabular-nums text-emerald-700">{preview.weight_kg > 0 ? `${preview.weight_kg.toFixed(3)} Kg` : "—"}</div></div>
          <div className="col-span-2"><div className="text-[10px] text-slate-500 uppercase">Dimensi Terbaca (bisa edit manual di bawah)</div>
            <div className="text-xs text-slate-700 font-mono">
              {isPlate && `L ${f.length_mm || 0} · W ${f.width_mm || 0} · T ${f.thickness_mm || 0} mm`}
              {isPipe && `OD ${f.outer_diameter_mm || 0} · t ${f.wall_thickness_mm || 0} · L ${f.length_mm || 0} mm`}
              {isRound && !isPipe && `Ø ${f.outer_diameter_mm || 0} · L ${f.length_mm || 0} mm`}
              {isSquareBar && `${f.width_mm || 0} × ${f.width_mm || 0} · L ${f.length_mm || 0} mm`}
              {isSHS && `SHS ${f.width_mm || 0} × wall ${f.wall_thickness_mm || 0} · L ${f.length_mm || 0} mm`}
              {isRHS && `RHS ${f.width_mm || 0}×${f.thickness_mm || 0} × wall ${f.wall_thickness_mm || 0} · L ${f.length_mm || 0} mm`}
              {isAngle && `L ${f.width_mm || 0} × t ${f.thickness_mm || 0} · L ${f.length_mm || 0} mm`}
              {(isHBeam || isChannel) && `${isHBeam ? "H" : "Ch"} ${f.outer_diameter_mm || 0}×${f.width_mm || 0} · tw ${f.wall_thickness_mm || 0} · tf ${f.thickness_mm || 0} · L ${f.length_mm || 0} mm`}
            </div>
          </div>
        </div>
      </div>

      {/* SECONDARY: Manual dim override (collapsible) */}
      {(isPlate || isRound || isPipe || isSquareBar || isSHS || isRHS || isAngle || isHBeam || isChannel) && (
        <details className="border border-slate-200 p-2 text-xs">
          <summary className="cursor-pointer text-slate-600 font-semibold">▸ Edit dimensi manual (opsional — override hasil parse)</summary>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {isPlate && <>
              <FormField label="Panjang (mm)"><Input type="number" step="any" className={inputCls} value={f.length_mm || ""} onChange={(e) => set("length_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Lebar (mm)"><Input type="number" step="any" className={inputCls} value={f.width_mm || ""} onChange={(e) => set("width_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Tebal (mm)"><Input type="number" step="any" className={inputCls} value={f.thickness_mm || ""} onChange={(e) => set("thickness_mm", parseFloat(e.target.value) || 0)} /></FormField>
            </>}
            {isPipe && <>
              <FormField label="OD (mm)"><Input type="number" step="any" className={inputCls} value={f.outer_diameter_mm || ""} onChange={(e) => set("outer_diameter_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Wall (mm)"><Input type="number" step="any" className={inputCls} value={f.wall_thickness_mm || ""} onChange={(e) => set("wall_thickness_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Panjang (mm)"><Input type="number" step="any" className={inputCls} value={f.length_mm || ""} onChange={(e) => set("length_mm", parseFloat(e.target.value) || 0)} /></FormField>
            </>}
            {isRound && !isPipe && <>
              <FormField label="Diameter (mm)"><Input type="number" step="any" className={inputCls} value={f.outer_diameter_mm || ""} onChange={(e) => set("outer_diameter_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Panjang (mm)"><Input type="number" step="any" className={inputCls} value={f.length_mm || ""} onChange={(e) => set("length_mm", parseFloat(e.target.value) || 0)} /></FormField>
            </>}
            {isSquareBar && <>
              <FormField label="Sisi (mm)"><Input type="number" step="any" className={inputCls} value={f.width_mm || ""} onChange={(e) => set("width_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Panjang (mm)"><Input type="number" step="any" className={inputCls} value={f.length_mm || ""} onChange={(e) => set("length_mm", parseFloat(e.target.value) || 0)} /></FormField>
            </>}
            {(isSHS || isRHS) && <>
              <FormField label={isSHS ? "Sisi (mm)" : "Width (mm)"}><Input type="number" step="any" className={inputCls} value={f.width_mm || ""} onChange={(e) => set("width_mm", parseFloat(e.target.value) || 0)} /></FormField>
              {isRHS && <FormField label="Height (mm)"><Input type="number" step="any" className={inputCls} value={f.thickness_mm || ""} onChange={(e) => set("thickness_mm", parseFloat(e.target.value) || 0)} /></FormField>}
              <FormField label="Wall (mm)"><Input type="number" step="any" className={inputCls} value={f.wall_thickness_mm || ""} onChange={(e) => set("wall_thickness_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Panjang (mm)"><Input type="number" step="any" className={inputCls} value={f.length_mm || ""} onChange={(e) => set("length_mm", parseFloat(e.target.value) || 0)} /></FormField>
            </>}
            {isAngle && <>
              <FormField label="Leg (mm)"><Input type="number" step="any" className={inputCls} value={f.width_mm || ""} onChange={(e) => set("width_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Tebal t (mm)"><Input type="number" step="any" className={inputCls} value={f.thickness_mm || ""} onChange={(e) => set("thickness_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Panjang (mm)"><Input type="number" step="any" className={inputCls} value={f.length_mm || ""} onChange={(e) => set("length_mm", parseFloat(e.target.value) || 0)} /></FormField>
            </>}
            {(isHBeam || isChannel) && <>
              <FormField label="H — Height (mm)"><Input type="number" step="any" className={inputCls} value={f.outer_diameter_mm || ""} onChange={(e) => set("outer_diameter_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="B — Flange Width (mm)"><Input type="number" step="any" className={inputCls} value={f.width_mm || ""} onChange={(e) => set("width_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="tw — Web Thk (mm)"><Input type="number" step="any" className={inputCls} value={f.wall_thickness_mm || ""} onChange={(e) => set("wall_thickness_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="tf — Flange Thk (mm)"><Input type="number" step="any" className={inputCls} value={f.thickness_mm || ""} onChange={(e) => set("thickness_mm", parseFloat(e.target.value) || 0)} /></FormField>
              <FormField label="Panjang (mm)"><Input type="number" step="any" className={inputCls} value={f.length_mm || ""} onChange={(e) => set("length_mm", parseFloat(e.target.value) || 0)} /></FormField>
            </>}
          </div>
        </details>
      )}

      <div className="grid grid-cols-3 gap-3">
        <FormField label="Berat (Kg) — override manual">
          <Input type="number" step="any" className={inputCls} value={f.weight_kg || ""} onChange={(e) => set("weight_kg", parseFloat(e.target.value) || 0)} placeholder={preview.weight_kg > 0 ? preview.weight_kg.toFixed(3) : "auto"} data-testid="mf-weight" />
        </FormField>
        <FormField label="Harga UTUH *">
          <PriceInput className={inputCls} value={f.price_per_unit} onChange={(v) => set("price_per_unit", v)} testid="mf-price" placeholder="mis. 1.500.000" />
        </FormField>
        <FormField label="Unit">
          <select className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)}>
            <option value="sheet">Sheet / Lembar</option>
            <option value="bar">Bar / Batang</option>
            <option value="piece">Piece</option>
            <option value="roll">Roll</option>
            <option value="meter">Meter</option>
          </select>
        </FormField>
      </div>
    </>
  );
}


function StandardPartFields({ f, set }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Jenis Part *">
          <select className={inputCls} value={f.material_type} onChange={(e) => set("material_type", e.target.value)} data-testid="mf-type">
            {STDPART_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Kode Katalog">
          <Input className={inputCls} value={f.catalog_code || ""} onChange={(e) => set("catalog_code", e.target.value)} placeholder="mis. BLT-M12-40-SS304" data-testid="mf-catalog" />
        </FormField>
        <FormField label="Nama Item *">
          <Input className={inputCls} value={f.grade} onChange={(e) => set("grade", e.target.value)} placeholder="mis. Hex Bolt M12 × 40 SS304" data-testid="mf-grade" />
        </FormField>
        <FormField label="Brand / Merk">
          <Input className={inputCls} value={f.brand || ""} onChange={(e) => set("brand", e.target.value)} placeholder="mis. Unbrako, HILTI" data-testid="mf-brand" />
        </FormField>
        <FormField label="Spec / Size" full>
          <Input className={inputCls} value={f.size_description} onChange={(e) => set("size_description", e.target.value)} placeholder="mis. M12 × 40mm, DIN933, SS304" data-testid="mf-size" />
        </FormField>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <FormField label="Harga Utuh *">
          <PriceInput className={inputCls} value={f.price_per_unit} onChange={(v) => set("price_per_unit", v)} testid="mf-price" placeholder="mis. 1.500.000" />
        </FormField>
        <FormField label="Unit">
          <select className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)}>
            <option value="pcs">Pcs</option>
            <option value="set">Set</option>
            <option value="lot">Lot</option>
            <option value="box">Box</option>
            <option value="pack">Pack</option>
          </select>
        </FormField>
        <FormField label="MOQ (Min Order Qty)">
          <Input type="number" step="any" className={inputCls} value={f.moq || ""} onChange={(e) => set("moq", parseFloat(e.target.value) || null)} placeholder="mis. 100" data-testid="mf-moq" />
        </FormField>
      </div>
    </>
  );
}

function ConsumableFields({ f, set }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Jenis Consumable *">
          <select className={inputCls} value={f.material_type} onChange={(e) => set("material_type", e.target.value)} data-testid="mf-type">
            {CONSUMABLE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Brand / Merk">
          <Input className={inputCls} value={f.brand || ""} onChange={(e) => set("brand", e.target.value)} placeholder="mis. Nippon, Jotun, Kobe" data-testid="mf-brand" />
        </FormField>
        <FormField label="Nama Item *">
          <Input className={inputCls} value={f.grade} onChange={(e) => set("grade", e.target.value)} placeholder="mis. Epoxy Primer Grey" data-testid="mf-grade" />
        </FormField>
        <FormField label="Pack Size">
          <Input className={inputCls} value={f.pack_size || ""} onChange={(e) => set("pack_size", e.target.value)} placeholder="mis. 5 Ltr, 20 Kg, 200 pcs/box" data-testid="mf-pack" />
        </FormField>
        <FormField label="Spec Tambahan" full>
          <Input className={inputCls} value={f.size_description} onChange={(e) => set("size_description", e.target.value)} placeholder="mis. Warna abu, ratio mix 4:1" data-testid="mf-size" />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Harga per Unit *">
          <PriceInput className={inputCls} value={f.price_per_unit} onChange={(v) => set("price_per_unit", v)} testid="mf-price" placeholder="mis. 1.500.000" />
        </FormField>
        <FormField label="Unit">
          <select className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)}>
            <option value="kaleng">Kaleng</option>
            <option value="box">Box</option>
            <option value="pack">Pack</option>
            <option value="roll">Roll</option>
            <option value="kg">Kg</option>
            <option value="liter">Liter</option>
            <option value="sak">Sak</option>
            <option value="pcs">Pcs</option>
          </select>
        </FormField>
      </div>
    </>
  );
}

function SubconFields({ f, set }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Jenis Layanan *">
          <select className={inputCls} value={f.material_type} onChange={(e) => set("material_type", e.target.value)} data-testid="mf-type">
            {SUBCON_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Nama Layanan / Deskripsi *">
          <Input className={inputCls} value={f.service_name || ""} onChange={(e) => set("service_name", e.target.value)} placeholder="mis. Sandblast SA 2.5" data-testid="mf-service" />
        </FormField>
        <FormField label="Detail / Scope" full>
          <Input className={inputCls} value={f.size_description} onChange={(e) => set("size_description", e.target.value)} placeholder="mis. Steel struktur besar, luas ± 20 m²" data-testid="mf-size" />
        </FormField>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormField label="Unit Rate">
          <select className={inputCls} value={f.rate_unit || "per_item"} onChange={(e) => set("rate_unit", e.target.value)} data-testid="mf-rate-unit">
            <option value="per_item">Per Item</option>
            <option value="lumpsum">Lumpsum</option>
            <option value="m2">Per m²</option>
            <option value="jam">Per Jam</option>
            <option value="kg">Per Kg</option>
            <option value="meter">Per Meter</option>
          </select>
        </FormField>
        <FormField label="Harga *">
          <PriceInput className={inputCls} value={f.price_per_unit} onChange={(v) => set("price_per_unit", v)} testid="mf-price" placeholder="mis. 1.500.000" />
        </FormField>
        <FormField label="Unit (Label)">
          <Input className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="item / lot / m² / jam" />
        </FormField>
      </div>
    </>
  );
}

function FormField({ label, children, full }) {
  return (
    <label className={`block ${full ? "col-span-full" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

/* ============ GRADE COMBOBOX (fuzzy autocomplete) ============ */

function GradeCombobox({ value, onChange, options }) {
  const [q, setQ] = React.useState(value || "");
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const wrapRef = React.useRef(null);

  React.useEffect(() => { setQ(value || ""); }, [value]);

  React.useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Normalize: uppercase + strip non-alphanumeric
  const norm = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const qn = norm(q);

  const filtered = React.useMemo(() => {
    if (!qn) return options.slice(0, 60);
    // Rank: startsWith normalized > contains > fallback
    const scored = options
      .map((o) => {
        const gn = norm(o.grade);
        let score = -1;
        if (gn.startsWith(qn)) score = 100 - gn.length;
        else if (gn.includes(qn)) score = 50 - gn.length;
        // Also match density value if user types number > 100 (kg/m³) — skip
        return { o, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((x) => x.o).slice(0, 60);
  }, [qn, options]);

  const pick = (opt) => {
    onChange(opt.grade);
    setQ(opt.grade);
    setOpen(false);
  };

  const onKey = (e) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setOpen(true); return; }
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((v) => Math.min(v + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((v) => Math.max(v - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[hi]) pick(filtered[hi]);
      else { onChange(q.toUpperCase()); setOpen(false); }
    } else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={inputCls}
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value.toUpperCase()); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Ketik grade — mis. a36, 4140, hardox500, aisi 1045..."
        data-testid="mf-grade"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 left-0 right-0 max-h-72 overflow-y-auto bg-white border border-slate-300 shadow-lg">
          {filtered.map((o, idx) => (
            <div
              key={o.grade}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setHi(idx)}
              className={`px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between ${idx === hi ? "bg-sky-100" : "hover:bg-slate-50"}`}
            >
              <span className="font-mono text-slate-900">{o.grade}</span>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {o.density_g_cm3} g/cm³{o.source === "override" && <span className="ml-1 text-sky-600">(custom)</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && q && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-slate-300 shadow-lg p-3 text-xs text-slate-500">
          Tidak ada grade cocok. Klik <b>"+ Grade"</b> untuk tambah baru, atau tekan Enter untuk pakai "{q.toUpperCase()}" (default density 7.85).
        </div>
      )}
    </div>
  );
}


/* ============ UPDATE PRICE DIALOG (quick) ============ */

function UpdatePriceDialog({ item, onClose, onSaved }) {
  const [newPrice, setNewPrice] = useState(item.price_per_unit || 0);
  const [newMarkup, setNewMarkup] = useState(item.markup_pct || 0);
  const [newSupplier, setNewSupplier] = useState(item.supplier_name || "");
  const [newCurrency, setNewCurrency] = useState(item.currency || "IDR");
  const [newRate, setNewRate] = useState(item.exchange_rate || 1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);

  // Auto-set default rate when currency changes (only if user hasn't customized)
  useEffect(() => {
    const def = (CURRENCIES.find((c) => c.code === newCurrency) || CURRENCIES[0]).default_rate;
    if (newCurrency === "IDR") setNewRate(1);
    else if (!newRate || newRate === 1) setNewRate(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newCurrency]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/material-costing/materials/${item.id}/price-history`);
        setHistory(data.history || []);
      } catch { /* ignore */ }
      finally { setLoadingHist(false); }
    })();
  }, [item.id]);

  const save = async () => {
    if (!(Number(newPrice) >= 0)) { toast.error("Harga tidak valid"); return; }
    setSaving(true);
    try {
      await api.post(`/material-costing/materials/${item.id}/update-price`, {
        price_per_unit: Number(newPrice),
        markup_pct: Number(newMarkup),
        supplier_name: newSupplier,
        currency: newCurrency,
        exchange_rate: Number(newRate) || 1,
        note,
      });
      toast.success("Harga tersimpan · tanggal update = hari ini");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  const label = item.service_name || item.catalog_code || `${item.grade} ${item.material_type || ""}`.trim();
  const diffPct = item.price_per_unit > 0 ? ((Number(newPrice) - Number(item.price_per_unit)) / Number(item.price_per_unit)) * 100 : 0;
  const previewIdr = Number(newPrice || 0) * Number(newRate || 1);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-emerald-700 font-bold">Rp</span> Update Harga — {label}
          </DialogTitle>
          <DialogDescription>{item.size_description || "-"}</DialogDescription>
        </DialogHeader>

        {/* Current price panel */}
        <div className="border border-slate-200 p-3 bg-slate-50 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Harga Sekarang</div>
            <div className="font-bold text-slate-900 tabular-nums">{fmtMoney(item.price_per_unit, item.currency)}<span className="text-[10px] text-slate-400"> /{item.unit}</span></div>
            {(item.currency && item.currency !== "IDR") && (<div className="text-[10px] text-slate-500">≈ {fmtRp(item.price_per_unit_idr)} @ kurs {Number(item.exchange_rate || 1).toLocaleString("id-ID")}</div>)}
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Markup</div>
            <div className="font-bold text-amber-700 tabular-nums">{item.markup_pct || 0}%</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Update Terakhir</div>
            <PriceDateBadge dateStr={item.price_last_updated || item.updated_at} />
          </div>
        </div>

        {/* New price form */}
        <div className="border-2 border-emerald-500 bg-emerald-50 p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Harga Baru — Tanggal Update Akan Otomatis Hari Ini</div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Harga Baru *">
              <div className="flex gap-1">
                <select className={`${inputCls} w-20`} value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)} data-testid="up-currency">
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
                <Input type="number" step="any" className={`${inputCls} flex-1`} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} autoFocus data-testid="up-price" />
              </div>
              {Number(newPrice) !== Number(item.price_per_unit) && (
                <div className={`text-[11px] mt-1 tabular-nums ${diffPct > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {diffPct > 0 ? "▲" : "▼"} {Math.abs(diffPct).toFixed(1)}% dari harga lama ({fmtMoney(item.price_per_unit, item.currency)})
                </div>
              )}
            </FormField>
            <FormField label={newCurrency === "IDR" ? "Markup % (opsional)" : `Kurs → IDR (mis. 1 ${newCurrency} = ...)`}>
              {newCurrency === "IDR" ? (
                <Input type="number" step="any" className={inputCls} value={newMarkup} onChange={(e) => setNewMarkup(e.target.value)} data-testid="up-markup" />
              ) : (
                <>
                  <Input type="number" step="any" className={inputCls} value={newRate} onChange={(e) => setNewRate(e.target.value)} data-testid="up-rate" placeholder="mis. 16000" />
                  <div className="text-[10px] text-slate-500 mt-1 tabular-nums">≈ {fmtRp(previewIdr)} <span className="text-slate-400">(preview)</span></div>
                </>
              )}
            </FormField>
            {newCurrency !== "IDR" && (
              <FormField label="Markup % (opsional)">
                <Input type="number" step="any" className={inputCls} value={newMarkup} onChange={(e) => setNewMarkup(e.target.value)} data-testid="up-markup" />
              </FormField>
            )}
            <FormField label="Supplier" full={newCurrency === "IDR"}>
              <Input className={inputCls} value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="mis. PT ABC Steel" data-testid="up-supplier" />
            </FormField>
            <FormField label="Catatan (opsional)" full>
              <Input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Kenaikan harga bulanan / diskon promo" data-testid="up-note" />
            </FormField>
          </div>
        </div>

        {/* Price history */}
        <div className="border border-slate-200 mt-2">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-[0.15em] font-bold text-slate-600 flex items-center justify-between">
            <span>Riwayat Perubahan Harga</span>
            <span className="text-slate-400 normal-case tracking-normal">{history.length} entri</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-white border-b border-slate-200 sticky top-0">
                <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  <th className="text-left p-2">Tanggal</th>
                  <th className="text-left p-2">Oleh</th>
                  <th className="text-right p-2">Harga Lama</th>
                  <th className="text-right p-2">Harga Baru</th>
                  <th className="text-center p-2">Markup</th>
                  <th className="text-left p-2">Supplier</th>
                  <th className="text-left p-2">Catatan</th>
                </tr>
              </thead>
              <tbody data-testid="up-history">
                {loadingHist && (<tr><td colSpan={7} className="p-4 text-center text-slate-400">Memuat...</td></tr>)}
                {!loadingHist && history.length === 0 && (<tr><td colSpan={7} className="p-4 text-center text-slate-400">Belum ada riwayat.</td></tr>)}
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-2 whitespace-nowrap">{new Date(h.changed_at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="p-2">{h.changed_by || "-"}</td>
                    <td className="p-2 text-right tabular-nums text-slate-500">{h.price_per_unit_old != null ? fmtRp(h.price_per_unit_old) : "-"}</td>
                    <td className="p-2 text-right tabular-nums font-semibold text-slate-900">{fmtRp(h.price_per_unit)}</td>
                    <td className="p-2 text-center tabular-nums text-amber-700">{h.markup_pct || 0}%</td>
                    <td className="p-2">{h.supplier_name || "-"}</td>
                    <td className="p-2 text-slate-600">{h.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-none">Batal</Button>
          <Button type="button" onClick={save} disabled={saving} className="rounded-none bg-emerald-700 hover:bg-emerald-800 text-white" data-testid="up-save">
            {saving ? "Menyimpan..." : "Simpan Update Harga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ IMPORT EXCEL DIALOG ============ */

function ImportExcelDialog({ category, categoryLabel, onClose, onImported, downloadTemplate }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const upload = async () => {
    if (!file) { toast.error("Pilih file Excel dulu"); return; }
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("category", category);
      fd.append("file", file);
      const { data } = await api.post("/material-costing/materials/import/xlsx", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      if (data.errors && data.errors.length > 0) {
        toast.warning(`${data.created} entri berhasil · ${data.errors.length} baris error`);
      } else {
        toast.success(`${data.created} entri berhasil di-import`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal upload");
    } finally { setUploading(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadSimple size={18} weight="bold" /> Upload Excel — {categoryLabel}
          </DialogTitle>
          <DialogDescription>
            Pastikan format file sesuai template resmi sistem. Baris sample di template harus dihapus/di-overwrite sebelum upload.
          </DialogDescription>
        </DialogHeader>

        <div className="border-2 border-dashed border-sky-300 bg-sky-50 p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-sky-700">Langkah 1 — Download Template</div>
          <div className="text-xs text-slate-700">
            Klik tombol di bawah untuk download template Excel sesuai kategori <b>{categoryLabel}</b>.
            Header sudah disiapkan, kolom bertanda <b>*</b> wajib diisi. Sheet <b>REFERENSI</b> berisi daftar currency, unit, dan grade valid.
          </div>
          <Button variant="outline" onClick={downloadTemplate} className="rounded-none w-full" data-testid="im-download">
            <DownloadSimple size={14} weight="bold" className="mr-1" /> Download Template Excel
          </Button>
        </div>

        <div className="border-2 border-dashed border-emerald-300 bg-emerald-50 p-4 space-y-3 mt-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Langkah 2 — Upload File Terisi</div>
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }}
            className="block w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:border file:border-slate-300 file:bg-white file:text-emerald-700 file:font-semibold hover:file:bg-emerald-50"
            data-testid="im-file"
          />
          {file && (
            <div className="text-xs text-slate-700">
              📄 <b>{file.name}</b> · {(file.size / 1024).toFixed(1)} KB
            </div>
          )}
          <Button
            onClick={upload}
            disabled={!file || uploading}
            className="rounded-none w-full bg-emerald-700 hover:bg-emerald-800 text-white"
            data-testid="im-upload"
          >
            {uploading ? "Meng-upload..." : "Upload & Import"}
          </Button>
        </div>

        {result && (
          <div className={`border p-3 mt-2 ${result.errors?.length ? "border-amber-400 bg-amber-50" : "border-emerald-400 bg-emerald-50"}`} data-testid="im-result">
            <div className="text-sm font-bold text-slate-900 mb-1">
              ✓ {result.created} entri berhasil di-import
              {result.errors?.length > 0 && <span className="text-amber-700"> · ⚠ {result.errors.length} error</span>}
            </div>
            <div className="text-[11px] text-slate-600">Total baris di-scan: {result.total_rows_scanned}</div>
            {result.errors?.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-amber-700 font-semibold">Lihat detail error ({result.errors.length})</summary>
                <ul className="mt-1 text-xs text-slate-700 max-h-40 overflow-y-auto list-disc list-inside">
                  {result.errors.map((e, i) => (<li key={i}>Baris {e.row}: {e.reason}</li>))}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 mt-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-none">
            {result ? "Tutup" : "Batal"}
          </Button>
          {result && (
            <Button type="button" onClick={onImported} className="rounded-none bg-sky-700 hover:bg-sky-800 text-white">
              Lihat Daftar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

