{
  "meta": {
    "app_context": "ERP Engineering internal (React + Tailwind + shadcn/ui, file .js). Redesign UI flow tanpa mengubah gaya existing.",
    "language": "id-ID",
    "non_goals": [
      "Tidak membuat tema/brand baru",
      "Tidak mengubah skema warna global aplikasi",
      "Tidak mengganti ikon library (tetap @phosphor-icons/react)",
      "Tidak mengubah viewer PDF yang sudah ada (hanya embed/compose)"
    ]
  },
  "brand_attributes": [
    "utilitarian (cepat dipindai)",
    "status-first (jelas OK/Revisi/Approved)",
    "dense-but-readable (masterlist style)",
    "sharp-cornered (rounded-none/minimal radius)",
    "audit-friendly (riwayat catatan terlihat)"
  ],
  "design_tokens": {
    "typography": {
      "font_families": {
        "heading": "Chivo, ui-sans-serif, system-ui",
        "body": "Inter, ui-sans-serif, system-ui",
        "mono": "JetBrains Mono, ui-monospace"
      },
      "scale_tailwind": {
        "h1": "text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight",
        "h2": "text-base md:text-lg font-semibold",
        "h3": "text-sm font-semibold",
        "body": "text-sm md:text-base",
        "small": "text-xs",
        "table": "text-xs md:text-sm"
      },
      "usage_notes": [
        "Heading halaman/section pakai Chivo (class: font-[family:var(--font-heading)] atau gunakan utility font via inline style jika belum ada).",
        "Konten tabel/label form pakai Inter untuk keterbacaan dense.",
        "Jangan membesarkan subheading melebihi text-lg (sesuai aturan)."
      ]
    },
    "color_system": {
      "rule": "WAJIB mengikuti gaya existing: header slate/gelap, rose untuk revisi/peringatan, emerald untuk OK/sukses, amber untuk Engineering. Jangan introduce palette baru.",
      "semantic": {
        "bg": "bg-background",
        "surface": "bg-card",
        "text": "text-foreground",
        "muted_text": "text-muted-foreground",
        "border": "border-border",
        "header_slate": "bg-slate-900 text-slate-50",
        "engineering_amber": "text-amber-700 bg-amber-50 border-amber-200",
        "success_emerald": "text-emerald-700 bg-emerald-50 border-emerald-200",
        "warning_rose": "text-rose-700 bg-rose-50 border-rose-200",
        "pending_neutral": "text-slate-700 bg-slate-100 border-slate-200"
      },
      "status_badge_mapping": [
        {
          "status": "Belum direview",
          "badge_variant": "secondary",
          "className": "rounded-none border border-slate-200 bg-slate-100 text-slate-700"
        },
        {
          "status": "OK",
          "badge_variant": "outline",
          "className": "rounded-none border border-emerald-200 bg-emerald-50 text-emerald-700"
        },
        {
          "status": "Minta Revisi",
          "badge_variant": "destructive",
          "className": "rounded-none border border-rose-200 bg-rose-50 text-rose-700"
        },
        {
          "status": "Approved",
          "badge_variant": "default",
          "className": "rounded-none border border-emerald-200 bg-emerald-600 text-white"
        }
      ]
    },
    "radius_shadow_spacing": {
      "radius": {
        "global": "--radius sudah 0.125rem; untuk kartu/tabel gunakan rounded-none",
        "components": {
          "card": "rounded-none",
          "dialog": "rounded-none",
          "button": "rounded-none",
          "input": "rounded-none"
        }
      },
      "shadows": {
        "surface": "shadow-sm",
        "dialog": "shadow-xl",
        "focus_ring": "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      },
      "density": {
        "table_row": "h-9",
        "table_cell": "py-1.5 px-2",
        "form_control": "h-9",
        "section_gap": "gap-3 md:gap-4",
        "page_padding": "px-3 md:px-6 py-4"
      }
    },
    "motion": {
      "principles": [
        "Micro-interactions wajib, tapi subtle (ERP).",
        "Hindari transition: all. Gunakan transition-colors untuk hover/focus.",
        "Dialog open/close gunakan animasi default shadcn (Radix) + optional className untuk fade/zoom ringan."
      ],
      "tailwind_recipes": {
        "hover": "transition-colors duration-150",
        "press": "active:translate-y-[1px]",
        "row_hover": "hover:bg-slate-50",
        "danger_hover": "hover:bg-rose-100",
        "success_hover": "hover:bg-emerald-100"
      }
    }
  },
  "layout_and_grid": {
    "page_structure": {
      "pattern": "Master-detail dense: panel SO-level di atas, daftar drawing di bawah; review dilakukan via Dialog (popup) agar user tidak kehilangan konteks.",
      "container": "max-w-[1400px] mx-auto",
      "grid": {
        "desktop": "grid grid-cols-12 gap-4",
        "so_panel": "col-span-12 xl:col-span-4",
        "drawing_list": "col-span-12 xl:col-span-8"
      },
      "sticky_elements": [
        "Header halaman (slate) boleh sticky top-0 untuk konteks WO/SO saat scroll panjang.",
        "Di Dialog Review: header dan footer sticky (top/bottom) agar aksi selalu terlihat."
      ]
    },
    "information_hierarchy": [
      "1) Identitas WO/SO + customer + status global",
      "2) Panel SO-level: BOM + Dokumen SO (Nesting/AutoCAD/Costing) + Submit",
      "3) Daftar Drawing: tiap drawing fokus upload PDF + kategori kerja + TTD & Submit + status",
      "4) Aksi review Eng Leader via Popup Review (daftar semua dokumen 1 SO)"
    ]
  },
  "components": {
    "component_path": {
      "shadcn": {
        "Card": "/app/frontend/src/components/ui/card.jsx",
        "Table": "/app/frontend/src/components/ui/table.jsx",
        "Dialog": "/app/frontend/src/components/ui/dialog.jsx",
        "AlertDialog": "/app/frontend/src/components/ui/alert-dialog.jsx",
        "Badge": "/app/frontend/src/components/ui/badge.jsx",
        "Button": "/app/frontend/src/components/ui/button.jsx",
        "Tabs": "/app/frontend/src/components/ui/tabs.jsx",
        "Tooltip": "/app/frontend/src/components/ui/tooltip.jsx",
        "ScrollArea": "/app/frontend/src/components/ui/scroll-area.jsx",
        "Separator": "/app/frontend/src/components/ui/separator.jsx",
        "Select": "/app/frontend/src/components/ui/select.jsx",
        "Input": "/app/frontend/src/components/ui/input.jsx",
        "Textarea": "/app/frontend/src/components/ui/textarea.jsx",
        "Skeleton": "/app/frontend/src/components/ui/skeleton.jsx",
        "Sonner": "/app/frontend/src/components/ui/sonner.jsx"
      },
      "icons": {
        "library": "@phosphor-icons/react",
        "usage": "Gunakan ikon untuk status/aksi (CheckCircle, WarningCircle, PencilSimple, FilePdf, Eye, Signature, Lock)."
      }
    },
    "page_level_components_to_build": {
      "EngineeringWorkOrderPage": {
        "goal": "Halaman per SO: panel SO-level + daftar drawing + akses popup review.",
        "sections": [
          "Header SO (slate)",
          "Panel SO-level (BOM + Dokumen SO + Submit)",
          "Daftar Drawing (dense list/table)",
          "CTA: Buka Popup Review (khusus Eng Leader)"
        ]
      },
      "EngLeaderReviewDialog": {
        "goal": "Popup review mirip Masterlist Drawing: daftar semua dokumen terkait 1 SO/WO, dengan aksi per item + preview + riwayat catatan.",
        "layout": "DialogContent w-[min(1100px,96vw)] h-[min(80vh,900px)] rounded-none p-0 overflow-hidden",
        "internal_layout": "grid grid-cols-12 h-full",
        "left_panel": "col-span-12 lg:col-span-7 border-r border-border",
        "right_panel": "col-span-12 lg:col-span-5",
        "left_panel_content": [
          "Toolbar: search + filter status + legend badge",
          "Dense Table daftar dokumen (Drawing/Nesting/AutoCAD/Costing/BOM)",
          "Row click memilih item untuk preview & aksi"
        ],
        "right_panel_content": [
          "Preview dokumen (embed viewer PDF existing) + metadata",
          "Aksi konteks: Approve+TTD / Tandai OK / Minta Revisi (dengan catatan)",
          "Riwayat catatan revisi (ScrollArea)"
        ],
        "actions_rules": [
          "Jika tipe = Drawing: tampilkan tombol 'Approve & TTD' + 'Minta Revisi'.",
          "Jika tipe != Drawing: tampilkan tombol 'Tandai OK' + 'Minta Revisi'.",
          "Minta Revisi wajib isi catatan (Textarea required).",
          "Setelah aksi sukses: toast sonner + update badge status di tabel."
        ]
      },
      "FinalSubmitReminderDialog": {
        "goal": "Saat submit drawing terakhir: reminder 'BOM & Dokumen SO sudah diisi? Jika tidak perlu, boleh lanjut.'",
        "component": "AlertDialog (lebih cocok untuk konfirmasi singkat)",
        "copy": {
          "title": "Konfirmasi sebelum submit final",
          "body": "BOM & Dokumen SO sudah diisi? Jika tidak perlu, Anda boleh lanjut.",
          "primary": "Lanjut submit",
          "secondary": "Cek dulu"
        }
      }
    },
    "dense_table_spec": {
      "table": {
        "wrapper": "border border-border rounded-none bg-card",
        "header": "bg-slate-50",
        "th": "h-9 px-2 text-xs font-semibold text-slate-700",
        "td": "px-2 py-1.5 text-xs md:text-sm align-middle",
        "row": "h-9 hover:bg-slate-50 data-[selected=true]:bg-slate-100",
        "first_col": "w-[44px]",
        "status_col": "w-[140px]",
        "actions_col": "w-[220px]"
      },
      "columns_for_review_masterlist": [
        "Jenis",
        "Nama Dokumen",
        "Terakhir Update",
        "Status",
        "Aksi cepat (Lihat / Review)"
      ],
      "mobile_behavior": [
        "Di mobile: ubah tabel menjadi list rows (Card/Collapsible) atau gunakan Table dengan horizontal scroll (ScrollArea + overflow-x-auto).",
        "Kolom 'Terakhir Update' boleh disembunyikan di <sm untuk mengurangi kepadatan."
      ]
    },
    "so_panel_spec": {
      "container": "Card rounded-none",
      "header": "flex items-center justify-between border-b border-border px-3 py-2",
      "title": "font-[family:Chivo] text-sm font-semibold",
      "body": "p-3 space-y-3",
      "blocks": [
        {
          "name": "BOM",
          "ui": "Row dengan label + tombol 'Buka/Isi BOM' (link) + status badge",
          "notes": "BOM 1 per SO. Jangan tampilkan BOM per drawing."
        },
        {
          "name": "Dokumen SO (Lampiran)",
          "ui": "Table mini atau list dense untuk Nesting/AutoCAD/Costing (upload/replace) + status",
          "lock_rule": "Setelah submit final: semua upload di panel ini read-only + tampilkan ikon Lock + helper text."
        },
        {
          "name": "Submit Dokumen SO",
          "ui": "Button primary 'Submit Dokumen SO' + helper text",
          "rule": "Submit ini hanya untuk lampiran SO-level (bukan drawing)."
        }
      ]
    },
    "drawing_list_spec": {
      "pattern": "Daftar drawing sebagai Table dense atau list Card rows (lebih cocok jika ada upload + select).",
      "recommended": "Table dense dengan row expandable (Collapsible) untuk area upload & kategori.",
      "columns": [
        "No Drawing",
        "Judul/Part",
        "Kategori Kerja (SIMPLE/MODERATE/COMPLEX)",
        "Status",
        "Aksi (Upload PDF / TTD & Submit / Lihat)"
      ],
      "row_expand_content": [
        "Uploader PDF drawing",
        "Preview mini (button 'Lihat')",
        "Select kategori kerja",
        "Button 'TTD & Submit'"
      ],
      "locking": {
        "after_submit": "Row menjadi read-only: disable uploader & select; tampilkan badge 'Terkunci' + ikon Lock.",
        "visual": "opacity-70 pointer-events-none untuk area form, tapi tetap bisa scroll/lihat preview."
      }
    },
    "buttons": {
      "variants": {
        "primary": {
          "use": "Aksi utama: Submit, Approve & TTD",
          "className": "rounded-none bg-slate-900 text-slate-50 hover:bg-slate-800 transition-colors duration-150 active:translate-y-[1px]"
        },
        "secondary": {
          "use": "Aksi netral: Lihat, Cek dulu",
          "className": "rounded-none border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 transition-colors duration-150"
        },
        "success": {
          "use": "Tandai OK",
          "className": "rounded-none border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors duration-150"
        },
        "danger": {
          "use": "Minta Revisi",
          "className": "rounded-none border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors duration-150"
        }
      },
      "icon_buttons": {
        "pattern": "Gunakan Button variant=ghost size=icon dengan rounded-none; ikon phosphor.",
        "className": "rounded-none hover:bg-slate-100 transition-colors duration-150"
      }
    },
    "forms": {
      "inputs": {
        "className": "rounded-none h-9",
        "focus": "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      },
      "textarea": {
        "className": "rounded-none min-h-[96px]",
        "rule": "Catatan revisi wajib saat Minta Revisi."
      },
      "select": {
        "use": "Kategori kerja SIMPLE/MODERATE/COMPLEX",
        "items": [
          "SIMPLE",
          "MODERATE",
          "COMPLEX"
        ]
      }
    },
    "empty_loading_error_states": {
      "loading": [
        "Gunakan Skeleton untuk tabel dan preview panel.",
        "Tampilkan teks kecil 'Memuat dokumen…'"
      ],
      "empty": [
        "Jika belum ada dokumen SO: tampilkan Alert neutral 'Belum ada lampiran SO'.",
        "Jika belum ada drawing: tampilkan Alert 'Belum ada drawing untuk SO ini'."
      ],
      "error": [
        "Gunakan Alert variant=destructive untuk error upload/submit.",
        "Sertakan CTA 'Coba lagi' dan tampilkan error code jika ada (text-xs, mono)."
      ]
    }
  },
  "flows": {
    "A_popup_review_eng_leader": {
      "entry_points": [
        "Button 'Review Dokumen SO' di header/panel (khusus role Eng Leader)",
        "Link dari Masterlist Drawing (deep link ke SO)"
      ],
      "interaction": [
        "User membuka dialog → tabel dokumen tampil.",
        "Klik row memilih dokumen → preview + aksi muncul.",
        "Aksi sesuai tipe dokumen (Drawing vs non-drawing).",
        "Jika Minta Revisi → wajib isi catatan → submit → status jadi 'Minta Revisi' + catatan masuk riwayat.",
        "Jika Approve & TTD → jalankan flow TTD existing → status jadi 'Approved'.",
        "Jika Tandai OK → status jadi 'OK'."
      ],
      "audit": [
        "Riwayat catatan tampil per dokumen: timestamp, user, catatan.",
        "Tampilkan 'Terakhir direview oleh' jika tersedia."
      ]
    },
    "B_menu_work_order_engineer": {
      "so_level": [
        "BOM link (1 per SO)",
        "Upload lampiran SO: Nesting/AutoCAD/Costing",
        "Submit Dokumen SO",
        "Setelah submit final: lampiran SO terkunci read-only"
      ],
      "drawing_level": [
        "Upload PDF drawing",
        "Pilih kategori kerja",
        "TTD & Submit",
        "Status approval per drawing"
      ],
      "last_drawing_submit_reminder": [
        "Saat user menekan 'TTD & Submit' pada drawing terakhir yang belum submit → tampilkan AlertDialog reminder.",
        "Jika 'Cek dulu' → tutup dialog, scroll/focus ke panel SO-level.",
        "Jika 'Lanjut submit' → lanjut submit final."
      ]
    }
  },
  "data_testid_conventions": {
    "rule": "Semua elemen interaktif & info penting wajib data-testid (kebab-case, berbasis peran).",
    "examples": {
      "page": "engineering-work-order-page",
      "open_review": "open-eng-leader-review-dialog-button",
      "review_dialog": "eng-leader-review-dialog",
      "review_search": "review-documents-search-input",
      "review_filter": "review-status-filter-select",
      "doc_row": "review-document-row-<docId>",
      "doc_preview": "review-document-preview-panel",
      "approve_ttd": "review-approve-ttd-button",
      "mark_ok": "review-mark-ok-button",
      "request_revision": "review-request-revision-button",
      "revision_note": "review-revision-note-textarea",
      "revision_submit": "review-revision-submit-button",
      "so_submit": "so-documents-submit-button",
      "so_upload": "so-attachment-upload-<type>",
      "bom_link": "so-bom-link-button",
      "drawing_row": "drawing-row-<drawingId>",
      "drawing_upload": "drawing-upload-pdf-input-<drawingId>",
      "drawing_category": "drawing-category-select-<drawingId>",
      "drawing_submit": "drawing-ttd-submit-button-<drawingId>",
      "final_reminder": "final-submit-reminder-dialog",
      "final_reminder_continue": "final-submit-reminder-continue-button",
      "final_reminder_check": "final-submit-reminder-check-button"
    }
  },
  "implementation_notes_js": {
    "file_convention": [
      "Komponen ditulis dalam .js (bukan .tsx).",
      "Gunakan named export untuk components (export const ...), default export untuk pages.",
      "Pastikan props divalidasi minimal via JSDoc atau PropTypes jika project sudah pakai (opsional)."
    ],
    "dialog_sizing_example": {
      "snippet": "<DialogContent className=\"w-[min(1100px,96vw)] h-[min(80vh,900px)] rounded-none p-0 overflow-hidden\">..."
    },
    "pdf_viewer_embed": {
      "rule": "Gunakan komponen viewer PDF existing; bungkus dalam container AspectRatio/ScrollArea bila perlu.",
      "container_class": "bg-slate-50 border-t border-border"
    }
  },
  "image_urls": {
    "note": "Tidak perlu gambar eksternal (ERP internal). Gunakan ikon + UI primitives. Jika butuh ilustrasi empty state, gunakan SVG internal sederhana (monochrome slate) agar konsisten.",
    "categories": []
  },
  "instructions_to_main_agent": [
    "Pertahankan style existing: sharp corners (rounded-none), header slate gelap, badge semantic (emerald/rose/amber).",
    "Implement ulang halaman Engineering Work Order dengan pemisahan jelas: Panel SO-level vs Daftar Drawing. Hapus BOM per drawing dari UI.",
    "Bangun EngLeaderReviewDialog (Dialog) dengan layout master-detail: kiri tabel dokumen dense, kanan preview + aksi + riwayat.",
    "Aksi per tipe dokumen: Drawing => Approve & TTD atau Minta Revisi; Non-drawing => Tandai OK atau Minta Revisi.",
    "Tambahkan Reminder AlertDialog saat submit drawing terakhir.",
    "Setelah submit final: panel upload dokumen SO menjadi read-only (disable input, tampilkan Lock + helper text).",
    "Gunakan shadcn/ui components dari /src/components/ui (jangan HTML dropdown/calendar/toast custom).",
    "Gunakan sonner untuk toast.",
    "Semua elemen interaktif & info penting wajib data-testid (kebab-case).",
    "Jangan gunakan transition: all; gunakan transition-colors duration-150 pada elemen interaktif."
  ]
}

<General UI UX Design Guidelines>  
    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms
    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text
   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json

 **GRADIENT RESTRICTION RULE**
NEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc
NEVER use dark gradients for logo, testimonial, footer etc
NEVER let gradients cover more than 20% of the viewport.
NEVER apply gradients to text-heavy content or reading areas.
NEVER use gradients on small UI elements (<100px width).
NEVER stack multiple gradient layers in the same viewport.

**ENFORCEMENT RULE:**
    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors

**How and where to use:**
   • Section backgrounds (not content backgrounds)
   • Hero section header content. Eg: dark to light to dark color
   • Decorative overlays and accent elements only
   • Hero section with 2-3 mild color
   • Gradients creation can be done for any angle say horizontal, vertical or diagonal

- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**

</Font Guidelines>

- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. 
   
- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.

- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.
   
- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly
    Eg: - if it implies playful/energetic, choose a colorful scheme
           - if it implies monochrome/minimal, choose a black–white/neutral scheme

**Component Reuse:**
	- Prioritize using pre-existing components from src/components/ui when applicable
	- Create new components that match the style and conventions of existing components when needed
	- Examine existing components to understand the project's component patterns before creating new ones

**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component

**Best Practices:**
	- Use Shadcn/UI as the primary component library for consistency and accessibility
	- Import path: ./components/[component-name]

**Export Conventions:**
	- Components MUST use named exports (export const ComponentName = ...)
	- Pages MUST use default exports (export default function PageName() {...})

**Toasts:**
  - Use `sonner` for toasts"
  - Sonner component are located in `/app/src/components/ui/sonner.tsx`

Use 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.
</General UI UX Design Guidelines>
