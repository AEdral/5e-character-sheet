/* Runs on Roll20 game pages: posts the rolls coming from 5e.tools into the chat.
 * Rich style: ready-made roll templates of the "D&D 5E by Roll20" sheet (simple / atkdmg / spell), built on 5e.tools.
 * Basic style: the default template, which works in every game. */
(function () {
	const clean = s => String(s ?? "").replace(/[{}]/g, "").replace(/\|/g, "/").replace(/\n/g, " ");

	function chat () {
		const ta = document.querySelector("#textchat-input textarea");
		const btn = document.querySelector("#textchat-input .btn, #textchat-input button");
		return ta && btn ? {ta, btn} : null;
	}

	async function post (texts, speakAs) {
		const c = chat();
		if (!c) return false;
		const sel = document.querySelector("#speakingas");
		let prevSpeak = null;
		if (sel && speakAs) {
			const opt = [...sel.options].find(o => o.text.trim().toLowerCase() === speakAs.trim().toLowerCase());
			if (opt) { prevSpeak = sel.value; sel.value = opt.value; sel.dispatchEvent(new Event("change", {bubbles: true})); }
		}
		const prev = c.ta.value;
		for (let i = 0; i < texts.length; i++) {
			if (i) await new Promise(r => setTimeout(r, 120));
			c.ta.value = texts[i].replace(/\r?\n/g, " ");
			c.btn.click();
		}
		c.ta.value = prev;
		if (prevSpeak != null) { sel.value = prevSpeak; sel.dispatchEvent(new Event("change", {bubbles: true})); }
		return true;
	}

	function basic (p) {
		let text = `&{template:default} {{name=${clean(p.charName)}: ${clean(p.title)}}}`;
		for (const r of p.rolls || []) text += ` {{${clean(r.label)}=[[${String(r.formula).replace(/[^\dd+\-*/()khl ]/gi, "")}]]}}`;
		if (p.desc) text += ` {{Notes=${clean(p.desc)}}}`;
		return text;
	}

	chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		if (msg?.type !== "roll20.post") return false;
		const p = msg.payload || {};
		const texts = Array.isArray(p.texts) && p.texts.length ? p.texts.map(String).filter(t => /^&\{template:[\w-]+\}/.test(t)) : [basic(p)];
		if (!chat()) { sendResponse({ok: false}); return false; }
		post(texts, p.charName);
		sendResponse({ok: true});
		return false;
	});
})();
