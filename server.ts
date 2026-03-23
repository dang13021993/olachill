import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { GoogleGenAI, Type } from "@google/genai";

type PartnerLinkMap = Record<string, string>;

interface AffiliateCoupon {
  id: string;
  partner: string;
  code: string;
  slug: string;
  note?: string;
}

interface EsimPlan {
  id: string;
  name: string;
  country: string;
  data: string;
  validityDays: number;
  priceUsd: number;
  currency: string;
  providerAmountRaw?: number;
  checkoutUrl?: string;
  providerName?: string;
  network?: string;
  speed?: string;
  coverage?: string;
  description?: string;
  basePriceJpy?: number;
  displayPriceJpy?: number;
  priceDiffJpy?: number;
  discountRate?: number;
  features?: string[];
}

function isEsimProviderConfigured(): boolean {
  return Boolean(process.env.ESIM_PROVIDER_BASE_URL && process.env.ESIM_PROVIDER_API_KEY);
}

const DEFAULT_PARTNER_LINKS: PartnerLinkMap = {
  "tokyo-disneyland": "https://www.tokyodisneyresort.jp/en/tdl/ticket/",
  "usj": "https://www.usj.co.jp/web/en/us/tickets",
  "teamlab-borderless": "https://www.teamlab.art/e/borderless-azabudai/",
  "shibuya-sky": "https://www.shibuya-scramble-square.com/sky/ticket/en/",
  "ghibli-museum": "https://www.ghibli-museum.jp/en/tickets/",
  "tokyo-skytree": "https://www.tokyo-skytree.jp/en/ticket/",
  "kyoto-kimono": "https://www.yumeyakata.com/english/",
  "nara-deer-park": "https://www.visitnara.jp/",
  "klook": "https://www.klook.com/",
  "kkday": "https://www.kkday.com/"
};

const DEFAULT_AFFILIATE_COUPONS: AffiliateCoupon[] = [
  {
    id: "klook",
    partner: "Klook",
    code: "",
    slug: "klook"
  },
  {
    id: "kkday",
    partner: "KKday",
    code: "",
    slug: "kkday"
  }
];

const DEFAULT_ESIM_PLANS: EsimPlan[] = [
  {
    id: "jp-3gb-7d",
    name: "Japan Starter eSIM",
    country: "JP",
    data: "3 GB",
    validityDays: 7,
    priceUsd: 8.9,
    currency: "USD"
  },
  {
    id: "jp-10gb-15d",
    name: "Japan Explorer eSIM",
    country: "JP",
    data: "10 GB",
    validityDays: 15,
    priceUsd: 16.9,
    currency: "USD"
  },
  {
    id: "jp-unlimited-7d",
    name: "Japan Unlimited eSIM",
    country: "JP",
    data: "Unlimited*",
    validityDays: 7,
    priceUsd: 24.9,
    currency: "USD"
  }
];

function parsePartnerLinksFromEnv(): PartnerLinkMap {
  const raw = process.env.AFFILIATE_LINKS_JSON;
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: PartnerLinkMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.startsWith("http")) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function getPartnerLinks(): PartnerLinkMap {
  return {
    ...DEFAULT_PARTNER_LINKS,
    ...parsePartnerLinksFromEnv()
  };
}

