# Regras do Projeto / Project Rules

## Limpeza de Storage pós-Publicação (Supabase Storage Cleanup)

### Descrição / Description

Para economizar espaço de armazenamento e limpar o cache, todos os arquivos de mídia (vídeo e capa) associados a um Reel agendado devem ser removidos do bucket `reels` do Supabase Storage após a publicação com sucesso no Instagram. Além disso, as URLs correspondentes no banco de dados devem ser limpas e o frontend deve lidar com isso de forma amigável.

To save storage space and clear the cache, all media files (video and cover image) associated with a scheduled Reel must be removed from the `reels` Supabase Storage bucket after successful publication to Instagram. In addition, the corresponding URLs in the database must be cleared, and the frontend must handle this gracefully.

### Diretrizes de Código / Code Guidelines

1. **Edge Function (`supabase/functions/publish-reels/index.ts`)**:
   - Após a publicação com sucesso de um post, atualize a tabela `scheduled_posts` definindo `status` como `"published"`, `video_url` como `""` (vazia) e `cover_url` como `null`.
   - Remova os arquivos do bucket `reels` utilizando a API de storage do Supabase (`supabase.storage.from("reels").remove(...)`).
   - _English_: After successfully publishing a post, update the `scheduled_posts` table by setting the `status` to `"published"`, `video_url` to `""` (empty), and `cover_url` to `null`. Remove the files from the `reels` bucket using the Supabase storage API (`supabase.storage.from("reels").remove(...)`).

2. **Frontend UI (`src/routes/calendar.tsx`, `src/routes/posts.tsx`, etc.)**:
   - Sempre verifique se `video_url` está disponível antes de renderizar elementos de `<video>`.
   - Se `video_url` for nula ou vazia, exiba um placeholder informativo (ex: um ícone de vídeo desabilitado com o rótulo "Limpo" ou uma mensagem indicando que o vídeo foi removido para economizar espaço).
   - _English_: Always verify if `video_url` is present before rendering `<video>` elements. If `video_url` is null or empty, display an informative placeholder (e.g., a disabled video icon with a "Limpo" label or a message indicating the video was removed to save space).

3. **Manutenção e Futuras Alterações / Maintenance and Future Changes**:
   - Ao alterar o fluxo de agendamento ou publicação, garanta que essa política de ciclo de vida (Upload -> Publicar -> Limpar Storage -> Fallback no Frontend) seja preservada.
   - _English_: When changing the scheduling or publishing flow, ensure that this lifecycle policy (Upload -> Publish -> Clean Storage -> Frontend Fallback) is preserved.
