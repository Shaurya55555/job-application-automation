"""Create Gmail drafts (default) or send application emails from companies/<Co>/email.md.

Usage:
  python mail/mail_apply.py Certa CertaFrontend          # save as Gmail drafts
  python mail/mail_apply.py Certa --send                 # actually send
  python mail/mail_apply.py Certa --dry-run              # just show what would happen

Setup (once): enable 2-step verification on the Google account, create an App Password
(myaccount.google.com/apppasswords), then:
  setx GMAIL_APP_PASSWORD "xxxx xxxx xxxx xxxx"

email.md format: first line "To: ...", second "Subject: ...", blank line, body.
Attaches shaurya_resume_<Co>.pdf and shaurya_cover_letter_<Co>.pdf if present.
"""
import argparse, csv, imaplib, os, re, smtplib, sys, time
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPANIES = Path(os.environ.get("COMPANIES_DIR") or (ROOT / "companies" if (ROOT / "companies").exists() else r"D:\placement\companies"))
LOG = ROOT / "mail_log.csv"
USER = "bajpaishaurya2911@gmail.com"
SENDER = f"Shaurya Bajpai <{USER}>"


def parse(path: Path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"\s*To:\s*([^\r\n]+)\r?\nSubject:\s*([^\r\n]+)\r?\n\s*\r?\n(.*)", text, re.S)
    if not m:
        raise ValueError(f"{path}: expected 'To:' / 'Subject:' header then body")
    return m.group(1).strip(), m.group(2).strip(), m.group(3).strip()


def build(co: str) -> EmailMessage:
    folder = COMPANIES / co
    to, subject, body = parse(folder / "email.md")
    if "@" not in to:
        raise ValueError(f"{co}: no valid To address ({to!r})")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = SENDER, to, subject
    msg.set_content(body)
    for name in (f"shaurya_resume_{co}.pdf", f"shaurya_cover_letter_{co}.pdf"):
        f = folder / name
        if f.exists():
            msg.add_attachment(f.read_bytes(), maintype="application", subtype="pdf", filename=name)
        else:
            print(f"  ! {co}: missing attachment {name}")
    return msg


def already_done(co, mode):
    if not LOG.exists():
        return False
    with LOG.open(newline="", encoding="utf-8") as fh:
        return any(r[1] == co and r[2] == mode for r in csv.reader(fh))


def log(co, mode, to):
    with LOG.open("a", newline="", encoding="utf-8") as fh:
        csv.writer(fh).writerow([datetime.now().isoformat(timespec="seconds"), co, mode, to])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("companies", nargs="+")
    ap.add_argument("--send", action="store_true", help="send instead of saving a draft")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="ignore the already-done log")
    ap.add_argument("--delay", type=float, default=20, help="seconds between sends")
    a = ap.parse_args()

    mode = "sent" if a.send else "draft"
    pw = os.environ.get("GMAIL_APP_PASSWORD", "") or (Path(__file__).with_name(".gmail_app_password").read_text() if Path(__file__).with_name(".gmail_app_password").exists() else "")
    pw = pw.replace(" ", "").strip()
    if not a.dry_run and not pw:
        sys.exit("Set GMAIL_APP_PASSWORD first (see docstring).")

    jobs = []
    for co in a.companies:
        if not a.force and already_done(co, mode):
            print(f"- {co}: already {mode}, skipping (use --force)")
            continue
        try:
            jobs.append((co, build(co)))
        except Exception as e:
            print(f"- {co}: SKIPPED ({e})")

    for co, msg in jobs:
        att = [p.get_filename() for p in msg.iter_attachments()]
        print(f"- {co}: {mode} -> {msg['To']} | {msg['Subject']} | {att}")
    if a.dry_run or not jobs:
        return

    if a.send:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(USER, pw)
            for i, (co, msg) in enumerate(jobs):
                s.send_message(msg)
                log(co, mode, msg["To"])
                print(f"  sent {co}")
                if i < len(jobs) - 1:
                    time.sleep(a.delay)
    else:
        im = imaplib.IMAP4_SSL("imap.gmail.com")
        im.login(USER, pw)
        for co, msg in jobs:
            im.append('"[Gmail]/Drafts"', "\\Draft", imaplib.Time2Internaldate(time.time()), msg.as_bytes())
            log(co, mode, msg["To"])
            print(f"  drafted {co}")
        im.logout()


if __name__ == "__main__":
    main()
