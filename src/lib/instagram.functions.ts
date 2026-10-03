import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export async function getMetaCredentialsForUser(supabase: any, userId: string) {
  // Query user settings
  const { data, error } = await supabase
    .from("user_settings")
    .select("meta_credential_profile")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar configurações de credenciais da Meta:", error);
  }

  const profile = data?.meta_credential_profile || "default";

  let appId = "";
  let appSecret = "";

  if (profile === "matheus" && process.env.META_APP_ID_MATHEUS) {
    appId = process.env.META_APP_ID_MATHEUS;
    appSecret = process.env.META_APP_SECRET_MATHEUS || "";
  } else if (profile === "pedro" && process.env.META_APP_ID_PEDRO) {
    appId = process.env.META_APP_ID_PEDRO;
    appSecret = process.env.META_APP_SECRET_PEDRO || "";
  } else if (profile === "antonio" && process.env.META_APP_ID_ANTONIO) {
    appId = process.env.META_APP_ID_ANTONIO;
    appSecret = process.env.META_APP_SECRET_ANTONIO || "";
  } else if (profile === "greg" && process.env.META_APP_ID_GREG) {
    appId = process.env.META_APP_ID_GREG;
    appSecret = process.env.META_APP_SECRET_GREG || "";
  } else {
    // Default Meta App credentials
    appId =
      process.env.META_APP_ID ||
      process.env.META_APP_ID_GUILHERME ||
      import.meta.env.VITE_META_APP_ID ||
      "1640486920796202";
    appSecret =
      process.env.META_APP_SECRET ||
      process.env.META_APP_SECRET_GUILHERME ||
      "bf711ee7f8430d977a2c55e595efa8fe";
  }

  // Clean the app ID
  const cleanedAppId = appId?.toString()?.match(/\d+/)?.[0] ?? "1640486920796202";

  return { appId: cleanedAppId, appSecret, profile };
}

// ─── Token de Estado Seguro para Dolphin / Anti-Detect ────────────────────────
export async function createSecureStateToken(userId: string, expiresInHours = 168): Promise<string> {
  const crypto = await import("crypto");
  const expiresAt = Date.now() + Math.max(1, expiresInHours) * 3600 * 1000;
  const payload = `${userId}:${expiresAt}`;
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.META_APP_SECRET ||
    "reelary_secure_state_secret_2026";
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export async function verifySecureStateToken(token: string): Promise<{
  valid: boolean;
  userId?: string;
  expiresAt?: number;
  error?: string;
}> {
  try {
    if (!token || typeof token !== "string") {
      return { valid: false, error: "Token de estado não fornecido." };
    }
    const parts = token.split(".");
    if (parts.length !== 2) {
      return { valid: false, error: "Formato de token de estado inválido." };
    }
    const [b64Payload, signature] = parts;
    const payload = Buffer.from(b64Payload, "base64url").toString("utf-8");
    const [userId, expiresAtStr] = payload.split(":");
    if (!userId || !expiresAtStr) {
      return { valid: false, error: "Conteúdo do token inválido." };
    }
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, error: "O link de autorização expirou. Gere um novo link no painel." };
    }
    const crypto = await import("crypto");
    const secret =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.META_APP_SECRET ||
      "reelary_secure_state_secret_2026";
    const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (signature !== expectedSignature) {
      return { valid: false, error: "Assinatura do token de estado inválida." };
    }
    return { valid: true, userId, expiresAt };
  } catch (e: any) {
    return { valid: false, error: "Erro na verificação do token: " + (e?.message ?? e) };
  }
}

async function resolveAuthUser(stateToken?: string): Promise<{ userId: string; supabase: any }> {
  // 1. Prioridade 1: Se um stateToken foi passado (fluxo Dolphin / Navegador Externo)
  if (stateToken) {
    const verified = await verifySecureStateToken(stateToken);
    if (verified.valid && verified.userId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return { userId: verified.userId, supabase: supabaseAdmin };
    }
    console.warn("[Auth] Invalid or expired state token:", verified.error);
  }

  // 2. Prioridade 2: Cabeçalho de autorização Bearer da sessão Supabase
  try {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const SUPABASE_URL =
        process.env.SUPABASE_URL ||
        import.meta.env.VITE_SUPABASE_URL ||
        "https://mbvjnqaufjykgpjkudju.supabase.co";
      const SUPABASE_PUBLISHABLE_KEY =
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1idmpucWF1Zmp5a2dwamt1ZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2ODEyNjgsImV4cCI6MjEwMzI1NzI2OH0.DoGk9MP_bgMg0ewqy3ftJFRc67wUwE0EFmukMbi8HKo";

      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { data, error } = await supabase.auth.getClaims(token);
      if (!error && data?.claims?.sub) {
        return { userId: data.claims.sub, supabase };
      }
    }
  } catch (err) {
    console.error("[Auth] Error parsing authorization header:", err);
  }

  throw new Error("Não autorizado: Sessão não encontrada e link de conexão inválido ou expirado.");
}

