import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail, formatDateID, formatDateTimeWIB } from "../lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import InlinePdfImageViewer from "./InlinePdfImageViewer";
import {
  CAR_STATUS_LABEL, CAR_STATUS_CLS, SEVERITY_LABEL, SEVERITY_CLS,
  SOURCE_LABEL, SOURCE_CLS, DEPT_LABEL,
  isCarLeader, isCarEng, isCarQc,
} from "../lib/carConstants";
import {
  WarningCircle, UserGear, ClockCounterClockwise, Paperclip, Eye, Trash,
  UploadSimple, CircleNotch, CheckCircle, ArrowClockwise, FileText,
} from "@phosphor-icons/react";

const apiUrl = process.env.REACT_APP_BACKEND_URL;

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 mt-0.5">{children ?? <span className="text-slate-300">—</span>}</div>
    </div>
  );
}

function SectionTitle({ n, title, hint }) {
  return (
    <div className="border-l-4 border-indigo-500 pl-2.5">
      <div className="text-[11px] uppercase tracking-widest font-bold text-indigo-700">Section {n}</div>
      <div className="text-sm font-bold text-slate-800">{title}</div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

export default function CarDetailModal({ open, ncId, user, onClose, onChanged }) {
  const [nc, setNc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [designers, setDesigners] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // attachment being previewed

  // Section 2 form
  const [inv, setInv] = useState({});
  // Section 3 form
  const [clo, setClo] = useState({});
  // follow-up
  const [assignee, setAssignee] = useState("");
  const [ecnNo, setEcnNo] = useState("");

  const leader = isCarLeader(user);
  const eng = isCarEng(user);

  const load = useCallback(async () => {
    if (!ncId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/nonconformance/${ncId}`);
      setNc(data);
      setInv(data.investigation || {});
      setClo(data.closeout || {});
      setEcnNo(data.ecn_no || "");
      const { data: att } = await api.get(`/nonconformance/${ncId}/attachments`);
      setAttachments(att.items || []);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Gagal memuat CAR");
    } finally { setLoading(false); }
  }, [ncId]);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    if (open && leader) {
      api.get("/drawings/eng-designers").then(({ data }) => setDesigners(data.designers || [])).catch(() => {});
    }
  }, [open, leader]);

  if (!open) return null;
  const closed = nc?.status === "closed";
  const isInitiator = nc?.issued_by?.id === user?.id;
  const isAssignee = nc?.assigned_to?.id === user?.id;
  const canEditInv = !closed && (leader || eng);
  const canEditClo = !closed && (leader || isInitiator || isCarQc(user));

  const refresh = () => { load(); onChanged && onChanged(); };

  const doAssign = async () => {
    if (!assignee) { toast.error("Pilih staff Engineering"); return; }
    setBusy(true);
    try {
      const d = designers.find((x) => x.id === assignee);
      await api.post(`/nonconformance/${ncId}/assign`, { assignee_id: assignee, assignee_name: d?.name || "" });
      toast.success("NC ditugaskan");
      refresh();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await api.post(`/nonconformance/${ncId}/status`, { status, ecn_no: ecnNo });
      toast.success(`Status → ${CAR_STATUS_LABEL[status]}`);
      refresh();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const saveInvestigation = async () => {
    setBusy(true);
    try {
      await api.post(`/nonconformance/${ncId}/investigation`, { ...inv, ecn_no: ecnNo, set_in_progress: true });
      toast.success("Investigasi & rencana tindakan disimpan");
      refresh();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const saveCloseout = async (close) => {
    setBusy(true);
    try {
      await api.post(`/nonconformance/${ncId}/closeout`, { ...clo, close });
      toast.success(close ? "CAR ditutup (Closed)" : "Closeout disimpan");
      refresh();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    try {
      await api.post(`/nonconformance/${ncId}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Lampiran diunggah");
      const { data: att } = await api.get(`/nonconformance/${ncId}/attachments`);
      setAttachments(att.items || []);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const deleteAtt = async (attId) => {
    setBusy(true);
    try {
      await api.delete(`/nonconformance/${ncId}/attachments/${attId}`);
      setAttachments((cur) => cur.filter((a) => a.id !== attId));
      if (preview?.id === attId) setPreview(null);
    } catch (err) { toast.error(formatApiErrorDetail(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose && onClose()}>
      <DialogContent className="max-w-5xl rounded-none p-0 gap-0 max-h-[94vh] overflow-hidden flex flex-col" data-testid="car-detail-modal">
        <DialogHeader className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-rose-600">
                <WarningCircle size={13} weight="fill" /> Corrective Action Report · MKS-F-QAD-004 Rev.02
              </div>
              <DialogTitle className="text-lg font-mono font-bold text-slate-900" data-testid="car-detail-no">
                {nc?.nc_no || "…"}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              {nc && (
                <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border ${CAR_STATUS_CLS[nc.status]}`} data-testid="car-detail-status">
                  {CAR_STATUS_LABEL[nc.status]}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={refresh} className="rounded-none h-8" title="Muat ulang"><ArrowClockwise size={14} weight="bold" /></Button>
            </div>
          </div>
        </DialogHeader>

        {loading || !nc ? (
          <div className="flex-1 flex items-center justify-center py-20 text-slate-400 gap-2"><CircleNotch size={22} className="animate-spin" /> Memuat…</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
              {/* LEFT: Form CAR */}
              <div className="p-5 space-y-5 border-r border-slate-100">
                {/* Header info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/70 border border-slate-200 p-3">
                  <Field label="Date of Issue">{formatDateID(nc.issued_at)}</Field>
                  <Field label="Issued By">{nc.issued_by?.name} <span className="text-slate-400">({DEPT_LABEL[nc.issuer_dept] || nc.issuer_dept})</span></Field>
                  <Field label="Issued To">{nc.issued_to}</Field>
                  <Field label="Expected Reply">{nc.expected_reply_date ? formatDateID(nc.expected_reply_date) : null}</Field>
                  <Field label="SO No.">{nc.so_no}</Field>
                  <Field label="Customer">{nc.customer_name}</Field>
                  <Field label="Sumber">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${SOURCE_CLS[nc.source]}`}>{SOURCE_LABEL[nc.source]}</span>
                  </Field>
                  <Field label="Severity">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${SEVERITY_CLS[nc.severity]}`}>{SEVERITY_LABEL[nc.severity]}</span>
                  </Field>
                  <Field label="Assignee">{nc.assigned_to?.name}</Field>
                </div>

                {/* Linked drawings */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Drawing Terkait</div>
                  <div className="flex flex-wrap gap-1.5" data-testid="car-detail-drawings">
                    {(nc.drawing_nos || []).map((dn) => (
                      <span key={dn} className="font-mono text-xs bg-indigo-50 border border-indigo-300 text-indigo-800 px-2 py-1">{dn}</span>
                    ))}
                    {(nc.drawing_nos || []).length === 0 && <span className="text-slate-300 text-xs">—</span>}
                  </div>
                </div>

                {/* Section 1 */}
                <div className="space-y-2">
                  <SectionTitle n="1" title="Nonconformance Information" hint="Diisi oleh CAR Initiator" />
                  {nc.title && <div className="text-sm font-semibold text-slate-800">{nc.title}</div>}
                  <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 p-3">{nc.description || "—"}</div>
                </div>

                {/* Section 2: Investigation */}
                <div className="space-y-2.5">
                  <SectionTitle n="2" title="Investigation & Action Plans" hint="Diisi oleh Responsible Dept./Assignee (Engineering)" />
                  {!canEditInv && !nc.investigation && <div className="text-xs text-slate-400 italic">Belum diisi.</div>}
                  {(canEditInv || nc.investigation) && (
                    <div className="space-y-2.5">
                      {[
                        ["root_cause", "Root Cause(s)"],
                        ["immediate_action", "Immediate Action(s) Taken"],
                        ["corrective_action", "Corrective Action(s) to eliminate root cause"],
                        ["preventive_action", "Preventive Action (untuk log ENG-006)"],
                      ].map(([k, lbl]) => (
                        <div key={k}>
                          <Label className="text-[11px] font-bold text-slate-500">{lbl}</Label>
                          {canEditInv ? (
                            <Textarea rows={2} value={inv[k] || ""} onChange={(e) => setInv({ ...inv, [k]: e.target.value })} className="rounded-none mt-1 text-sm" data-testid={`car-inv-${k}`} />
                          ) : (
                            <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 p-2 mt-1">{nc.investigation?.[k] || "—"}</div>
                          )}
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] font-bold text-slate-500">Actions Completed By</Label>
                          {canEditInv ? <Input value={inv.completed_by || ""} onChange={(e) => setInv({ ...inv, completed_by: e.target.value })} className="rounded-none h-8 mt-1" data-testid="car-inv-completed_by" /> : <div className="text-sm mt-1">{nc.investigation?.completed_by || "—"}</div>}
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold text-slate-500">Date</Label>
                          {canEditInv ? <Input type="date" value={inv.completed_date || ""} onChange={(e) => setInv({ ...inv, completed_date: e.target.value })} className="rounded-none h-8 mt-1" data-testid="car-inv-completed_date" /> : <div className="text-sm mt-1">{nc.investigation?.completed_date || "—"}</div>}
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold text-slate-500">Approved by Dept. Head</Label>
                          {canEditInv ? <Input value={inv.dept_head_name || ""} onChange={(e) => setInv({ ...inv, dept_head_name: e.target.value })} className="rounded-none h-8 mt-1" data-testid="car-inv-dept_head" /> : <div className="text-sm mt-1">{nc.investigation?.dept_head_name || "—"}</div>}
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold text-slate-500">Date</Label>
                          {canEditInv ? <Input type="date" value={inv.dept_head_date || ""} onChange={(e) => setInv({ ...inv, dept_head_date: e.target.value })} className="rounded-none h-8 mt-1" data-testid="car-inv-dept_head_date" /> : <div className="text-sm mt-1">{nc.investigation?.dept_head_date || "—"}</div>}
                        </div>
                      </div>
                      {canEditInv && (
                        <Button onClick={saveInvestigation} disabled={busy} size="sm" className="rounded-none bg-indigo-600 hover:bg-indigo-700" data-testid="car-save-investigation">
                          <FileText size={14} weight="bold" className="mr-1" /> Simpan Investigasi
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Section 3: Closeout */}
                <div className="space-y-2.5">
                  <SectionTitle n="3" title="CAR Closeout Information" hint="Diisi oleh Initiator / MR / QA" />
                  {!canEditClo && !nc.closeout && <div className="text-xs text-slate-400 italic">Belum diisi.</div>}
                  {(canEditClo || nc.closeout) && (
                    <div className="space-y-2.5">
                      <div>
                        <Label className="text-[11px] font-bold text-slate-500">Remarks from Initiator</Label>
                        {canEditClo ? <Textarea rows={2} value={clo.initiator_remarks || ""} onChange={(e) => setClo({ ...clo, initiator_remarks: e.target.value })} className="rounded-none mt-1 text-sm" data-testid="car-clo-remarks" /> : <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 p-2 mt-1">{nc.closeout?.initiator_remarks || "—"}</div>}
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input type="checkbox" disabled={!canEditClo} checked={!!clo.risk_review} onChange={(e) => setClo({ ...clo, risk_review: e.target.checked })} data-testid="car-clo-risk" />
                          Review of risks & opportunities
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input type="checkbox" disabled={!canEditClo} checked={!!clo.risk_attached} onChange={(e) => setClo({ ...clo, risk_attached: e.target.checked })} data-testid="car-clo-risk-attach" />
                          Attached
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] font-bold text-slate-500">Effectiveness reviewed by</Label>
                          {canEditClo ? <Input value={clo.effectiveness_reviewed_by || ""} onChange={(e) => setClo({ ...clo, effectiveness_reviewed_by: e.target.value })} className="rounded-none h-8 mt-1" data-testid="car-clo-eff-by" /> : <div className="text-sm mt-1">{nc.closeout?.effectiveness_reviewed_by || "—"}</div>}
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold text-slate-500">Date</Label>
                          {canEditClo ? <Input type="date" value={clo.effectiveness_date || ""} onChange={(e) => setClo({ ...clo, effectiveness_date: e.target.value })} className="rounded-none h-8 mt-1" data-testid="car-clo-eff-date" /> : <div className="text-sm mt-1">{nc.closeout?.effectiveness_date || "—"}</div>}
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold text-slate-500">Approved by QA</Label>
                          {canEditClo ? <Input value={clo.qa_approved_by || ""} onChange={(e) => setClo({ ...clo, qa_approved_by: e.target.value })} className="rounded-none h-8 mt-1" data-testid="car-clo-qa" /> : <div className="text-sm mt-1">{nc.closeout?.qa_approved_by || "—"}</div>}
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold text-slate-500">Date</Label>
                          {canEditClo ? <Input type="date" value={clo.qa_date || ""} onChange={(e) => setClo({ ...clo, qa_date: e.target.value })} className="rounded-none h-8 mt-1" data-testid="car-clo-qa-date" /> : <div className="text-sm mt-1">{nc.closeout?.qa_date || "—"}</div>}
                        </div>
                      </div>
                      {canEditClo && (
                        <div className="flex gap-2">
                          <Button onClick={() => saveCloseout(false)} disabled={busy} size="sm" variant="outline" className="rounded-none" data-testid="car-save-closeout">Simpan Closeout</Button>
                          {(leader || isCarQc(user)) && (
                            <Button onClick={() => saveCloseout(true)} disabled={busy} size="sm" className="rounded-none bg-emerald-600 hover:bg-emerald-700" data-testid="car-close-nc">
                              <CheckCircle size={14} weight="bold" className="mr-1" /> Simpan & Tutup (Closed)
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Follow-up + Attachments + Timeline */}
              <div className="p-5 space-y-5 bg-slate-50/40">
                {/* Follow-up (Eng Leader) */}
                {leader && !closed && (
                  <div className="border border-indigo-200 bg-indigo-50/50 p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-indigo-700">
                      <UserGear size={14} weight="bold" /> Tindak Lanjut (Eng Leader)
                    </div>
                    <div>
                      <Label className="text-[11px] font-bold text-slate-500">Tugaskan ke Staff Engineering</Label>
                      <div className="flex gap-1.5 mt-1">
                        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="flex-1 h-8 border border-slate-300 text-sm px-2 bg-white" data-testid="car-assignee-select">
                          <option value="">— Pilih staff —</option>
                          {designers.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.role})</option>)}
                        </select>
                        <Button onClick={doAssign} disabled={busy} size="sm" className="rounded-none bg-sky-600 hover:bg-sky-700" data-testid="car-assign-btn">Assign</Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] font-bold text-slate-500">No. ECN (MKS-F-ENG-004)</Label>
                      <Input value={ecnNo} onChange={(e) => setEcnNo(e.target.value)} placeholder="ECN-YY-MM-NN" className="rounded-none h-8 mt-1" data-testid="car-ecn-input" />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <Button onClick={() => setStatus("in_progress")} disabled={busy} size="sm" variant="outline" className="rounded-none" data-testid="car-set-inprogress">In Progress</Button>
                      <Button onClick={() => setStatus("closed")} disabled={busy} size="sm" className="rounded-none bg-emerald-600 hover:bg-emerald-700" data-testid="car-set-closed">Tutup (Closed)</Button>
                    </div>
                  </div>
                )}

                {nc.ecn_no && (
                  <div className="text-xs bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-800 px-3 py-2">
                    <b>ECN terkait:</b> <span className="font-mono">{nc.ecn_no}</span>
                  </div>
                )}

                {/* Attachments */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-slate-600">
                      <Paperclip size={14} weight="bold" /> Lampiran Bukti ({attachments.length})
                    </div>
                    <label className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer" data-testid="car-upload-label">
                      <UploadSimple size={13} weight="bold" /> Unggah
                      <input type="file" className="hidden" onChange={uploadFile} accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx" data-testid="car-upload-input" />
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    {attachments.length === 0 && <div className="text-xs text-slate-400 italic">Belum ada lampiran.</div>}
                    {attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 bg-white border border-slate-200 px-2.5 py-1.5">
                        <FileText size={14} className="text-slate-400 shrink-0" />
                        <span className="flex-1 text-xs truncate" title={a.filename}>{a.filename}</span>
                        <button onClick={() => setPreview(a)} className="text-slate-400 hover:text-indigo-600" title="Pratinjau" data-testid={`car-att-preview-${a.id}`}><Eye size={15} weight="bold" /></button>
                        <button onClick={() => deleteAtt(a.id)} className="text-slate-400 hover:text-rose-600" title="Hapus" data-testid={`car-att-delete-${a.id}`}><Trash size={14} weight="bold" /></button>
                      </div>
                    ))}
                  </div>
                  {preview && (
                    <div className="mt-2 border border-slate-300">
                      <div className="flex items-center justify-between bg-slate-800 text-white px-2 py-1 text-[11px]">
                        <span className="truncate">{preview.filename}</span>
                        <button onClick={() => setPreview(null)} className="hover:text-rose-300 font-bold">Tutup</button>
                      </div>
                      <InlinePdfImageViewer
                        key={preview.id}
                        metaUrl={`/nonconformance/${ncId}/attachments/${preview.id}/page-meta`}
                        pageUrlBuilder={(n) => `${apiUrl}/api/nonconformance/${ncId}/attachments/${preview.id}/page-image?page=${n}&scale=2`}
                        emptyMessage="Lampiran tidak dapat dipratinjau."
                        className="h-[40vh]"
                      />
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-slate-600 mb-2">
                    <ClockCounterClockwise size={14} weight="bold" /> Riwayat
                  </div>
                  <div className="space-y-2 border-l-2 border-slate-200 pl-3" data-testid="car-timeline">
                    {(nc.timeline || []).slice().reverse().map((t, i) => (
                      <div key={i} className="relative">
                        <span className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-indigo-400" />
                        <div className="text-xs text-slate-700">{t.notes}</div>
                        <div className="text-[10px] text-slate-400">{t.by?.name || "-"} · {formatDateTimeWIB(t.at)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
