/* Isolated-world bridge: the page-world UI talks to chrome.storage and the service worker only through here. */
(function () {
	const KEYS = new Set(["chars", "settings", "tombstones", "ui"]);
	const TYPES = new Set(["auth.status", "auth.signIn", "auth.signOut", "auth.redirectUrl", "drive.list", "drive.get", "drive.save", "drive.delete"]);
	const reply = (id, ok, data, error) => window.postMessage({__cs5e: "res", id, ok, data, error}, location.origin);

	window.addEventListener("message", async evt => {
		if (evt.source !== window || evt.origin !== location.origin) return;
		const m = evt.data;
		if (!m || m.__cs5e !== "req") return;
		try {
			if (m.op === "get") {
				if (!KEYS.has(m.key)) throw new Error("Key not allowed");
				reply(m.id, true, (await chrome.storage.local.get(m.key))[m.key]);
			} else if (m.op === "set") {
				if (!KEYS.has(m.key)) throw new Error("Key not allowed");
				await chrome.storage.local.set({[m.key]: m.value});
				reply(m.id, true, null);
			} else if (m.op === "send") {
				if (!TYPES.has(m.payload?.type)) throw new Error("Message not allowed");
				chrome.runtime.sendMessage(m.payload, res => {
					const err = chrome.runtime.lastError;
					if (err) return reply(m.id, false, null, err.message);
					if (!res) return reply(m.id, false, null, "No response from the extension");
					reply(m.id, res.ok, res.data, res.error);
				});
			} else if (m.op === "url") {
				reply(m.id, true, chrome.runtime.getURL(m.path || ""));
			}
		} catch (e) {
			reply(m.id, false, null, e.message || String(e));
		}
	});

	chrome.runtime.onMessage.addListener(msg => {
		if (msg?.type === "ui.toggle") window.postMessage({__cs5e: "evt", type: "ui.toggle"}, location.origin);
	});
})();