// Returns the public Meta App ID and profile so the client can build the OAuth URL.
export const getMetaAppId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { appId, profile } = await getMetaCredentialsForUser(supabase, userId);
    return { appId, profile };
  });

// Gera link de autorização assinado para colar no Dolphin / Navegador Anti-Detect
export const generateMetaConnectLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        provider: z.enum(["facebook", "instagram"]).default("facebook"),
        origin: z.string().optional(),
        expiresInHours: z.number().min(1).max(720).default(168),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { appId, profile } = await getMetaCredentialsForUser(supabase, userId);
    if (!appId) {
      throw new Error("Meta App ID não configurado no servidor.");
    }

    const stateToken = await createSecureStateToken(userId, data.expiresInHours);
    const origin = (data.origin || "https://reelary-2-steel.vercel.app").replace(/\/+$/, "");

    let authUrl = "";
    if (data.provider === "instagram") {
      const igAppId = process.env.INSTAGRAM_APP_ID || "1386867933636927";
      const redirectUri = `${origin}/auth/instagram/callback`;
      const params = new URLSearchParams({
        force_reauth: "true",
        client_id: igAppId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope:
          "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages,instagram_business_manage_comments",
        state: stateToken,
      });
      authUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
    } else {
      const redirectUri = `${origin}/auth/facebook/callback`;
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope:
          "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management",
        state: stateToken,
      });
      authUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
    }

    return {
      authUrl,
      stateToken,
      appId,
      profile,
      expiresInHours: data.expiresInHours,
    };
  });

