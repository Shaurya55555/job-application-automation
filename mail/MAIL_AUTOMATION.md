# Mail automation: send application emails from chat

Status: working and tested end to end (real send to saurav@earlyjobs.in on 2026-10-12, test send to
daringshaurya2003@gmail.com). Sends from **bajpaishaurya2911@gmail.com** with the company's resume and
cover letter PDFs attached.

## What it does
Given email text (To / Subject / body), it finds the matching `companies/<Folder>/`, attaches that
folder's newest `shaurya_resume_*.pdf` and `shaurya_cover_letter_*.pdf` from disk, and sends via Gmail
SMTP (or saves a Gmail draft). No browser, no manual attaching.

## Files
| Path | Purpose |
|---|---|
| `mail/mail_ui.py` | Main tool. CLI mode for chat use, local web UI for manual paste. |
| `mail/mail_apply.py` | Older per-folder tool: sends/drafts from `companies/<Co>/email.md`. |
| `mail/gmail_app_password.txt` | Gmail App Password (16 chars). **Gitignored. Never print, paste or commit it.** `.gmail_app_password` (leading dot) is also accepted. |
| `mail_log.csv` | Append-only log: timestamp, company, sent/draft, recipient. Gitignored. |

## One-time setup (already done)
- 2-Step Verification enabled on bajpaishaurya2911@gmail.com, App Password created.
- Password stored in `mail/gmail_app_password.txt`. Login verified OK.
- If login ever fails: create a new App Password at myaccount.google.com/apppasswords (sign in as
  bajpaishaurya2911), overwrite the file with only the 16 characters.

## How to send from chat (steps for Claude)
Run everything from `D:\placement`.

1. Write the pasted emails to a temp file in the session scratchpad (plain text, UTF-8).
2. **Preview** (no sending) to verify folder + attachments:
   ```
   python -c "import sys;sys.path.insert(0,'tools');import mail_ui,json;[print(i['to'],'|',i['subject'],'|',i['company'],'|',i['resume'],'|',i['cover']) for i in mail_ui.preview(open(r'<file>',encoding='utf-8').read())['items']]"
   ```
3. If every row shows the right company and both PDFs, **send**:
   ```
   python mail/mail_ui.py --send <file>
   ```
   or save drafts only: `python mail/mail_ui.py --draft <file>`.
4. Report a table: recipient, subject, folder, attachments, status. Then do the tracker update.

The CLI itself refuses to send if any email has no matched company folder.

## Email block format
```
To: person@company.com
Subject: Application for <Role>
Company: <FolderName>        <- optional, forces the folder, put it right under Subject

Hi <Name>,
...body...

Best,
Shaurya Bajpai
```
- Many emails in one file: each simply starts with its own `To:` line.
- Markdown code fences (```) are stripped automatically.
- Body is sent as plain text. No Markdown, no em-dashes (user's writing rule).

## Company folder matching
Guess order: recipient domain + subject + first 600 chars of body vs folder names (longest match wins).
Variant folders (e.g. `Certa` vs `CertaFrontend`) are picked when the suffix word (Frontend) is in the subject.
**Use `Company:` whenever the name is not clearly present or two folders are similar.**
Folders containing `old_unused` are ignored.

## Hard requirements for attachments
The resume chat must leave PDFs in the company folder named exactly:
- `companies/<Folder>/shaurya_resume_<Folder>.pdf`
- `companies/<Folder>/shaurya_cover_letter_<Folder>.pdf`

If the newest PDF matching those prefixes is stale (resume regenerated after the cover letter, or the
reverse), re-compile first. The tool picks the newest by modified time, it does not know which is "right".
Per user rule, email applications get only: the mail + resume PDF + cover letter PDF, nothing extra.

## Safety rules
- Sending is outward-facing and irreversible. Only send emails the user pasted/approved in the chat.
- Never send with no folder or with a missing resume PDF. Ask instead.
- Never send the same company twice without the user's say-so: check `mail_log.csv` for the recipient.
- Delay between sends is 15 seconds. Gmail daily cap is roughly 500 (about 100 for new/low-reputation
  accounts), so large bursts should be split.
- Do not use the chat's Gmail connector for sending. It is signed in as swayambajpai333@gmail.com, a
  different account, and attachments would have to be pasted as base64.

## After sending
Add the company to `Application_Tracker.xlsx` (user rule). Ask for Source if unknown, never guess.

## Known pitfalls
- Windows line endings (CRLF) in pasted/emailed text are handled. A blank line must separate headers from body.
- Notepad may save the password file as `.txt` or add blank lines: both are handled.
- `setx` env vars only apply to new terminals. The password file avoids that problem.
- If the tool says "No app password", the file is missing or empty.
- Subject/To lines must be single-line. Recipient must be one plain email address.
- Gmail may place first mails to new domains in the recipient's spam. Nothing to fix on our side.

## Manual fallback (UI)
`python mail/mail_ui.py` opens http://127.0.0.1:8765: paste, Preview, fix folder dropdown, Send or Save drafts.
