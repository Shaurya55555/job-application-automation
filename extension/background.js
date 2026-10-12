chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fill-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: "FILL" }).catch(() => {});
});
