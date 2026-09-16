import { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { Tray, Wrench, ClipboardText } from "@phosphor-icons/react";

const LEADER_ROLES = ["eng_head", "eng_leader", "engineering", "admin", "super_admin", "supervisor"];

/**
 * Tab grup Work Order Engineering.
 * - Tab "Job Saya" disembunyikan untuk Leader kecuali Leader benar-benar punya job pending.
 * - Badge: Job Saya = jumlah job menunggu diterima; Work Order = jumlah DRF menunggu (khusus Leader).
 */
export function useWorkOrderTabs() {
  const { user } = useAuth();
  const isLeader = LEADER_ROLES.includes(user?.role);
  const [jobPending, setJobPending] = useState(0);
  const [drfPending, setDrfPending] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get("/drawing-requests/my-queue")
      .then(({ data }) => { if (alive) setJobPending((data.antri_count || 0) + (data.diterima_count || 0)); })
      .catch(() => {});
    if (isLeader) {
      api.get("/drawing-requests/pending-count-for-engineering")
        .then(({ data }) => { if (alive) setDrfPending(data.count || 0); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [isLeader]);

  const tabs = [];
  // Staff: cukup 1 halaman "Antrian Job Saya". Tab "Work Order" (papan assign) khusus Leader.
  tabs.push({ key: "my-queue", label: "Antrian Job Saya", to: "/engineering/my-queue", icon: Tray, badge: jobPending || undefined });
  if (isLeader) {
    tabs.push({ key: "work-orders", label: "Work Order (Assign)", to: "/engineering/work-orders", icon: Wrench, badge: drfPending || undefined });
  }
  return tabs;
}

/**
 * Tab grup Inquiry Costing.
 * - Badge "Antrian Aktif" = jumlah inquiry berstatus submitted (menunggu di-assign / dikerjakan).
 */
export function useInquiryTabs() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    let alive = true;
    api.get("/sales/stats")
      .then(({ data }) => { if (alive) setActive(data?.inquiries?.by_status?.submitted || 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return [
    { key: "inq-active", label: "Antrian Aktif", to: "/engineering/inquiries", icon: Wrench, badge: active || undefined },
    { key: "inq-master", label: "Masterlist Inquiry", to: "/engineering/inquiry-masterlist", icon: ClipboardText },
  ];
}
