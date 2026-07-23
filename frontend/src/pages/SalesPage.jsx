import React from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/card";
import { Storefront, ArrowLeft, Clock } from "@phosphor-icons/react";

export default function SalesPage() {
  return (
    <div className="max-w-[1000px] mx-auto p-6 space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-slate-600 hover:text-slate-900" data-testid="sales-back-btn">
        <ArrowLeft size={12} weight="bold" /> Kembali ke Portal
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Storefront size={22} weight="duotone" className="text-rose-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo, sans-serif" }}>Departemen Sales</h1>
        </div>
        <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Costing Request · Quotation · Order Status</p>
      </div>

      <Card className="rounded-none border-slate-200 p-8 border-dashed">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 flex items-center justify-center bg-amber-50 border border-amber-200">
            <Clock size={22} weight="duotone" className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Departemen Sales — dalam pengembangan</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              Modul Sales sedang disiapkan. Berikut fitur yang akan hadir:
            </p>
            <ul className="text-sm text-slate-700 space-y-1.5 list-none">
              <li className="flex gap-2"><span className="text-rose-500">▸</span> <b>Permintaan Costing Harga</b> — kirim request ke Engineering</li>
              <li className="flex gap-2"><span className="text-rose-500">▸</span> Engineering pilih PIC & upload hasil costing + drawing</li>
              <li className="flex gap-2"><span className="text-rose-500">▸</span> Review Sales: <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5">Accept</span> atau <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5">Request Revisi</span> dengan notifikasi</li>
              <li className="flex gap-2"><span className="text-rose-500">▸</span> Generate <b>Quotation PDF</b> siap kirim ke customer</li>
              <li className="flex gap-2"><span className="text-rose-500">▸</span> Update status: <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5">on-bidding</span> · <span className="font-mono text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5">confirm-order</span> · <span className="font-mono text-xs bg-red-100 text-red-700 px-1.5 py-0.5">cancel</span></li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
