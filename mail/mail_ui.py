"""Paste-and-send application mailer. Run:  python mail/mail_ui.py   (opens http://127.0.0.1:8765)

Paste one or many emails (each starting with a "To:" line, then "Subject:", blank line, body).
It guesses the company folder for each, attaches that folder's newest resume + cover letter PDFs,
and either saves drafts or sends from your Gmail. Needs env var GMAIL_APP_PASSWORD (see mail_apply.py).
"""
import csv, imaplib, json, os, re, smtplib, sys, threading, time, webbrowser
from datetime import datetime
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPANIES = Path(os.environ.get("COMPANIES_DIR") or (ROOT / "companies" if (ROOT / "companies").exists() else r"D:\placement\companies"))
LOG = ROOT / "mail_log.csv"
USER = "bajpaishaurya2911@gmail.com"
SENDER = f"Shaurya Bajpai <{USER}>"
PORT = 8765


def get_password():
    """Env var first, else the gitignored file mail/gmail_app_password.txt."""
    pw = os.environ.get("GMAIL_APP_PASSWORD", "")
    if not pw:
        d = Path(__file__).resolve().parent
        for name in (".gmail_app_password", "gmail_app_password.txt"):
            if (d / name).exists():
                pw = (d / name).read_text(encoding="utf-8-sig")
                break
    return pw.replace(" ", "").strip()