function parseAffiliateCouponsFromEnv(): AffiliateCoupon[] {
  const envCodeByPartner: Record<string, string> = {
    klook: String(process.env.KLOOK_COUPON_CODE || "").trim(),
    kkday: String(process.env.KKDAY_COUPON_CODE || "").trim()
  };

  const raw = process.env.AFFILIATE_COUPONS_JSON;
  if (!raw) {
    return DEFAULT_AFFILIATE_COUPONS.map((item) => ({
      ...item,
      code: envCodeByPartner[item.id] || item.code
    }));
  }

  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? Object.entries(parsed).map(([id, value]) => {
            if (value && typeof value === "object") {
              return { id, ...(value as Record<string, unknown>) };
            }
            return { id, code: String(value || "") };
          })
        : [];

    const normalized = entries
      .map((item: any) => {
        const id = String(item?.id || item?.partner || item?.name || "")
          .trim()
          .toLowerCase();
        const partner = String(item?.partner || item?.name || item?.id || "").trim();
        const slug = String(item?.slug || id).trim().toLowerCase();
        const code = String(
          item?.code ||
          item?.voucher ||
          item?.discountCode ||
          envCodeByPartner[id] ||
          ""
        ).trim();
        const note = typeof item?.note === "string" ? item.note.trim() : undefined;
        if (!id || !partner || !slug) return null;
        return { id, partner, slug, code, note } satisfies AffiliateCoupon;
      })
      .filter(Boolean) as AffiliateCoupon[];

    if (normalized.length === 0) {
      return DEFAULT_AFFILIATE_COUPONS.map((item) => ({
        ...item,
        code: envCodeByPartner[item.id] || item.code
      }));
    }

    return normalized;
  } catch {
    return DEFAULT_AFFILIATE_COUPONS.map((item) => ({
      ...item,
      code: envCodeByPartner[item.id] || item.code
    }));
  }
}

function getAffiliateCoupons(): AffiliateCoupon[] {
  const envCoupons = parseAffiliateCouponsFromEnv();
  const merged = new Map<string, AffiliateCoupon>();

  for (const item of DEFAULT_AFFILIATE_COUPONS) {
    merged.set(item.id, item);
  }

  for (const item of envCoupons) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values());
}

function toNum(value: unknown): number | null {
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
}

function normalizeMoneyValue(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  // eSIMAccess values are often scaled by 10,000 (e.g. 57000 => 5.7)
  if (amount >= 1000) {
    return amount / 10000;
  }
  return amount;
}

function formatDataAmount(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  const amount = toNum(value);
  if (amount === null || amount <= 0) {
    return null;
  }

  if (amount >= 1024 * 1024) {
    const gb = amount / (1024 ** 3);
    if (gb >= 1) {
      const rounded = gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10;
      return Number.isInteger(rounded) ? `${rounded.toFixed(0)} GB` : `${rounded} GB`;
    }
    const mb = Math.max(1, Math.round(amount / (1024 ** 2)));
    return `${mb} MB`;
  }

  if (amount <= 100) {
    return Number.isInteger(amount) ? `${amount.toFixed(0)} GB` : `${amount.toFixed(1)} GB`;
  }

  return `${Math.round(amount)} MB`;
}

function normalizeValidityDays(plan: any): number {
  const raw = Number(plan.validityDays || plan.validity || plan.days || plan.duration || 0);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }

  const unit = String(plan.durationUnit || plan.validityUnit || "").trim().toUpperCase();
  if (unit.startsWith("MONTH")) return Math.max(1, Math.round(raw * 30));
  if (unit.startsWith("YEAR")) return Math.max(1, Math.round(raw * 365));
  if (unit.startsWith("HOUR")) return Math.max(1, Math.round(raw / 24));
  return Math.max(1, Math.round(raw));
}

type EsimProviderMode = "generic" | "esimaccess";

function detectEsimProviderMode(baseUrl: string): EsimProviderMode {
  const explicit = String(process.env.ESIM_PROVIDER_MODE || "").trim().toLowerCase();
  if (explicit === "esimaccess") return "esimaccess";
  if (explicit === "generic") return "generic";

  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === "api.esimaccess.com" || host.endsWith(".esimaccess.com")) {
      return "esimaccess";
    }
  } catch {
    // ignore URL parse error and fallback to generic mode
  }

  return "generic";
}

