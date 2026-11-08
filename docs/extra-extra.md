# Extra! Extra! — primeira versão jogável

Jogo original do entregador de jornais, em `/jogos/extra-extra`. Publicado em 2026-11-06, implantação `cf9832ee`, com acesso pelo menu do site. Prévia independente em `artifacts/extra-extra/preview.html`, atualizada por `node scripts/preview-extra-extra.mjs`.

## Mecânica

Uma rota de 90 segundos, três chances, bicicleta com avanço automático. Espaço/↑ pula; J/→ lança o jornal. No celular, botões Pular e Entregar. O botão de entrega ganha destaque quando uma caixa entra na janela de entrega. O jornal recebido vale 100 pontos, com bônus progressivo de 25 até 200 por entrega seguida. Colisão ou casa perdida custa uma chance; breve proteção evita dano duplicado. Três perdas ou o fim do tempo encerram a partida.

P/ESC ou o botão de pausa interrompem a partida. Troca de aba ou perda de foco também pausa, com retomada explícita. O relógio de simulação não avança em segundo plano. Recorde local, sem cadastro ou servidor; falhas de armazenamento são informadas. Compartilhamento é acionado somente por clique do leitor, com Web Share, cópia ou texto selecionável.

## Código

- `public/static/extra-extra-engine.js`: física, janela de entrega, pontuação, geração de obstáculos e estados.
- `public/static/extra-extra-art.js`: ilustrações vetoriais originais em Canvas, sem imagens ou fontes remotas necessárias ao jogo.
- `public/static/extra-extra.js`: controles, animação, pausa, recorde e compartilhamento.
- `public/static/extra-extra.css`: apresentação e adaptação para celular.
- `packages/core/web/extra-extra.ts`: página dentro do layout do jornal.

## Verificação

Seis testes unitários em `tests/unit/extra-extra.test.ts`, tipagem e compilação aprovados. Teste em navegador isolado no desktop 1440×1100 e celular 390×844: início, entrega de 100 pontos, pulo, pausa e ausência de rolagem horizontal. Capturas em `artifacts/extra-extra/`. Simulação de rota com controles automáticos chegou aos 90 segundos com 19 entregas e três chances preservadas.

O script de empacotamento do Meu dia inclui a nova rota e os três módulos JavaScript necessários quando for solicitada a publicação. Não exige banco de dados nem integração n8n. A navegação pública e os convites adicionais ao jogo podem ser definidos após a avaliação desta prévia.


Verificação em produção: página e três módulos JavaScript com HTTP 200. Menu com um único acesso ao jogo e Meu dia preservado. Navegador isolado no desktop e celular confirmou início, entrega de 100 pontos, pulo, pausa e ausência de rolagem horizontal. Capturas `*-live-*.png` em `artifacts/extra-extra/`.
