-- Migration: Create Live Blog Updates Table
CREATE TABLE IF NOT EXISTS live_blog_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    content_markdown TEXT,
    is_pinned INTEGER DEFAULT 0,
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES authors(id)
);

CREATE INDEX IF NOT EXISTS idx_live_blog_updates_post_id ON live_blog_updates(post_id);
CREATE INDEX IF NOT EXISTS idx_live_blog_updates_published_at ON live_blog_updates(published_at);