function buildProviderHeaders(mode: EsimProviderMode, apiKey: string, withJsonBody = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (withJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  if (mode === "esimaccess") {
    headers["RT-AccessCode"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function convertToJpy(amount: number, currency: string): number {
  const jpyRate = Number(process.env.ESIM_JPY_EXCHANGE_RATE || 150);
  if (currency.toUpperCase() === "JPY") {
    return amount;
  }
  return amount * (Number.isFinite(jpyRate) && jpyRate > 0 ? jpyRate : 150);
}

function applyEsimMarkup(baseJpy: number): { final: number; diff: number } {
  const markupPercent = Number(process.env.ESIM_MARKUP_PERCENT || 0);
  const markupJpy = Number(process.env.ESIM_MARKUP_JPY || 0);
  const roundStep = Number(process.env.ESIM_PRICE_ROUND_STEP_JPY || 10);
  const safeRoundStep = Number.isFinite(roundStep) && roundStep > 0 ? roundStep : 10;
  const safePercent = Number.isFinite(markupPercent) ? markupPercent : 0;
  const safeMarkupJpy = Number.isFinite(markupJpy) ? markupJpy : 0;
  const rawFinal = baseJpy * (1 + safePercent / 100) + safeMarkupJpy;
  const final = Math.max(baseJpy, Math.ceil(rawFinal / safeRoundStep) * safeRoundStep);
  return {
    final,
    diff: Math.max(0, final - baseJpy)
  };
}

function deriveFeatureList(plan: any): string[] {
  const featureCandidates = Array.isArray(plan?.features)
    ? plan.features
    : Array.isArray(plan?.highlights)
      ? plan.highlights
      : Array.isArray(plan?.benefits)
        ? plan.benefits
        : [];

  const mapped = featureCandidates
    .map((f: any) => (typeof f === "string" ? f : typeof f?.title === "string" ? f.title : ""))
    .map((f: string) => f.trim())
    .filter(Boolean);

  if (mapped.length > 0) {
    return mapped.slice(0, 6);
  }

  return [
    "Data only (no voice/SMS)",
    "Instant digital delivery",
    "Reliable coverage in Japan"
  ];
}

function normalizeEsimPlans(payload: any): EsimPlan[] {
  if (!payload) {
    return [];
  }

  const plans = Array.isArray(payload?.plans)
    ? payload.plans
    : Array.isArray(payload?.obj?.packageList)
      ? payload.obj.packageList
      : Array.isArray(payload?.obj?.plans)
        ? payload.obj.plans
        : Array.isArray(payload)
          ? payload
          : [];

  return plans
    .map((plan: any) => {
      const id = String(plan.id || plan.planId || plan.packageCode || plan.slug || "").trim();
      const name = String(plan.name || plan.title || "eSIM Plan").trim();
      const countryRaw = String(plan.country || plan.countryCode || plan.locationCode || plan.location || "JP").trim().toUpperCase();
      const country = countryRaw.split(",")[0]?.trim() || "JP";
      const data = String(
        plan.data ||
        plan.dataAllowance ||
        formatDataAmount(plan.volume) ||
        formatDataAmount(plan.totalVolume) ||
        "N/A"
      ).trim();
      const validityDays = normalizeValidityDays(plan);
      const currency = String(plan.currency || plan.currencyCode || "USD").trim().toUpperCase();
      const rawPrice = toNum(plan.priceUsd) ?? toNum(plan.price) ?? toNum(plan.amount) ?? toNum(plan.salePrice) ?? 0;
      const priceUsd = normalizeMoneyValue(rawPrice);
      const checkoutUrl = typeof plan.checkoutUrl === "string" ? plan.checkoutUrl : undefined;
      const providerName = typeof plan.providerName === "string" ? plan.providerName : typeof plan.provider === "string" ? plan.provider : undefined;
      const network = typeof plan.network === "string" ? plan.network : undefined;
      const speed = typeof plan.speed === "string" ? plan.speed : typeof plan.speedLevel === "string" ? plan.speedLevel : undefined;
      const coverage = typeof plan.coverage === "string" ? plan.coverage : typeof plan.region === "string" ? plan.region : undefined;
      const description = typeof plan.description === "string" ? plan.description : undefined;

      if (!id || !name || !country || !data || !Number.isFinite(validityDays) || !Number.isFinite(priceUsd)) {
        return null;
      }

      const providerBaseAmountRaw =
        toNum(plan.basePrice) ??
        toNum(plan.originalPrice) ??
        toNum(plan.listPrice) ??
        toNum(plan.compareAtPrice) ??
        toNum(plan.price) ??
        toNum(plan.amount) ??
        toNum(plan.priceUsd) ??
        priceUsd;
      const providerRetailAmountRaw =
        toNum(plan.retailPrice) ??
        toNum(plan.displayPrice) ??
        toNum(plan.salePrice);

      const originalAmount = normalizeMoneyValue(providerBaseAmountRaw ?? priceUsd);
      const originalJpy = Math.round(convertToJpy(originalAmount, currency));
      const saleJpyFromProvider =
        toNum(plan.salePriceJpy) ??
        toNum(plan.displayPriceJpy) ??
        toNum(plan.priceJpy);
      const saleAmountFromProvider = providerRetailAmountRaw !== null
        ? normalizeMoneyValue(providerRetailAmountRaw)
        : null;
      const saleJpyComputed = saleJpyFromProvider !== null
        ? Math.round(saleJpyFromProvider)
        : saleAmountFromProvider !== null
          ? Math.round(convertToJpy(saleAmountFromProvider, currency))
          : applyEsimMarkup(originalJpy).final;
      const saleJpy = Math.max(originalJpy, saleJpyComputed);
      const diffJpy = Math.max(0, saleJpy - originalJpy);
      const discountRate = originalJpy > 0
        ? Math.min(99, Math.max(0, Math.round((diffJpy / originalJpy) * 100)))
        : 0;

      return {
        id,
        name,
        country,
        data,
        validityDays,
        priceUsd,
        currency,
        providerAmountRaw: providerBaseAmountRaw ?? undefined,
        checkoutUrl,
        providerName,
        network,
        speed,
        coverage,
        description,
        basePriceJpy: originalJpy,
        displayPriceJpy: saleJpy,
        priceDiffJpy: diffJpy,
        discountRate,
        features: deriveFeatureList(plan)
      } satisfies EsimPlan;
    })
    .filter(Boolean) as EsimPlan[];
}

function resolveTargetLanguage(language: string): string {
  if (language === "ja") return "JAPANESE (日本語)";
  if (language === "en") return "ENGLISH";
  return "VIETNAMESE (Tiếng Việt)";
}

const DEFAULT_GEMINI_MODELS = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-3-flash-preview"];

function getGeminiModelCandidates(): string[] {
  const configured = String(process.env.GEMINI_MODEL || "").trim();
  const merged = [configured, ...DEFAULT_GEMINI_MODELS].filter(Boolean);
  return Array.from(new Set(merged));
}

async function generateGeminiContentWithFallback(
  ai: GoogleGenAI,
  payload: { contents: string; config?: any }
): Promise<{ response: any; model: string }> {
  const attempts: string[] = [];

  for (const model of getGeminiModelCandidates()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: payload.contents,
        config: payload.config
      });
      return { response, model };
    } catch (error: any) {
      const reason = String(error?.message || error || "unknown error").replace(/\s+/g, " ").trim();
      attempts.push(`${model}: ${reason.slice(0, 180)}`);
    }
  }

  throw new Error(`All configured AI models failed. ${attempts.join(" | ")}`.slice(0, 900));
}

function buildHistoryContext(history: Array<{ role: "user" | "model"; text: string }>): string {
  if (!Array.isArray(history) || history.length === 0) return "";
  return history
    .slice(-12)
    .map((h) => `${h.role === "user" ? "User" : "AI"}: ${String(h.text || "").trim()}`)
    .filter(Boolean)
    .join("\n");
}

function parseJsonFromAiText(rawText: string): any {
  const text = String(rawText || "").trim();
  if (!text) {
    throw new Error("Empty AI response");
  }

  const candidates: string[] = [text];

  // Common format from LLMs: ```json ... ```
  const codeFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeFenceMatch?.[1]) {
    candidates.push(codeFenceMatch[1].trim());
  }

  // Fallback: best-effort extraction between first "{" and last "}".
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  throw new Error("AI returned invalid JSON format");
}

