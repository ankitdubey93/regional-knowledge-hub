-- The app connects as chub_app. A superuser or the table owner would bypass
-- row-level security, so chub_app is neither (CLAUDE.md Hard rule 11).
CREATE ROLE chub_app LOGIN PASSWORD 'chub_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE chub_test OWNER chub;
