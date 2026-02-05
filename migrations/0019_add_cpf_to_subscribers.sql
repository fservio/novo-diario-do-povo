-- Migration: Add CPF to subscribers table
ALTER TABLE subscribers ADD COLUMN cpf TEXT;