function resolveProviderEndpoint(baseUrl: string, endpointOrUrl: string): URL {
  const raw = String(endpointOrUrl || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    return new URL(raw);
  }
  if (!raw) {
    return new URL(baseUrl);
  }
  if (raw.startsWith("/")) {
    return new URL(raw, baseUrl);
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(raw, normalizedBase);
}

async function fetchEsimPlansFromProvider(country: string): Promise<EsimPlan[] | null> {
  const baseUrl = process.env.ESIM_PROVIDER_BASE_URL;
  const apiKey = process.env.ESIM_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) {
    return null;
  }

  const mode = detectEsimProviderMode(baseUrl);
  const plansEndpoint = process.env.ESIM_PROVIDER_PLANS_PATH || (mode === "esimaccess" ? "/api/v1/open/package/list" : "plans");
  const url = resolveProviderEndpoint(baseUrl, plansEndpoint);

  let resp: Response;
  if (mode === "esimaccess") {
    const payload: Record<string, string> = {
      locationCode: country.toUpperCase()
    };
    const packageType = String(process.env.ESIM_PROVIDER_PACKAGE_TYPE || "").trim();
    if (packageType) {
      payload.type = packageType;
    }

    resp = await fetch(url.toString(), {
      method: "POST",
      headers: buildProviderHeaders(mode, apiKey, true),
      body: JSON.stringify(payload)
    });
  } else {
    url.searchParams.set("country", country.toUpperCase());
    url.searchParams.set("limit", process.env.ESIM_PROVIDER_LIMIT || "200");
    url.searchParams.set("include", "all");

    resp = await fetch(url.toString(), {
      method: "GET",
      headers: buildProviderHeaders(mode, apiKey)
    });
  }

  const responseText = await resp.text();
  let json: any = null;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    throw new Error(`eSIM provider plans error: ${resp.status} endpoint=${url.pathname} body=${responseText.slice(0, 300)}`);
  }

  if (json?.success === false) {
    throw new Error(`eSIM provider plans errorCode=${json?.errorCode || "unknown"} message=${json?.errorMsg || json?.errorMessage || "unknown"} endpoint=${url.pathname}`);
  }

  return normalizeEsimPlans(json);
}

