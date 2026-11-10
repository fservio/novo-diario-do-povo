INSERT INTO media (r2_key, filename, mime_type, size_bytes, width, height, alt, credits)
VALUES ('editorial/internacional.png', 'internacional.png', 'image/png', 3289246, 1254, 1254,
        'Ilustração do globo terrestre em estilo de gravura', 'Ilustração gerada por IA para o Diário do Povo')
ON CONFLICT(r2_key) DO NOTHING;

INSERT INTO authors (slug, name, bio, avatar_media_id, is_columnist, author_type, column_name, column_description)
SELECT 'internacional', 'Internacional',
       'Coluna produzida por inteligência artificial a partir das matérias da editoria Mundo do Diário do Povo.',
       id, 1, 'columnist', 'Internacional',
       'Às 6h, 13h e 20h, uma leitura dos acontecimentos internacionais e de seus desdobramentos.'
FROM media WHERE r2_key='editorial/internacional.png'
ON CONFLICT(slug) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internacional_edition
ON posts(original_link)
WHERE substr(original_link,1,length('https://diario.dopovo.com.br/coluna/internacional?edicao='))
      = 'https://diario.dopovo.com.br/coluna/internacional?edicao=';
