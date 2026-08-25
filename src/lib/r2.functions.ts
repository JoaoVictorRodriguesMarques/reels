import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("As credenciais do Cloudflare R2 não estão configuradas no servidor.");
  }

  return new S3Client({
    region: "us-east-1",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    s3ForcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// Gera URL assinada para upload direto pelo cliente
export const getUploadPresignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fileName: z.string().min(1),
        contentType: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { fileName, contentType } = data;

    const ext = fileName.split(".").pop() ?? "mp4";
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${userId}/${Date.now()}_${cleanFileName}`;

    const bucketName = process.env.R2_BUCKET_NAME;
    const publicDomain = process.env.R2_PUBLIC_DOMAIN;

    if (!bucketName || !publicDomain) {
      throw new Error("R2_BUCKET_NAME ou R2_PUBLIC_DOMAIN não configurado no servidor.");
    }

    const s3 = getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });

    // A assinatura expira em 1 hora (3600 segundos)
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    // Normaliza domínio público (garante que não termine com barra para construir URL consistente)
    const normalizedDomain = publicDomain.endsWith("/") ? publicDomain.slice(0, -1) : publicDomain;
    const publicUrl = `${normalizedDomain}/${key}`;

    return {
      uploadUrl,
      publicUrl,
      key,
    };
  });

// Exclui um arquivo do Cloudflare R2 a partir de sua URL pública
export const deleteR2File = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        url: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { url } = data;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicDomain = process.env.R2_PUBLIC_DOMAIN;

    if (!bucketName || !publicDomain) {
      throw new Error("R2_BUCKET_NAME ou R2_PUBLIC_DOMAIN não configurado no servidor.");
    }

    const normalizedDomain = publicDomain.endsWith("/") ? publicDomain : `${publicDomain}/`;

    if (!url.startsWith(normalizedDomain)) {
      console.warn(`URL ${url} não pertence ao domínio R2 configurado. Ignorando exclusão.`);
      return { success: false, reason: "Fora do domínio R2" };
    }

    const key = decodeURIComponent(url.substring(normalizedDomain.length));
    if (!key) {
      return { success: false, reason: "Chave de arquivo vazia" };
    }

    try {
      const s3 = getS3Client();
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      await s3.send(command);
      console.log(`Sucesso ao excluir arquivo do R2: ${key}`);
      return { success: true };
    } catch (err: any) {
      console.error(`Erro ao excluir arquivo do R2: ${key}`, err);
      throw new Error(`Falha ao excluir arquivo do R2: ${err.message}`);
    }
  });
