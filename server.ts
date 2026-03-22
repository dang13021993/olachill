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
      const priceUsd = Number(plan.priceUsd || plan.price || 0);
      const currency = String(plan.currency || "USD").trim().toUpperCase();
      const checkoutUrl = typeof plan.checkoutUrl === "string" ? plan.checkoutUrl : undefined;

      if (!id || !name || !country || !data || !Number.isFinite(validityDays) || !Number.isFinite(priceUsd)) {
        return null;
      }

      return {
        id,
        name,
        country,
        data,
        validityDays,
        priceUsd,
        currency,
        checkoutUrl
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
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.set("trust proxy", true);

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "VoyageAI Server is running" });
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
