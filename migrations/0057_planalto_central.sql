INSERT INTO media (r2_key, filename, mime_type, size_bytes, width, height, alt, credits)
VALUES ('editorial/planalto-central.png', 'planalto-central.png', 'image/png', 2918662, 1254, 1254,
        'Ilustração do Congresso Nacional em Brasília', 'Ilustração gerada por IA para o Diário do Povo')
ON CONFLICT(r2_key) DO NOTHING;

INSERT INTO authors (slug, name, bio, avatar_media_id, is_columnist, author_type, column_name, column_description)
SELECT 'planalto-central', 'Planalto Central',
       'Coluna de análise da política nacional produzida por inteligência artificial a partir da cobertura do Diário do Povo.',
       id, 1, 'columnist', 'Planalto Central',
       'Às 6h, 13h e 20h, uma leitura dos fatos, dos movimentos de Brasília e do que acompanhar.'
FROM media WHERE r2_key='editorial/planalto-central.png'
ON CONFLICT(slug) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_planalto_central_edition
ON posts(original_link)
WHERE substr(original_link,1,length('https://diario.dopovo.com.br/coluna/planalto-central?edicao='))
      = 'https://diario.dopovo.com.br/coluna/planalto-central?edicao=';
