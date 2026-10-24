# Notice

This repository, [MaticsLab/design](https://github.com/MaticsLab/design), is a fork of
[Penpot](https://github.com/penpot/penpot), maintained by **City Politics INC** for the City Politics network's
designer at **design.citypolitics.org**. It tracks Penpot's stable release **2.18.4** (tag `2.18.4`), not `develop`.

Penpot is Copyright (c) KALEIDOS INC Sucursal en España SL and contributors, and is licensed under the
[Mozilla Public License 2.0](LICENSE). Penpot's license, copyright notices and file headers are kept unchanged.
Files City Politics modified remain under the MPL-2.0, and so do the files we added; their source is published here.
"Penpot" is a trademark of its owners; this fork is not affiliated with or endorsed by them, and so it is branded
**City Politics Design** with City Politics' own mark. Penpot remains credited in the app (Help → About Penpot), in
[LICENSE](LICENSE) and here.

## What City Politics changed

| Change | Where |
| --- | --- |
| The City Politics ad sizes at the top of Penpot's board presets (728×90, 468×60, 320×50, 300×250, native card 600×314) | `frontend/src/app/main/constants.cljs` |
| The **City Politics Ads** plugin: ad board presets, a template library (candidate card, event promo, ballot measure), dynamic slots (headline, body, image, button text, URL, color), ordered IF/ELSE rules (ZIP list, city, state, page context, time and countdowns, device, language, A/B half) with a minimum-audience guard, keyframe motion (fade, slide, scale, color; at most 15 s, 3 loops, 3 flashes a second, reduced motion respected), Penpot prototype frames, a locked "Paid for by" layer for political ads, and **Send to City Politics** | `plugins/citypolitics-ads/` |
| Light is the default theme (unset and legacy "default" mean light; dark and system remain a choice in the profile) | `frontend/src/app/util/theme.cljs`, `frontend/src/app/main/data/profile.cljs`, `frontend/src/app/main/ui/settings/options.cljs`, `frontend/src/app/main/ui/workspace/main_menu.cljs`, `frontend/src/app/main/ui/components/progress.cljs`, `frontend/src/app/main/ui/exports/assets.cljs` |
| City Politics branding: the City Politics megaphone mark in place of Penpot's logo (sidebar, workspace, login, loader, favicon, app icon, link preview), "City Politics Design" in the browser tab, the login and register pages' taglines | `docker/citypolitics/brand/` (assets and `apply.py`, which applies the branding and the compiled form of the light default to Penpot's official bundle, checking every patch) |
| Our frontend image: Penpot's official frontend for the tracked release, patched as above, with the plugin at `/plugins/citypolitics-ads/` | `docker/citypolitics/Dockerfile.frontend`, `.dockerignore` |
| Fly.io deployment: the frontend, Penpot's official backend and exporter, Valkey and Fly Postgres; storage on Cloudflare R2 (S3 API); mail through Resend's SMTP; sign-in only with a City Politics account (OpenID Connect at citypolitics.org) | `fly/`, `.github/workflows/citypolitics-deploy.yml`, `.github/workflows/citypolitics-source-build.yml` |

The server side of the ad features (validation, the SVG sanitizer, the compiler, rule resolution at the edge, staff
review) lives in City Politics' own site, which receives the designs: it is not part of this repository.
