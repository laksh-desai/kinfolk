# Open questions

Things in `docs/SPEC.md` that are ambiguous, internally inconsistent, or that I think are
the wrong call. None of these blocked work: each records my reading, the alternatives, and
what I built. Items marked **Recommend spec change** are places where I implemented what
the spec says but would do it differently.

Status key: **Decided** (built as described, revisit if you disagree) · **Open** (needs you;
built around it) · **Recommend spec change**.

---

## Data model (§3) — expensive to reverse

### Q1 — Reviewers have no home in the model · Decided
§5.7 has reviewers open `/review/:token` and author ChangeRequests (`authorId`), but §3 has
no review token, no reviewer role in `Access.role`, and no record of who the tree was sent to.
- Alternatives: (a) reuse `ShareLink` with a `kind` column; (b) add `reviewer` to
  `Access.role`; (c) a separate `ReviewAssignment` table.
- Decision: (c). `ReviewAssignment { treeId, tokenHash, reviewerEmail, reviewerUserId?,
  decision?, decidedAt? }`. The reviewer must be signed in (ChangeRequest needs an author);
  the first signed-in user to open the link claims it and it is bound to them thereafter.
  Reusing ShareLink would mix a redacted visitor token with a token that exposes planning
  answers — one bug away from a data leak.

### Q2 — Twins / multiple births have no field · Decided
§4.5.15 requires twins to be "ordered sensibly and marked", but Person has no birth order
or multiple-birth field.
- Alternatives: add `birthOrder` + `multipleBirthGroup`; derive.
- Decision: derive. Children of the same Union with identical full birth dates (year,
  month, day all known) are a multiple birth and get a marker. Order within the set falls
  back to creation order. Consequence: twins with unknown or partial dates can't be marked.
  **Recommend spec change:** add an optional `birthOrder` so users can fix the order.

