import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let targetAccountId: string | null = null;
    try {
      const body = await req.json();
      if (body && body.account_id) targetAccountId = body.account_id;
    } catch (_) {
      // Body may be empty on plain GET/POST
    }

    // Fetch accounts to sync
    let query = supabase
      .from("instagram_accounts")
      .select("id, instagram_user_id, access_token, username, user_id")
      .eq("hidden", false);

    if (targetAccountId) {
      query = query.eq("id", targetAccountId);
    }

    const { data: accounts, error: accErr } = await query;
    if (accErr) throw accErr;

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma conta para sincronizar.", accounts_synced: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const todayDate = new Date().toISOString().split("T")[0];
    const nowIso = new Date().toISOString();

    // Helper to process a single account with high speed field expansion
    async function syncSingleAccount(acc: any) {
      console.log(`[Sync-Insights] Syncing @${acc.username}...`);
      try {
        if (!acc.access_token) {
          throw new Error("Token de acesso ausente.");
        }

        const isIgToken = acc.access_token.startsWith("IGAA") || acc.access_token.startsWith("IG");
        const baseUrl = isIgToken ? "https://graph.instagram.com/v21.0" : "https://graph.facebook.com/v21.0";

        // 1. Fetch Profile & Check Health (in parallel with media)
        let profileUrl = `${baseUrl}/me?fields=id,username,name,followers_count,follows_count,media_count,profile_picture_url&access_token=${acc.access_token}`;
        if (!isIgToken) {
          profileUrl = `${baseUrl}/${acc.instagram_user_id}?fields=id,username,name,followers_count,media_count,profile_picture_url&access_token=${acc.access_token}`;
        }

        // 2. Fetch Media WITH Nested Insights (1 single API call instead of 25 calls!)
        let mediaUrl = `${baseUrl}/me/media?fields=id,caption,media_type,timestamp,like_count,comments_count,insights.metric(views,reach,total_interactions)&limit=15&access_token=${acc.access_token}`;
        if (!isIgToken) {
          mediaUrl = `${baseUrl}/${acc.instagram_user_id}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,insights.metric(views,reach,total_interactions)&limit=15&access_token=${acc.access_token}`;
        }

        const [profileRes, mediaRes] = await Promise.all([
          fetch(profileUrl),
          fetch(mediaUrl),
        ]);

        if (!profileRes.ok) {
          const errData = await profileRes.json().catch(() => ({}));
          const errCode = errData.error?.code;
          const errMsg = errData.error?.message || "Erro de autenticação com a Meta.";

          let healthStatus = "warning";
          let healthReason = errMsg;
          let tokenInvalid = false;

          if (errCode === 190) {
            healthStatus = "token_expired";
            healthReason = "Token de acesso expirado. Reconecte a conta no painel.";
            tokenInvalid = true;
          } else if (errCode === 200 || errCode === 368) {
            healthStatus = "restricted";
            healthReason = "Restrição temporária da Meta (API access blocked). Aguarde a liberação.";
          }

          await supabase
            .from("instagram_accounts")
            .update({
              health_status: healthStatus,
              health_reason: healthReason,
              token_invalid: tokenInvalid,
              last_health_check_at: nowIso,
            })
            .eq("id", acc.id);

          return {
            id: acc.id,
            username: acc.username,
            status: "error",
            health_status: healthStatus,
            error: healthReason,
          };
        }

        const profileData = await profileRes.json();
        const followersCount = profileData.followers_count || 0;
        const mediaCount = profileData.media_count || 0;
        const profilePictureUrl = profileData.profile_picture_url || null;

        let totalViews = 0;
        let totalReach = 0;
        let totalLikes = 0;
        let totalComments = 0;
        let totalInteractions = 0;

        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          const mediaList = mediaData.data || [];

          for (const item of mediaList) {
            const likes = item.like_count || 0;
            const comments = item.comments_count || 0;
            totalLikes += likes;
            totalComments += comments;

            let views = 0;
            let reach = 0;
            let interactions = likes + comments;

            // Extract nested insights
            if (item.insights && Array.isArray(item.insights.data)) {
              for (const metric of item.insights.data) {
                const val = metric.values?.[0]?.value || 0;
                if (metric.name === "views") views = val;
                if (metric.name === "reach") reach = val;
                if (metric.name === "total_interactions") interactions = val;
              }
            }

            totalViews += views > 0 ? views : (likes + comments);
            totalReach += reach > 0 ? reach : views;
            totalInteractions += interactions;

            // Update matching scheduled_post if found
            if (item.id) {
              await supabase
                .from("scheduled_posts")
                .update({
                  views_count: views,
                  reach_count: reach,
                  likes_count: likes,
                  comments_count: comments,
                  ig_media_id: item.id,
                })
                .eq("ig_container_id", item.id);
            }
          }
        }

        // Calculate engagement rate
        const baseCount = followersCount > 0 ? followersCount : (mediaCount > 0 ? mediaCount * 10 : 100);
        const engagementRate = Number(((totalInteractions / baseCount) * 100).toFixed(2));

        // Update instagram_accounts
        await supabase
          .from("instagram_accounts")
          .update({
            followers_count: followersCount,
            media_count: mediaCount,
            total_views: totalViews,
            total_reach: totalReach,
            total_likes: totalLikes,
            total_comments: totalComments,
            engagement_rate: engagementRate,
            profile_picture_url: profilePictureUrl,
            health_status: "healthy",
            health_reason: null,
            token_invalid: false,
            last_health_check_at: nowIso,
            metrics_updated_at: nowIso,
          })
          .eq("id", acc.id);

        // Record Daily Snapshot
        try {
          await supabase.from("account_daily_metrics").upsert(
            {
              instagram_account_id: acc.id,
              date: todayDate,
              followers_count: followersCount,
              total_views: totalViews,
              total_reach: totalReach,
              total_likes: totalLikes,
            },
            { onConflict: "instagram_account_id,date" },
          );
        } catch (_) {}

        return {
          id: acc.id,
          username: acc.username,
          status: "success",
          health_status: "healthy",
          views: totalViews,
          reach: totalReach,
          likes: totalLikes,
          media_count: mediaCount,
          engagement_rate: engagementRate,
        };
      } catch (err: any) {
        console.error(`[Sync-Insights] Exception for @${acc.username}:`, err);
        return {
          id: acc.id,
          username: acc.username,
          status: "error",
          health_status: "warning",
          error: err.message,
        };
      }
    }

    // Process accounts in parallel chunks of 5
    const results: any[] = [];
    const chunkSize = 5;
    for (let i = 0; i < accounts.length; i += chunkSize) {
      const chunk = accounts.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map((acc) => syncSingleAccount(acc)));
      results.push(...chunkResults);
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts_synced: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[Sync-Insights] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
