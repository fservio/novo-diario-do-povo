import fs from 'fs';
import xml2js from 'xml2js';
import path from 'path';

// Configuração
const INPUT_FILE = process.argv[2];
const OUTPUT_FILE = 'migration_output.sql';

if (!INPUT_FILE) {
    console.error('Uso: node scripts/migrate_wordpress.mjs <caminho-para-o-arquivo-xml>');
    process.exit(1);
}

const parser = new xml2js.Parser();

function escapeSql(str) {
    if (str === null || str === undefined) return 'NULL';
    str = String(str);
    // Substitui aspas simples por duas aspas simples para escapar no SQL
    str = str.replace(/'/g, "''");
    // Substitui quebras de linha por concatenação SQLite para manter comando em uma linha
    str = str.replace(/\n/g, "' || CHAR(10) || '");
    str = str.replace(/\r/g, "");
    return "'" + str + "'";
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '0000-00-00 00:00:00') return 'NULL';
    // SQLite accepts ISO strings or space separated. WXR usually has YYYY-MM-DD HH:MM:SS
    return escapeSql(dateStr);
}

// Mapas para IDs (Old ID -> New ID)
const authorMap = new Map(); // login -> id
const categoryMap = new Map(); // old_nicename -> new_id
const tagMap = new Map(); // old_slug -> new_id
const mediaMap = new Map(); // attachment_wp_id -> media_id/r2_key

let sqlOutput = [];

function addSql(sql) {
    sqlOutput.push(sql);
}

// No transaction or PRAGMAs for remote execution to avoid batching issues

// 0. Disable constraints during import for flexibility (Commented out DELETEs for incremental mode)
// addSql('DELETE FROM posts_tags;');
// addSql('DELETE FROM posts;');
// addSql('DELETE FROM categories;');
// addSql('DELETE FROM tags;');
// addSql('DELETE FROM media;');
// addSql('DELETE FROM authors;');

