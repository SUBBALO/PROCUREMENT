/**
 * Excel-like resizable table columns — global, non-invasif.
 *
 * Menambahkan "pegangan geser" (grip) di tepi kanan setiap sel header tabel
 * di dalam elemen root (biasanya <main>). Pengguna bisa men-drag untuk
 * melebarkan/menyempitkan kolom seperti Excel. Lebar disimpan per-halaman di
 * localStorage sehingga bertahan setelah re-render / reload. Double-click pada
 * grip me-reset lebar kolom tsb.
 *
 * Dipanggil dari AppShell via MutationObserver + saat pindah route.
 */

const PREFIX = "mks_colw::";
const keyFor = (path, tIdx, cIdx) => `${PREFIX}${path}::${tIdx}::${cIdx}`;

function headerCells(table) {
  const row = (table.tHead && table.tHead.rows[0]) || table.rows[0];
  if (!row) return [];
  // Hanya proses jika baris header tidak memakai colspan (agar pemetaan kolom akurat)
  const cells = Array.from(row.cells);
  if (cells.some((c) => c.colSpan && c.colSpan > 1)) return [];
  return cells;
}

function totalWidth(cells) {
  return cells.reduce((a, c) => a + (parseFloat(c.style.width) || c.getBoundingClientRect().width), 0);
}

function enableFixed(table, cells) {
  if (table.style.tableLayout === "fixed") return;
  cells.forEach((c) => {
    if (!c.style.width) c.style.width = c.getBoundingClientRect().width + "px";
  });
  table.style.tableLayout = "fixed";
  table.style.width = totalWidth(cells) + "px";
}

export function processResizableTables(root) {
  if (!root || typeof window === "undefined") return;
  const path = window.location.pathname;
  const tables = root.querySelectorAll("table");

  tables.forEach((table, tIdx) => {
    const cells = headerCells(table);
    if (!cells.length) return;

    // 1) Reapply lebar tersimpan (bertahan lintas re-render) + aktifkan fixed layout
    const stored = cells.map((c, i) => {
      const v = localStorage.getItem(keyFor(path, tIdx, i));
      return v ? parseFloat(v) : null;
    });
    if (stored.some((v) => v != null)) {
      cells.forEach((c, i) => {
        const w = stored[i] != null ? stored[i] : c.getBoundingClientRect().width;
        c.style.width = w + "px";
      });
      table.style.tableLayout = "fixed";
      table.style.width = totalWidth(cells) + "px";
    }

    // 2) Pasang grip pada tiap header cell (idempoten via dataset flag)
    cells.forEach((th, i) => {
      if (th.dataset.mksResizer === "1") return;
      th.dataset.mksResizer = "1";

      const pos = window.getComputedStyle(th).position;
      if (pos === "static") th.style.position = "relative";

      const handle = document.createElement("div");
      handle.className = "mks-col-resizer";
      handle.setAttribute("data-testid", `col-resizer-${tIdx}-${i}`);
      th.appendChild(handle);

      let startX = 0;
      let startW = 0;

      const onMove = (e) => {
        const w = Math.max(40, startW + (e.clientX - startX));
        th.style.width = w + "px";
        table.style.width = totalWidth(cells) + "px";
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        handle.classList.remove("is-dragging");
        const w = Math.round(parseFloat(th.style.width) || th.getBoundingClientRect().width);
        try { localStorage.setItem(keyFor(path, tIdx, i), String(w)); } catch { /* noop */ }
        table.style.width = totalWidth(cells) + "px";
      };

      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        enableFixed(table, cells);
        startX = e.clientX;
        startW = parseFloat(th.style.width) || th.getBoundingClientRect().width;
        handle.classList.add("is-dragging");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
      });

      // Double-click grip = reset lebar kolom ini
      handle.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.removeItem(keyFor(path, tIdx, i)); } catch { /* noop */ }
        th.style.width = "";
        const anyLeft = cells.some((_, j) => localStorage.getItem(keyFor(path, tIdx, j)));
        if (!anyLeft) {
          table.style.tableLayout = "";
          table.style.width = "";
          cells.forEach((c) => (c.style.width = ""));
        } else {
          table.style.width = totalWidth(cells) + "px";
        }
      });
    });
  });
}
