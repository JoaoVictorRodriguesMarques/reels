/**
 * Translates raw Instagram/Meta API error messages into user-friendly
 * Portuguese descriptions with an emoji icon and a short label.
 */

type ParsedError = {
  icon: string;
  label: string;
  description: string;
};

export function parseErrorMessage(rawError: string | null | undefined): ParsedError | null {
  if (!rawError) return null;

  const lower = rawError.toLowerCase();

  // Try to extract Meta Graph API error code & subcode from JSON in the message
  let metaCode: number | null = null;
  let metaSubcode: number | null = null;

  try {
    const jsonStart = rawError.indexOf("{");
    if (jsonStart !== -1) {
      const parsed = JSON.parse(rawError.slice(jsonStart));
      metaCode = parsed?.error?.code ?? null;
      metaSubcode = parsed?.error?.error_subcode ?? null;
    }
  } catch {
    // ignore parse errors, fall through to string matching
  }

  // ─── Token / Auth Issues ───
  if (
    metaCode === 190 ||
    metaCode === 102 ||
    [458, 460, 463, 467, 490].includes(metaSubcode ?? 0) ||
    lower.includes("access token") ||
    lower.includes("session has expired") ||
    lower.includes("login to www.instagram.com") ||
    lower.includes("checkpoint") ||
    lower.includes("token has expired") ||
    lower.includes("invalid access token")
  ) {
    // Differentiate subtypes
    if (metaSubcode === 460 || lower.includes("password")) {
      return {
        icon: "🔑",
        label: "Senha Alterada",
        description:
          "A senha do Instagram/Facebook foi alterada. Reconecte a conta no Reelary para gerar um novo token.",
      };
    }
    if (metaSubcode === 458 || lower.includes("deauthorized") || lower.includes("removed")) {
      return {
        icon: "🚫",
        label: "App Desautorizado",
        description:
          "O Reelary foi removido das permissões do Instagram/Facebook. Reconecte a conta nas configurações.",
      };
    }
    if (metaSubcode === 490 || lower.includes("checkpoint")) {
      return {
        icon: "🛡️",
        label: "Verificação de Segurança",
        description:
          "O Instagram solicitou uma verificação de segurança. Faça login em www.instagram.com, siga as instruções e reconecte a conta.",
      };
    }
    if (lower.includes("log in to www.instagram.com") || lower.includes("login to www.instagram.com") || lower.includes("follow the instructions")) {
      return {
        icon: "🔐",
        label: "Login Necessário",
        description:
          "O Instagram exige que o dono da conta faça login em www.instagram.com e siga as instruções antes de publicar. Após isso, reconecte a conta.",
      };
    }
    return {
      icon: "🔒",
      label: "Token Inválido",
      description:
        "O token de acesso da conta expirou ou foi invalidado. Reconecte a conta no Reelary para resolver.",
    };
  }

  // ─── Disconnected Account ───
  if (
    lower.includes("conta instagram desconectada") ||
    lower.includes("sem token")
  ) {
    return {
      icon: "🔌",
      label: "Conta Desconectada",
      description:
        "Esta conta do Instagram não possui um token de acesso. Conecte-a novamente nas configurações.",
    };
  }

  // ─── Video Processing Errors ───
  if (
    lower.includes("instagram rejected the video") ||
    lower.includes("status_code") && lower.includes("error")
  ) {
    return {
      icon: "🎬",
      label: "Vídeo Rejeitado",
      description:
        "O Instagram rejeitou o vídeo. Verifique se o formato, resolução e duração do vídeo atendem aos requisitos do Reels.",
    };
  }

  // ─── Container Creation Failure (generic) ───
  if (lower.includes("container creation failed")) {
    return {
      icon: "📦",
      label: "Erro ao Criar Publicação",
      description:
        "O Instagram não conseguiu processar o vídeo para publicação. Verifique se o arquivo de vídeo é válido e acessível.",
    };
  }

  // ─── Publish Failure (generic) ───
  if (lower.includes("publish failed")) {
    return {
      icon: "📤",
      label: "Erro ao Publicar",
      description:
        "A publicação do Reel falhou na etapa final. O vídeo foi processado mas não pôde ser publicado no Instagram.",
    };
  }

  // ─── Rate Limit ───
  if (
    lower.includes("rate limit") ||
    lower.includes("too many") ||
    metaCode === 4 ||
    metaCode === 32
  ) {
    return {
      icon: "⏱️",
      label: "Limite de Requisições",
      description:
        "O Instagram limitou temporariamente as publicações desta conta. Aguarde alguns minutos e tente novamente.",
    };
  }

  // ─── Permission Error ───
  if (
    lower.includes("permission") ||
    lower.includes("does not have permission") ||
    metaCode === 10 ||
    metaCode === 200
  ) {
    return {
      icon: "⛔",
      label: "Sem Permissão",
      description:
        "A conta não possui as permissões necessárias para publicar Reels. Reconecte a conta garantindo todas as permissões.",
    };
  }

  // ─── Network / Timeout ───
  if (
    lower.includes("timeout") ||
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed")
  ) {
    return {
      icon: "🌐",
      label: "Erro de Conexão",
      description:
        "Não foi possível conectar ao Instagram. Isso pode ser um problema temporário de rede. Tente novamente mais tarde.",
    };
  }

  // ─── Fallback: Unknown Error ───
  return {
    icon: "❓",
    label: "Erro Desconhecido",
    description: rawError.length > 200 ? rawError.slice(0, 200) + "…" : rawError,
  };
}
