import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";

type PartnerLinkMap = Record<string, string>;

interface EsimPlan {
  id: string;
  name: string;
  country: string;
  data: string;
  validityDays: number;
  priceUsd: number;
  currency: string;
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

const DEFAULT_PARTNER_LINKS: PartnerLinkMap = {
  "tokyo-disneyland": "https://www.tokyodisneyresort.jp/en/tdl/ticket/",
  "usj": "https://www.usj.co.jp/web/en/us/tickets",
  "teamlab-borderless": "https://www.teamlab.art/e/borderless-azabudai/",
  "shibuya-sky": "https://www.shibuya-scramble-square.com/sky/ticket/en/",
  "ghibli-museum": "https://www.ghibli-museum.jp/en/tickets/",
  "tokyo-skytree": "https://www.tokyo-skytree.jp/en/ticket/",
  "kyoto-kimono": "https://www.yumeyakata.com/english/",
  "nara-deer-park": "https://www.visitnara.jp/"
};

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

function toNum(value: unknown): number | null {
  const v = Number(value);
  return Number.isFinite(v) ? v : null;
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

  const plans = Array.isArray(payload?.plans) ? payload.plans : Array.isArray(payload) ? payload : [];

  return plans
    .map((plan: any) => {
      const id = String(plan.id || plan.planId || "").trim();
      const name = String(plan.name || plan.title || "eSIM Plan").trim();
      const country = String(plan.country || plan.countryCode || "JP").trim().toUpperCase();
      const data = String(plan.data || plan.dataAllowance || "N/A").trim();
      const validityDays = Number(plan.validityDays || plan.validity || plan.days || 0);
      const priceUsd = Number(plan.priceUsd || plan.price || plan.amount || plan.salePrice || 0);
      const currency = String(plan.currency || "USD").trim().toUpperCase();
      const checkoutUrl = typeof plan.checkoutUrl === "string" ? plan.checkoutUrl : undefined;
      const providerName = typeof plan.providerName === "string" ? plan.providerName : typeof plan.provider === "string" ? plan.provider : undefined;
      const network = typeof plan.network === "string" ? plan.network : undefined;
      const speed = typeof plan.speed === "string" ? plan.speed : undefined;
      const coverage = typeof plan.coverage === "string" ? plan.coverage : typeof plan.region === "string" ? plan.region : undefined;
      const description = typeof plan.description === "string" ? plan.description : undefined;

      if (!id || !name || !country || !data || !Number.isFinite(validityDays) || !Number.isFinite(priceUsd)) {
        return null;
      }

      const providerBaseAmount =
        toNum(plan.basePrice) ??
        toNum(plan.originalPrice) ??
        toNum(plan.listPrice) ??
        toNum(plan.compareAtPrice) ??
        priceUsd;
      const originalAmount = providerBaseAmount ?? priceUsd;
      const originalJpy = Math.round(convertToJpy(originalAmount, currency));
      const saleJpyFromProvider =
        toNum(plan.salePriceJpy) ??
        toNum(plan.displayPriceJpy) ??
        toNum(plan.salePrice) ??
        toNum(plan.priceJpy);
      const saleJpyComputed = saleJpyFromProvider !== null
        ? Math.round(convertToJpy(saleJpyFromProvider, currency))
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

async function fetchEsimPlansFromProvider(country: string): Promise<EsimPlan[] | null> {
  const baseUrl = process.env.ESIM_PROVIDER_BASE_URL;
  const apiKey = process.env.ESIM_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) {
    return null;
  }

  const url = new URL("/plans", baseUrl);
  url.searchParams.set("country", country.toUpperCase());
  url.searchParams.set("limit", process.env.ESIM_PROVIDER_LIMIT || "200");
  url.searchParams.set("include", "all");

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  if (!resp.ok) {
    throw new Error(`eSIM provider plans error: ${resp.status}`);
  }

  const json = await resp.json();
  return normalizeEsimPlans(json);
}

async function createEsimOrderWithProvider(planId: string, email?: string): Promise<{ checkoutUrl?: string; orderId?: string } | null> {
  const baseUrl = process.env.ESIM_PROVIDER_BASE_URL;
  const apiKey = process.env.ESIM_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) {
    return null;
  }

  const url = new URL("/orders", baseUrl);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      planId,
      email
    })
  });

  if (!resp.ok) {
    throw new Error(`eSIM provider order error: ${resp.status}`);
  }

  const json: any = await resp.json();
  return {
    checkoutUrl: typeof json?.checkoutUrl === "string" ? json.checkoutUrl : undefined,
    orderId: typeof json?.orderId === "string" ? json.orderId : undefined
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
      checkoutUltraUrl: process.env.CHECKOUT_ULTRA_URL || process.env.VITE_CHECKOUT_ULTRA_URL || ""
    });
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

    try {
      const providerPlans = await fetchEsimPlansFromProvider(country);
      if (providerPlans && providerPlans.length > 0) {
        res.json({
          source: "provider",
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
      plans: localPlans.length > 0 ? localPlans : DEFAULT_ESIM_PLANS
    });
  });

  app.post("/api/esim/order", async (req, res) => {
    const { planId, email } = req.body || {};

    if (typeof planId !== "string" || !planId.trim()) {
      res.status(400).json({ error: "planId is required" });
      return;
    }

    try {
      const providerOrder = await createEsimOrderWithProvider(planId, typeof email === "string" ? email : undefined);
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

    res.status(501).json({
      error: "eSIM provider is not configured on server",
      hint: "Set ESIM_PROVIDER_BASE_URL and ESIM_PROVIDER_API_KEY"
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
