# Filesystem Security Model

Authoritative reference for every command in QMS Desktop that touches the
filesystem or launches an external program.

---

## 1. The rule

The renderer is treated as untrusted — not because it is expected to be hostile,
but because a command whose safety depends on the frontend behaving correctly
depends on every line of UI code and every dependency in the bundle.

**A privileged command never accepts a location from the renderer.**

| Case | Who names the location | Rule |
|---|---|---|
| **A. Managed storage** | Backend, from a database id or a name | Filename comes from the database, directory from `get_storage_paths`. Nothing caller-supplied is joined into a path. |
| **B. Import source** | The operator, in a native dialog | Read-only, copied inward once, validated as a real regular file. Never written to or deleted. |
| **C. Export / backup destination** | The operator, in a dialog **the backend opens** | Written once, inside the call that presented the dialog. |
| **D. Internal files** | Backend | Confined to `%APPDATA%\QMSDesktop`. |

### The two helpers

`storage::resolve_managed_file(dir, stored_filename)` — canonicalises the
candidate **and** the storage root and compares resolved ancestry. A string
prefix test is not enough on Windows: junctions and symlinks can share a textual
prefix while resolving elsewhere, and `..`, mixed separators, 8.3 short names and
case differences all defeat text matching. It also refuses a stored value that is
not a bare filename, and `PathBuf::join` silently *replaces* the base when the
joined component is absolute — which is exactly what this prevents.

`storage::validate_import_source(path)` — an operator-chosen source must be an
absolute, canonicalisable, regular file.

---

## 2. Command classification

### SAFE — 23 commands

Backup: `get_backup_status`, `create_local_backup`, `create_backup_to_folder`,
`pick_and_inspect_backup`, `restore_pending_backup`, `restore_managed_backup`,
`delete_backup`, `open_backups_folder`.

Documents: `read_document_file`, `get_document_file_info`, `open_document_file`,
`print_document_file`, `remove_document_attachment`, `attach_document_file`.

Module opens and attaches, all five modules (CAPA, Risks, Complaints, Audits,
Non-Conformities) — hardened in this stage.

Export: `export_text_file`. Storage: `initialize_app_storage`,
`get_app_storage_status`.

### PURPOSEFULLY EXTERNAL — 3 flows

`create_backup_to_folder`, `pick_and_inspect_backup` and `export_text_file` all
need a location outside the application. In each, the **backend** opens the
native dialog, so the destination is trusted because a person chose it during
that call — not because a string arrived saying so.

The five `attach_*_file` commands take an operator-selected source path from the
renderer. That is deliberate: the file picker lives in the form, the path is only
ever read, and `validate_import_source` confirms it is a real file before the
copy. Nothing downstream writes to or deletes it.

### Reported, not changed

`import_license_token`, `activate_license_online` and `validate_license_online`
write `license.json` before validating the result. Licensing is out of scope by
instruction; recorded here so it is not lost.

---

## 3. Backup and restore

### What was wrong

`create_local_backup` and `restore_local_backup` both took a path from the
renderer and checked only `exists()` and `is_dir()`.

- **Create** copied `data.db` — password hashes included — plus settings, the
  licence and every attachment, to any writable location including a UNC share.
  The product never passed a destination; the capability existed for nobody.
- **Restore** overwrote the live database after checking only that a file named
  `data.db` was present in the folder. A text file with that name would replace
  the QMS database, and the original was already gone by the time anyone noticed.

`validate_backup_path` and `validate_import_backup` contained the right idea but
were **separate commands the frontend called first** — advisory, and trivially
skippable by calling the mutating command directly. Both also used
`canonicalize(..).unwrap_or_else(|_| raw)`, which falls back to the unresolved
string exactly when resolution fails — precisely when a check must not be
skipped. Both are gone; the checks now live inside the operations they protect.

### The flows now

**Create** — `create_local_backup` takes no destination and writes to the managed
backups folder. `create_backup_to_folder` opens the folder picker in Rust for a
deliberate external copy, and refuses a destination inside the app data folder,
because a backup stored inside the data it protects is lost with it.

**Restore** — two entry points, neither taking a path:

- `restore_managed_backup(name)` — resolved inside the backups folder and
  required to be a direct child of it.
- `pick_and_inspect_backup()` → `restore_pending_backup()` — the backend opens
  the picker, validates, and **holds the folder** between inspection and
  confirmation, so what gets restored is what was actually validated.

**Delete** — `delete_backup(name)`. Safety backups are not deletable here; they
exist precisely for the moment someone regrets a restore.

### Validation, before anything is touched

1. `data.db` present, non-empty, opens as SQLite
2. `PRAGMA integrity_check` returns `ok`
3. all eight core QMS tables present
4. `schema_migrations` readable
5. schema not newer than this build — a newer database would appear to restore
   and silently drop what this build cannot represent

Inspection opens with the `immutable=1` URI, so it does not even leave a
zero-byte `-wal` behind in the operator's folder.

### Failure-safe replacement

1. validate
2. copy current data aside; abort if that fails
3. stage the new database **beside** the live one and verify the staged copy
4. delete the old `-wal` / `-shm`
5. rename into place
6. re-verify what is now live

Step 3 stops a truncated copy becoming the live database — the bytes are checked
under a different name before anything is replaced. Step 4 matters just as much:
a `-wal` left from the previous database would be replayed on top of the restored
one, which is corruption presenting as a successful restore.

---

## 4. Printing was broken

`print_document_file` appended the path as a trailing argument to
`powershell -Command` and referenced `$args[0]`. PowerShell does not bind `$args`
that way — verified on this machine, `$args.Count` is `0`. `Start-Process`
received a null `-FilePath`, exited non-zero, and every print reported *"check
that a printer is installed"*. Printing had never worked; Stage 4 reported it as
working on the strength of the permission gate alone.

The path now travels in an **environment variable**
(`$env:QMS_PRINT_TARGET`), which binds correctly and never passes through
PowerShell's parser. Interpolating it into the command string would have fixed
the binding and introduced an injection instead — a filename is data.

Failures now surface what Windows actually said, which is where the original bug
hid behind a blanket message.

---

## 5. Audit events

Written to `activity_log` under module `backup`: `BACKUP_CREATED`,
`BACKUP_DELETED`, `RESTORE_STARTED`, `RESTORE_SUCCEEDED`, `RESTORE_FAILED`,
`RESTORE_REJECTED`.

Deliberately **path-free**. An audit line naming an operator's external folder
would put a filesystem layout into the database for every future reader of the
log. Folder names and record counts are recorded; full external paths are not.

---

## 6. Remaining surface

- **Licensing writes before validating** (above). Out of scope by instruction.
- **`copy_dir_recursive`** has no symlink/junction guard and no depth cap. It
  operates only on backend-derived directories today, so it is not currently
  reachable with attacker-chosen input, but it is the weakest remaining helper.
- **`BackupEntry.full_path`** is still returned to the UI for display. Delete and
  restore no longer use it. It discloses the backups directory, which the screen
  already shows.
- No command accepts SQL from the renderer; every `format!`-built query composes
  backend constants only. No `sql:*` capability is granted in
  `capabilities/default.json`, so the SQL plugin is not reachable from the
  frontend either.
