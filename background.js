/* Service worker: autenticazione Google + Google Drive.
 * Il token non lascia mai il service worker: la pagina 5e.tools non può leggerlo. */

const SCOPES = [
	"openid",
	"email",
	"profile",
	"https://www.googleapis.com/auth/drive.file",
];
const FOLDER_NAME = "5etools Characters";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

/* ---------------- Token ---------------- */

async function getSettings () {
	const {settings} = await chrome.storage.local.get("settings");
	return settings || {};
}

function manifestClientId () {
	const id = chrome.runtime.getManifest().oauth2?.client_id || "";
	return id.startsWith("PASTE-YOUR") ? "" : id;
}

async function cachedWebToken () {
	const {webToken} = await chrome.storage.session.get("webToken");
	if (webToken && webToken.expiresAt > Date.now() + 60_000) return webToken.token;
	return null;
}

/** Flusso alternativo (Edge, Brave, Chromium): launchWebAuthFlow con client "Applicazione web". */
async function webAuthFlow (interactive) {
	const cached = await cachedWebToken();
	if (cached) return cached;
	const settings = await getSettings();
	const clientId = settings.webClientId || manifestClientId();
	if (!clientId) throw new Error("Google Client ID not configured. See the README (step 'Google sign-in').");
	const redirect = chrome.identity.getRedirectURL();
	const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
		client_id: clientId,
		response_type: "token",
		redirect_uri: redirect,
		scope: SCOPES.join(" "),
		prompt: interactive ? "select_account" : "none",
	});
	const resp = await chrome.identity.launchWebAuthFlow({url, interactive});
	const hash = new URLSearchParams(new URL(resp).hash.slice(1));
	const token = hash.get("access_token");
	if (!token) throw new Error(hash.get("error") || "Sign-in failed");
	const expiresIn = Number(hash.get("expires_in") || 3600) * 1000;
	await chrome.storage.session.set({webToken: {token, expiresAt: Date.now() + expiresIn}});
	return token;
}

async function chromeAuthToken (interactive) {
	const res = await chrome.identity.getAuthToken({interactive, scopes: SCOPES});
	const token = typeof res === "string" ? res : res?.token;
	if (!token) throw new Error("No token");
	return token;
}

async function getToken (interactive = false) {
	const settings = await getSettings();
	const useWeb = settings.authMode === "web" || !manifestClientId();
	if (useWeb) return webAuthFlow(interactive);
	try {
		return await chromeAuthToken(interactive);
	} catch (e) {
		// getAuthToken non esiste fuori da Google Chrome: si prova il flusso web
		if (/not supported|unsupported|Function not implemented/i.test(e.message) && (settings.webClientId)) {
			return webAuthFlow(interactive);
		}
		throw e;
	}
}

async function dropToken (token) {
	try { await chrome.identity.removeCachedAuthToken({token}); } catch (e) { /* ignore */ }
	await chrome.storage.session.remove("webToken");
}

async function signOut () {
	let token = null;
	try { token = await getToken(false); } catch (e) { /* già disconnesso */ }
	if (token) {
		try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token), {method: "POST"}); } catch (e) { /* ignore */ }
		await dropToken(token);
	}
	try { await chrome.identity.clearAllCachedAuthTokens(); } catch (e) { /* ignore */ }
	await chrome.storage.local.remove(["folderId", "user"]);
}

/* ---------------- HTTP ---------------- */

async function api (url, opts = {}, retry = true) {
	const token = await getToken(false);
	const res = await fetch(url, {
		...opts,
		headers: {...(opts.headers || {}), Authorization: "Bearer " + token},
	});
	if (res.status === 401 && retry) {
		await dropToken(token);
		return api(url, opts, false);
	}
	if (!res.ok) {
		let msg = res.status + " " + res.statusText;
		try { msg = (await res.json()).error?.message || msg; } catch (e) { /* ignore */ }
		throw new Error("Google API: " + msg);
	}
	if (res.status === 204) return null;
	const type = res.headers.get("content-type") || "";
	return type.includes("json") ? res.json() : res.text();
}

async function userInfo () {
	const u = await api("https://www.googleapis.com/oauth2/v3/userinfo");
	const user = {email: u.email, name: u.name, picture: u.picture};
	await chrome.storage.local.set({user});
	return user;
}

/* ---------------- Drive ---------------- */