def flat(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def folders():
    return sorted(p.name for p in COMPANIES.iterdir() if p.is_dir() and "old_unused" not in p.name)


def newest(folder, prefix):
    c = sorted((COMPANIES / folder).glob(prefix + "*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
    return c[0].name if c else None


def guess(to, subject, body, names):
    hay = flat(to.split("@")[-1] + " " + subject + " " + body[:600])
    hits = [n for n in names if len(flat(n)) >= 3 and flat(n) in hay]
    if not hits:
        return ""
    best = max(hits, key=lambda n: len(flat(n)))
    # variants like CertaFrontend: pick when the suffix word appears in the subject
    subj = flat(subject)
    for n in names:
        rest = flat(n)[len(flat(best)):]
        if flat(n).startswith(flat(best)) and len(rest) >= 3 and rest in subj:
            return n
    return best


def parse_blocks(text):
    text = re.sub(r"```\w*", "", text)
    parts = re.split(r"(?im)^\s*To:\s*", text)
    out = []
    for p in parts[1:]:
        m = re.match(r"([^\r\n]+)\r?\n\s*Subject:\s*([^\r\n]+)\r?\n(.*)", p, re.S)
        if not m:
            out.append({"error": "Could not read block (need To:, Subject:, body)", "raw": p[:80]})
            continue
        body = re.sub(r"\n\s*---\s*$", "", m.group(3).strip()).strip()
        out.append({"to": m.group(1).strip(), "subject": m.group(2).strip(), "body": body})
    return out


def preview(text):
    names = folders()
    items = []
    for b in parse_blocks(text):
        if "error" in b:
            items.append(b)
            continue
        co = b.get("forced") if b.get("forced") in names else guess(b["to"], b["subject"], b["body"], names)
        b.update(company=co, resume=newest(co, "shaurya_resume_") if co else None,
                 cover=newest(co, "shaurya_cover_letter_") if co else None)
        items.append(b)
    return {"items": items, "companies": names}


def build(item):
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = SENDER, item["to"], item["subject"]
    msg.set_content(item["body"])
    for key in ("resume", "cover"):
        name = item.get(key)
        if name and item.get("company"):
            f = COMPANIES / item["company"] / name
            msg.add_attachment(f.read_bytes(), maintype="application", subtype="pdf", filename=name)
    return msg


def log(co, mode, to):
    with LOG.open("a", newline="", encoding="utf-8") as fh:
        csv.writer(fh).writerow([datetime.now().isoformat(timespec="seconds"), co, mode, to])


def act(items, mode):
    pw = get_password()
    if not pw:
        return [{"to": "-", "status": "No app password: put it in mail/gmail_app_password.txt"}]
    res = []
    try:
        if mode == "send":
            s = smtplib.SMTP_SSL("smtp.gmail.com", 465)
            s.login(USER, pw)
        else:
            s = imaplib.IMAP4_SSL("imap.gmail.com")
            s.login(USER, pw)
        for i, it in enumerate(items):
            try:
                msg = build(it)
                if mode == "send":
                    s.send_message(msg)
                    if i < len(items) - 1:
                        time.sleep(15)
                else:
                    s.append('"[Gmail]/Drafts"', "\\Draft", imaplib.Time2Internaldate(time.time()), msg.as_bytes())
                log(it.get("company", ""), "sent" if mode == "send" else "draft", it["to"])
                res.append({"to": it["to"], "status": "sent" if mode == "send" else "drafted"})
            except Exception as e:
                res.append({"to": it["to"], "status": f"FAILED: {e}"})
        s.quit() if mode == "send" else s.logout()
    except Exception as e:
        res.append({"to": "-", "status": f"Login/connection failed: {e}"})
    return res


PAGE = r"""<!doctype html><meta charset=utf-8><title>Mail Apply</title>
<style>
body{font:14px system-ui;max-width:900px;margin:20px auto;padding:0 12px}
textarea{width:100%;height:240px;font:13px monospace}
button{padding:9px 16px;margin:6px 6px 6px 0;cursor:pointer;border-radius:6px;border:1px solid #888}
.go{background:#2563eb;color:#fff;border:0;font-weight:600}.send{background:#16a34a;color:#fff;border:0;font-weight:600}
.card{border:1px solid #ccc;border-radius:8px;padding:10px;margin:8px 0}.warn{color:#b91c1c}
pre{white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:6px;max-height:150px;overflow:auto}
</style>
<h2>Paste application emails</h2>
<p>Each email starts with <code>To:</code>, then <code>Subject:</code>, blank line, body. Paste as many as you like.</p>
<textarea id=t placeholder="To: hr@company.com&#10;Subject: ...&#10;&#10;body..."></textarea><br>
<button class=go onclick=prev()>Preview</button>
<div id=out></div>
<script>
let data=null;
async function prev(){
  const r=await fetch('/preview',{method:'POST',body:t.value});data=await r.json();render();
}
function render(){
  let h='';
  data.items.forEach((it,i)=>{
    if(it.error){h+=`<div class=card><b class=warn>${it.error}</b><pre>${esc(it.raw)}</pre></div>`;return;}
    const opts=['',...data.companies].map(c=>`<option ${c==it.company?'selected':''}>${c}</option>`).join('');
    h+=`<div class=card><b>${esc(it.to)}</b> &mdash; ${esc(it.subject)}<br>
    Company folder: <select onchange="setco(${i},this.value)">${opts}</select>
    <span id=att${i}>${att(it)}</span><pre>${esc(it.body)}</pre></div>`;
  });
  h+='<button onclick="go(\'draft\')">Save all as drafts</button><button class=send onclick="go(\'send\')">Send all now</button><div id=res></div>';
  out.innerHTML=h;
}
function att(it){
  if(!it.company)return '<span class=warn>no folder: no attachments</span>';
  return `<br>&#128206; ${it.resume||'<span class=warn>no resume pdf</span>'} &nbsp; ${it.cover||'<span class=warn>no cover letter pdf</span>'}`;
}
async function setco(i,c){
  const r=await fetch('/files?c='+encodeURIComponent(c));const f=await r.json();
  Object.assign(data.items[i],{company:c,resume:f.resume,cover:f.cover});
  document.getElementById('att'+i).innerHTML=att(data.items[i]);
}
async function go(mode){
  const items=data.items.filter(x=>!x.error);
  if(mode=='send'&&!confirm('Send '+items.length+' email(s) now?'))return;
  res.innerHTML='Working...';
  const r=await fetch('/act?mode='+mode,{method:'POST',body:JSON.stringify(items)});
  const j=await r.json();
  res.innerHTML=j.map(x=>`<div>${esc(x.to)}: ${esc(x.status)}</div>`).join('');
}
function esc(s){return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
</script>"""


class H(BaseHTTPRequestHandler):
    def _send(self, body, ctype="application/json"):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/files"):
            c = re.search(r"c=([^&]*)", self.path).group(1)
            from urllib.parse import unquote
            c = unquote(c)
            ok = c in folders()
            self._send(json.dumps({"resume": newest(c, "shaurya_resume_") if ok else None,
                                   "cover": newest(c, "shaurya_cover_letter_") if ok else None}))
        else:
            self._send(PAGE, "text/html")

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n).decode("utf-8")
        if self.path.startswith("/preview"):
            self._send(json.dumps(preview(raw)))
        elif self.path.startswith("/act"):
            mode = "send" if "mode=send" in self.path else "draft"
            self._send(json.dumps(act(json.loads(raw), mode)))


def cli(path, mode):
    items = preview(Path(path).read_text(encoding="utf-8"))["items"]
    ok = [i for i in items if "error" not in i]
    for i in items:
        if "error" in i:
            print("SKIP:", i["error"], i.get("raw", ""))
        else:
            print(f"- {i['to']} | {i['subject']} | {i['company'] or 'NO FOLDER'} | {i['resume']} | {i['cover']}")
    if any(not i["company"] for i in ok):
        print("Refusing: some emails have no company folder. Add a 'Company: <Folder>' line.")
        return
    for r in act(ok, mode):
        print(r["to"], "->", r["status"])


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] in ("--send", "--draft"):
        cli(sys.argv[2], "send" if sys.argv[1] == "--send" else "draft")
        sys.exit()
    srv = HTTPServer(("127.0.0.1", PORT), H)
    print(f"Open http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
    threading.Timer(0.8, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    srv.serve_forever()
