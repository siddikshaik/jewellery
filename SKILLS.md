# Skills index

Skills are short playbooks Claude loads when the task matches. They live in `.claude/skills/<name>/SKILL.md`, where Claude Code picks them up automatically.

| Skill | Use it when |
| --- | --- |
| `jewellery-billing-app` | Adding a feature, field, route, setting, report or inventory behaviour to the app, or rebuilding it from scratch. |
| `invoice-templates-pdf` | Changing an invoice template, adding a column, or fixing the PDF layout. |
| `json-storage` | Changing how data is saved, the API, migrating old data, adding a collection, backups, or moving to SQLite later. |
| `hallmark-qr-tags` | HUID rules and storage, hallmark purity marks, the QR payload, item page, scanner, tag printing, the QR encoder. |
| `access-control` | Sign-in, roles, stores, permissions; adding an endpoint or button that some roles must not reach. |

To start a new project of this kind, copy this folder, keep `CLAUDE.md` and `.claude/skills/`, then edit `docs/SPEC.md` for the new business.