async function createEsimOrderWithProvider(
  planId: string,
  email?: string,
  providerAmountRaw?: unknown
): Promise<{ checkoutUrl?: string; orderId?: string } | null> {
  const baseUrl = process.env.ESIM_PROVIDER_BASE_URL;
  const apiKey = process.env.ESIM_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) {
    return null;
  }

  const mode = detectEsimProviderMode(baseUrl);
  const ordersEndpoint = process.env.ESIM_PROVIDER_ORDERS_PATH || (mode === "esimaccess" ? "/api/v1/open/esim/order" : "orders");
  const url = resolveProviderEndpoint(baseUrl, ordersEndpoint);

  let resp: Response;
  if (mode === "esimaccess") {
    const normalizedAmount = toNum(providerAmountRaw);
    const amountRaw = normalizedAmount !== null && normalizedAmount > 0 ? Math.round(normalizedAmount) : undefined;
    const packageInfo: Record<string, unknown> = {
      packageCode: planId,
      count: 1
    };
    if (amountRaw !== undefined) {
      packageInfo.price = amountRaw;
    }

    const body: Record<string, unknown> = {
      transactionId: `olachill-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      packageInfoList: [packageInfo]
    };
    if (amountRaw !== undefined) {
      body.amount = amountRaw;
    }
    if (email) {
      body.email = email;
    }

    resp = await fetch(url.toString(), {
      method: "POST",
      headers: buildProviderHeaders(mode, apiKey, true),
      body: JSON.stringify(body)
    });
  } else {
    resp = await fetch(url.toString(), {
      method: "POST",
      headers: buildProviderHeaders(mode, apiKey, true),
      body: JSON.stringify({
        planId,
        email
      })
    });
  }

  const responseText = await resp.text();
  let json: any = null;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    throw new Error(`eSIM provider order error: ${resp.status} endpoint=${url.pathname} body=${responseText.slice(0, 300)}`);
  }

  if (json?.success === false) {
    throw new Error(`eSIM provider order errorCode=${json?.errorCode || "unknown"} message=${json?.errorMsg || json?.errorMessage || "unknown"} endpoint=${url.pathname}`);
  }

  const checkoutUrl =
    (typeof json?.checkoutUrl === "string" ? json.checkoutUrl : undefined) ||
    (typeof json?.obj?.checkoutUrl === "string" ? json.obj.checkoutUrl : undefined) ||
    (typeof json?.obj?.paymentUrl === "string" ? json.obj.paymentUrl : undefined) ||
    (typeof json?.obj?.payUrl === "string" ? json.obj.payUrl : undefined);
  const orderId =
    (typeof json?.orderId === "string" ? json.orderId : undefined) ||
    (typeof json?.obj?.orderId === "string" ? json.obj.orderId : undefined) ||
    (typeof json?.obj?.orderNo === "string" ? json.obj.orderNo : undefined);

  return {
    checkoutUrl,
    orderId
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(cors());
  app.use(express.json());
  app.set("trust proxy", true);

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "VoyageAI Server is running" });
  });

  // Public runtime config for client-side features that should not depend on Vite build-time env.
  app.get("/api/public-config", (_req, res) => {
    res.json({
      checkoutBasicUrl: process.env.CHECKOUT_BASIC_URL || process.env.VITE_CHECKOUT_BASIC_URL || "",
      checkoutProUrl: process.env.CHECKOUT_PRO_URL || process.env.VITE_CHECKOUT_PRO_URL || "",
      checkoutUltraUrl: process.env.CHECKOUT_ULTRA_URL || process.env.VITE_CHECKOUT_ULTRA_URL || "",
      affiliateCoupons: getAffiliateCoupons()
    });
  });

  app.post("/api/travel/generate", async (req, res) => {
    const prompt = String(req.body?.prompt || "").trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const language = String(req.body?.language || "vi").trim() as "vi" | "en" | "ja";

    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "GEMINI_API_KEY is not configured on server" });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const targetLang = resolveTargetLanguage(language);
      const historyContext = buildHistoryContext(history);
      const nowText = new Date().toLocaleDateString();

      const requestText = [
        `USER REQUEST: "${prompt}"`,
        historyContext ? `\nCONVERSATION HISTORY:\n${historyContext}` : "",
        "\nCRITICAL INSTRUCTIONS:",
        `1) Respond strictly in ${targetLang}.`,
        "2) Return ONLY ONE valid JSON object.",
        '3) Use "type":"chat" for general Q&A and "type":"plan" only for true multi-day itinerary requests.',
        "4) Include concise, practical travel guidance.",
        "5) Add Google Maps links in summary where relevant.",
        `6) Use search-grounding for current events around date ${nowText}.`
      ]
        .filter(Boolean)
        .join("\n");

      const { response, model } = await generateGeminiContentWithFallback(ai, {
        contents: requestText,
        config: {
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }],
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ["plan", "chat"] },
              destination: { type: Type.STRING },
              summary: { type: Type.STRING },
              itinerarySummary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.STRING },
                    area: { type: Type.STRING },
                    focus: { type: Type.STRING }
                  }
                }
              },
              days: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.STRING },
                    title: { type: Type.STRING },
                    activities: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          time: { type: Type.STRING },
                          activity: { type: Type.STRING },
                          location: { type: Type.STRING },
                          description: { type: Type.STRING },
                          googleMapsUrl: { type: Type.STRING }
                        }
                      }
                    }
                  }
                }
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              hotels: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    area: { type: Type.STRING },
                    priceRange: { type: Type.STRING },
                    description: { type: Type.STRING },
                    bookingUrl: { type: Type.STRING }
                  }
                }
              },
              tickets: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    price: { type: Type.STRING },
                    bookingPoint: { type: Type.STRING },
                    note: { type: Type.STRING }
                  }
                }
              },
              transportation: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    provider: { type: Type.STRING },
                    price: { type: Type.STRING },
                    details: { type: Type.STRING }
                  }
                }
              },
              events: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    date: { type: Type.STRING },
                    location: { type: Type.STRING },
                    description: { type: Type.STRING },
                    type: { type: Type.STRING }
                  }
                }
              },
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    query: { type: Type.STRING },
                    icon: { type: Type.STRING }
                  }
                }
              }
            },
            required: ["destination", "summary", "tips", "suggestions"]
          }
        }
      });
      console.log(`travel/generate model=${model}`);

      try {
        const parsed = parseJsonFromAiText(String(response.text || ""));
        res.json(parsed);
      } catch (parseError) {
        const detail = parseError instanceof Error ? parseError.message : "AI returned invalid JSON format";
        res.status(502).json({ error: detail });
      }
    } catch (error) {
      console.error("travel/generate failed:", error);
      const detail = error instanceof Error ? error.message : "Failed to generate travel plan from AI";
      res.status(502).json({ error: detail.slice(0, 500) });
    }
  });

  app.post("/api/travel/place-info", async (req, res) => {
    const placeName = String(req.body?.placeName || "").trim();
    const language = String(req.body?.language || "vi").trim() as "vi" | "en" | "ja";

    if (!placeName) {
      res.status(400).json({ error: "placeName is required" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "GEMINI_API_KEY is not configured on server" });
      return;
    }

    const langPrompt = language === "ja"
      ? "日本語で簡潔に説明してください。"
      : language === "en"
        ? "Please explain briefly in English."
        : "Trình bày ngắn gọn bằng tiếng Việt.";

    try {
      const ai = new GoogleGenAI({ apiKey });
      const { response, model } = await generateGeminiContentWithFallback(ai, {
        contents: `Detailed information about: ${placeName}. Include highlights and practical tips for travelers. ${langPrompt}`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      console.log(`travel/place-info model=${model}`);

      res.json({
        text: response.text || "No information.",
        grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      });
    } catch (error) {
      console.error("travel/place-info failed:", error);
      res.status(502).json({ error: "Failed to load place info" });
    }
  });

  // Branded redirect route to keep affiliate URLs hidden from frontend/UI.
  app.get("/go/:slug", (req, res) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const target = getPartnerLinks()[slug];

    if (!target) {
      res.status(404).send("Link not found");
      return;
    }

    const clickMeta = {
      ts: new Date().toISOString(),
      slug,
      ip: req.ip,
      ua: req.get("user-agent") || "",
      referer: req.get("referer") || ""
    };
    console.log("partner_click", JSON.stringify(clickMeta));
    res.redirect(302, target);
  });

  app.get("/api/esim/plans", async (req, res) => {
    const country = String(req.query.country || "JP").trim().toUpperCase();
    const providerConfigured = isEsimProviderConfigured();

    try {
      const providerPlans = await fetchEsimPlansFromProvider(country);
      if (providerPlans && providerPlans.length > 0) {
        res.json({
          source: "provider",
          providerConfigured,
          plans: providerPlans
        });
        return;
      }
    } catch (error) {
      console.error("eSIM provider plans failed:", error);
    }

    const localPlans = DEFAULT_ESIM_PLANS.filter((p) => p.country === country);
    res.json({
      source: "local-fallback",
      providerConfigured,
      plans: localPlans.length > 0 ? localPlans : DEFAULT_ESIM_PLANS
    });
  });

  app.post("/api/esim/order", async (req, res) => {
    const { planId, email, providerAmountRaw } = req.body || {};

    if (typeof planId !== "string" || !planId.trim()) {
      res.status(400).json({ error: "planId is required" });
      return;
    }

    if (!isEsimProviderConfigured()) {
      res.status(503).json({
        error: "eSIM provider is not configured on server",
        hint: "Set ESIM_PROVIDER_BASE_URL and ESIM_PROVIDER_API_KEY",
        providerConfigured: false
      });
      return;
    }

    try {
      const providerOrder = await createEsimOrderWithProvider(
        planId,
        typeof email === "string" ? email : undefined,
        providerAmountRaw
      );
      if (providerOrder) {
        res.json({
          source: "provider",
          ...providerOrder
        });
        return;
      }
    } catch (error) {
      console.error("eSIM provider order failed:", error);
      res.status(502).json({ error: "Failed to create eSIM order with provider" });
      return;
    }

    res.status(502).json({
      error: "Failed to create eSIM order with provider"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
