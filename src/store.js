/* Archiviazione: locale (chrome.storage) + sincronizzazione Google Drive tramite il service worker */
(function () {
	const CS = globalThis.CS5E;

	const pending = new Map();
	let seq = 0;
	window.addEventListener("message", evt => {
		if (evt.source !== window) return;
		const m = evt.data;
		if (!m || m.__cs5e !== "res" || !pending.has(m.id)) return;
		const {resolve, reject} = pending.get(m.id);
		pending.delete(m.id);
		m.ok ? resolve(m.data) : reject(new Error(m.error || "Error"));
	});
	const bridge = (msg, timeout = 120000) => new Promise((resolve, reject) => {
		const id = `${Date.now()}-${++seq}`;
		pending.set(id, {resolve, reject});
		window.postMessage({__cs5e: "req", id, ...msg}, location.origin);
		setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("The extension is not responding: reload the page.")); } }, timeout);
	});
	const send = (type, payload = {}) => bridge({op: "send", payload: {type, ...payload}});
	const get = key => bridge({op: "get", key}, 15000);
	const set = (key, value) => bridge({op: "set", key, value}, 15000);

	const S = (CS.store = {
		auth: {signedIn: false, user: null},
		listeners: new Set(),
		onChange (fn) { S.listeners.add(fn); return () => S.listeners.delete(fn); },
		emit (what) { for (const fn of S.listeners) { try { fn(what); } catch (e) { console.error(e); } } },

		async getSettings () { return {edition: "all", hoverDelay: true, ...(await get("settings") || {})}; },
		async getUi () { return (await get("ui")) || {}; },
		async setUi (v) { await set("ui", v); },
		async setSettings (s) { await set("settings", s); },

		async authStatus () {
			try { S.auth = await send("auth.status"); } catch (e) { S.auth = {signedIn: false}; }
			S.emit("auth");
			return S.auth;
		},
		async signIn () { S.auth = await send("auth.signIn"); S.emit("auth"); return S.auth; },
		async signOut () { S.auth = await send("auth.signOut"); S.emit("auth"); return S.auth; },
		redirectUrl: () => send("auth.redirectUrl"),

		async all () { return (await get("chars")) || {}; },
		async list () {
			const chars = Object.values(await S.all());
			return chars.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
		},
		async getLocal (id) { return (await S.all())[id] || null; },

		async saveLocal (char) {
			const all = await S.all();
			all[char.id] = char;
			await set("chars", all);
		},

		/** Salva: locale subito, Drive se connesso */
		async save (char, {touch = true} = {}) {
			if (touch) char.updatedAt = Date.now();
			char._dirty = true;
			await S.saveLocal(char);
			if (S.auth.signedIn) await S.pushDrive(char);
			S.emit("saved");
			return char;
		},

		async pushDrive (char) {
			try {
				const r = await send("drive.save", {char, fileId: char._driveId});
				const cur = await S.getLocal(char.id);
				const target = cur || char;
				target._driveId = r.id; target._dirty = false; target._driveModified = r.modifiedTime;
				char._driveId = r.id; char._dirty = false;
				await S.saveLocal(target);
				S.lastSync = Date.now(); S.syncError = null;
			} catch (e) {
				S.syncError = e.message;
				throw e;
			}
		},

		async remove (char) {
			const all = await S.all();
			delete all[char.id];
			await set("chars", all);
			if (char._driveId) {
				if (S.auth.signedIn) {
					try { await send("drive.delete", {fileId: char._driveId}); } catch (e) { await S.tombstone(char._driveId); }
				} else await S.tombstone(char._driveId);
			}
			S.emit("list");
		},
		async tombstone (fileId) {
			const t = (await get("tombstones")) || [];
			if (!t.includes(fileId)) t.push(fileId);
			await set("tombstones", t);
		},

		/** Sincronizza in entrambe le direzioni (vince la modifica più recente) */
		async sync () {
			if (!S.auth.signedIn) return {pulled: 0, pushed: 0};
			let pulled = 0; let pushed = 0;
			const tomb = (await get("tombstones")) || [];
			for (const fileId of tomb) { try { await send("drive.delete", {fileId}); } catch (e) { /* già eliminato */ } }
			await set("tombstones", []);
			const files = await send("drive.list");
			const all = await S.all();
			const seen = new Set();
			for (const f of files) {
				const id = f.appProperties.charId;
				seen.add(id);
				const local = all[id];
				const remoteTime = Number(f.appProperties.updatedAt || Date.parse(f.modifiedTime) || 0);
				if (!local || (!local._dirty && remoteTime > (local.updatedAt || 0) + 500)) {
					const remote = await send("drive.get", {fileId: f.id});
					remote._driveId = f.id; remote._dirty = false;
					all[id] = remote; pulled++;
				} else if (!local._driveId) {
					local._driveId = f.id;
				}
			}
			await set("chars", all);
			for (const c of Object.values(all)) {
				if (c._dirty || !c._driveId || !seen.has(c.id)) {
					if (c._driveId && !seen.has(c.id) && !c._dirty) { delete c._driveId; }
					try { await S.pushDrive(c); pushed++; } catch (e) { console.warn("[Schede 5e.tools] sync", e); }
				}
			}
			S.lastSync = Date.now();
			S.emit("list");
			return {pulled, pushed};
		},
	});
})();