// ─── Método 1 (Instagram Login direto) ──────────────────────────────────────────
// Exchanges the OAuth `code` for an access_token, fetches the IG account
// info, and persists the connection in `instagram_accounts`.
export const connectInstagramAccount = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        code: z.string().min(1).max(2000),
        redirectUri: z.string().url().max(500),
        state: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { userId, supabase } = await resolveAuthUser(data.state);
    const igAppId = process.env.INSTAGRAM_APP_ID || "1386867933636927";
    const igAppSecret = process.env.INSTAGRAM_APP_SECRET || "b98e65415d47d5f2f98aceec0df2f984";

    // 1. Trocar code por short-lived access token (Instagram Login)
    // Remove qualquer fragmento extra adicionado por redirecionamentos da Meta
    const cleanCode = data.code.replace(/#_.*$/, "");
    const tokenParams = new URLSearchParams();
    tokenParams.set("client_id", igAppId);
    tokenParams.set("client_secret", igAppSecret);
    tokenParams.set("grant_type", "authorization_code");
    tokenParams.set("redirect_uri", data.redirectUri);
    tokenParams.set("code", cleanCode);

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: tokenParams,
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Short-lived token exchange failed:", err);
      throw new Error(
        "Falha na troca do código por token do Instagram. Resposta da Meta: " + err,
      );
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      user_id: string | number;
    };

    let accessToken = tokenJson.access_token;
    let expiresIn = 0;

    // 2. Trocar por long-lived token (60 dias)
    try {
      const llUrl = new URL("https://graph.instagram.com/access_token");
      llUrl.searchParams.set("grant_type", "ig_exchange_token");
      llUrl.searchParams.set("client_secret", igAppSecret);
      llUrl.searchParams.set("access_token", accessToken);
      const llRes = await fetch(llUrl.toString());
      if (llRes.ok) {
        const llJson = (await llRes.json()) as { access_token: string; expires_in?: number };
        accessToken = llJson.access_token;
        expiresIn = llJson.expires_in ?? 5184000;
      } else {
        const err = await llRes.text();
        console.warn("Long-lived token exchange warning, using short-lived:", err);
      }
    } catch (e: any) {
      console.warn("Long-lived token exchange warning:", e);
    }

    // 3. Buscar profile do usuário para obter o username e instagram_user_id
    let instagramUserId = String(tokenJson.user_id || "");
    let username = "";

    try {
      const meRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`,
      );
      if (meRes.ok) {
        const meJson = await meRes.json();
        if (meJson.id) instagramUserId = String(meJson.id);
        if (meJson.username) username = meJson.username;
      }
    } catch (e) {
      console.warn("Error fetching /v21.0/me:", e);
    }

    if (!username) {
      try {
        const meRes = await fetch(
          `https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`,
        );
        if (meRes.ok) {
          const meJson = await meRes.json();
          if (meJson.id) instagramUserId = String(meJson.id);
          if (meJson.username) username = meJson.username;
        }
      } catch (_) {}
    }

    if (!username) {
      username = `insta_${instagramUserId}`;
    }

    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    const { error } = await supabase.from("instagram_accounts").upsert(
      {
        user_id: userId,
        instagram_user_id: instagramUserId,
        username: username,
        access_token: accessToken,
        token_expires_at: expiresAt,
        token_invalid: false,
      },
      { onConflict: "user_id,instagram_user_id" } as never,
    );
    if (error) {
      // Fallback: insert simples se não houver unique constraint
      const { error: insErr } = await supabase.from("instagram_accounts").insert({
        user_id: userId,
        instagram_user_id: instagramUserId,
        username: username,
        access_token: accessToken,
        token_expires_at: expiresAt,
        token_invalid: false,
      });
      if (insErr) throw new Error(insErr.message);
    }

    return { username, instagramUserId };
  });

// ─── Método 2 (Facebook Login → IG Business via Page) ───────────────────────────
// Exchanges Facebook OAuth `code` for access_token, finds the user's Facebook
// Page, resolves the linked Instagram Business account, and persists it.
export const connectFacebookAccount = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        code: z.string().min(1).max(2000),
        redirectUri: z.string().url().max(500),
        state: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { userId, supabase } = await resolveAuthUser(data.state);
    const { appId, appSecret } = await getMetaCredentialsForUser(supabase, userId);
    if (!appId || !appSecret) {
      throw new Error("Meta App credentials não configuradas no servidor.");
    }

    // 1. Trocar code por access_token via Facebook Graph API
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", data.redirectUri);
    tokenUrl.searchParams.set("code", data.code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Facebook token exchange failed:", err);
      throw new Error("Falha na troca do código Facebook por token.");
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      token_type: string;
      expires_in?: number;
    };

    const userAccessToken = tokenJson.access_token;
    const userExpiresIn = tokenJson.expires_in ?? 0;

    // 2. Trocar por long-lived user token
    let longLivedUserToken = userAccessToken;
    let longLivedExpiresIn = userExpiresIn;
    try {
      const llUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
      llUrl.searchParams.set("grant_type", "fb_exchange_token");
      llUrl.searchParams.set("client_id", appId);
      llUrl.searchParams.set("client_secret", appSecret);
      llUrl.searchParams.set("fb_exchange_token", userAccessToken);
      const llRes = await fetch(llUrl.toString());
      if (llRes.ok) {
        const llJson = (await llRes.json()) as { access_token: string; expires_in?: number };
        longLivedUserToken = llJson.access_token;
        longLivedExpiresIn = llJson.expires_in ?? 5184000; // default 60 days
      } else {
        console.warn("Long-lived user token exchange failed, using short-lived token.");
      }
    } catch (e) {
      console.warn("Long-lived user token exchange error:", e);
    }

    // 3. Buscar as Páginas do Facebook do usuário
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(longLivedUserToken)}`,
    );
    if (!pagesRes.ok) {
      const err = await pagesRes.text();
      console.error("Facebook pages fetch failed:", err);
      throw new Error("Não foi possível buscar as Páginas do Facebook. Verifique as permissões.");
    }
    const pagesJson = (await pagesRes.json()) as {
      data: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string };
      }>;
    };

    if (!pagesJson.data || pagesJson.data.length === 0) {
      throw new Error(
        "Nenhuma Página do Facebook encontrada. Crie uma Página e vincule ao Instagram Business.",
      );
    }

    // 4. Encontrar a primeira página com conta IG Business vinculada
    const pageWithIg = pagesJson.data.find((p) => p.instagram_business_account?.id);
    if (!pageWithIg || !pageWithIg.instagram_business_account) {
      throw new Error(
        "Nenhuma das suas Páginas do Facebook possui uma conta Instagram Business vinculada. " +
          "Vincule sua conta Instagram Business a uma Página do Facebook e tente novamente.",
      );
    }

    const pageAccessToken = pageWithIg.access_token; // Page token (EAA...), never expires while page exists
    const igBusinessId = pageWithIg.instagram_business_account.id;

    // 5. Buscar username da conta IG Business
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${igBusinessId}?fields=id,username&access_token=${encodeURIComponent(pageAccessToken)}`,
    );
    if (!igRes.ok) {
      const err = await igRes.text();
      console.error("IG Business account fetch failed:", err);
      throw new Error("Não foi possível buscar as informações da conta Instagram Business.");
    }
    const igJson = (await igRes.json()) as { id: string; username: string };

    const instagramUserId = igJson.id;
    const username = igJson.username;
    const expiresAt =
      longLivedExpiresIn > 0
        ? new Date(Date.now() + longLivedExpiresIn * 1000).toISOString()
        : null;

    // 6. Salvar na tabela instagram_accounts (usando o Page access token)
    const { error } = await supabase.from("instagram_accounts").upsert(
      {
        user_id: userId,
        instagram_user_id: instagramUserId,
        username: username,
        access_token: pageAccessToken,
        token_expires_at: expiresAt,
        token_invalid: false,
      },
      { onConflict: "user_id,instagram_user_id" } as never,
    );
    if (error) {
      // Fallback: insert simples
      const { error: insErr } = await supabase.from("instagram_accounts").insert({
        user_id: userId,
        instagram_user_id: instagramUserId,
        username: username,
        access_token: pageAccessToken,
        token_expires_at: expiresAt,
        token_invalid: false,
      });
      if (insErr) throw new Error(insErr.message);
    }

    return { username, instagramUserId };
  });

export const getAvailableMetaAppIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const rawDefault =
      process.env.META_APP_ID ||
      process.env.META_APP_ID_GUILHERME ||
      import.meta.env.VITE_META_APP_ID ||
      "1640486920796202";
    const rawMatheus = process.env.META_APP_ID_MATHEUS || "";
    const rawPedro = process.env.META_APP_ID_PEDRO || "";
    const rawAntonio = process.env.META_APP_ID_ANTONIO || "";
    const rawGreg = process.env.META_APP_ID_GREG || "";
    const defaultAppId = rawDefault.match(/\d+/)?.[0] ?? "1640486920796202";
    const matheusAppId = rawMatheus.match(/\d+/)?.[0] ?? null;
    const pedroAppId = rawPedro.match(/\d+/)?.[0] ?? null;
    const antonioAppId = rawAntonio.match(/\d+/)?.[0] ?? null;
    const gregAppId = rawGreg.match(/\d+/)?.[0] ?? null;

    return {
      guilherme: defaultAppId,
      default: defaultAppId,
      matheus: matheusAppId,
      pedro: pedroAppId,
      antonio: antonioAppId,
      greg: gregAppId,
    };
  });

export const getPublishedReelsWithPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        accountId: z.string().optional(),
        limit: z.number().default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let query = supabase
      .from("instagram_accounts")
      .select("id, username, access_token, profile_picture_url, account_categories(id, name, color)")
      .eq("user_id", userId)
      .eq("hidden", false)
      .not("access_token", "is", null);

    if (data.accountId && data.accountId !== "all") {
      query = query.eq("id", data.accountId);
    }

    const { data: accounts, error: accErr } = await query;
    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) return [];

    const allPublished: any[] = [];

    // Fetch media from each account
    await Promise.all(
      accounts.map(async (acc) => {
        if (!acc.access_token) return;
        try {
          const url = `https://graph.instagram.com/v21.0/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=10&access_token=${acc.access_token}`;
          const res = await fetch(url);
          if (!res.ok) return;

          const resData = await res.json();
          const mediaList = resData.data || [];

          for (const m of mediaList) {
            let views = 0;
            let reach = 0;

            try {
              const insRes = await fetch(
                `https://graph.instagram.com/v21.0/${m.id}/insights?metric=views,reach,total_interactions&access_token=${acc.access_token}`,
              );
              if (insRes.ok) {
                const insData = await insRes.json();
                for (const row of insData.data || []) {
                  if (row.name === "views") views = row.values?.[0]?.value || 0;
                  if (row.name === "reach") reach = row.values?.[0]?.value || 0;
                }
              }
            } catch (_) {}

            allPublished.push({
              id: m.id,
              instagram_account_id: acc.id,
              username: acc.username,
              profile_picture_url: acc.profile_picture_url,
              account_categories: (acc as any).account_categories,
              caption: m.caption || "",
              media_url: m.media_url,
              thumbnail_url: m.thumbnail_url || m.media_url,
              permalink: m.permalink,
              timestamp: m.timestamp,
              likes_count: m.like_count || 0,
              comments_count: m.comments_count || 0,
              views_count: views,
              reach_count: reach,
            });
          }
        } catch (_) {}
      }),
    );

    // Sort by publication date descending
    allPublished.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return allPublished.slice(0, data.limit);
  });
