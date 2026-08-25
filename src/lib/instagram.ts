// Helpers do lado cliente para o fluxo OAuth do Instagram.
// O App ID é buscado do servidor (vive nas variáveis de ambiente do backend).

export const INSTAGRAM_REDIRECT_PATH = "/auth/instagram/callback";
export const FACEBOOK_REDIRECT_PATH = "/auth/facebook/callback";

export function buildInstagramAuthUrl(appId: string): string {
  const redirectUri = `${window.location.origin}${INSTAGRAM_REDIRECT_PATH}`;
  const scope = "instagram_business_basic,instagram_business_content_publish";

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export function buildFacebookAuthUrl(appId: string): string {
  const redirectUri = `${window.location.origin}${FACEBOOK_REDIRECT_PATH}`;
  const scope =
    "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management";

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

export function getInstagramRedirectUri(): string {
  return `${window.location.origin}${INSTAGRAM_REDIRECT_PATH}`;
}

export function getFacebookRedirectUri(): string {
  return `${window.location.origin}${FACEBOOK_REDIRECT_PATH}`;
}
