/* Runs on Roll20 game pages: posts the rolls coming from 5e.tools into the chat as a roll template. */
(function () {
	const clean = s => String(s ?? "").replace(/[{}]/g, "").replace(/\|/g, "/").replace(/\n/g, " ");

	function post (text, speakAs) {
		const ta = document.querySelector("#textchat-input textarea");
		const btn = document.querySelector("#textchat-input .btn, #textchat-input button");
		if (!ta || !btn) return false;
		const sel = document.querySelector("#speakingas");
		let prevSpeak = null;
		if (sel && speakAs) {
			const opt = [...sel.options].find(o => o.text.trim().toLowerCase() === speakAs.trim().toLowerCase());
			if (opt) { prevSpeak = sel.value; sel.value = opt.value; sel.dispatchEvent(new Event("change", {bubbles: true})); }
		}
		const prev = ta.value;
		ta.value = text;
		btn.click();
		ta.value = prev;
		if (prevSpeak != null) { sel.value = prevSpeak; sel.dispatchEvent(new Event("change", {bubbles: true})); }
		return true;
	}

	chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		if (msg?.type !== "roll20.post") return false;
		const p = msg.payload || {};
		let text = `&{template:default} {{name=${clean(p.charName)}: ${clean(p.title)}}}`;
		for (const r of p.rolls || []) text += ` {{${clean(r.label)}=[[${String(r.formula).replace(/[^\dd+\-*/()khl ]/gi, "")}]]}}`;
		if (p.desc) text += ` {{Notes=${clean(p.desc)}}}`;
		sendResponse({ok: post(text, p.charName)});
		return false;
	});
})();
