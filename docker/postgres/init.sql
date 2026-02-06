-- ──────────────────────────────────────────────
-- Lynq Studio — PostgreSQL Schema (App DB)
-- ──────────────────────────────────────────────
-- Plausible ve Umami yaklaşımı: işlemsel (OLTP) veriler burada.
-- Kullanıcı hesapları, website kayıtları, API key'ler, ayarlar.
-- ──────────────────────────────────────────────

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════
-- 1. USERS — Kullanıcı hesapları
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(255),
    role            VARCHAR(20) DEFAULT 'owner',   -- owner, admin, viewer
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
-- 2. WEBSITES — Takip edilen web siteleri
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS websites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,          -- "My Blog", "E-Commerce"
    domain          VARCHAR(255) NOT NULL,          -- myblog.com
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, domain)
);

-- ═══════════════════════════════════════════════
-- 3. API_KEYS — Website bazlı API anahtarları
-- ═══════════════════════════════════════════════
-- Tracker bu key'i kullanarak event gönderir.
-- Collect endpoint'i bu key ile website_id'yi doğrular.
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id      UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    key             VARCHAR(64) UNIQUE NOT NULL,     -- Rastgele üretilmiş API key
    name            VARCHAR(255) DEFAULT 'Default',  -- "Production", "Staging"
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ
);

-- Index: API key ile hızlı doğrulama
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key) WHERE is_active = true;

-- ═══════════════════════════════════════════════
-- 4. SESSIONS — Aktif oturum yönetimi (JWT yerine)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           VARCHAR(255) UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- ═══════════════════════════════════════════════
-- 5. Seed: Default admin kullanıcı (geliştirme için)
-- ═══════════════════════════════════════════════
-- Şifre: "admin123" (bcrypt hash)
-- Production'da bu satırları kaldır!
INSERT INTO users (email, password_hash, name, role)
VALUES ('admin@lynq.studio', '$2b$10$placeholder_hash_change_me', 'Admin', 'owner')
ON CONFLICT (email) DO NOTHING;
