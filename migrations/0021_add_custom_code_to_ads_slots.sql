-- Migration: 0021_add_custom_code_to_ads_slots.sql
-- Description: Add custom_code column to ads_slots table to support raw HTML/JS ads

ALTER TABLE ads_slots ADD COLUMN custom_code TEXT;
