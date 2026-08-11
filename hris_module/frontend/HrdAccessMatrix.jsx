// Editor hak akses granular ala Accurate (View/Create/Edit/Delete/Report per menu HRD).
// Dipakai di panel Admin saat membuat/mengubah user HRD.
// Props: value = object access {menu_key: {view,create,edit,delete,report}}, onChange(newAccess)
import React from "react";
import { Label } from "../components/ui/label";

export const HRD_MENUS_DEF = [
  { key: "hrd_karyawan", label: "Master Karyawan" },
  { key: "hrd_slip_gaji", label: "Slip Gaji" },
  { key: "hrd_email", label: "Kirim Email Slip" },
  { key: "hrd_settings", label: "Pengaturan Email" },
  { key: "hrd_dokumen", label: "Dokumen HRD" },
];
export const HRD_ACTIONS_DEF = [["view", "Lihat"], ["create", "Tambah"], ["edit", "Ubah"], ["delete", "Hapus"], ["report", "Cetak"]];

export function HrdAccessMatrix({ value, onChange }) {
  const acc = value || {};
  const toggle = (menu, action) => {
    const cur = { ...(acc[menu] || {}) };
    cur[action] = !cur[action];
    if (action !== "view" && cur[action]) cur.view = true;
    onChange({ ...acc, [menu]: cur });
  };
  const setRow = (menu, val) => onChange({ ...acc, [menu]: HRD_ACTIONS_DEF.reduce((o, [a]) => ({ ...o, [a]: val }), {}) });
  return (
    <div className="border-t border-slate-200 pt-3">
      <Label className="text-xs font-semibold text-slate-600 mb-2 block">Akses HRD (centang menu & aksi — seperti Accurate)</Label>
      <div className="overflow-x-auto border border-slate-200">
        <table className="w-full text-xs" data-testid="hrd-access-matrix">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-2 py-1.5 font-semibold">Menu</th>
              {HRD_ACTIONS_DEF.map(([a, lbl]) => <th key={a} className="px-2 py-1.5 font-semibold text-center">{lbl}</th>)}
              <th className="px-2 py-1.5 font-semibold text-center">Semua</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {HRD_MENUS_DEF.map((m) => {
              const row = acc[m.key] || {};
              const allOn = HRD_ACTIONS_DEF.every(([a]) => row[a]);
              return (
                <tr key={m.key}>
                  <td className="px-2 py-1.5 font-medium text-slate-700">{m.label}</td>
                  {HRD_ACTIONS_DEF.map(([a]) => (
                    <td key={a} className="px-2 py-1.5 text-center">
                      <input type="checkbox" className="w-4 h-4 accent-teal-600" checked={!!row[a]} onChange={() => toggle(m.key, a)} data-testid={`hrd-perm-${m.key}-${a}`} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" className="w-4 h-4 accent-slate-700" checked={allOn} onChange={(e) => setRow(m.key, e.target.checked)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-1">Contoh: Herliana → centang semua di baris gaji; Heri → hanya "Dokumen HRD".</p>
    </div>
  );
}
