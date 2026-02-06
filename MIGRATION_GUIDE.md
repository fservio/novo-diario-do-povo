# Guia de Migração: WordPress para D1

Este guia descreve os passos para migrar o conteúdo do seu site antigo WordPress para o novo portal.

## 1. Exportar do WordPress
1. No painel do WordPress, vá em **Ferramentas > Exportar**.
2. Selecione **Posts** (ou o que desejar migrar).
3. Recomendamos exportar por períodos (meses) para evitar arquivos XML muito grandes.
4. Salve os arquivos `.xml` na pasta `migração banco de dados/` na raiz do projeto.

## 2. Rodar o Script de Migração
O script lê o XML e gera um arquivo SQL compatível com o SQLite (D1).

```bash
# Uso: node scripts/migrate_wordpress.mjs <caminho_do_xml>
node scripts/migrate_wordpress.mjs "migração banco de dados/seu-arquivo.xml"
```

Isso gerará o arquivo `migration_output.sql`.

## 3. Importar para o D1
Com o arquivo SQL gerado, você pode importá-lo para o seu banco de dados Cloudflare D1 local ou remoto.

**Para desenvolvimento local (Wrangler):**
```bash
npx wrangler d1 execute <NOME_DO_DB> --local --file=migration_output.sql
```

**Para produção:**
```bash
npx wrangler d1 execute <NOME_DO_DB> --remote --file=migration_output.sql
```

## 4. O que foi migrado?
- **Autores**: Mapeados pelo login do WordPress.
- **Categorias**: Mantidas com slugs e nomes originais.
- **Tags**: Preservadas e vinculadas aos posts.
- **Posts**: Conteúdo completo, excertos, status e datas.
- **Chapéu (Hat)**: Extraído automaticamente do campo de metadados `chapeu`.
- **Mídia**: As referências de imagem destacada são migradas. *Nota: Você precisará fazer o upload físico das imagens para o R2 separadamente.*

## 5. Próximos Passos (Imagens)
Para que as imagens funcionem, você deve:
1. Sincronizar sua pasta `wp-content/uploads/` com o bucket do Cloudflare R2.
2. Garantir que as chaves no R2 coincidam com o nome do arquivo original (ex: `2026/02/imagem.jpg`).
