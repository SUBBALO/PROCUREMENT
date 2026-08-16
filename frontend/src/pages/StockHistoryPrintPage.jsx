import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { formatDateID } from "../lib/api";

/**
 * Print-friendly stock history ledger.
 * Opens in a NEW tab via /store/stock/history/print?item_name=X&unit=Y&hide_price=1
 * User can press Ctrl+P (or Ctrl+Alt+P) to print or save as PDF.
 */
export default function StockHistoryPrintPage() {
  const [params] = useSearchParams();
  const itemName = params.get("item_name") || "";
  const unit = params.get("unit") || "";
  const isCust = params.get("is_customer_material");
  const hidePrice = params.get("hide_price") === "1";
  const fromDate = params.get("from") || "";
  const toDate = params.get("to") || "";

  const [rows, setRows] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ company: "PT MITRA KARYA SARANA" });

  useEffect(() => {
    (async () => {
      try {
        const q = { item_name: itemName };
        if (isCust !== null && isCust !== undefined && isCust !== "") q.is_customer_material = isCust;
        const { data } = await api.get("/store/stock/history", { params: q });
        setRows(data.rows || []);
        setBalance(data.current_balance || 0);
        // Try to fetch company setting for header (fallback to default)
        try {
          const s = await api.get("/settings/company").catch(() => null);
          if (s?.data?.company_name) setMeta({ company: s.data.company_name });
        } catch (e) { console.warn("Company setting tidak tersedia, memakai default:", e?.message); }
      } catch (e) {
        console.error("Gagal memuat riwayat stok untuk print:", e?.response?.status || e?.message);
        // page still renders with empty state
      } finally { setLoading(false); }
    })();
  }, [itemName, isCust]);

  // Filter by date range + opening balance
  const from = fromDate || "0000-01-01";
  const to = toDate || "9999-12-31";
  let openingBalance = 0;
  const inRange = [];
  for (const r of rows) {
    const d = r.date || "";
    if (d < from) {
      if (r.kind === "IN" && r.added_to_stock) openingBalance += r.qty_in;
      else if (r.kind === "OUT") openingBalance -= r.qty_out;
    } else if (d <= to) {
      inRange.push(r);
    }
  }
  let running = openingBalance;
  const filteredRows = inRange.map((r) => {
    if (r.kind === "IN" && r.added_to_stock) running += r.qty_in;
    else if (r.kind === "OUT") running -= r.qty_out;
    return { ...r, balance: running };
  });
  const closingBalance = running;
  const totalIn = filteredRows.reduce((s, r) => s + (r.qty_in || 0), 0);
  const totalOut = filteredRows.reduce((s, r) => s + (r.qty_out || 0), 0);
  const totalValueIn = hidePrice ? 0 : filteredRows.reduce((s, r) => s + (r.qty_in || 0) * (r.unit_price || 0), 0);
  const totalValueOut = hidePrice ? 0 : filteredRows.reduce((s, r) => s + (r.qty_out || 0) * (r.unit_price || 0), 0);

  useEffect(() => {
    // Auto-open print dialog after data loads (delay to let render finish)
    if (!loading && filteredRows.length > 0) {
      const t = setTimeout(() => { try { window.print(); } catch (e) { console.warn("window.print gagal:", e?.message); } }, 400);
      return () => clearTimeout(t);
    }
  }, [loading, filteredRows.length]);

  return (
    <div className="min-h-screen bg-white text-slate-900" data-testid="stock-history-print">
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #64748b; padding: 4px 6px; }
        th { background: #f1f5f9; text-align: left; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; }
        td.num { text-align: right; font-variant-numeric: tabular-nums; }
        tr.in-row td { background: #f0fdf4; }
        tr.out-row td { background: #fef2f2; }
      `}</style>

      <div className="p-4 max-w-[1600px] mx-auto">
        <div className="no-print mb-3 flex items-center gap-2 justify-between">
          <div className="text-xs text-slate-500">Tekan <b>Ctrl+P</b> untuk print / save PDF. Dialog print akan muncul otomatis.</div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-sky-600 text-white text-xs uppercase tracking-[0.1em] font-bold hover:bg-sky-700"
              data-testid="print-btn"
            >Print</button>
            <button
              onClick={() => window.close()}
              className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs uppercase tracking-[0.1em] font-bold hover:bg-slate-300"
            >Tutup</button>
          </div>
        </div>

        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-2 mb-3">
          <div>
            <div className="text-lg font-bold" style={{ fontFamily: "Chivo, sans-serif" }}>{meta.company}</div>
            <div className="text-xs text-slate-600">Riwayat Stok / Item Ledger</div>
          </div>
          <div className="text-right text-xs text-slate-600">
            <div>Dicetak: {formatDateID(new Date().toISOString().slice(0, 10))}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
          <div>
            <b>Nama Barang:</b> <span className="font-mono">{itemName}</span>
            {(fromDate || toDate) && (
              <div>
                <b>Periode:</b> {fromDate ? formatDateID(fromDate) : "awal"} s/d {toDate ? formatDateID(toDate) : "hari ini"}
              </div>
            )}
          </div>
          <div className="text-right">
            <div><b>Total Rows:</b> {filteredRows.length}</div>
            <div><b>Opening Balance:</b> {openingBalance.toLocaleString("id-ID")} {unit}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Tanggal</th>
              <th style={{ width: 55 }}>Jenis</th>
              <th>Description / Vendor</th>
              <th>Invoice / Pengambil</th>
              <th style={{ width: 90 }}>SO No</th>
              <th style={{ width: 60 }} className="text-right">In</th>
              <th style={{ width: 60 }} className="text-right">Out</th>
              <th style={{ width: 75 }} className="text-right">Balance</th>
              {!hidePrice && <th style={{ width: 110 }} className="text-right">Total (Rp)</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={hidePrice ? 8 : 9} style={{ textAlign: "center", padding: 20 }}>Memuat…</td></tr>}
            {!loading && filteredRows.length === 0 && <tr><td colSpan={hidePrice ? 8 : 9} style={{ textAlign: "center", padding: 20 }}>Tidak ada transaksi dalam periode ini</td></tr>}
            {filteredRows.map((r, idx) => (
              <tr key={idx} className={r.kind === "IN" ? "in-row" : "out-row"}>
                <td>{r.date ? formatDateID(r.date) : "-"}</td>
                <td>{r.kind}{r.kind === "IN" && !r.added_to_stock ? " (LOG)" : ""}</td>
                <td>{r.description || "-"}</td>
                <td style={{ fontFamily: "monospace", fontSize: 10 }}>{r.ref || "-"}</td>
                <td>{r.so_no || "-"}</td>
                <td className="num">{r.qty_in > 0 ? r.qty_in.toLocaleString("id-ID") : "-"}</td>
                <td className="num">{r.qty_out > 0 ? r.qty_out.toLocaleString("id-ID") : "-"}</td>
                <td className="num" style={{ fontWeight: 700 }}>{r.balance.toLocaleString("id-ID")}</td>
                {!hidePrice && (
                  (() => {
                    const qty = r.qty_in > 0 ? r.qty_in : r.qty_out;
                    const total = qty * (r.unit_price || 0);
                    return <td className="num">{total > 0 ? `Rp ${Number(total).toLocaleString("id-ID")}` : "-"}</td>;
                  })()
                )}
              </tr>
            ))}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: "right", fontWeight: 700, background: "#f1f5f9" }}>TOTAL PERIODE</td>
                <td className="num" style={{ fontWeight: 700, background: "#f1f5f9" }}>{totalIn.toLocaleString("id-ID")}</td>
                <td className="num" style={{ fontWeight: 700, background: "#f1f5f9" }}>{totalOut.toLocaleString("id-ID")}</td>
                <td className="num" style={{ fontWeight: 700, background: "#f1f5f9" }}>{closingBalance.toLocaleString("id-ID")} {unit}</td>
                {!hidePrice && <td className="num" style={{ fontWeight: 700, background: "#f1f5f9" }}>Rp {(totalValueIn - totalValueOut).toLocaleString("id-ID")}</td>}
              </tr>
            </tfoot>
          )}
        </table>

        <div className="mt-4 text-[10px] text-slate-500">
          MKS Management System — {meta.company} — MKS-F-STK-001
        </div>
      </div>
    </div>
  );
}
