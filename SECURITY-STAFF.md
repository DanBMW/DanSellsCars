# Staff pages and customer data: what protects what

Written October 2026. This file is not published on the website (`*.md` is
excluded in `_config.yml`), but the repo is public, so **never put a password,
PIN, token or key in it**.

## The two layers

1. **Page gates** (`staff-gate.js`): the admin password on `admin.html` and
   `links.html`, the manager PIN on `team-board.html` and `Forecourt.html`, and
   Nathan's PIN on `newcar.html`. Only salted PBKDF2 hashes are stored. These
   are cosmetic: the site is static and public, so anyone can read the page
   source, and a 4-digit PIN can be brute-forced from its hash in seconds.
   They stop the wrong person wandering in, nothing more.
2. **Firebase Auth + database rules** (`staff-auth.js`, `database.rules.json`,
   `storage.rules`). This is the real protection, enforced by Google's
   servers:
   - **Signed customer forms** (`disclosures/`): customers can create a record
     but nobody can read, change or delete one except a staff account. Before
     this change anyone could read a record by its ID, and anyone with an
     anonymous Firebase sign-in could list every record.
   - **Staff writes**: board control and settings (reload, videos, play, held
     board), the banner, birthdays, the used-car manager's screenshot,
     mug-shot blocking, event deals and profit-challenge deals need a Google
     account listed under `/staff` in the database.
   - **Colleague writes** (mug shot entries/votes/current, Nathan's newcar
     upload, the forecourt tools and games, the board's own stockwatch and
     screen-pairing writes) need any Firebase sign-in. The pages do a quiet
     anonymous sign-in, so nobody sees anything. This only stops plain
     scripted writes; anyone determined can still get an anonymous sign-in
     with the public API key. The next step up would be Firebase App Check.
   - **Reads** of board data stay public so the office TV needs no sign-in.
   - **Storage**: no page uses it any more, so it is fully locked. Old PDFs are
     still reachable in the Firebase console.

When a staff-only write is refused, the page shows a "Staff sign-in" card
(Sign in with Google). If the account is not on the staff list, the card shows
its user ID so Dan can add it.

## One-off setup (Dan)

1. Firebase console, project **forecourt-1b6bc**, Authentication, Sign-in
   method: check **Google** and **Anonymous** are both enabled. (Google is
   already on and dan-sells.co.uk is already an authorised domain.)
2. Publish the rules, either:
   - Console: Realtime Database, Rules tab: replace everything with the
     contents of `database.rules.json`, Publish. Then Storage, Rules tab:
     replace with `storage.rules`, Publish. Or
   - Terminal, from the repo folder:
     `npx firebase-tools login` then
     `npx firebase-tools deploy --only database,storage --project forecourt-1b6bc`
3. Open https://dan-sells.co.uk/admin.html, enter the password, flip any
   switch. The Staff sign-in card appears: sign in with your Google account.
   It will say the account is not on the staff list yet and show an ID.
4. Firebase console, Realtime Database, Data tab: add a child at the top
   called `staff`, and inside it a child whose name is that ID and whose value
   is `true`.
5. Back on admin.html, tap "Use a different Google account" and pick the same
   account. The card closes and the switch saves. You stay signed in on that
   browser.
6. Repeat steps 3 to 5 for each manager who uses the board's manager panel
   (they will see the card the first time they save a deal or a banner line).

If anything misbehaves after publishing, the console's Rules tab keeps a
history: pick the previous version and publish it to roll back.

## Changing a gate password or PIN

From the repo folder: `node scripts/gate-hash.mjs admin` (or `manager`,
`newcar`). It asks twice without showing what you type, rewrites
`staff-gate.js`, and tells you the commit/push command. Use a long passphrase
where you can.

## Testing rule changes

`scripts/test-firebase-rules.mjs` runs 103 allow/deny checks against the
Firebase emulator (instructions at the top of the file). Nothing touches the
real database.
