# Latest local preview

Run `python3 fitment_server.py` and open http://127.0.0.1:8766/converter-express_1.html.

This is an unauthenticated local review application. The server binds to localhost. Do not publish it or expose its workspace endpoint to the internet. It stores its workspace under `~/.codex/converter-express/preview.sqlite3` by default; use `CONVERTER_PREVIEW_DB` to choose an isolated database.

The catalog is included, but sample shops/orders and assumed costs are not seeded. New stock remains uncounted and prices pending until explicitly entered. The separate `../supabase-app/` directory contains the prepared authenticated migration.