### Q3 — `ParentChild.kind = step` overlaps derived step relationships · Decided
§4.5.7 says step-children are "a partner's children from a prior union", which the graph
already expresses (child of my partner's other Union). §3 also allows an explicit `step` edge.
- Decision: step relationships are **derived** by default, and Add relative → Step-child
  creates the child under the partner's union. An explicit `step` edge is still allowed
  and means "raised by this union's partners, no biological tie to either". The kinship
  calculator treats a `step` edge as a direct step-parent/step-child link that does not
  extend to grandparents.

### Q4 — Adoption, foster, and guardian: how far does each reach? · Decided
- Adopted edges count as full lineage for every derived label: an adopted child's parent's
  mother is their "Grandmother". Only the direct edge is qualified: "Adoptive mother",
  "Adopted son".
- Foster and guardian edges are direct only: "Foster mother" / "Foster son",
  "Guardian" / "Ward". They do not produce grandparents or cousins.

### Q5 — Dates as JSON vs columns · Decided (ADR 005)
§3 shows `birthDate { year, month?, day?, approximate }`. Stored as flat columns so Key
Events can filter by month/day in SQL. API and Zod keep the nested shape.

### Q6 — Placeholders and the required `firstName` · Decided
`firstName` is required, but placeholders are unnamed.
- Decision: a placeholder stores `firstName = ""`. The schema requires a non-empty first
  name unless `isPlaceholder` is true. The display label ("Ravi's parent — unnamed") is
  computed from the graph, not stored, so it stays correct if the graph changes. Naming the
  person clears `isPlaceholder`.

### Q7 — "A child in more than one ParentChild row only when kinds differ" · Decided
Enforced as a DB unique constraint on `(childId, kind)` plus `(childId, unionId)`.
Consequence: nobody can have two biological parental unions. The one realistic case this
rules out is "two possible biological fathers", which is out of scope for a planning tool.

### Q8 — Link-visitor redaction vs. rendering the relationship · Decided
§2 says link visitors see "names, relationships, birth years only". Relationship labels
need gender ("Mother" vs "Parent"). Rendering a deceased person as living would also
misstate the family.
- Decision: the redacted DTO includes `gender`, `lifeStatus`, `isPlaceholder`, the name
  fields, and `birthYear`. It excludes month and day, death date, photo, place, contact,
  address, notes, profession, details, socials, planning, and union dates.

### Q9 — Planning answers: who sees them? · Decided
§5.4 says Planning is "owner and reviewer only". Editors and viewers therefore never
receive planning fields from the API and cannot write them (403). An editor editing a
person's name does not wipe planning, because updates are patches.

### Q10 — AuditEvent retention vs. deletion · Decided
"Every mutation writes an AuditEvent", but account deletion must destroy data, and the
events' `before`/`after` hold PII.
- Decision: AuditEvent rows cascade with their tree. Deleting a tree or account removes the
  audit trail with it. **Open:** a regulated advisor may need a retained, PII-free record
  of the deletion itself. Not built.

### Q11 — Cascade delete when a person has descendants · Decided
§3: blocked "unless the user explicitly confirms a cascade that names every affected
relationship. Never orphan a subtree." Those two sentences pull against each other: a
cascade that removes the only parent would orphan the children.
- Decision: the confirm dialog lists every affected union and parent-child edge by name
  and offers two explicit cascades:
  - "Replace with an unnamed placeholder": relationships kept, descendants stay connected.
  - "Delete and all N descendants": every name listed.

  A plain delete of someone whose children still have another parent in the same union is
  also allowed after confirmation, because nothing is orphaned. Every option is undoable.

## Relationships (§4)

### Q12 — "Add parent" when two parents already exist · Decided
§4.1 says "up to two" but also "never hidden". The action stays visible. If the person
already has a two-partner biological union, the form says so and offers adoptive, step,
foster, or guardian parent instead. This is a different `kind`, so it passes the Q7
constraint.

### Q13 — Half-sibling resolution · Decided
Add relative → Half-sibling asks which parent is shared, or uses the only known parent.
The new sibling goes under a new single-parent union of that parent. It is not placed
under a new union with a placeholder partner, which avoids an extra placeholder. If the
anchor person has no parent, a placeholder parent is created first.

### Q14 — Step-sibling resolution needs up to three placeholders · Decided
Anchor's parent (placeholder if missing) → that parent's new partner (placeholder) → a
single-parent union of that partner → the step-sibling. The summary sentence names every
placeholder created.

### Q15 — In-law terms for unmarried partners · Decided
English has no "-in-law" for unmarried partners. `marriage` unions produce
"Mother-in-law". `partnership` and `unknown` unions produce "Partner's mother". Former
spouses produce "Former mother-in-law".

### Q16 — Maternal/paternal on cousins · Decided
Applied to grandparents and above, and to aunts/uncles and above. Not applied to cousins,
nieces, or nephews, where "maternal first cousin" is unusual and makes the label longer.

### Q17 — Gender-neutral labels · Decided
`other`/`unknown` genders get neutral terms: Parent, Child, Sibling, Spouse, Grandparent.
For aunt/uncle and niece/nephew there is no common neutral word ("pibling" and "nibling"
aren't plain English), so the label is descriptive: "Parent's sibling", "Sibling's child".

### Q18 — Great-aunt vs grand-aunt, great-niece vs grand-niece · Decided
Using "Great-aunt", "Great-niece", "Great-great-aunt". Consistent with "Great-grandmother".

### Q19 — Generation assignment: "longest path" vs anchoring · Decided
§5.3 says "longest path from any root" and also "unless a union anchors them". Pure longest
path leaves a married-in spouse's parents at generation 0 even when the spouse sits at
generation 3. Implementation: longest path, then a reverse-topological pass that pulls
childful roots down to directly above their highest child. Each connected component is
then normalised so its topmost generation is 0.

**Update (M3):** pure longest path produced a visible defect in the seed tree. Priya
(married in, row 3) and her sister Divya ended up on different rows, because Divya's depth
came only from her own shallow ancestry. As built:
1. Each component is first anchored by a breadth-first walk from its first family (one row
   per parent/child hop).
2. Children are pushed down so every child is below every parent.
3. Parents are pulled down to sit directly above their highest child.

This matches the spec's intent ("unless a union anchors them") better than its literal
wording. ADR 014.

### Q34 — Fit-to-content vs. the 25% zoom floor on very large trees · Open
§5.3 requires zoom to stay within 25%–200% and the tree to open "fitted to content… never
clipped or off-screen". §4.5.19 requires a 500-person, six-generation tree. Generational
layout puts about 300 people on the bottom row. The generated 500-person tree is about
88,000 px wide and 1,056 px tall, so fitting it into a 1,280 px window needs about 1.5% zoom.
- Alternatives: allow zoom below 25% for fit only; open at 25% centred on the focus person
  with the minimap showing the whole; compress with collapsed branches by default.
- M5 found it's not only huge trees. The 60-person seed tree is 7,270 px wide and needs
  about 9% zoom to fit a 768 px window, so §12 "opens fitted at every width from 768 to 2560"
  and §5.3 "25%–200%" can't both hold for ordinary families.
- As built (M5):
  - **Fit** (on load and via the Fit button) may go as low as 5%, so a tree opens whole.
  - Manual zoom (buttons, wheel, keys) stays within 25–200%, except that it never pushes
    you further out than a fit level below 25%.
  - When a tree can't fit even at 5% (the 500-person tree needs ~1.5%), fit centres on the
    focus person at 25% and says so; the minimap shows the whole.
  - This is a deliberate deviation from "25%–200%", listed in CLAUDE.md.
- **Recommend spec change:** state the zoom range as "25%–200% for manual zoom; fit may
  go lower".

### Q20 — Where does the in-law branch render? · Decided
§4.3 asks for "separate root components side by side" and says the blood line vs.
married-in distinction must be "subtle, toggleable". Layout packs the in-law root's block
immediately after the block it married into, on whichever side makes its connectors shorter
(M3); the married-in partner sits on the right of the couple. The distinction is a thin labelled bracket above each branch with
no blood relative of the focus person, toggleable from the canvas toolbar. The layout
itself never depends on the focus person, so changing focus doesn't move cards.

## Product behaviour (§5)

### Q21 — Editing while `in_review` · Decided (§5.7 says pick one)
- `in_review`: the tree is locked for everyone. The API returns 409 with a plain-language
  message. The banner says "Sent to <reviewer> for review on <date>. Editing is paused so
  the reviewer sees a stable record. Withdraw to make changes."
- `approved`: editing is allowed. The first edit returns the tree to `draft`, and the
  banner warns about this before it happens.
- `changes_requested`: editing is allowed.

### Q22 — Access invitations vs. relative Invitations · Decided
§3 has two concepts. `Access` (§5.6) grants a role on this tree; it has no token, so it is
accepted by signing in with the invited email and pressing Accept on the dashboard.
`Invitation` (§5.5) invites a relative to build their own tree, with the four-stage
tracker. Joining through an Invitation does **not** grant access to the inviting tree.

### Q23 — What approving a LinkRequest grants · Decided
Approval sets `Person.linkedTreeId` and advances the invitation to `linked`. The inviting
tree's owner can only open the linked tree if they have access to it. Approval therefore
also creates an active **viewer** Access for that owner on the invitee's tree; the
invitee's request is taken as consent. **Open:** you may want the invitee to choose the role.

### Q24 — Share-link and review tokens · Decided
"Signed expiring share tokens": token = `base64url(id).base64url(HMAC-SHA256(id|exp))`, and
only its sha256 is stored. The signature is checked before any DB lookup; revocation and
expiry are checked in the DB. Tokens appear in URL paths (unavoidable for a link), so the
request logger masks every `/s/`, `/review/`, and `/invite/` path segment.

### Q25 — Sessions and CSRF details · Decided (ADR 006)
- Access token: stateless HMAC-signed, 15 min, httpOnly cookie on path `/api`.
- Refresh token: opaque, stored hashed, 30 days, rotated on each use, httpOnly cookie on
  path `/api/auth`. Replaying an already-rotated refresh token revokes the whole session.
- CSRF: double-submit token (a readable `kf_csrf` cookie echoed in `X-CSRF-Token`) plus an
  `Origin` check on every non-GET request.
- `SESSION_SECRET` rotation invalidates sessions *and* share/review links, because all of
  them derive keys from it. **Recommend spec change:** a separate `LINK_TOKEN_SECRET` so
  rotating session keys doesn't break links already sent to advisors.

### Q26 — Forgot-password flow state · Decided
§6.1 requires every screen to be restorable from its URL, but emails can't go in URLs and
auth state can't go in `localStorage`. The pending reset is carried in an httpOnly cookie
set by the API, so `/forgot-password/verify` survives a refresh without the email ever
appearing in the URL. Verifying the code swaps it for a short-lived reset cookie.

### Q27 — Google OAuth in development · Decided (ADR 007)
With `GOOGLE_CLIENT_ID` empty and `NODE_ENV !== production`, "Continue with Google" goes to
an API-served dev consent form. That form calls the same `completeOAuthSignIn` →
`issueSession` path as the real Google callback. Production boot fails if the Google
variables are missing. The dev form is not in the web bundle and is not routable in
production.

### Q28 — Key events: who and which unions · Decided
- Birthdays: living people and people with `lifeStatus = unknown`, if their birth month and
  day are known.
- Anniversaries: `current` unions with a known start month and day.
- Deceased birthdays and ended marriages are excluded; they would be noise on a reminders
  list.
- Year-only dates can't produce an event. The page explains this and links to the
  "needs detail" list.

### Q29 — "Tree head" · Decided
The spec never defines "tree head". It is the first person added to the tree, which is
stored as `focusPersonId` at that moment. The user can change it later.

### Q30 — Lighthouse ≥ 95 and 60 fps at 500 people · Open
There is no Lighthouse or real GPU profiling in this environment's automated loop. I can
measure the bundle size, layout computation time, and culled node counts. The 60 fps and
Lighthouse claims will be marked "not verified" unless I can run them for real.

## Editing people and relationships (§4.6, §5.3, §5.4) — M6

### Q35 — Re-parent "via the detail panel or drag onto a couple's connector" · Decided
§4.6 offers two ways to re-parent, joined by "or".
- Alternatives: build both; build the panel path only.
- Decision: the panel path only. The Relationships screen has "Move to different parents",
  a list of every family in the tree. Drag-and-drop onto a connector has no keyboard
  equivalent of its own, and the panel path already satisfies the requirement for
  everyone.
- **Recommend spec change** if drag is wanted: make it additive and keep the panel as the
  accessible path.

### Q36 — How precise are union dates in the relationship editor? · Decided
§4.6 says "change a union's type or status and its dates".
- Decision: the Relationships screen edits start and end **years**. A known month and day
  are kept when the year is unchanged. Unions keep full partial dates in the model, so a
  finer editor can come later. Anniversaries need a month and day (Q28), so until then
  those come from data entered elsewhere, such as import.

### Q37 — Does a photo change wait for the form's Save? · Decided
- Alternatives: stage the upload and attach on Save; attach immediately.
- Decision: attach immediately as its own undoable change, with a toast and Undo. Uploads
  are slow and a staged file is easy to lose to navigation. The copy under the control
  says photo changes save straight away.

### Q38 — Keyboard access to the card menu · Decided
§5.3 wants a right-click menu that is keyboard reachable.
- Decision: the Menu key and Shift+F10 open it on the focused card; the canvas help text
  says so. Every menu action is also in the always-visible panel, which is the only
  keyboard path on keyboards without a Menu key.

### Q39 — Undo history across a refresh · Decided
§5.3 asks for "undo/redo with at least 20 steps" and doesn't say whether history survives
a reload.
- Decision: history lives in memory per tree (100 steps) and is lost on refresh. Every
  change is already saved and audited, so nothing is lost but the shortcut. Persisting it
  would mean storing inverse ops, which can include planning text the viewer may not see
  (ADR 012), in browser storage, which CLAUDE.md forbids for anything sensitive.

### Q40 — Google Places path can't be verified here · Open
There is no Places key in this environment, so the autocomplete path (ADR 020) is built
but has never run against Google. Free text is the default and is tested. Verify with a
real key before enabling it in production: load on focus, suggestion fills the parts, CSP
allows the script.

## Collaboration (§5.5, §5.6) — M8

### Q41 — Who may accept a relative invitation? · Decided
The invitation link is a bearer token sent to one email address. Requiring the accepting
account's email to match would strand anyone who signs up with a different address, which
is common for a relative using a personal account.
- Decision: any signed-in account holding the link may accept, and the acceptance records
  who took it. Accepting grants **no** access to the inviting tree (Q22), so the worst case
  is a wasted invitation the owner can withdraw and resend.

### Q42 — Who may invite a relative? · Decided
§5.5 says "invite a relative by email from their card", without naming a role.
- Decision: owners and editors, since it changes nothing in the tree and is how a family
  builds out its branches. Granting **access** stays owner-only (§5.6). Both are rate
  limited per account.

### Q43 — A share link can't be shown twice · Decided
Only the token's hash is stored (Q24), so an existing link can never be displayed again.
- Decision: the screen says so when the link is created ("copy it now"), lists existing
  links with their status and expiry for revoking, and offers creating a fresh link when
  one is lost. The alternative — storing usable tokens — is exactly what a leak would need.

## Reported from use (M11)

### Q44 — "Never orphan a subtree" blocks removing the top of a tree · Recommend spec change
§3 says both "Never orphan a subtree" and "A person may have zero parents (the graph is
allowed to have many roots)". Read strictly, the first sentence means the only parent of a
child can never simply be removed — so a grandfather entered by mistake at the top of a tree
can only be deleted by deleting everyone below him. A user hit exactly that within minutes
of using the app.
- Alternatives: (a) keep the refusal and tell people to use the placeholder mode; (b) allow
  the removal and name the children who will be left without a parent first.
- Decision: (b), ADR 026. The children keep every other relationship and become roots, which
  §3 explicitly permits, and the dialog names them before anything happens.
- Recommend spec change: reword to "never orphan a subtree *silently*" — the guarantee worth
  keeping is that nothing disappears unnamed, not that a tree can never be corrected from the
  top.

### Q45 — The planning questionnaire is out of scope · Recommend spec change
§3, §5.4 and §5.7 carry five advisory questions per person, owner-and-reviewer only. The
product owner removed them: "This app is purely to create family trees, nothing else."
- Decision: removed in full, including the `Person.planning` column and the `standard`
  visibility level that existed only to hide it (ADR 028). SPEC.md is not edited.
- Recommend spec change: drop the planning field from §3, the Planning section from §5.4,
  and the planning sentence from §5.7 and §2's role table. Review still makes sense without
  it: a professional reads the tree and approves it or asks for changes.

### Q46 — Date format and how much of a date quick add takes · Decided
§5.4 says dates may be partial and must never be required, but does not say what order to
show or collect them in. The build used day/month/year and quick add asked only for a year.
- Decision: month/day/year throughout (entry fields, formatted dates, relative times), and
  quick add takes the whole date of birth with day and month optional (ADR 031). Both came
  from the product owner while using the app.
- The locale is fixed, not derived from the browser: a tree read by a family in several
  countries should not change meaning depending on who opens it. If that is wrong, the
  formatting is in one place (`formatPartialDate`) plus three `toLocaleDateString` calls.

### Q47 — Cards show an age, which §5 and §6.17 rule out · Recommend spec change
§5 specifies "birth–death years (not a bare age)" on the person card, and §6.17 lists "cards
show a bare integer age with no dates and no indication of death" as a defect of the product
being replaced. The product owner asked for the age instead: "instead of displaying birth year
on each member's card, display their current age."
- Decision: living people show "Age 38" (or "Age about 37" from a year-only date); the deceased
  keep their lifespan, since they have no current age and §3 requires the lifespan (ADR 032).
- The defect's substance is kept: the age is labelled, death is still shown on the card, and the
  full dates sit in the panel one click away. What changed is the default summary.
- Recommend spec change: §5 should read "a living person's age or a deceased person's lifespan,
  never a bare integer with no indication of death", and §6.17 should be narrowed to the real
  failure — an unlabelled number that hides whether the person is alive.

### Q48 — Whose name goes beside Kinfolk, and how far the branding goes · Decided
The spec describes an unbranded product. The logo supplied reads "ATS Wealth Management — A
Simplicity Company" while the brief said "ATS financial".
- Decision (from the product owner): "ATS Wealth Management" everywhere, held in one constant
  (`COMPANY` in `components/Brand.tsx`) so it can never be spelled two ways; dark theme by
  default; gender colour as an accent rather than a full card tint (ADR 033).
- §5 says the canvas is "a warm, calm surface" and names no company. The build now carries ATS
  livery throughout. Recommend the spec gain a short branding section rather than leaving the
  product nameless.
- Also worth the owner's eye: exports now show the same age the app shows. A printed tree is
  dated at the foot, so an age reads unambiguously — but if these are filed for years, dates
  may age better than ages. One line in `exportTree.ts` (`today`) switches it back.

### Q49 — Public records and the client household are not in the spec · Decided
The CEO of ATS asked for a person's public records PDF to be attachable and easy to open, and for
the client couple to stand out on the canvas. §3 gives a Person a photo and no other file, and
§5 marks only the focus person.
- Decision: one `Person.publicRecordUrl`, PDF only, stored under the tree and opened in a new tab
  (ADR 034); the focus person and their current partner marked together as the client household
  (ADR 035).
- Worth the owner's eye: one document per person is all this holds. If ATS will attach wills,
  deeds, or several records per person, say so and it becomes a table before anyone relies on the
  single field.
- Public records are private to the tree: members see them, share links never do, and they are
  left out of exports and GEDCOM.

### Q50 — A preview deployment needs services the spec assumes exist · Decided
§9 describes production: real Google sign-in, object storage, and mail. A preview for ATS has
none of those and should cost nothing.
- Decision: `ALLOW_DEV_ADAPTERS=true` lets a production build boot on the file-backed adapters,
  saying so at boot; Google sign-in is switched off rather than stood in for, because the
  development consent page signs you in as any address typed into it; `SIGNUP_ALLOWLIST` closes
  registration (ADR 036, `docs/DEPLOY.md`).
- Open for the owner: a preview delivers no email, so password reset, access invitations, and
  review links do not arrive. Members already see invitations in their dashboard inbox and share
  links are copied from the UI, so the gap is password reset. Setting `SMTP_URL` closes it
  whenever a mail provider is worth the ten minutes.
- Free-plan caveats worth knowing before the link is sent: the database expires after 30 days and
  the service sleeps after 15 minutes idle, so the first visit of the day takes about a minute.

## Environment

### Q31 — Node version · Decided
`.nvmrc` says 22 per spec. This machine has Node 23.5; everything is written to Node 22 APIs
and CI should use 22.

### Q33 — `"lint": "eslint . && tsc --noEmit -b"` does not run · Recommend spec change
`tsc` rejects `-b` unless it is the first argument ("error TS5023: Unknown compiler option
'-b'"). The script name is unchanged. The command is `tsc -b --noEmit`. Build mode also
refuses `--noEmit` when one project references another ("TS6310: Referenced project may
not disable emit"). So api and web each `include` `packages/shared/src` directly instead
of using a project reference. Type-checking coverage is the same.

### Q32 — Repository root name · Decided
§7.1 shows `kinfolk/` as the root. The repo directory is `family_tree_app/`, and the root
package is named `kinfolk`. Nothing depends on the directory name.
