# FormFlow

FormFlow is a small full-stack form builder with a protected admin editor and a separate public respondent page.

## Local setup

1. Copy `.env.example` to `.env` and set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and a long `SESSION_SECRET`.
2. Run `npm install`.
3. Run `npm start` and open `http://localhost:3000/` for the admin login or `http://localhost:3000/form.html` for the public form.

The server stores `data/form-state.json` locally by default. The data directory is ignored by Git.

## How it works

The admin editor loads the draft from `GET /api/admin/form`. `PUT /api/admin/draft` validates and stores draft changes. `POST /api/admin/publish` validates again and creates an immutable-in-practice latest snapshot with a version number and timestamp. The public page can only read that snapshot from `GET /api/public/form`; drafts are never exposed.

Admin credentials come from environment variables and the session cookie is HTTP-only and same-site. Set `NODE_ENV=production` to enable secure cookies behind HTTPS.

## Render and GitHub

Push this repository to GitHub, then create a Render web service from the repository. `render.yaml` supplies the Node build/start commands, generated session secret, and a 1 GB persistent disk mounted at `/var/data`. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` as private Render environment variables.

The persistent disk makes JSON storage durable for this single service instance, but it is not a multi-instance database. If horizontal scaling or concurrent writers are required, replace the persistence module with a managed database or external storage service.

## Tests

Run `npm test`.
