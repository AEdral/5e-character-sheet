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
		roll20: payload => send("roll20.send", {payload}),
		notifySettings: () => send("settings.changed"),

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

		/** where characters are backed up: "chrome" (Chrome sync, default), "drive" (Google Drive), "off" */
		cloud: () => CS.data?.settings?.cloud || "chrome",

		/** Save: locally at once, then to the cloud */
		async save (char, {touch = true} = {}) {
			if (touch) char.updatedAt = Date.now();
			char._dirty = true; char._syncDirty = true;
			await S.saveLocal(char);
			if (S.cloud() === "chrome") await S.pushChrome(char).catch(e => { S.syncError = e.message; });
			if (S.auth.signedIn) await S.pushDrive(char);
			S.emit("saved");
			return char;
		},

		async pushChrome (char) {
			await send("sync.save", {char});
			const cur = await S.getLocal(char.id);
			if (cur && cur.updatedAt <= char.updatedAt) { cur._syncDirty = false; await S.saveLocal(cur); }
			char._syncDirty = false;
			S.syncError = null;
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
			if (S.cloud() === "chrome") { try { await send("sync.delete", {id: char.id}); } catch (e) { /* ignore */ } }
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

		/** Two-way sync with Chrome sync storage (newest change wins) */
		async syncChrome () {
			let pulled = 0; let pushed = 0;
			const r = await send("sync.list");
			S.syncUsage = {bytes: r.bytes, quota: r.quota};
			const all = await S.all();
			for (const id of r.tombs) if (all[id] && !all[id]._syncDirty) delete all[id];
			const remote = new Map(r.chars.map(c => [c.id, c]));
			for (const m of r.chars) {
				const local = all[m.id];
				if (!local || (!local._syncDirty && m.u > (local.updatedAt || 0) + 500)) {
					try {
						const c = await send("sync.get", {id: m.id});
						if (c) { c._syncDirty = false; if (local?._driveId) c._driveId = local._driveId; all[m.id] = c; pulled++; }
					} catch (e) { console.warn("[5etools Characters] sync get", e); }
				}
			}
			await set("chars", all);
			for (const c of Object.values(all)) {
				if (c._syncDirty || !remote.has(c.id)) {
					try { await S.pushChrome(c); pushed++; } catch (e) { S.syncError = e.message; console.warn("[5etools Characters] sync", e); }
				}
			}
			try { const r2 = await send("sync.list"); S.syncUsage = {bytes: r2.bytes, quota: r2.quota}; } catch (e) { /* ignore */ }
			return {pulled, pushed};
		},

		/** Sync everything that is enabled */
		async sync () {
			let pulled = 0; let pushed = 0;
			if (S.cloud() === "chrome") { const r = await S.syncChrome(); pulled += r.pulled; pushed += r.pushed; }
			if (!S.auth.signedIn) { S.emit("list"); return {pulled, pushed}; }
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
