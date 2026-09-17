-- Perfis editoriais iniciais para que o Estúdio de Vídeo possa ser usado
-- antes do cadastro dos personagens específicos utilizados pela redação.

INSERT INTO video_ai_avatars (name, role, speaking_style, is_active)
SELECT
  'Âncora do Diário',
  'anchor',
  'Condução institucional, segura e objetiva; abre, conecta os blocos e encerra a apresentação.',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM video_ai_avatars WHERE role = 'anchor' AND is_active = 1
);

INSERT INTO video_ai_avatars (name, role, speaking_style, is_active)
SELECT
  'Repórter do Diário',
  'reporter',
  'Narração factual, clara e contextualizada; desenvolve a informação sem emitir opinião.',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM video_ai_avatars WHERE role = 'reporter' AND is_active = 1
);

INSERT INTO video_ai_avatars (name, role, speaking_style, is_active)
SELECT
  'Comentarista do Diário',
  'commentator',
  'Análise identificada, sóbria e fundamentada; diferencia fatos, interpretação e hipótese.',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM video_ai_avatars WHERE role = 'commentator' AND is_active = 1
);