function q (s) { return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

async function ensureFolder () {
	const {folderId} = await chrome.storage.local.get("folderId");
	if (folderId) {
		try {
			const f = await api(`${DRIVE}/files/${folderId}?fields=id,trashed`);
			if (!f.trashed) return folderId;
		} catch (e) { /* ricrea */ }
	}
	const found = await api(`${DRIVE}/files?` + new URLSearchParams({
		q: `name='${q(FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
		fields: "files(id)",
		spaces: "drive",
	}));
	let id = found.files?.[0]?.id;
	if (!id) {
		const created = await api(`${DRIVE}/files?fields=id`, {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder"}),
		});
		id = created.id;
	}
	await chrome.storage.local.set({folderId: id});
	return id;
}

async function driveList () {
	const folder = await ensureFolder();
	const out = [];
	let pageToken;
	do {
		const params = new URLSearchParams({
			q: `'${folder}' in parents and trashed=false`,
			fields: "nextPageToken,files(id,name,modifiedTime,appProperties)",
			pageSize: "200",
		});
		if (pageToken) params.set("pageToken", pageToken);
		const r = await api(`${DRIVE}/files?${params}`);
		out.push(...(r.files || []));
		pageToken = r.nextPageToken;
	} while (pageToken);
	return out.filter(f => f.appProperties?.charId);
}

async function driveGet (fileId) {
	const txt = await api(`${DRIVE}/files/${fileId}?alt=media`);
	return typeof txt === "string" ? JSON.parse(txt) : txt;
}

function safeName (s) {
	return (s || "Unnamed").replace(/[\\/:*?"<>|]/g, "_").slice(0, 100) + ".json";
}

async function driveSave (char, fileId) {
	const folder = await ensureFolder();
	const clean = {...char};
	delete clean._driveId; delete clean._dirty; delete clean._driveModified;
	const body = JSON.stringify(clean, null, 1);
	const meta = {
		name: safeName(char.name),
		mimeType: "application/json",
		appProperties: {charId: char.id, app: "schede-5etools", updatedAt: String(char.updatedAt || Date.now())},
	};
	if (fileId) {
		try {
			return await multipart("PATCH", `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id,modifiedTime`, meta, body);
		} catch (e) {
			if (!/not found|404/i.test(e.message)) throw e;
		}
	}
	return multipart("POST", `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, {...meta, parents: [folder]}, body);
}

function multipart (method, url, meta, body) {
	const boundary = "schede5e" + Math.random().toString(36).slice(2);
	const payload =
		`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
		`--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
	return api(url, {method, headers: {"Content-Type": `multipart/related; boundary=${boundary}`}, body: payload});
}

async function driveTrash (fileId) {
	return api(`${DRIVE}/files/${fileId}?fields=id`, {
		method: "PATCH",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({trashed: true}),
	});
}

/* ---------------- Messaggi ---------------- */

const handlers = {
	"auth.status": async () => {
		try {
			await getToken(false);
			const {user} = await chrome.storage.local.get("user");
			return {signedIn: true, user: user || await userInfo()};
		} catch (e) {
			return {signedIn: false};
		}
	},
	"auth.signIn": async () => {
		await getToken(true);
		return {signedIn: true, user: await userInfo()};
	},
	"auth.signOut": async () => { await signOut(); return {signedIn: false}; },
	"auth.redirectUrl": async () => chrome.identity.getRedirectURL(),
	"drive.list": () => driveList(),
	"drive.get": ({fileId}) => driveGet(fileId),
	"drive.save": ({char, fileId}) => driveSave(char, fileId),
	"drive.delete": ({fileId}) => driveTrash(fileId),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	const h = handlers[msg?.type];
	if (!h) return false;
	Promise.resolve()
		.then(() => h(msg))
		.then(data => sendResponse({ok: true, data}))
		.catch(e => sendResponse({ok: false, error: e?.message || String(e)}));
	return true;
});

/* Clic sull'icona: apre/chiude il pannello, o apre 5e.tools */
chrome.action.onClicked.addListener(async tab => {
	if (tab?.url && /^https:\/\/5e\.tools\//.test(tab.url)) {
		try { await chrome.tabs.sendMessage(tab.id, {type: "ui.toggle"}); return; } catch (e) { /* script non pronto */ }
	}
	chrome.tabs.create({url: "https://5e.tools/index.html#characters"});
});
