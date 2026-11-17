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
- **Dice rolls / Roll20**: click an ability, saving throw, skill, initiative, attack or spell on the sheet to roll it. Shift-click rolls with advantage, Ctrl-click with disadvantage. If a Roll20 game tab is open (`app.roll20.net/editor`), the roll is posted to its chat, speaking as your character when Roll20 has a character with the same name. Otherwise the roll uses the 5etools dice roller. You can turn this off in *My Characters → Settings*.
- **Rich Roll20 chat cards** (D&D Beyond style): checks and saves use the *simple* card (both d20s, advantage/disadvantage highlighted), attacks the *attack & damage* card (to hit, damage per type, critical dice, save DC, notes; one card per Eldritch Blast beam), initiative goes into the turn tracker, and clicking a spell without dice (or right-click → *Post Spell Card*) posts its full spell card. The cards are the roll templates of the **D&D 5E by Roll20** sheet, the default sheet of 5e games. For games with another sheet, choose *Roll20 chat style → Basic* in Settings.
- **Import from D&D Beyond**: on D&D Beyond open the character sheet and use *Export to PDF*, then click *Import from D&D Beyond* in My Characters and pick the PDF. Species, background, classes and subclasses, feats, invocations and other options, skills, languages, class spells, feat spells, Mystic Arcanum and equipment are matched to 5etools data and filled in as builder choices. Ability scores, HP and proficiencies keep the values of the D&D Beyond sheet. Anything that couldn't be matched is listed at the end.
- **Damage**: every damage roll shows its type, with one line per type when a spell deals more than one. Cantrips scale with your level, and Eldritch Blast rolls one attack per beam. Features that add damage are included automatically: Agonizing Blast, Genie's Wrath (with your genie kind), Empowered Evocation, Potent Spellcasting/Blessed Strikes, Improved Divine Smite/Radiant Strikes, Dueling and Archery. **Right-click** any roll for advantage or disadvantage and to add optional extras such as Hex, Hunter's Mark, Sneak Attack, Divine Smite or Genie's Wrath.
- **Homebrew and partnered content**: books you have loaded on 5etools through its Homebrew/Prerelease manager (for example *The Lord of the Rings Roleplaying*, TLotRR) are included in every list.
- **Spell slots** on the sheet are split into shared Spellcasting slots (multiclass table, regained on a long rest) and Pact Magic slots (regained on a short rest).
- **Ad blocking** on 5e.tools uses network rules plus hidden ad slots. You can turn it off in Settings. Keep in mind the site is funded by these ads.
- **Ability Score Improvements** follow the rules: they come at **class** levels (Sorcerer 6 / Cleric 6 → 2 ASIs). An optional house rule in *Home* gives them at character levels 4/8/12/16/19 instead.
- **Saving (no setup)**: characters are always saved in your browser. By default they are also backed up to **your Chrome account** (`chrome.storage.sync`). Nothing to configure: if you are signed in to Chrome with sync on, your characters follow you to every computer where you install the extension. The space is about 100 KB, which is roughly 15–30 characters with a portrait. The drawer shows how much is used.
- **Google Drive (optional)**: one JSON file per character in the folder "5etools Characters". Choose it under *My Characters → Settings → Cloud save*. It needs the one-time setup below.
- **Portraits**: upload an image from a file (it is cropped to a small square to fit the cloud save) or paste a URL. You can also click the portrait on the sheet to change it.

## Install
1. Unzip to a folder you will keep.
2. Open `chrome://extensions`, turn on **Developer mode** and click **Load unpacked**. Select the folder.
3. Open https://5e.tools and click **My Characters** on the right edge of the page.

If you are updating from the previous version: remove the old extension first, then load this one. Your saved characters are kept in your browser storage.

## Google Drive sign-in (optional, one-time setup)
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

## Versions
Every release bumps the minor version in `manifest.json` and is tagged in git (`v2.2.0`, `v2.3.0`, …).
