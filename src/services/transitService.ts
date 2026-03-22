export type TransitMode = "train" | "bus";

export interface TransitResult {
  type: string;
  time: string;
  price: string;
  departure: string;
  arrival: string;
  changes: string;
  mode: TransitMode;
  source: "local";
}

interface TransitTemplate {
  label: string;
  durationMin: number;
  priceJPY: number;
  changes: number;
}

const CITY_ALIASES: Record<string, string> = {
  tokyo: "Tokyo",
  shinjuku: "Tokyo",
  shibuya: "Tokyo",
  ueno: "Tokyo",
  asakusa: "Tokyo",
  shinagawa: "Tokyo",
  ikebukuro: "Tokyo",
  akihabara: "Tokyo",
  ginza: "Tokyo",
  roppongi: "Tokyo",
  harajuku: "Tokyo",
  omotesando: "Tokyo",
  ebisu: "Tokyo",
  nakano: "Tokyo",
  kichijoji: "Tokyo",
  shimokitazawa: "Tokyo",
  hachioji: "Tokyo",
  tachikawa: "Tokyo",
  yokohama: "Yokohama",
  sakuragicho: "Yokohama",
  "minato-mirai": "Yokohama",
  "shin-yokohama": "Yokohama",
  motomachi: "Yokohama",
  "motomachi-chukagai": "Yokohama",
  osaka: "Osaka",
  "shin-osaka": "Osaka",
  umeda: "Osaka",
  namba: "Osaka",
  tennoji: "Osaka",
  kyobashi: "Osaka",
  yodoyabashi: "Osaka",
  shinsaibashi: "Osaka",
  nipponbashi: "Osaka",
  kyoto: "Kyoto",
  "gion-shijo": "Kyoto",
  kawaramachi: "Kyoto",
  arashiyama: "Kyoto",
  "fushimi-inari": "Kyoto",
  "kiyomizu-gojo": "Kyoto",
  nagoya: "Nagoya",
  kanayama: "Nagoya",
  sakae: "Nagoya",
  "osu-kannon": "Nagoya",
  "nagoya-ko": "Nagoya",
  fujigaoka: "Nagoya",
  nara: "Nara",
  "kintetsu-nara": "Nara",
  kobe: "Kobe",
  sannomiya: "Kobe",
  motomachikobe: "Kobe",
  "shin-kobe": "Kobe",
  hakone: "Hakone",
  "hakone-yumoto": "Hakone",
  gora: "Hakone",
  togendai: "Hakone",
  kawaguchiko: "Kawaguchiko",
  fujisan: "Kawaguchiko",
  hakata: "Fukuoka",
  tenjin: "Fukuoka",
  "nakasu-kawabata": "Fukuoka",
  "fukuoka-airport": "Fukuoka",
  odori: "Sapporo",
  susukino: "Sapporo",
  miyajimaguchi: "Hiroshima",
  hatchobori: "Hiroshima",
  nikko: "Nikko",
  "tobu-nikko": "Nikko",
  kamakura: "Kamakura",
  hase: "Kamakura",
  "kita-kamakura": "Kamakura",
  sapporo: "Sapporo",
  fukuoka: "Fukuoka",
  hiroshima: "Hiroshima"
};

