INSERT INTO media (r2_key, filename, mime_type, size_bytes, width, height, alt, credits)
VALUES ('editorial/painel-economico.png', 'painel-economico.png', 'image/png', 3640826, 1254, 1254,
        'Ilustração de uma moeda e barras econômicas', 'Ilustração gerada por IA para o Diário do Povo')
ON CONFLICT(r2_key) DO NOTHING;

INSERT INTO authors (slug, name, bio, avatar_media_id, is_columnist, author_type, column_name, column_description)
SELECT 'painel-economico', 'Painel Econômico',
       'Coluna produzida por inteligência artificial a partir das matérias da editoria de Economia do Diário do Povo.',
       id, 1, 'columnist', 'Painel Econômico',
       'Às 6h, 13h e 20h, uma leitura dos fatos econômicos e de suas consequências.'
FROM media WHERE r2_key='editorial/painel-economico.png'
ON CONFLICT(slug) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_painel_economico_edition
ON posts(original_link)
WHERE substr(original_link,1,length('https://diario.dopovo.com.br/coluna/painel-economico?edicao='))
      = 'https://diario.dopovo.com.br/coluna/painel-economico?edicao=';
