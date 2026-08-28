import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const graphApiUrl = "https://graph.facebook.com/v21.0";

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
        JSON.stringify({ success: true, message: "No accounts to sync.", accounts_synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: any[] = [];
    const todayDate = new Date().toISOString().split("T")[0];

    for (const acc of accounts) {
      console.log(`[Sync-Insights] Syncing account @${acc.username} (${acc.id})...`);
      const nowIso = new Date().toISOString();

      try {
        // 1. Fetch Basic Profile & Check Token Health
        const profileRes = await fetch(
          `${graphApiUrl}/${acc.instagram_user_id}?fields=id,username,name,followers_count,media_count,profile_picture_url&access_token=${acc.access_token}`,
        );

        if (!profileRes.ok) {
          const errData = await profileRes.json().catch(() => ({}));
          const errCode = errData.error?.code;
          const errMsg = errData.error?.message || "Erro de autenticação com a Meta.";

          console.warn(`[Sync-Insights] Account @${acc.username} error:`, errData);

          let healthStatus = "warning";
          let healthReason = errMsg;

          if (errCode === 190) {
            healthStatus = "token_expired";
            healthReason = "Token de acesso expirado. Reconecte a conta no painel de configurações.";
          } else if (errCode === 200 || errCode === 368) {
            healthStatus = "restricted";
            healthReason = "Restrição temporária de postagem pela Meta (API access blocked). Aguarde o término do bloqueio de segurança.";
          }

          await supabase
            .from("instagram_accounts")
            .update({
              health_status: healthStatus,
              health_reason: healthReason,
              last_health_check_at: nowIso,
            })
            .eq("id", acc.id);

          results.push({
            id: acc.id,
            username: acc.username,
            status: "error",
            health_status: healthStatus,
            error: healthReason,
          });
          continue;
        }

        const profileData = await profileRes.json();
        const followersCount = profileData.followers_count || 0;
        const mediaCount = profileData.media_count || 0;
        const profilePictureUrl = profileData.profile_picture_url || null;

        // 2. Fetch Media and Reels Insights (last 30 posts)
        let totalViews = 0;
        let totalReach = 0;
        let totalLikes = 0;
        let totalComments = 0;
        let totalInteractions = 0;

        try {
          const mediaRes = await fetch(
            `${graphApiUrl}/${acc.instagram_user_id}/media?fields=id,caption,like_count,comments_count,media_type,timestamp,insights.metric(plays,reach,saved,shares,total_interactions)&limit=30&access_token=${acc.access_token}`,
          );

          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            const mediaList = mediaData.data || [];

            for (const item of mediaList) {
              const likes = item.like_count || 0;
              const comments = item.comments_count || 0;
              totalLikes += likes;
              totalComments += comments;

              let plays = 0;
              let reach = 0;
              let interactions = likes + comments;

              if (item.insights && Array.isArray(item.insights.data)) {
                for (const metric of item.insights.data) {
                  const val = metric.values?.[0]?.value || 0;
                  if (metric.name === "plays") plays = val;
                  if (metric.name === "reach") reach = val;
                  if (metric.name === "total_interactions") interactions = val;
                }
              }

              // In Instagram, plays is for Reels, views/reach for other media
              totalViews += plays > 0 ? plays : reach;
              totalReach += reach;
              totalInteractions += interactions;

              // If this media corresponds to a scheduled post, update its stats
              if (item.id) {
                await supabase
                  .from("scheduled_posts")
                  .update({
                    views_count: plays,
                    reach_count: reach,
                    likes_count: likes,
                    comments_count: comments,
                    ig_media_id: item.id,
                  })
                  .eq("ig_container_id", item.id);
              }
            }
          }
        } catch (mediaErr) {
          console.warn(`[Sync-Insights] Failed to fetch media insights for @${acc.username}:`, mediaErr);
        }

        // Calculate engagement rate
        const engagementRate =
          followersCount > 0
            ? Number(((totalInteractions / followersCount) * 100).toFixed(2))
            : 0;

        // 3. Update instagram_accounts table
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
            last_health_check_at: nowIso,
            metrics_updated_at: nowIso,
          })
          .eq("id", acc.id);

        // 4. Save daily history snapshot
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
        } catch (dailyErr) {
          console.warn(`[Sync-Insights] Failed to upsert daily metrics:`, dailyErr);
        }

        results.push({
          id: acc.id,
          username: acc.username,
          status: "success",
          health_status: "healthy",
          followers: followersCount,
          views: totalViews,
          reach: totalReach,
          engagement_rate: engagementRate,
        });
      } catch (accLoopErr: any) {
        console.error(`[Sync-Insights] Unexpected error for @${acc.username}:`, accLoopErr);
        results.push({
          id: acc.id,
          username: acc.username,
          status: "error",
          health_status: "warning",
          error: accLoopErr.message,
        });
      }
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
