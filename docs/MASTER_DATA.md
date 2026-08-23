# Master Data

Authoritative reference for the administrator-managed lookup values — Risk
Sources and Customers — and for how records that use them stay truthful when
those values later change.

---

## 1. The rule everything else follows

**Editing a master value never rewrites history.**

A QMS record is a controlled record. If renaming a customer silently changed what
a complaint raised two years ago says it was about, the complaint would no longer
be evidence of anything. So every record that references master data stores two
things:

| | Stable link | Historical snapshot |
|---|---|---|
| Risk → source | `risks.source_id` | `risks.source` |
| Complaint → customer | `complaints.customer_ref_id` | `complaints.customer_name`, `complaints.customer_id` |

The link is what makes a record findable and filterable. The snapshot is what the
record *says*. Renaming the master moves the master row and nothing else; the
snapshot stays as recorded, and the link keeps the record traceable to the same
master entity.

The second rule follows from the first: **nothing is ever deleted.** Master values
are referenced by historical records and by the activity log, so removal would
orphan them. Deactivation removes a value from the selectors while leaving every
record that used it intact. There is no delete command, and the foreign keys
refuse a destructive delete of anything referenced.

---

## 2. Schema

Added by migration `008_admin_master_data.sql`.

```sql
risk_sources(id, name UNIQUE, sort_order, is_active, created_at, updated_at)
customers(id, customer_code UNIQUE, customer_name, contact_email,
          contact_phone, notes, is_active, created_at, updated_at)
```

`risks.source_id` was appended by `009_risk_source_historical_integrity.sql`;
`complaints.customer_ref_id` by `008`. Both are nullable: a record that predates
the master, or that names a party never added to it, keeps its snapshot and has
no link. That is a supported state, not a broken one.

Seven risk sources ship seeded. They are **suggestions** — the administrator may
rename, reorder or deactivate any of them. `sort_order` drives selector order, so
the list is arranged rather than alphabetical.

---

## 3. Administration

**Master Data** (`/master-data`, Administration) has two tabs.

*Risk Sources* — add, rename, reorder, activate/deactivate, search. The row shows
how many risks reference the source, counted through the stable FK so the figure
survives a rename.

*Customers* — add, edit (name, code, contact details, notes), activate/deactivate,
search by name or code. The row shows the complaint count.

Reordering deliberately acts on the unfiltered list; "move up" is meaningless
against a filtered view, so the arrows are hidden while a search is active.

### Customer code is editable

It was originally immutable, on the grounds that it identifies historical
complaints. That was the right goal reached by the wrong mechanism — a mistyped
code has to be fixable. `update_customer` now takes the code, validates
uniqueness case-insensitively, and leaves complaint snapshots untouched, exactly
as `rename_risk_source` already did. Both return the number of records that kept
their original details so the screen can say what was deliberately left alone.

---

## 4. The complaint customer selector

The complaint form used to have two unrelated free-text boxes, **Customer Name**
and **Customer ID**. Nothing tied them together, so a complaint could be filed
against one customer carrying another customer's code, and nothing would ever
notice.

Now: a searchable selector (matching on name **or** code, since people know
customers by either), and the code is a **read-only derived field**.

The important half is not in the UI. When `customer_ref_id` is set,
`create_complaint` and `update_complaint` read the name and code **from the master
record** and ignore the text the client sent:

```rust
let (customer_name, customer_id_val) = match customer_ref_id {
    Some(ref_id) => resolve_customer_snapshot(&conn, ref_id, existing_ref)?,
    None => (customer_name.trim().to_string(), customer_id.trim().to_string()),
};
```

A snapshot that disagrees with the selected customer is therefore
**unrepresentable**, not merely discouraged by the form.

### Deactivated customers

Offered on nothing new. Kept on the complaint that already references them, and
marked *Inactive* in both the form and the details drawer.
`resolve_customer_snapshot` accepts an inactive customer only when it is the one
already on that record — so editing an old complaint's title cannot force it onto
a different customer, and the exemption does not become a general hole that lets
any dormant customer be selected during an edit.

---

## 5. Existing complaints (migration 012)

Complaints raised before the customer master existed carry only free text. They
must not be lost, guessed at, or require re-entry.

`012_complaint_customer_link.sql` links a complaint to a master record **only on
an exact match of the business code**, compared case-insensitively after
trimming. `customers.customer_code` is UNIQUE, so at most one customer can match
a given code — an exact code match is unambiguous by construction rather than a
guess.

Deliberately not done:

- No fuzzy or partial name matching. "Acme" and "Acme Ltd" are not evidence of the
  same legal entity, and misattributing a complaint is worse than leaving it
  unlinked.
- No name-only matching. Two customers may share a trading name; the code is the
  identifier.
- No rewriting of any complaint text.

An unlinked complaint stays fully readable, is listed normally (the register uses
a LEFT JOIN, so unlinked rows cannot vanish), shows *Not linked — recorded as
text*, and can be linked later by editing it and choosing the customer.

---

## 6. Authorization

| Command | Requires |
|---|---|
| `list_risk_sources` | any of `masterdata.view`, `masterdata.manage`, `risks.view`, `risks.create`, `risks.edit` |
| `list_customer_options` | any of `masterdata.view`, `masterdata.manage`, `complaints.view`, `complaints.create`, `complaints.edit` |
| `list_all_risk_sources`, `list_customers` | `masterdata.manage` |
| every write | `masterdata.manage` |

Choosing a value while raising a record is part of doing the work; administering
the lookup table is a separate act. Requiring master-data rights to populate one
dropdown would mean a custom role granted `complaints.create` could not actually
raise a complaint. The two lookup key sets are named constants
(`RISK_SOURCE_LOOKUP_PERMISSIONS`, `CUSTOMER_LOOKUP_PERMISSIONS`) so the decision
is asserted directly in tests.

The lookup projections stay minimal — id, code, name. Contact details and notes
are only in `list_customers`, which requires `masterdata.manage`.

---

## 7. Audit trail

Written to the existing `activity_log` under module `master_data`:

| Action | Written by |
|---|---|
| `CREATE` | `create_risk_source`, `create_customer` |
| `RENAME` | `rename_risk_source` — records the old and new name and how many risks keep the old label |
| `UPDATE` | `update_customer` — records the old and new name/code and how many complaints keep the original details |
| `ACTIVATE` / `DEACTIVATE` | `set_risk_source_active`, `set_customer_active` |
| `CUSTOMER_LINK_BACKFILL` | migration 012, once, with the number of complaints linked |

Each entry carries the actor, the record id, and a summary. The rename and update
entries deliberately state what was *not* changed, because that is the part a
future reader needs to know.

---

## 8. Test coverage

`shipped_master_data_tests` in `src-tauri/src/commands/master_data.rs` runs the
**real migration files** into a scratch database rather than a restatement of the
schema, so a change to the shipped SQL is what the assertions see. It covers the
seeded sources and their ordering, deactivation leaving records intact, the rename
invariant, delete refusal on both tables, customer code uniqueness, active-only
lookups with historical resolution, and every branch of the 012 backfill including
the name-matches-but-code-does-not case the conservative rule exists for.

`customer_link_tests` in `complaints.rs` covers `resolve_customer_snapshot`
directly: the snapshot comes from the master, an inactive customer is refused for
a new complaint, permitted for the complaint already using it, and still refused
when an edit tries to switch to a *different* inactive one.
