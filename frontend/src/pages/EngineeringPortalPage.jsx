import React from "react";
import DeptPortal from "../components/DeptPortal";
import { Wrench, Package, CurrencyCircleDollar } from "@phosphor-icons/react";

const CARDS = [
  {
    key: "costing", label: "Costing (Inquiry Sales)", stats: "Request dari Sales",
    description: "Lihat permintaan costing dari Sales, accept, upload hasil kerja & drawing.",
    icon: Wrench, href: "/sales/inquiries",
    accent: "from-rose-500 via-red-500 to-orange-500", accentText: "text-rose-400",
  },
  {
    key: "bom", label: "Bill of Material (BOM)", stats: "Upload · Revisi · Search",
    description: "Upload BOM per SO, otomatis auto-revisi, search by SO/Customer/Project.",
    icon: Package, href: "/bom",
    accent: "from-amber-500 via-yellow-500 to-lime-500", accentText: "text-amber-400",
  },
  {
    key: "material-price", label: "Engineering Master List Material Price", stats: "Coming Soon",
    description: "Master list harga material per Engineering. Detail spesifikasi menyusul dari user.",
    icon: CurrencyCircleDollar, href: "#",
    accent: "from-sky-500 via-blue-500 to-indigo-500", accentText: "text-sky-400",
    comingSoon: true,
  },
];

export default function EngineeringPortalPage() {
  return <DeptPortal deptLabel="Engineering Department" deptTagline="Costing · BOM · Material Price" accentColor="amber" cards={CARDS} />;
}
