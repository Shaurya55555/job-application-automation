# Shaurya Autofill (Chrome extension)

Fills career-page applications and Google Forms from a saved profile.

## Install
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** and pick this folder (`D:\placement\autofill-extension`).
3. Click the extension icon, review the profile fields, press **Save profile**.
4. Optional: pick your resume PDF (auto-attached to resume/CV file inputs), add custom Q&A rows.

## Use
- Open a form, then click the blue **Autofill** button (bottom-right), or the toolbar icon then **Fill this page**, or press **Alt+Shift+G**.
- Review before submitting. Nothing is ever submitted automatically.

## Notes
- Blank profile fields (CGPA, gender, CTC, notice period, experience) are skipped, so set them if you want them filled.
- Custom Q&A: left side is a keyword/regex matched against the question text, right side is the answer (e.g. `why (join|us)` -> your answer).
- Handles text/textarea, selects, radios, consent checkboxes, Google Forms radios and dropdowns, and normal resume file inputs.
- Google Forms file-upload questions use a Drive picker and cannot be automated.
- Already-filled fields are left alone unless "Overwrite" is ticked.
- Everything stays in `chrome.storage.local` on your machine.