fs.readFile(INPUT_FILE, function (err, data) {
    if (err) {
        console.error('Erro ao ler arquivo:', err);
        return;
    }

    parser.parseString(data, function (err, result) {
        if (err) {
            console.error('Erro ao fazer parse do XML:', err);
            return;
        }

        const channel = result.rss.channel[0];

        // 1. Authors
        console.log('Processando Autores...');
        if (channel['wp:author']) {
            channel['wp:author'].forEach((author) => {
                const login = author['wp:author_login'][0];
                const email = author['wp:author_email'][0];
                const display_name = author['wp:author_display_name'][0];
                // schema: id, slug*, name*, email, is_columnist
                // Using INSERT OR IGNORE to prevent duplicates. ID is auto-incremented by DB if new.
                addSql(`INSERT OR IGNORE INTO authors (slug, name, email, is_columnist) VALUES (${escapeSql(login)}, ${escapeSql(display_name)}, ${escapeSql(email)}, 0);`);
            });
        }

        const items = channel.item || [];
        const attachments = items.filter(i => i['wp:post_type'][0] === 'attachment');
        const posts = items.filter(i => i['wp:post_type'][0] === 'post');
        const pages = items.filter(i => i['wp:post_type'][0] === 'page');

        // Extract unique categories and tags from all items
        const rawCategories = new Map();
        const rawTags = new Map();
        items.forEach(item => {
            if (item.category) {
                item.category.forEach(c => {
                    const domain = c.$ ? c.$.domain : '';
                    const nicename = c.$ ? c.$.nicename : '';
                    const name = c._ || nicename;
                    if (domain === 'category' && nicename && !rawCategories.has(nicename)) {
                        rawCategories.set(nicename, name);
                    } else if (domain === 'post_tag' && nicename && !rawTags.has(nicename)) {
                        rawTags.set(nicename, name);
                    }
                });
            }
        });

        // 2. Categories
        console.log('Processando Categorias...');
        // Ensure default category exists
        addSql(`INSERT OR IGNORE INTO categories (id, slug, name, description, is_active, display_order) VALUES (1, 'noticias', 'Notícias', '', 1, 0);`);

        rawCategories.forEach((name, nicename) => {
            if (nicename === 'noticias' || nicename === 'uncategorized') return;
            // schema: id, slug*, name*, description, is_active*, display_order*
            addSql(`INSERT OR IGNORE INTO categories (slug, name, description, is_active, display_order) VALUES (${escapeSql(nicename)}, ${escapeSql(name)}, '', 1, 0);`);
        });

        // 3. Tags
        console.log('Processando Tags...');
        rawTags.forEach((name, nicename) => {
            // schema: id, slug*, name*, seo_noindex*
            addSql(`INSERT OR IGNORE INTO tags (slug, name, seo_noindex) VALUES (${escapeSql(nicename)}, ${escapeSql(name)}, 0);`);
        });

        // 4. Media
        console.log('Processando Mídia...');
        const mediaByKey = new Map();
        attachments.forEach((att) => {
            const wpId = att['wp:post_id'][0];
            const url = att['guid'] ? att['guid'][0]._ : '';
            if (!url) return;
            const filename = path.basename(url);
            const r2_key = filename;

            // Map WP ID to R2 Key for lookup later
            mediaMap.set(wpId, r2_key);

            // schema: id, r2_key*, filename*, mime_type*, size_bytes*
            addSql(`INSERT OR IGNORE INTO media (r2_key, filename, mime_type, size_bytes) VALUES (${escapeSql(r2_key)}, ${escapeSql(filename)}, 'image/jpeg', 0);`);
        });

        // 5. Posts
        console.log('Processando Posts...');
        posts.forEach((post) => {
            const wpId = parseInt(post['wp:post_id'][0]);
            const title = post.title[0];
            const slug = post['wp:post_name'][0] || `post-${wpId}`;
            const content = post['content:encoded'][0];
            const excerpt = post['excerpt:encoded'][0];
            const status = post['wp:status'][0] === 'publish' ? 'published' : 'draft';
            const date = post['wp:post_date'][0];
            const authorLogin = post['dc:creator'][0];

            // Hat selection
            const meta = post['wp:postmeta'] || [];
            const chapeuMeta = meta.find(m => m['wp:meta_key'][0] === 'chapeu');
            const hat = chapeuMeta ? chapeuMeta['wp:meta_value'][0] : null;

            // Category & Tags
            let categorySlug = 'noticias';
            const postTagSlugs = [];
            if (post.category) {
                post.category.forEach(c => {
                    const domain = c.$ ? c.$.domain : '';
                    const nicename = c.$ ? c.$.nicename : '';
                    if (domain === 'category') {
                        // Just take the last one or 'noticias'
                        if (nicename) categorySlug = nicename;
                    } else if (domain === 'post_tag') {
                        if (nicename) postTagSlugs.push(nicename);
                    }
                });
            }

            // Featured Image
            let coverMediaKey = null;
            const thumbMeta = meta.find(m => m['wp:meta_key'][0] === '_thumbnail_id');
            if (thumbMeta) {
                const thumbWpId = thumbMeta['wp:meta_value'][0];
                if (mediaMap.has(thumbWpId)) {
                    coverMediaKey = mediaMap.get(thumbWpId);
                }
            }

            // Subqueries for IDs
            const authorIdSql = `(SELECT id FROM authors WHERE slug = ${escapeSql(authorLogin)})`;
            const categoryIdSql = `(SELECT id FROM categories WHERE slug = ${escapeSql(categorySlug)})`;
            const coverMediaIdSql = coverMediaKey ? `(SELECT id FROM media WHERE r2_key = ${escapeSql(coverMediaKey)})` : 'NULL';

            // Use original WP ID to prevent collisions and maintain history
            const newPostId = wpId;

            // actual schema columns: id, slug*, title*, excerpt, content*, category_id*, author_id*, cover_media_id, status*, template*, seo_title, seo_description, seo_canonical, seo_noindex*, is_premium*, paywall_tier, metering_exempt*, breaking_until, published_at, scheduled_at, created_at, updated_at, content_markdown, hat, is_live, original_link, views
            // We use INSERT OR REPLACE to update if exists (or just INSERT OR IGNORE if we want to be safer, but REPLACE works for updates)
            // User implies "adding", so INSERT OR IGNORE is safer for "appending" history.
            addSql(`INSERT OR IGNORE INTO posts (id, slug, title, excerpt, content, category_id, author_id, cover_media_id, status, template, seo_noindex, is_premium, paywall_tier, metering_exempt, published_at, created_at, updated_at, hat, is_live, views) VALUES (${newPostId}, ${escapeSql(slug)}, ${escapeSql(title)}, ${escapeSql(excerpt)}, ${escapeSql(content)}, COALESCE(${categoryIdSql}, 1), COALESCE(${authorIdSql}, 1), ${coverMediaIdSql}, '${status}', 'article', 0, 0, 'free', 0, ${formatDate(date)}, ${formatDate(date)}, ${formatDate(date)}, ${escapeSql(hat)}, 0, 0);`);

            // 6. Post-Tag Relationship
            postTagSlugs.forEach(tagSlug => {
                const tagIdSql = `(SELECT id FROM tags WHERE slug = ${escapeSql(tagSlug)})`;
                addSql(`INSERT OR IGNORE INTO posts_tags (post_id, tag_id) VALUES (${newPostId}, ${tagIdSql});`);
            });
        });

        // 7. Pages
        console.log('Processando Páginas...');
        pages.forEach((page) => {
            const wpId = parseInt(page['wp:post_id'][0]);
            const title = page.title[0];
            const slug = page['wp:post_name'][0];
            const content = page['content:encoded'][0];
            const is_active = page['wp:status'][0] === 'publish' ? 1 : 0;
            const newId = wpId;
            // schema: id*, slug*, title*, content*, seo_title, seo_description, is_active*, created_at, updated_at
            addSql(`INSERT OR IGNORE INTO pages (id, slug, title, content, is_active) VALUES (${newId}, ${escapeSql(slug)}, ${escapeSql(title)}, ${escapeSql(content)}, ${is_active});`);
        });

        fs.writeFileSync(OUTPUT_FILE, sqlOutput.join('\n'));
        console.log(`Sucesso! Arquivo ${OUTPUT_FILE} gerado.`);
    });
});
