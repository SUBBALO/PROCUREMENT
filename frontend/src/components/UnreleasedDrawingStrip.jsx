import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { WarningCircle, CaretDown, CaretUp } from "@phosphor-icons/react";

/**
 * UnreleasedDrawingStrip — peringatan merah di portal Engineering:
 * SO yang SUDAH jalan di Produksi tapi drawing-nya BELUM release (stamp DocCon).
 */
export const UnreleasedDrawingStrip = () => {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.get("/engineering/so-unreleased-drawings")
      .then(({ data }) => { if (alive) setItems(data.items || []); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="border-2 border-rose-500 bg-rose-50" data-testid="unreleased-drawing-strip">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left" data-testid="unreleased-strip-toggle">
        <div className="flex items-center gap-2">
          <WarningCircle size={18} weight="fill" className="text-rose-600" />
          <span className="text-sm font-bold text-rose-800" style={{ fontFamily: "Chivo, sans-serif" }}>
            {items.length} SO sudah jalan produksi — Drawing BELUM Release
          </span>
        </div>
        {open ? <CaretUp size={14} weight="bold" className="text-rose-600" /> : <CaretDown size={14} weight="bold" className="text-rose-600" />}
      </button>
      {open && (
        <div className="px-4 pb-3">
          <table className="w-full text-xs bg-white border border-rose-200">
            <thead className="bg-rose-100/60 border-b border-rose-200">
              <tr>
                {["SO", "Customer", "Keterangan Drawing"].map((h) => (
                  <th key={h} className="p-2 text-left uppercase text-[10px] tracking-[0.08em] text-rose-700 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.so_no} className="border-b border-rose-100" data-testid={`unreleased-so-${u.so_no}`}>
                  <td className="p-2 font-mono text-[11px] font-bold text-slate-800">{u.so_no}</td>
                  <td className="p-2 text-slate-700">{u.customer || "-"}</td>
                  <td className="p-2 text-rose-700 font-semibold">{u.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-rose-600 mt-1">Segera proses approval &amp; stamp DocCon agar Produksi bekerja dengan drawing resmi.</div>
        </div>
      )}
    </div>
  );
};

export default UnreleasedDrawingStrip;
