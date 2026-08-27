# FormFlow

FormFlow is a small full-stack form builder with a protected admin editor and a separate public respondent page.

## Local setup

1. Copy `.env.example` to `.env` and set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and a long `SESSION_SECRET`.
2. Run `npm install`.
3. Run `npm start` and open `http://localhost:3000/` for the admin login or `http://localhost:3000/form.html` for the public form.

The server stores `data/form-state.json` locally by default. The data directory is ignored by Git. If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, the server uses the Supabase `form_state` row with `id = 1` instead.

### Supabase table setup

Run this in Supabase **SQL Editor** before deploying:

```sql
create table if not exists form_state (
	id integer primary key,
	state jsonb not null,
	updated_at timestamptz not null default now()
);

insert into form_state (id, state)
values (1, '{"draft": null, "published": null, "publishedAt": null, "version": 0}'::jsonb)
on conflict (id) do nothing;
```

The server replaces a null draft with a starter form. The API reports a setup-specific error if the table or columns are missing.

## How it works

The admin editor loads the draft from `GET /api/admin/form`. `PUT /api/admin/draft` validates and stores draft changes. `POST /api/admin/publish` validates again and creates an immutable-in-practice latest snapshot with a version number and timestamp. The public page can only read that snapshot from `GET /api/public/form`; drafts are never exposed.

Admin credentials come from environment variables and the session cookie is HTTP-only and same-site. Set `NODE_ENV=production` to enable secure cookies behind HTTPS.

## Render and GitHub

Push this repository to GitHub, then create a Render web service from the repository. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` as private Render environment variables. The Supabase secret key must stay server-side.

Supabase is the production source of truth when configured. The local JSON fallback is intended for development only. The existing Render disk configuration is optional and is not needed when Supabase is active.

## Tests

Run `npm test`.
