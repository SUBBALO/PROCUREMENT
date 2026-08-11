import React, { useMemo, useState } from "react";
import { Input } from "./ui/input";
import { MagnifyingGlass, CheckSquare, Square } from "@phosphor-icons/react";

/**
 * AccessMatrix — editor hak akses granular ala Accurate (compact/dense).
 * Baris = modul→aktivitas, kolom = aksi (create/edit/delete/report/view/list).
 *
 * Props:
 *  - registry: [{ module, activities: [{ key, label }] }]
 *  - actions: ["create","edit",...]
 *  - actionLabels: { create: "Create", ... }
 *  - value: { menu_key: { create:bool, ... } }
 *  - onChange: (nextValue) => void
 */
export const AccessMatrix = ({ registry = [], actions = [], actionLabels = {}, value = {}, onChange }) => {
  const [q, setQ] = useState("");

  const allKeys = useMemo(
    () => registry.flatMap((g) => g.activities.map((a) => a.key)),
    [registry]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return registry;
    return registry
      .map((g) => ({
        ...g,
        activities: g.activities.filter(
          (a) => a.label.toLowerCase().includes(s) || g.module.toLowerCase().includes(s)
        ),
      }))
      .filter((g) => g.activities.length > 0);
  }, [registry, q]);

  const isOn = (key, act) => !!value?.[key]?.[act];

  const emit = (next) => onChange && onChange(next);

  const setCell = (key, act, on) => {
    const next = { ...value };
    const node = { ...(next[key] || {}) };
    node[act] = on;
    next[key] = node;
    emit(next);
  };

  const setRow = (key, on) => {
    const next = { ...value };
    next[key] = actions.reduce((acc, a) => ((acc[a] = on), acc), {});
    emit(next);
  };

  const rowAllOn = (key) => actions.every((a) => isOn(key, a));

  const setColumn = (act, on) => {
    const next = { ...value };
    allKeys.forEach((k) => {
      next[k] = { ...(next[k] || {}) };
      next[k][act] = on;
    });
    emit(next);
  };

  const colAllOn = (act) => allKeys.length > 0 && allKeys.every((k) => isOn(k, act));

  const setModule = (grp, on) => {
    const next = { ...value };
    grp.activities.forEach((a) => {
      next[a.key] = actions.reduce((acc, ac) => ((acc[ac] = on), acc), {});
    });
    emit(next);
  };
  const moduleAllOn = (grp) => grp.activities.every((a) => actions.every((ac) => isOn(a.key, ac)));

  const setAll = (on) => {
    const next = {};
    allKeys.forEach((k) => {
      next[k] = actions.reduce((acc, a) => ((acc[a] = on), acc), {});
    });
    emit(next);
  };

  const enabledCount = allKeys.reduce(
    (n, k) => n + actions.filter((a) => isOn(k, a)).length,
    0
  );

  // Native checkbox — paling padat & konsisten dgn dialog Admin existing.
  const Cb = ({ checked, onChange, testid, accent = "accent-sky-600", title }) => (
    <input
      type="checkbox"
      className={`w-3.5 h-3.5 ${accent} cursor-pointer align-middle`}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      data-testid={testid}
      title={title}
    />
  );

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden" data-testid="access-matrix">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 border-b border-slate-200">
        <div className="relative flex-1 max-w-[220px]">
          <MagnifyingGlass size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari modul/aktivitas…"
            className="h-7 pl-7 pr-2 text-[11px] rounded-sm border-slate-300"
            data-testid="access-matrix-search"
          />
        </div>
        <span className="text-[11px] text-slate-500 tabular-nums">{enabledCount} izin aktif</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="inline-flex items-center gap-1 h-7 px-2 text-[11px] font-medium text-sky-700 border border-sky-200 bg-sky-50 rounded-sm hover:bg-sky-100"
            data-testid="access-matrix-select-all"
          >
            <CheckSquare size={13} /> Akses Penuh
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="inline-flex items-center gap-1 h-7 px-2 text-[11px] font-medium text-slate-600 border border-slate-200 bg-white rounded-sm hover:bg-slate-50"
            data-testid="access-matrix-clear-all"
          >
            <Square size={13} /> Kosongkan
          </button>
        </div>
      </div>

      {/* Matrix table */}
      <div className="max-h-[340px] overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 text-slate-600">
              <th className="sticky left-0 z-20 bg-slate-100 text-left font-semibold px-2 py-1.5 border-b border-r border-slate-200 min-w-[190px]">
                Modul / Aktivitas
              </th>
              {actions.map((a) => (
                <th key={a} className="px-1 py-1 border-b border-slate-200 font-semibold w-[46px]">
                  <div className="flex flex-col items-center gap-0.5 leading-none">
                    <span>{actionLabels[a] || a}</span>
                    <Cb
                      checked={colAllOn(a)}
                      onChange={(on) => setColumn(a, on)}
                      accent="accent-slate-500"
                      testid={`access-col-toggle-${a}`}
                      title={`Toggle semua ${actionLabels[a] || a}`}
                    />
                  </div>
                </th>
              ))}
              <th className="px-1 py-1 border-b border-l border-slate-200 font-semibold w-[42px] text-center">Semua</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((grp) => (
              <React.Fragment key={grp.module}>
                <tr className="bg-slate-50">
                  <td className="sticky left-0 z-10 bg-slate-50 px-2 py-1 border-b border-r border-slate-200 font-semibold text-slate-700 uppercase tracking-[0.06em] text-[10px]">
                    {grp.module}
                  </td>
                  <td colSpan={actions.length} className="border-b border-slate-200" />
                  <td className="px-1 py-1 border-b border-l border-slate-200 text-center">
                    <Cb
                      checked={moduleAllOn(grp)}
                      onChange={(on) => setModule(grp, on)}
                      accent="accent-slate-500"
                      testid={`access-module-toggle-${grp.module}`}
                      title="Toggle semua di modul ini"
                    />
                  </td>
                </tr>
                {grp.activities.map((act) => (
                  <tr key={act.key} className="hover:bg-sky-50/50">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1 border-b border-r border-slate-100 text-slate-700 whitespace-nowrap">
                      {act.label}
                    </td>
                    {actions.map((a) => (
                      <td key={a} className="px-1 py-1 border-b border-slate-100 text-center">
                        <Cb
                          checked={isOn(act.key, a)}
                          onChange={(on) => setCell(act.key, a, on)}
                          testid={`access-cell-${act.key}-${a}`}
                          title={`${act.label} — ${actionLabels[a] || a}`}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 border-b border-l border-slate-100 text-center">
                      <Cb
                        checked={rowAllOn(act.key)}
                        onChange={(on) => setRow(act.key, on)}
                        accent="accent-emerald-600"
                        testid={`access-row-toggle-${act.key}`}
                        title="Toggle semua aksi baris ini"
                      />
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={actions.length + 2} className="px-3 py-6 text-center text-slate-400 text-[11px]">
                  Tidak ada modul yang cocok "{q}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
