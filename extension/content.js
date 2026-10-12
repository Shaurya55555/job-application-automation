(() => {
  if (window.__shauryaAutofill) return;
  window.__shauryaAutofill = true;

  // ---- defaults (duplicated from defaults.js so the content script is self-contained) ----
  const FIELD_DEFS = [
    { key: "firstName", patterns: ["first name", "given name", "forename"] },
    { key: "lastName", patterns: ["last name", "surname", "family name"] },
    { key: "email", patterns: ["e-?mail"] },
    { key: "phone", patterns: ["phone", "mobile", "contact (no|number)", "whats ?app", "telephone"] },
    { key: "linkedin", patterns: ["linkedin"] },
    { key: "github", patterns: ["github"] },
    { key: "leetcode", patterns: ["leetcode", "coding profile", "hackerrank", "codeforces"] },
    { key: "portfolio", patterns: ["portfolio", "personal (web)?site", "website", "other link"] },
    { key: "cgpa", patterns: ["cgpa", "gpa", "percentage", "aggregate"] },
    { key: "gradYear", patterns: ["graduation (year|date)", "passing year", "year of (graduation|passing)", "batch"] },
    { key: "currentCompany", patterns: ["current (company|employer|organi[sz]ation)", "company name", "employer"] },
    { key: "currentTitle", patterns: ["current (title|role|designation)", "job title", "designation"] },
    { key: "experience", patterns: ["years? of (work )?experience", "total experience", "experience \\(years\\)"] },
    { key: "noticePeriod", patterns: ["notice period", "joining (time|date)", "available (from|to join)"] },
    { key: "currentCtc", patterns: ["current (ctc|salary|compensation)"] },
    { key: "stipend", patterns: ["stipend"] },
    { key: "expectedCtc", patterns: ["expected (ctc|salary|compensation)", "salary expectation", "ctc", "lpa", "compensation"] },
    { key: "branch", patterns: ["branch", "major", "specialization", "stream", "discipline"] },
    { key: "degree", patterns: ["degree", "qualification"] },
    { key: "college", patterns: ["college", "university", "institute", "school name", "institution"] },
    { key: "state", patterns: ["^state", "province"] },
    { key: "country", patterns: ["country"] },
    { key: "city", patterns: ["current (city|location)", "city", "location", "where are you based"] },
    { key: "gender", patterns: ["gender", "sex"] },
    { key: "name", patterns: ["^(full |your |candidate |applicant )?name\\b", "^name$"] }
  ];
  const BOOLEAN_DEFS = [
    { patterns: ["relocat"], answer: "Yes" },
    { patterns: ["work authori[sz]ation", "legally (authori[sz]ed|eligible)", "eligible to work"], answer: "Yes" },
    { patterns: ["sponsorship"], answer: "No" },
    { patterns: ["agree", "consent", "declaration", "terms", "privacy", "i confirm", "certify"], answer: "Yes", checkbox: true }
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toLowerCase().replace(/[*•]/g, " ").replace(/\brequired\b/g, " ").replace(/\s+/g, " ").trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (r.width > 0 || r.height > 0) && cs.visibility !== "hidden" && cs.display !== "none";
  };

  // ---- label discovery ----
  function textOfIds(ids, root) {
    return ids.split(/\s+/).map((id) => (root.getElementById ? root.getElementById(id) : document.getElementById(id))).filter(Boolean).map((e) => e.innerText || e.textContent).join(" ");
  }
  function labelFor(el) {
    const parts = [];
    const root = el.getRootNode();
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    if (el.getAttribute("aria-labelledby")) parts.push(textOfIds(el.getAttribute("aria-labelledby"), root));
    if (el.id) {
      try { root.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).forEach((l) => parts.push(l.innerText)); } catch {}
    }
    const wrap = el.closest("label");
    if (wrap) parts.push(wrap.innerText);
    // Google Forms: question title lives in the list item heading
    const item = el.closest('[role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot');
    if (item) {
      const h = item.querySelector('[role="heading"]');
      if (h) parts.push(h.innerText);
    }
    // Generic: fieldset legend / nearest preceding text in the field wrapper
    const fs = el.closest("fieldset");
    if (fs && fs.querySelector("legend")) parts.push(fs.querySelector("legend").innerText);
    if (parts.every((p) => !norm(p))) {
      const box = el.closest('div[class*="field"], div[class*="form-group"], div[class*="question"], li, .row, div');
      if (box && box.innerText && box.innerText.length < 200) parts.push(box.innerText);
    }
    parts.push(el.getAttribute("placeholder") || "", el.getAttribute("name") || "", el.getAttribute("data-automation-id") || "", el.id || "");
    return norm(parts.join(" "));
  }

  // ---- value setting (works with React/Angular controlled inputs) ----
  function setNative(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    setter ? setter.call(el, value) : (el.value = value);
    for (const t of ["input", "change", "blur"]) el.dispatchEvent(new Event(t, { bubbles: true }));
  }

  function matchKey(label, profile) {
    for (const def of FIELD_DEFS) {
      if (!profile.fields[def.key]) continue;
      if (def.patterns.some((p) => new RegExp(p, "i").test(label))) return def.key;
    }
    return null;
  }
  function matchCustom(label, profile) {
    for (const qa of profile.custom || []) {
      if (!qa.q || !qa.a) continue;
      try { if (new RegExp(qa.q, "i").test(label)) return qa.a; } catch { if (label.includes(qa.q.toLowerCase())) return qa.a; }
    }
    return null;
  }
  function booleanFor(label, checkbox) {
    for (const b of BOOLEAN_DEFS) {
      if (!!b.checkbox !== !!checkbox && b.checkbox) continue;
      if (b.patterns.some((p) => new RegExp(p, "i").test(label))) return b.answer;
    }
    return null;
  }
  const answerFor = (label, profile) => matchCustom(label, profile) ?? (() => { const k = matchKey(label, profile); return k ? profile.fields[k] : null; })();

  function pickOption(options, wanted) {
    const w = norm(wanted);
    return options.find((o) => norm(o.text) === w) || options.find((o) => norm(o.text).includes(w) || (w.length > 2 && w.includes(norm(o.text)) && norm(o.text).length > 1));
  }

  // ---- filling ----
  async function fill(profile) {
    let filled = 0;
    const skipped = [];

    // text-like inputs + textareas
    const inputs = document.querySelectorAll('input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="search"], textarea');
    for (const el of inputs) {
      if (el.disabled || el.readOnly || !visible(el)) continue;
      if (el.value && el.value.trim() && !profile.overwrite) continue;
      const label = labelFor(el);
      if (!label) continue;
      let val = answerFor(label, profile);
      if (val == null && el.type === "email") val = profile.fields.email;
      if (val == null && el.type === "tel") val = profile.fields.phone;
      if (!val) { skipped.push(label.slice(0, 50)); continue; }
      // number inputs can't hold a range: use the lower bound
      if (el.type === "number") val = (String(val).match(/\d+(\.\d+)?/) || [""])[0];
      setNative(el, val);
      filled++;
    }

    // <select>
    for (const el of document.querySelectorAll("select")) {
      if (el.disabled || !visible(el)) continue;
      const label = labelFor(el);
      const val = answerFor(label, profile) ?? booleanFor(label);
      if (!val) continue;
      const opts = [...el.options].map((o) => ({ text: o.text, value: o.value }));
      const hit = pickOption(opts, val);
      if (hit) { setNative(el, hit.value); filled++; }
    }

    // native radio groups
    const groups = {};
    document.querySelectorAll('input[type="radio"]').forEach((r) => { (groups[r.name || r.id] ||= []).push(r); });
    for (const radios of Object.values(groups)) {
      if (radios.some((r) => r.checked) || !visible(radios[0])) continue;
      const label = labelFor(radios[0]);
      const val = answerFor(label, profile) ?? booleanFor(label);
      if (!val) continue;
      const hit = radios.find((r) => norm(labelFor(r) + " " + r.value).includes(norm(val)));
      if (hit) { hit.click(); filled++; }
    }

    // native consent checkboxes
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
      if (cb.checked || !visible(cb)) continue;
      if (booleanFor(labelFor(cb), true) === "Yes") { cb.click(); filled++; }
    }

    // ---- Google Forms widgets ----
    for (const item of document.querySelectorAll('[role="listitem"]')) {
      const heading = item.querySelector('[role="heading"]');
      if (!heading) continue;
      const label = norm(heading.innerText);
      const val = answerFor(label, profile) ?? booleanFor(label);
      if (!val) continue;

      const radios = [...item.querySelectorAll('[role="radio"]')];
      if (radios.length && !radios.some((r) => r.getAttribute("aria-checked") === "true")) {
        const hit = pickOption(radios.map((r) => ({ text: r.getAttribute("data-value") || r.getAttribute("aria-label") || r.innerText, el: r })), val);
        if (hit) { hit.el.click(); filled++; }
        continue;
      }
      const listbox = item.querySelector('[role="listbox"]');
      if (listbox) {
        listbox.click();
        await sleep(250);
        const opts = [...item.querySelectorAll('[role="option"]')].map((o) => ({ text: o.getAttribute("data-value") || o.innerText, el: o }));
        const hit = pickOption(opts, val);
        if (hit) { hit.el.click(); filled++; await sleep(150); }
      }
    }

    // resume file inputs
    if (profile.resume) {
      const bytes = Uint8Array.from(atob(profile.resume.data), (c) => c.charCodeAt(0));
      for (const el of document.querySelectorAll('input[type="file"]')) {
        if (el.files && el.files.length) continue;
        const label = labelFor(el) + " " + norm(el.closest("div")?.innerText || "").slice(0, 100);
        if (!/resume|cv|curriculum/.test(label)) continue;
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], profile.resume.name, { type: "application/pdf" }));
        el.files = dt.files;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      }
    }

    return { filled, skipped };
  }

  async function run() {
    const stored = await chrome.storage.local.get(["profile"]);
    const profile = stored.profile;
    if (!profile) return { filled: 0, error: "Open the extension popup and save your profile first." };
    return fill(profile);
  }

  // ---- floating button ----
  function toast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;bottom:70px;right:16px;z-index:2147483647;background:#111;color:#fff;padding:8px 12px;border-radius:8px;font:13px system-ui";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
  function addButton() {
    if (window.top !== window) return;
    const b = document.createElement("button");
    b.textContent = "Autofill";
    b.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#2563eb;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 13px system-ui;cursor:pointer;opacity:.85;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    b.onclick = async () => { const r = await run(); toast(r.error || `Filled ${r.filled} field(s)`); };
    document.body.appendChild(b);
  }
  if (document.readyState === "complete") addButton(); else window.addEventListener("load", addButton);

  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg.type === "FILL") { run().then(send); return true; }
  });
})();