const TRAIN_TEMPLATES: Record<string, TransitTemplate[]> = {
  "Tokyo|Kyoto": [
    { label: "Shinkansen Nozomi", durationMin: 135, priceJPY: 14170, changes: 0 },
    { label: "Shinkansen Hikari", durationMin: 160, priceJPY: 13850, changes: 0 },
    { label: "JR + Local", durationMin: 420, priceJPY: 9200, changes: 2 }
  ],
  "Tokyo|Osaka": [
    { label: "Shinkansen Nozomi", durationMin: 150, priceJPY: 14720, changes: 0 },
    { label: "Shinkansen Hikari", durationMin: 185, priceJPY: 14400, changes: 0 },
    { label: "JR + Local", durationMin: 490, priceJPY: 9800, changes: 3 }
  ],
  "Tokyo|Nagoya": [
    { label: "Shinkansen Nozomi", durationMin: 100, priceJPY: 11090, changes: 0 },
    { label: "Shinkansen Hikari", durationMin: 115, priceJPY: 10890, changes: 0 },
    { label: "JR + Local", durationMin: 290, priceJPY: 7700, changes: 2 }
  ],
  "Osaka|Kyoto": [
    { label: "JR Special Rapid", durationMin: 30, priceJPY: 580, changes: 0 },
    { label: "JR Limited Express", durationMin: 23, priceJPY: 1210, changes: 0 },
    { label: "Hankyu + Subway", durationMin: 45, priceJPY: 690, changes: 1 }
  ],
  "Osaka|Nara": [
    { label: "Kintetsu Rapid Express", durationMin: 40, priceJPY: 680, changes: 0 },
    { label: "JR Yamatoji Rapid", durationMin: 50, priceJPY: 820, changes: 0 },
    { label: "Local + Transfer", durationMin: 60, priceJPY: 700, changes: 1 }
  ],
  "Osaka|Kobe": [
    { label: "JR Special Rapid", durationMin: 25, priceJPY: 420, changes: 0 },
    { label: "Hanshin Railway", durationMin: 35, priceJPY: 330, changes: 0 },
    { label: "Local + Transfer", durationMin: 44, priceJPY: 390, changes: 1 }
  ],
  "Tokyo|Yokohama": [
    { label: "JR Tokaido Line", durationMin: 28, priceJPY: 490, changes: 0 },
    { label: "JR Shonan-Shinjuku", durationMin: 35, priceJPY: 490, changes: 0 },
    { label: "Local + Transfer", durationMin: 42, priceJPY: 510, changes: 1 }
  ],
  "Tokyo|Hakone": [
    { label: "Odakyu Romancecar", durationMin: 90, priceJPY: 2470, changes: 0 },
    { label: "Shinkansen + Local", durationMin: 70, priceJPY: 3620, changes: 1 },
    { label: "Local + Transfer", durationMin: 125, priceJPY: 1590, changes: 2 }
  ],
  "Tokyo|Kawaguchiko": [
    { label: "Fuji Excursion", durationMin: 120, priceJPY: 4130, changes: 0 },
    { label: "JR + Fujikyu", durationMin: 145, priceJPY: 3720, changes: 1 },
    { label: "Local + Transfer", durationMin: 180, priceJPY: 3200, changes: 2 }
  ],
  "Hiroshima|Kyoto": [
    { label: "Shinkansen Nozomi", durationMin: 105, priceJPY: 11290, changes: 0 },
    { label: "Shinkansen Sakura", durationMin: 120, priceJPY: 11070, changes: 0 },
    { label: "JR + Local", durationMin: 300, priceJPY: 8200, changes: 2 }
  ]
};

const BUS_TEMPLATES: Record<string, TransitTemplate[]> = {
  "Tokyo|Kyoto": [
    { label: "Willer Express Night Bus", durationMin: 510, priceJPY: 4800, changes: 0 },
    { label: "JR Highway Bus", durationMin: 520, priceJPY: 5200, changes: 0 },
    { label: "Premium Seat Night Bus", durationMin: 500, priceJPY: 6900, changes: 0 }
  ],
  "Tokyo|Osaka": [
    { label: "Willer Express Night Bus", durationMin: 540, priceJPY: 5100, changes: 0 },
    { label: "JR Dream Bus", durationMin: 530, priceJPY: 5900, changes: 0 },
    { label: "Premium Seat Night Bus", durationMin: 515, priceJPY: 7500, changes: 0 }
  ],
  "Osaka|Kyoto": [
    { label: "Keihan Highway Bus", durationMin: 65, priceJPY: 900, changes: 0 },
    { label: "Hankyu Bus", durationMin: 70, priceJPY: 850, changes: 0 },
    { label: "Airport Limousine + City Bus", durationMin: 85, priceJPY: 1200, changes: 1 }
  ],
  "Tokyo|Kawaguchiko": [
    { label: "Fujikyuko Highway Bus", durationMin: 115, priceJPY: 2200, changes: 0 },
    { label: "Keio Highway Bus", durationMin: 120, priceJPY: 2100, changes: 0 },
    { label: "Express Bus + Local", durationMin: 140, priceJPY: 2600, changes: 1 }
  ],
  "Kyoto|Nara": [
    { label: "Kyoto Kotsu Direct Bus", durationMin: 80, priceJPY: 1200, changes: 0 },
    { label: "Kintetsu Nara Bus", durationMin: 85, priceJPY: 1100, changes: 0 },
    { label: "Local Bus + Transfer", durationMin: 100, priceJPY: 980, changes: 1 }
  ],
  "Sapporo|Hiroshima": [
    { label: "Intercity Night Bus", durationMin: 900, priceJPY: 13500, changes: 1 },
    { label: "Express Bus + Ferry", durationMin: 960, priceJPY: 11200, changes: 2 },
    { label: "Long-distance Bus", durationMin: 980, priceJPY: 9900, changes: 2 }
  ],
  "Tokyo|Yokohama": [
    { label: "Tokyu Limousine Bus", durationMin: 50, priceJPY: 700, changes: 0 },
    { label: "Keikyu Express Bus", durationMin: 55, priceJPY: 680, changes: 0 },
    { label: "City Bus + Local", durationMin: 75, priceJPY: 620, changes: 1 }
  ]
};

