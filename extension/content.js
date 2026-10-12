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
    { key: "branch", patterns: ["field of study", "branch", "major", "specialization", "stream", "discipline"] },
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
    const aid = (el.getAttribute && el.getAttribute("data-automation-id")) || "";
    if (/dateSection/i.test(aid)) {
      const w = el.closest('[data-automation-id^="formField"]') || el.parentElement;
      if (w) { const wr = w.getBoundingClientRect(); return wr.width > 0 || wr.height > 0; }
    }
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


  // ---- work experience / education sections ----
  const DEFAULT_EXPERIENCE = [
    { title: "SDE Intern", company: "Marine Edge", location: "Bengaluru", from: "2025-03", to: "2026-01", current: false,
      description: "- Engineered a full-stack web platform serving 7,000+ users globally, owning features from the React UI to Node.js REST APIs\n- Integrated the Razorpay REST API and automated deployment with CI/CD, shipping frequent updates with fewer manual steps\n- Built role-based access control (RBAC) and tuned queries and indexes for a 30% faster load speed\n- Diagnosed production issues through log analysis to root cause rather than surface symptoms" },
    { title: "Frontend Web Developer Intern", company: "APJ Academy", location: "Bengaluru", from: "2024-08", to: "2025-02", current: false,
      description: "- Optimized database queries, reducing data retrieval latency by 25% through query and index analysis\n- Implemented real-time data synchronization over WebSockets for low-latency updates\n- Built responsive UIs in React.js, collaborating with the team on code reviews and quality" }
  ];

  // Workday wraps every field in <div data-automation-id="formField-<key>"> inside sections like workExperience-1.
  function wdFormKey(el) {
    let n = el;
    for (let i = 0; i < 10 && n && n.getAttribute; i++, n = n.parentElement) {
      const m = /^formField-(.+)$/.exec(n.getAttribute("data-automation-id") || "");
      if (m) return m[1];
    }
    return "";
  }
  const WD_EXP = /^(jobTitle|companyName|location|currentlyWorkHere|startDate|endDate|roleDescription|description)$/i;
  const WD_EDU = /^(school|degree|fieldOfStudy|gradeAverage|firstYearAttended|lastYearAttended)$/i;

  function sectionOf(el) {
    const key = wdFormKey(el);
    if (key) {
      if (WD_EXP.test(key)) return "experience";
      if (WD_EDU.test(key)) return "education";
    }
    for (let n = el, i = 0; i < 14 && n && n.getAttribute; i++, n = n.parentElement) {
      const a = n.getAttribute("data-automation-id") || "";
      if (/workExperience/i.test(a)) return "experience";
      if (/^education|educationSection/i.test(a)) return "education";
    }
    let found = null;
    for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,[role="heading"]')) {
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = h; else break;
    }
    if (!found) return "";
    const t = norm(found.innerText);
    if (/education|academic|qualification/.test(t)) return "education";
    if (/experience|employment|internship|work history/.test(t)) return "experience";
    return "";
  }

  function fmtDate(iso, el) {
    if (!iso) return "";
    const [y, m] = iso.split("-");
    if (el.type === "month") return `${y}-${m}`;
    if (el.type === "date") return `${y}-${m}-01`;
    const ph = (el.getAttribute("placeholder") || "").toLowerCase();
    if (ph.includes("dd/mm/yyyy")) return `01/${m}/${y}`;
    if (ph.includes("mm/dd/yyyy")) return `${m}/01/${y}`;
    if (/yyyy-mm/.test(ph)) return `${y}-${m}`;
    if (/mmm|month/.test(ph) && !/mm\/yyyy/.test(ph)) return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1]} ${y}`;
    return `${m}/${y}`;
  }

  function isDateLike(el, label) {
    if (el.type === "date" || el.type === "month") return true;
    const ph = (el.getAttribute("placeholder") || "").toLowerCase();
    return /mm\s*[\/-]\s*yyyy|dd\s*[\/-]\s*mm|mm\s*[\/-]\s*dd|yyyy\s*[\/-]\s*mm/.test(ph) || /^(from|to)\b|start date|end date/.test(label);
  }

  function expKind(el, label) {
    const k = wdFormKey(el).toLowerCase();
    if (k === "roledescription" || k === "description") return "desc";
    if (k === "jobtitle") return "title";
    if (k === "companyname") return "company";
    if (k === "location") return "location";
    if (isDateLike(el, label)) return "date";
    if (el.tagName === "TEXTAREA" || /descri|responsibilit|duties|summary|achievement/.test(label)) return "desc";
    if (/company|employer|organi[sz]ation/.test(label)) return "company";
    if (/job title|position|designation|^title|^role\b/.test(label)) return "title";
    if (/location|city/.test(label)) return "location";
    return null;
  }

  // Index every field in document order (filled or not) so block N always gets entry N.
  function indexSections(fields) {
    const map = new Map();
    const c = { desc: 0, company: 0, title: 0, location: 0, from: 0, to: 0, date: 0, eduFrom: 0, eduTo: 0 };
    for (const el of fields) {
      if (!visible(el)) continue;
      const label = labelFor(el);
      const sect = sectionOf(el);
      const wd = /dateSection(Month|Year)/i.exec(el.getAttribute("data-automation-id") || "");
      if (wd && (sect === "experience" || sect === "education")) {
        const part = wd[1].toLowerCase();
        const key = wdFormKey(el);
        let role = /^startDate$|firstYearAttended/i.test(key) ? "from" : /^endDate$|lastYearAttended/i.test(key) ? "to" : null;
        let idx;
        if (role) {
          const ck = `wd_${role}_${part}`;
          idx = (c[ck] = (c[ck] ?? -1) + 1);
        } else {
          const ck = "wd_" + part;
          const pair = (c[ck] = (c[ck] ?? -1) + 1);
          role = pair % 2 === 0 ? "from" : "to";
          idx = Math.floor(pair / 2);
        }
        map.set(el, { sect, kind: role, idx, part });
        continue;
      }
      if (sect === "experience") {
        const kind = expKind(el, label);
        if (!kind) continue;
        if (kind === "date") {
          let role = /^from\b|start|joined/.test(label) ? "from" : /^to\b|end|until/.test(label) ? "to" : null;
          if (!role) role = c.date % 2 === 0 ? "from" : "to";
          c.date++;
          map.set(el, { sect, kind: role, idx: c[role]++ });
        } else map.set(el, { sect, kind, idx: c[kind]++ });
      } else if (sect === "education" && isDateLike(el, label)) {
        const role = /^to\b|end|graduat/.test(label) ? "to" : /^from\b|start/.test(label) ? "from" : (c.eduFrom <= c.eduTo ? "from" : "to");
        role === "from" ? c.eduFrom++ : c.eduTo++;
        map.set(el, { sect, kind: role, idx: 0 });
      }
    }
    return map;
  }

  function sectionalValue(el, info, profile) {
    if (!info) return null;
    const exps = profile.experience && profile.experience.length ? profile.experience : DEFAULT_EXPERIENCE;
    if (info.part) {
      let iso;
      if (info.sect === "education") {
        if (info.idx > 0) return null;
        iso = info.kind === "from" ? (profile.fields.eduFrom || "2023-08") : (profile.fields.eduTo || "2027-08");
      } else {
        const e = exps[info.idx];
        if (!e || (info.kind === "to" && e.current)) return null;
        iso = info.kind === "from" ? e.from : e.to;
      }
      if (!iso) return null;
      const [y, m] = iso.split("-");
      return info.part === "month" ? m : y;
    }
    if (info.sect === "education") {
      return fmtDate(info.kind === "from" ? (profile.fields.eduFrom || "2023-08") : (profile.fields.eduTo || "2027-08"), el);
    }
    const e = exps[info.idx];
    if (!e) return null;
    switch (info.kind) {
      case "desc": return e.description;
      case "company": return e.company;
      case "title": return e.title;
      case "location": return e.location;
      case "from": return fmtDate(e.from, el) || null;
      case "to": return e.current ? null : fmtDate(e.to, el) || null;
    }
    return null;
  }

  // Types a date char by char so masked / controlled date inputs accept it.
  async function typeDate(el, str) {
    const digits = (v) => (v || "").replace(/\D/g, "");
    el.click();
    if (await writeValue(el, str) && digits(el.value) === digits(str)) return;
    const attempt = async (text) => {
      el.click();
      el.focus();
      if (el.select) el.select();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, "");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      let cur = "";
      for (const ch of text) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keypress", { key: ch, bubbles: true }));
        cur += ch;
        setter.call(el, cur);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ch }));
        el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
        await sleep(15);
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      await sleep(120);
    };
    await attempt(str);
    if (digits(el.value) !== digits(str)) await attempt(digits(str)); // mask inserts the slash itself
    if (digits(el.value) !== digits(str)) {
      setNative(el, str); // last resort
      console.debug("[autofill] date field rejected typed value", el.value, "wanted", str);
    }
  }

  // ---- typeahead (type, wait, pick suggestion / press Enter) ----
  function visibleSuggestions() {
    return [...document.querySelectorAll('[role="option"], [role="listbox"] li, ul.ui-autocomplete li, .autocomplete-suggestions div, [class*="suggest"] li, [class*="option"], [role="radio"], label:has(input[type="radio"]), [role="menuitem"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]')]
      .filter((o) => visible(o) && norm(o.innerText).length > 0 && o.offsetHeight < 120);
  }
  async function realClick(node) {
    try { node.scrollIntoView({ block: "nearest" }); } catch {}
    const r = node.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const t of ["pointerover", "mouseover", "pointermove", "mousemove", "pointerdown", "mousedown"]) {
      node.dispatchEvent(t.startsWith("pointer") ? new PointerEvent(t, { ...o, pointerType: "mouse", isPrimary: true }) : new MouseEvent(t, o));
    }
    try { node.focus(); } catch {}
    for (const t of ["pointerup", "mouseup", "click"]) {
      node.dispatchEvent(t.startsWith("pointer") ? new PointerEvent(t, { ...o, pointerType: "mouse", isPrimary: true }) : new MouseEvent(t, o));
    }
  }
  const keyEv = (el, key, code, kc) => { for (const t of ["keydown", "keyup"]) el.dispatchEvent(new KeyboardEvent(t, { key, code, keyCode: kc, which: kc, bubbles: true, cancelable: true })); };
  const chosenIn = (el, want) => {
    const box = el.closest('[data-automation-id="multiSelectContainer"]') || el.closest('[data-automation-id^="formField"]') || el.parentElement;
    if (!box) return false;
    const c = box.cloneNode(true); // ignore the open results list, count only chips already chosen
    c.querySelectorAll('[role="listbox"], [role="option"], [data-automation-id="promptOption"], [data-automation-id*="popup" i], [data-automation-id*="menu" i]').forEach((n) => n.remove());
    return norm(c.innerText || c.textContent).includes(want);
  };
  // pick a result: click it like a user, check it landed in the widget, else try the keyboard
  async function pickResult(el, hit, want) {
    console.debug("[autofill] option html:", hit.outerHTML.slice(0, 260));
    const nodes = [hit, hit.querySelector("[data-automation-id='promptLeafNode'], [data-automation-id='menuItemLabel'], div, span, label, input")].filter(Boolean);
    for (const n of nodes) {
      await realClick(n);
      await sleep(350);
      if (chosenIn(el, want) || !document.contains(hit)) return true;
    }
    el.focus();
    keyEv(el, "ArrowDown", "ArrowDown", 40);
    await sleep(150);
    keyEv(el, "Enter", "Enter", 13);
    await sleep(350);
    return chosenIn(el, want);
  }
  async function typeahead(el, attempts, fallbackOther, waitMs = 900) {
    let sawOptions = false;
    for (const text of attempts) {
      await writeValue(el, text);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: text.slice(-1), bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: text.slice(-1), bubbles: true }));
      await sleep(waitMs);
      const opts = visibleSuggestions();
      if (opts.length) sawOptions = true;
      const want = norm(text);
      const hit = opts.find((o) => norm(o.innerText) === want) || opts.find((o) => norm(o.innerText).includes(want)) || (text === "Other" ? opts[0] : null);
      if (hit) { await pickResult(el, hit, want); return true; }
      for (const t of ["keydown", "keyup"]) el.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      await sleep(400);
      if (norm(el.value) && opts.length) return true;
    }
    if (fallbackOther && sawOptions) {
      // dropdown exists but nothing matched: follow the page's "type Other" instruction
      setNative(el, "Other");
      await sleep(700);
      const o = visibleSuggestions()[0];
      if (o) o.click();
      return true;
    }
    setNative(el, attempts[0]); // no suggestion UI detected: leave the full value in place
    return false;
  }

  // Multi-select "type to add" boxes (Workday skills): type, press Enter to search, then click the matching result.
  async function addTag(el, text) {
    const key = (t) => el.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    const want = norm(text);
    if (chosenIn(el, want)) return true;
    await writeValue(el, text);
    key("keydown"); key("keypress"); key("keyup");
    let hit = null;
    for (let i = 0; i < 12 && !hit; i++) {
      await sleep(250);
      const opts = visibleSuggestions().filter((o) => !o.contains(el));
      hit = opts.find((o) => norm(o.innerText) === want) || opts.find((o) => norm(o.innerText).includes(want)) || null;
    }
    console.debug("[autofill] skill", text, hit ? "-> " + norm(hit.innerText).slice(0, 30) : "-> no match");
    if (hit) console.debug("[autofill] skill", text, "selected:", await pickResult(el, hit, want));
    if (el.value) { el.focus(); if (el.select) el.select(); try { document.execCommand("delete"); } catch {} if (el.value) setNative(el, ""); }
    return !!hit;
  }

  // Most compatible write: behaves like the user typing (execCommand), falls back to native setter, then per-char typing.
  async function writeValue(el, val) {
    const same = () => norm(el.value) === norm(val) || el.value.replace(/\D/g, "") === String(val).replace(/\D/g, "") && /\d/.test(val) && !/[a-z]/i.test(val);
    el.focus();
    if (el.select) el.select();
    try { document.execCommand("delete"); document.execCommand("insertText", false, val); } catch {}
    await sleep(80);
    if (same()) { el.dispatchEvent(new Event("change", { bubbles: true })); return true; }
    setNative(el, val);
    await sleep(80);
    return same();
  }

  // ---- filling ----
  let skillsDone = false;
  async function fill(profile) {
    let filled = 0;
    const skipped = [];
    const sectionMap = indexSections(document.querySelectorAll('input:not([type]), input[type="text"], input[type="search"], input[type="date"], input[type="month"], textarea'));

    // text-like inputs + textareas
    const inputs = document.querySelectorAll('input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input[type="search"], input[type="date"], input[type="month"], textarea');
    for (const el of inputs) {
      if (el.disabled || (el.readOnly && !sectionMap.has(el)) || !visible(el)) continue;
      if (el.value && el.value.trim() && !/^[mdy\/\-._\s]+$/i.test(el.value) && !profile.overwrite) continue;
      const label = labelFor(el);
      if (!label && !/(^|--)skills$/i.test(el.id || "")) continue;
      let val = null;
      const sect = sectionOf(el);
      const wdSkills = wdFormKey(el).toLowerCase() === "skills" || /(^|--)skills$/i.test(el.id || "");
      if ((wdSkills || /\bskills?\b/.test(label)) && !/experience|years|rating|level/.test(label) && profile.fields.skills) {
        if (skillsDone) continue; // fill() runs several passes; add skills only once per run
        skillsDone = true;
        const list = String(profile.fields.skills).split(/[,;]/).map((x) => x.trim()).filter(Boolean).slice(0, 14);
        for (const skill of list) await addTag(el, skill);
        filled++;
        continue;
      }
      const info = sectionMap.get(el);
      if (info) { val = sectionalValue(el, info, profile); console.debug("[autofill]", info.sect, info.kind, info.idx, "->", val); }
      if (val == null) val = answerFor(label, profile);
      if (val == null && el.type === "email") val = profile.fields.email;
      if (val == null && el.type === "tel") val = profile.fields.phone;
      if (!val) { skipped.push(label.slice(0, 50)); continue; }
      // number inputs can't hold a range: use the lower bound
      if (el.type === "number") val = (String(val).match(/\d+(\.\d+)?/) || [""])[0];
      if (sect === "education" && /school|university|college|institution/.test(label) && !/degree/.test(label)) {
        const w = String(val).split(/\s+/);
        await typeahead(el, [val, w.slice(0, 2).join(" "), w[0]], true);
      } else if (sect === "education" && /field of study|major|branch|discipline/.test(label)) {
        await typeahead(el, ["Computer Science", "Computer Engineering", val, "Computer"], false);
      } else if (info && !info.part && (info.kind === "from" || info.kind === "to") && el.type !== "date" && el.type !== "month") {
        await typeDate(el, val);
      } else {
        if (info?.part) { el.closest('[data-automation-id="dateInputWrapper"], [data-automation-id^="formField"]')?.querySelector('[data-automation-id^="dateSection"][data-automation-id$="display"]')?.click?.(); }
        const ok = await writeValue(el, val);
        console.debug("[autofill] wrote", JSON.stringify(label.slice(0, 30)), "->", JSON.stringify(val.slice(0, 20)), ok ? "ok" : "REJECTED by page");
      }
      filled++;
    }

    // <select>
    for (const el of document.querySelectorAll("select")) {
      if (el.disabled || !visible(el)) continue;
      const label = labelFor(el);
      const val = answerFor(label, profile) ?? booleanFor(label);
      if (!val) continue;
      const opts = [...el.options].map((o) => ({ text: o.text, value: o.value }));
      let hit = pickOption(opts, val);
      if (!hit && /degree|qualification/.test(label)) {
        for (const syn of ["bachelor degree", "bachelor's degree", "bachelors degree", "bachelor of technology", "bachelor of engineering", "bachelor", "b.tech", "btech", "b.e", "undergraduate", "graduate"]) {
          hit = pickOption(opts, syn);
          if (hit) break;
        }
      }
      if (hit) { setNative(el, hit.value); filled++; }
    }

    // custom dropdowns (role=combobox / aria-haspopup=listbox, not <select> or text inputs)
    for (const trig of document.querySelectorAll('[role="combobox"]:not(input):not(select), [aria-haspopup="listbox"]:not(input):not(select)')) {
      if (!visible(trig)) continue;
      const label = labelFor(trig);
      if (!/degree|qualification/.test(label)) continue;
      trig.click();
      await sleep(350);
      const opts = visibleSuggestions().map((o) => ({ text: o.innerText, el: o }));
      let hit = null;
      for (const syn of ["bachelor degree", "bachelor's degree", "bachelor", "b.tech", "undergraduate"]) {
        hit = pickOption(opts, syn);
        if (hit) break;
      }
      if (hit) { hit.el.click(); filled++; await sleep(200); }
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

    // native consent checkboxes + "I currently work here"
    const exps = profile.experience && profile.experience.length ? profile.experience : DEFAULT_EXPERIENCE;
    let cwIdx = 0;
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
      if (!visible(cb)) continue;
      if (/currently (work|working)|present/.test(labelFor(cb))) {
        const e = exps[cwIdx++];
        if (e && e.current && !cb.checked) { cb.click(); filled++; }
        continue;
      }
      if (cb.checked) continue;
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
    let stored;
    try {
      stored = await chrome.storage.local.get(["profile"]);
    } catch {
      return { filled: 0, error: "Extension was reloaded. Refresh this page (F5) and try again." };
    }
    const profile = stored.profile;
    if (!profile) return { filled: 0, error: "Open the extension popup and save your profile first." };
    const total = (profile.experience && profile.experience.length ? profile.experience : DEFAULT_EXPERIENCE).length;
    skillsDone = false;
    let r = await fill(profile);
    const titleCount = () => [...document.querySelectorAll("input")].filter((i) => visible(i) && sectionOf(i) === "experience" && /job title|position|designation|^title/.test(labelFor(i))).length;
    for (let round = 0; round < total - 1; round++) {
      const before = titleCount();
      if (before >= total) break;
      const btn = [...document.querySelectorAll("button,a,[role=button]")].find((b) => /^\s*add (another|more|experience|work)/i.test(b.innerText || "") && sectionOf(b) === "experience");
      if (!btn) break;
      btn.click();
      for (let t = 0; t < 12 && titleCount() <= before; t++) await sleep(250); // wait for new block
      await sleep(400);
      for (let pass = 0; pass < 2; pass++) {
        const r2 = await fill(profile);
        r.filled += r2.filled;
        await sleep(300);
      }
    }
    // final sweep: fields that rendered late or were reset by the page
    const r3 = await fill(profile);
    r.filled += r3.filled;
    return r;
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
    document.getElementById("__shaurya_autofill_btn")?.remove(); // button left by a stale/reloaded copy
    const b = document.createElement("button");
    b.id = "__shaurya_autofill_btn";
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
