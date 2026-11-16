# 5etools Characters

A Chrome extension that adds a D&D Beyond-style character builder and character sheet to **5e.tools**. It uses the site's own data, renderer, hover pop-ups, lists, filters and styling.

- **My Characters**: a pull-out tab on the right edge of every 5e.tools page (or the toolbar icon). From there you can view, edit, create, duplicate, import, export or delete characters.
- **Builder** (D&D Beyond flow): Home → Class → Background → Species → Abilities → Spells → Equipment → Description.
  - Every option is chosen where it is granted: feats (Variant Human, the 2024 background feats, Ability Score Improvements), their spells (Fey Touched, Magic Initiate…), skills, expertise, languages, tools, invocations, maneuvers, metamagic, fighting styles, lineages and so on.
  - Class spells have their own **Spells** step. It checks your spell slots, how many cantrips and prepared/known spells you may have, and your spellbook. It also includes expanded lists (Divine Soul, warlock patrons, the optional lists from Tasha's Cauldron of Everything) and marks spells you already have for free (always prepared, granted by a feat…).
  - **Tasha's Custom Origin** is always available for species ability increases (+2/+1 or +1/+1/+1 to any ability).
- **Lists and filters work like the site's**: the same filter pills (include / exclude / ignore) and sortable columns. The **Source** filter is shared by every list. Spells are sorted by level, then by name.
- **Hover pop-ups** on every link use the site's own hover windows and open after about 1 second. You can turn the delay off in Settings.
- **Character sheet**: abilities, saving throws, senses, skills, proficiencies, AC, initiative, HP (heal/damage, temporary HP), death saves, hit dice, short and long rests. Tabs for Actions, Spells (with slot tracking), Inventory, Features & Traits, Background and Notes. You can print it or save it as a PDF.
- **Saving**: characters are always saved in your browser. Once you sign in with Google, they are also saved to Google Drive, one JSON file per character in the folder "5etools Characters".

## Install
1. Unzip to a folder you will keep.
2. Open `chrome://extensions`, turn on **Developer mode** and click **Load unpacked**. Select the folder.
3. Open https://5e.tools and click **My Characters** on the right edge of the page.

If you are updating from the previous version: remove the old extension first, then load this one. Your saved characters are kept in your browser storage.

## Google sign-in (one-time setup)
1. In https://console.cloud.google.com create a project and enable the **Google Drive API**.
2. Set up the **OAuth consent screen**: choose External, then add yourself (and your friends) as test users.
3. Go to **Credentials → Create OAuth client ID** and pick the type **Chrome Extension**. For the Item ID, use the extension ID shown in `chrome://extensions`.
4. Paste the client ID into `manifest.json` in place of `PASTE-YOUR-CLIENT-ID.apps.googleusercontent.com`, then reload the extension.

Edge, Brave and other Chromium browsers: create a **Web application** client instead. Use the redirect URI shown in *My Characters → Settings*, and paste the client ID into the same settings box.

The extension only sees the Drive files it created itself (`drive.file` scope). The Google token stays in the extension's service worker and is never exposed to the page.

## Notes
- The extension runs inside the 5e.tools page (Chrome's "MAIN" world) so it can use the site's own `Renderer`, `Parser` and `UiUtil`. A small bridge script relays storage and Google Drive requests to the extension.
- Data is read live from `https://5e.tools/data/…`, so anything new the site adds shows up automatically.
- Characters saved with version 1 (the Italian version) are converted automatically when you open them.