function canonicalizeCity(rawInput: string): string | null {
  const normalized = rawInput
    .trim()
    .toLowerCase()
    .replace(/station$/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  if (!normalized) {
    return null;
  }

  if (CITY_ALIASES[normalized]) {
    return CITY_ALIASES[normalized];
  }

  const compact = normalized.replace(/-/g, "");
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    const aliasCompact = alias.replace(/-/g, "");
    if (aliasCompact === compact || compact.includes(aliasCompact) || aliasCompact.includes(compact)) {
      return city;
    }
  }

  return null;
}

function routeKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function parseTimeToMinutes(raw: string): number {
  const [h, m] = raw.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return 9 * 60;
  }
  return Math.max(0, Math.min(23 * 60 + 59, h * 60 + m));
}

function minutesToClock(totalMinutes: number): string {
  const wrapped = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toDurationLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

function buildIntraCityTemplates(mode: TransitMode): TransitTemplate[] {
  if (mode === "train") {
    return [
      { label: "JR Local", durationMin: 22, priceJPY: 220, changes: 0 },
      { label: "Metro + Local", durationMin: 31, priceJPY: 290, changes: 1 },
      { label: "Rapid + Walk", durationMin: 27, priceJPY: 350, changes: 1 }
    ];
  }
  return [
    { label: "City Bus Direct", durationMin: 35, priceJPY: 230, changes: 0 },
    { label: "Bus + Transfer", durationMin: 46, priceJPY: 310, changes: 1 },
    { label: "Local Bus", durationMin: 52, priceJPY: 280, changes: 1 }
  ];
}

function buildFallbackTemplates(from: string, to: string, mode: TransitMode): TransitTemplate[] {
  const seed =
    Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) +
    Math.abs(from.length - to.length) * 9 +
    Math.abs(from.charCodeAt(from.length - 1) - to.charCodeAt(to.length - 1));

  const base = mode === "train" ? 85 : 120;
  const duration = base + (seed % (mode === "train" ? 95 : 140));
  const priceBase = mode === "train" ? 2100 : 1400;
  const price = priceBase + (seed % (mode === "train" ? 4300 : 2600));

  if (mode === "train") {
    return [
      { label: "JR Limited Express", durationMin: duration, priceJPY: price, changes: 0 },
      { label: "JR + Transfer", durationMin: duration + 20, priceJPY: Math.max(890, price - 320), changes: 1 },
      { label: "Local + Rapid", durationMin: duration + 45, priceJPY: Math.max(760, price - 650), changes: 2 }
    ];
  }

  return [
    { label: "Highway Bus", durationMin: duration + 35, priceJPY: price, changes: 0 },
    { label: "Express Bus", durationMin: duration + 20, priceJPY: Math.max(650, price - 220), changes: 0 },
    { label: "Bus + Local", durationMin: duration + 55, priceJPY: Math.max(590, price - 380), changes: 1 }
  ];
}

function buildResultsFromTemplates(templates: TransitTemplate[], time: string, mode: TransitMode): TransitResult[] {
  const baseMinute = parseTimeToMinutes(time);
  const spacing = mode === "train" ? 12 : 20;

  return templates.map((tpl, idx) => {
    const departureMin = baseMinute + idx * spacing;
    const arrivalMin = departureMin + tpl.durationMin;
    return {
      type: tpl.label,
      time: toDurationLabel(tpl.durationMin),
      price: `${tpl.priceJPY.toLocaleString("en-US")} JPY`,
      departure: minutesToClock(departureMin),
      arrival: minutesToClock(arrivalMin),
      changes: String(tpl.changes),
      mode,
      source: "local"
    };
  });
}

export function searchTransitLocal(
  fromRaw: string,
  toRaw: string,
  time: string,
  mode: TransitMode = "train"
): TransitResult[] {
  const from = canonicalizeCity(fromRaw);
  const to = canonicalizeCity(toRaw);
  if (!from || !to) {
    return [];
  }

  if (from === to) {
    return buildResultsFromTemplates(buildIntraCityTemplates(mode), time, mode);
  }

  const key = routeKey(from, to);
  const routeTemplates = mode === "train" ? TRAIN_TEMPLATES[key] : BUS_TEMPLATES[key];
  const templates = routeTemplates && routeTemplates.length > 0 ? routeTemplates : buildFallbackTemplates(from, to, mode);

  return buildResultsFromTemplates(templates, time, mode);
}
