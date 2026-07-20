-- Slug único por empresa para poder tener una URL de login con marca
-- propia (ej. tuapp.com/login/seiq) sin necesitar subdominios ni un
-- dominio propio.

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

UPDATE empresas SET slug = 'bo-synergy' WHERE nombre = 'BO Synergy' AND slug IS NULL;
UPDATE empresas SET slug = 'seiq' WHERE nombre = 'SEIQ' AND slug IS NULL;
