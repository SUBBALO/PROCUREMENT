{
  "brand_attributes": {
    "adjectives": ["minimalis", "rapi", "cepat", "profesional-industrial", "tidak ramai"],
    "anti_goals": [
      "Jangan tampilkan 11 kartu besar full-width yang mendominasi layar",
      "Jangan gunakan blok warna besar di kiri item (accent bar tebal)",
      "Jangan buat layout center-aligned",
      "Jangan pakai gradient gelap/saturated atau gradient berlebihan"
    ],
    "success_actions": [
      "User bisa menemukan menu dalam 1–2 detik",
      "Group bawah terlihat tanpa scroll berat",
      "Badge count tetap terlihat tapi tidak ‘teriak’",
      "Panel antrian (children slot) cepat terlihat"
    ]
  },

  "layout_strategy": {
    "overall": "Ubah menu dari ‘wall of cards’ menjadi launcher yang ringkas: header kecil + 4 group dengan grid tile mini (2–4 kolom) + children panels langsung di bawah. Fokus pada whitespace dan tipografi, bukan blok warna.",
    "page_container": {
      "max_width": "max-w-[1200px] 2xl:max-w-[1320px]",
      "padding": "px-4 sm:px-6 lg:px-8",
      "vertical_rhythm": "py-5 sm:py-6",
      "grid": "Gunakan 12-col mental model; menu area = 8–12 col (full), children panels di bawah full width. Hindari right-side kosong dengan grid yang mengisi lebar secara natural."
    },
    "header_block": {
      "structure": [
        "Row 1: Back link (kiri) + optional quick actions (kanan, jika ada)",
        "Row 2: Title (deptLabel) + tagline (deptTagline)"
      ],
      "height_target": "<= 96px total di desktop agar menu + panel bawah cepat terlihat",
      "divider": "Separator tipis setelah header (shadcn Separator)"
    },
    "menu_groups": {
      "group_header": "Header group kecil, uppercase tracking, dengan count ringkas opsional (jumlah item).",
      "group_layout": "Setiap group = Card container tipis (bukan kartu per item). Di dalamnya grid tile mini.",
      "recommended_columns": {
        "mobile": "grid-cols-1",
        "tablet": "sm:grid-cols-2",
        "desktop": "lg:grid-cols-3",
        "wide": "xl:grid-cols-4"
      },
      "gap": "gap-2 sm:gap-3",
      "group_spacing": "space-y-4 sm:space-y-5"
    },
    "item_density": {
      "tile_height": "h-[52px] sm:h-[56px]",
      "tile_padding": "px-3 py-2",
      "icon_box": "w-8 h-8 rounded-md",
      "icon_size": "18–20px",
      "badge": "min-w-[22px] h-[18px] px-1.5 text-[11px]"
    }
  },

  "typography": {
    "font_pairing": {
      "headings": "Chivo (existing)",
      "body": "Inter (existing)",
      "numbers": "Inter (tabular-nums via Tailwind: tabular-nums)"
    },
    "scale": {
      "page_title": "text-2xl sm:text-3xl font-semibold tracking-[-0.02em] (Chivo)",
      "tagline": "text-sm sm:text-base text-muted-foreground leading-snug",
      "group_label": "text-xs font-semibold tracking-[0.12em] uppercase text-slate-600",
      "item_title": "text-sm font-semibold text-slate-900 leading-none",
      "item_subtitle": "text-xs text-slate-600 leading-snug (opsional; default hidden untuk mode compact)",
      "badge_text": "text-[11px] font-semibold"
    },
    "rules": [
      "Default: sembunyikan subtitle untuk mengurangi ramai. Tampilkan hanya via tooltip atau hover-card jika perlu.",
      "Gunakan line-clamp-1 untuk label agar tile tetap pendek.",
      "Jangan gunakan H2 besar; group header cukup kecil tapi tegas."
    ]
  },

  "color_system": {
    "notes": "Tetap light, industrial ERP. Accent per item tetap ada tapi diperkecil jadi dot/rail tipis + icon tint. Badge merah tetap merah tapi lebih halus.",
    "tokens_css_variables": {
      "add_to": "/app/frontend/src/index.css (:root)",
      "tokens": {
        "--portal-surface": "0 0% 100%",
        "--portal-surface-2": "210 40% 96%",
        "--portal-ink": "222 47% 11%",
        "--portal-ink-2": "215 16% 46%",
        "--portal-border": "214 32% 91%",
        "--portal-hover": "210 40% 98%",
        "--portal-focus": "199 89% 41%",
        "--portal-badge-bg": "0 84% 96%",
        "--portal-badge-ink": "0 72% 45%",
        "--portal-shadow": "0 0% 0%"
      }
    },
    "semantic_palette": {
      "background": "hsl(var(--background)) (existing)",
      "surface": "hsl(var(--card))",
      "surface_muted": "hsl(var(--secondary))",
      "text_primary": "hsl(var(--foreground))",
      "text_secondary": "hsl(var(--muted-foreground))",
      "border": "hsl(var(--border))",
      "focus_ring": "hsl(var(--ring))",
      "danger_badge": {
        "bg": "hsl(var(--portal-badge-bg))",
        "text": "hsl(var(--portal-badge-ink))",
        "border": "hsl(var(--border))"
      }
    },
    "accent_usage_rule": [
      "Accent warna item hanya muncul sebagai: (1) dot 6px atau rail 2px, (2) icon background tint 6–10% opacity.",
      "Tidak ada accent bar tebal full height.",
      "Tidak ada background warna solid besar per item."
    ]
  },

  "components": {
    "component_path": {
      "shadcn_primary": [
        "/app/frontend/src/components/ui/button.jsx",
        "/app/frontend/src/components/ui/badge.jsx",
        "/app/frontend/src/components/ui/card.jsx",
        "/app/frontend/src/components/ui/separator.jsx",
        "/app/frontend/src/components/ui/tooltip.jsx",
        "/app/frontend/src/components/ui/hover-card.jsx",
        "/app/frontend/src/components/ui/command.jsx",
        "/app/frontend/src/components/ui/scroll-area.jsx"
      ],
      "recommended_new_local_components": [
        "/app/frontend/src/components/portal/PortalLauncherGroup.jsx",
        "/app/frontend/src/components/portal/PortalLauncherItem.jsx",
        "/app/frontend/src/components/portal/PortalCommandK.jsx"
      ]
    },
    "menu_item_blueprint": {
      "base": "Gunakan <a> atau <button> (tergantung href/onClick) dengan role yang benar. Styling seperti ‘list-row tile’.",
      "structure": [
        "Left: icon box (8x8) dengan tint accent",
        "Middle: label (line-clamp-1)",
        "Right: badge count (jika ada) + chevron kecil (opsional, hanya hover)"
      ],
      "accent_indicator": {
        "option_a_dot": "span w-1.5 h-1.5 rounded-full bg-[accent] di dekat label",
        "option_b_rail": "pseudo-element before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:rounded-full before:bg-[accent]"
      },
      "recommended_tailwind": {
        "tile": "group relative flex items-center gap-3 rounded-lg border bg-white px-3 py-2 h-[52px] sm:h-[56px] shadow-[0_1px_0_rgba(15,23,42,0.04)] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50",
        "iconBox": "grid place-items-center w-8 h-8 rounded-md bg-slate-50 border border-slate-200",
        "label": "text-sm font-semibold text-slate-900 leading-none line-clamp-1",
        "subtitle_optional": "hidden md:block text-xs text-slate-600 line-clamp-1",
        "badge": "ml-auto inline-flex items-center justify-center rounded-full border border-slate-200 bg-rose-50 text-rose-700 tabular-nums min-w-[22px] h-[18px] px-1.5 text-[11px] font-semibold",
        "chevron": "ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-slate-400"
      },
      "badge_rules": [
        "Jika badgeCount = 0 atau null: jangan render badge.",
        "Badge tidak boleh besar; gunakan pill kecil.",
        "Badge warna merah tetap, tapi gunakan rose-50/rose-700 (lebih halus daripada merah solid)."
      ]
    },
    "group_container_blueprint": {
      "container": "Card tipis sebagai wadah group (bukan per item).",
      "recommended_tailwind": {
        "card": "rounded-xl border bg-white/80 backdrop-blur-[2px]",
        "cardHeader": "px-4 pt-4 pb-2 flex items-center justify-between",
        "cardTitle": "text-xs font-semibold tracking-[0.12em] uppercase text-slate-600",
        "cardContent": "px-3 pb-3",
        "grid": "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3"
      }
    },
    "quick_find": {
      "pattern": "Tambahkan Command palette (Cmd+K / Ctrl+K) untuk cari menu cepat. Ini sangat cocok untuk staff internal.",
      "shadcn": "Gunakan /components/ui/command.jsx + Dialog (jika sudah ada) atau Drawer untuk mobile.",
      "trigger": "Button ghost kecil di header: 'Cari menu…'",
      "data": "Isi CommandGroup per group (Pekerjaan Masuk, dst). CommandItem navigasi ke href/onClick.",
      "data_testid": {
        "trigger": "portal-commandk-trigger",
        "input": "portal-commandk-input",
        "item_prefix": "portal-commandk-item-"
      }
    }
  },

  "motion_microinteractions": {
    "principles": [
      "Minimal, cepat, tidak ‘ramai’.",
      "Hormati Mode Cepat: jika html.reduce-motion aktif, animasi praktis mati (sudah ada di index.css)."
    ],
    "allowed_transitions": [
      "Hover background: transition-colors duration-150",
      "Chevron reveal: transition-opacity duration-150",
      "Focus ring: default focus-visible ring (tanpa transition all)"
    ],
    "avoid": ["transition-all", "scale besar", "shadow animasi berlebihan"],
    "optional_fr_motion": {
      "use_case": "Jika ingin entrance halus untuk group containers (stagger kecil).",
      "rule": "Disable ketika html.reduce-motion aktif."
    }
  },

  "accessibility": {
    "keyboard": [
      "Semua tile harus bisa di-tab.",
      "Gunakan focus-visible ring yang jelas.",
      "Jika tile adalah <a>, pastikan href valid; jika <button>, type=button."
    ],
    "aria": [
      "Badge count: tambahkan aria-label mis. '3 item menunggu'",
      "Jika subtitle disembunyikan, sediakan Tooltip untuk deskripsi (optional)."
    ],
    "contrast": [
      "Text slate-900 di bg putih aman.",
      "Muted text slate-600 tetap terbaca.",
      "Badge rose-700 di rose-50 memenuhi kontras untuk angka kecil."
    ]
  },

  "testing_data_testid": {
    "rules": [
      "Semua item menu wajib punya data-testid unik.",
      "Gunakan kebab-case berbasis fungsi, bukan tampilan."
    ],
    "suggested_convention": {
      "back_link": "dept-portal-back-link",
      "group": "dept-portal-group-{groupKey}",
      "item": "dept-portal-nav-item-{cardKey}",
      "badge": "dept-portal-nav-badge-{cardKey}",
      "children_slot": "dept-portal-children"
    }
  },

  "responsive_behavior": {
    "mobile": [
      "Grid 1 kolom; tile tetap pendek.",
      "Command palette trigger tetap terlihat.",
      "Group containers stack vertikal."
    ],
    "tablet_desktop": [
      "Grid 2–4 kolom sesuai breakpoint.",
      "Jaga agar total tinggi menu (header + groups) tidak terlalu tinggi: target <= ~420–520px di desktop agar panel antrian terlihat."
    ]
  },

  "image_urls": {
    "notes": "Portal internal ERP: tidak perlu foto hero/testimonial. Gunakan texture/noise halus via CSS saja.",
    "categories": [
      {
        "category": "background_texture",
        "description": "Noise halus (CSS) untuk menghindari flat look tanpa gambar.",
        "urls": []
      }
    ]
  },

  "implementation_notes_for_deptportal": {
    "do_not_change_api": "DeptPortal.jsx props tetap sama. Perubahan hanya pada markup internal + className + penggunaan shadcn components.",
    "mapping": {
      "groups": "Render group container Card per group.",
      "cards": "Render tile mini per card.",
      "badgeCount": "Render badge kecil di kanan.",
      "accent/accentText": "Gunakan untuk dot/rail + icon tint (bg with opacity)."
    },
    "compact_mode": {
      "compactCards": "Jika prop compactCards true: paksa subtitle hidden, padding lebih kecil, grid gap lebih rapat.",
      "cardsFirst": "Jika cardsFirst true: menu di atas children; jika false: children bisa muncul dulu (tetap dukung)."
    }
  },

  "instructions_to_main_agent": [
    "Refactor DeptPortal.jsx: ganti layout kartu besar menjadi group Card container + grid tile mini sesuai blueprint.",
    "Pastikan setiap tile memakai data-testid='dept-portal-nav-item-{card.key}'.",
    "Badge count: data-testid='dept-portal-nav-badge-{card.key}'.",
    "Tambahkan Command palette opsional (PortalCommandK) untuk pencarian cepat menu; jangan mengubah API DeptPortal.",
    "Jangan gunakan transition: all. Gunakan transition-colors / transition-opacity saja.",
    "Pertahankan light theme dan Chivo untuk heading; jangan ubah identitas aplikasi."
  ],

  "appendix_general_ui_ux_design_guidelines": "<General UI UX Design Guidelines>\n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
