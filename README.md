# Job Application Automation

Personal tooling for high-volume job applications.

- `extension/` : Chrome extension (Manifest V3) that autofills career pages and Google Forms
  from a saved profile. Load unpacked at `chrome://extensions`. See `extension/README.md`.
- `mail/` : paste-and-send application mailer. Sends from Gmail with the company's resume and
  cover letter PDFs auto-attached. Full runbook: `mail/MAIL_AUTOMATION.md`.

## Mail quick start
1. Create a Gmail App Password and save it in `mail/gmail_app_password.txt` (gitignored).
2. Point `COMPANIES_DIR` at a folder of `<Company>/shaurya_resume_<Company>.pdf` and
   `shaurya_cover_letter_<Company>.pdf` (defaults to `./companies` or `D:\placement\companies`).
3. `python mail/mail_ui.py` for the web UI, or `python mail/mail_ui.py --send emails.txt` for CLI.

The profile defaults in `extension/defaults.js` and the sender in `mail/*.py` are personal; change
them before reusing.
