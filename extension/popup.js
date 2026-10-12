const $ = (id) => document.getElementById(id);
let profile = { fields: {}, custom: [], resume: null, overwrite: false };

function buildFields() {
  $("fields").innerHTML = "";
  for (const def of FIELD_DEFS) {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.textContent = def.label;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.dataset.key = def.key;
    inp.value = profile.fields[def.key] || def.value;
    wrap.append(lab, inp);
    $("fields").append(wrap);
  }
}

function addQA(q = "", a = "") {
  const row = document.createElement("div");
  row.className = "qa";
  row.innerHTML = '<input type="text" placeholder="question keyword, e.g. why (us|join)"><input type="text" placeholder="answer">';
  row.children[0].value = q;
  row.children[1].value = a;
  $("qa").append(row);
}

function collect() {
  const fields = {};
  document.querySelectorAll("#fields input").forEach((i) => (fields[i.dataset.key] = i.value.trim()));
  const custom = [...document.querySelectorAll(".qa")].map((r) => ({ q: r.children[0].value.trim(), a: r.children[1].value.trim() })).filter((x) => x.q && x.a);
  return { ...profile, fields, custom, overwrite: $("overwrite").checked };
}

async function save() {
  profile = collect();
  await chrome.storage.local.set({ profile });
  $("status").textContent = "Saved.";
}

async function init() {
  const { profile: saved } = await chrome.storage.local.get("profile");
  if (saved) profile = saved;
  buildFields();
  (profile.custom || []).forEach((c) => addQA(c.q, c.a));
  if (!profile.custom?.length) addQA("why (do you want|are you interested|join)", "");
  $("overwrite").checked = !!profile.overwrite;
  $("resumeName").textContent = profile.resume ? "Stored: " + profile.resume.name : "";
}

$("save").onclick = save;
$("addqa").onclick = () => addQA();
$("resume").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    profile.resume = { name: f.name, data: reader.result.split(",")[1] };
    $("resumeName").textContent = "Stored: " + f.name;
    await save();
  };
  reader.readAsDataURL(f);
};
$("fill").onclick = async () => {
  await save();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ask = () => chrome.tabs.sendMessage(tab.id, { type: "FILL" });
  try {
    let r;
    try {
      r = await ask();
    } catch {
      // tab was open before the extension was (re)loaded: inject a fresh copy and retry
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] });
      await new Promise((res) => setTimeout(res, 300));
      r = await ask();
    }
    $("status").textContent = r?.error || `Filled ${r?.filled ?? 0} field(s).`;
  } catch {
    $("status").textContent = "Could not reach this page. Press F5 on it, then try again.";
  }
};

init();
