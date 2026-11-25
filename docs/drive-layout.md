# xDrive On-Disk Drive Layout

Every Drive in xDrive is a **single self-contained local folder**. Its location is configured via the `XDRIVE_DRIVE_DIR` environment variable and defaults to `./marble-drive` (relative to the server working directory).

Copying or moving that folder moves the entire Drive—folder hierarchy, `.mrbl` documents, metadata, share configuration, checkpoints, AI intent history, Drive Chat threads, per-document AI collaborator chat histories, trash state, and per-drive settings—with no external database required. All paths stored inside Drive metadata files are relative POSIX paths (never absolute host paths).

## Directory Structure

```text
<XDRIVE_DRIVE_DIR>/                 # Default: ./marble-drive/
├── <Folder>/                       # Real user folders (arbitrary nesting)
│   ├── <Subfolder>/
│   │   └── <slug>.mrbl             # Marble HTML5 document source
│   └── <slug>.mrbl
├── <slug>.mrbl                     # Root-level ("My Drive") documents
├── .trash/                         # Soft-deleted documents awaiting auto-purge
│   ├── <slug>.mrbl                 # Trashed document source
│   └── <slug>.meta.json            # Trash timestamp, purge timestamp, original folder & meta
└── .xdrive/                        # Internal Drive metadata, settings, history & chats
    ├── metadata.json               # Folder metadata, document metadata, and trash purge state
    ├── settings.json               # Per-drive settings (retention, model defaults/favorites, view)
    ├── history/
    │   └── <docId>.json            # Per-document checkpoints (max 40) & AI intent history (max 20)
    ├── chats/
    │   └── <threadId>.json         # Persisted Drive Chat threads (/api/drive-chat/threads)
    └── doc-chats/
        └── <docId>.json            # Per-document AI collaborator sidebar chat histories (/api/ai/history)
```

## File Details

### Documents & Folders (`<slug>.mrbl`, `<Folder>/`)

- User folders map 1:1 to real directories under `<XDRIVE_DRIVE_DIR>`.
- Any dot-prefixed directory (`.xdrive`, `.trash`, `.git`, etc.) is skipped when scanning user folders.
- Dropping a raw `.mrbl` file or creating a folder directly on disk is supported: the next workspace load discovers it automatically, derives its title and category from the HTML5 source, and records a deterministic ID in `.xdrive/metadata.json`.
- Moving a `.mrbl` file between folders manually on disk is also recovered on load by matching its slug, and its checkpoint/intent/chat histories follow automatically because they are keyed by `docId`.

### `.xdrive/metadata.json` (Schema v2)

Stores structured metadata for folders, active documents, and trash purge tracking:

```json
{
  "version": 2,
  "folders": {
    "Research": {
      "id": "folder-cae6ddd42477",
      "color": "accent",
      "createdAt": "2026-11-25T03:32:39.379Z",
      "updatedAt": "2026-11-25T03:32:39.379Z"
    }
  },
  "documents": {
    "Research/notes.mrbl": {
      "id": "doc-382feb8a-b87a-482a-9a10-9795c12936df",
      "slug": "notes",
      "title": "Research Notes",
      "description": "",
      "category": "notebook",
      "version": 4,
      "createdAt": "2026-11-25T03:41:49.521Z",
      "updatedAt": "2026-11-25T03:41:56.489Z",
      "createdBy": { "name": "You", "initials": "YO" },
      "lastEditedBy": { "name": "You", "initials": "YO" },
      "starred": false,
      "pinned": false,
      "tags": ["notebook"],
      "share": {
        "isPublicLinkEnabled": false,
        "publicLinkUrl": "https://xdrive.app/d/notes",
        "publicPermission": "view_only",
        "allowDuplication": true,
        "sharedAiDailyLimit": 40,
        "sharedAiUsedToday": 0,
        "collaborators": []
      }
    }
  },
  "trash": {
    "retentionDays": 30,
    "lastPurgedAt": "2026-11-25T04:00:00.000Z",
    "lastPurgedSlugs": []
  }
}
```

### `.xdrive/history/<docId>.json` (Schema v1)

Kept separate from `metadata.json` so checkpoint source snapshots do not bloat the main index:

```json
{
  "version": 1,
  "docId": "doc-382feb8a-b87a-482a-9a10-9795c12936df",
  "slug": "notes",
  "updatedAt": "2026-11-25T04:00:00.000Z",
  "checkpoints": [
    {
      "sha": "a1b2c3d4e5f6",
      "label": "setText #heading",
      "timestamp": 1795492800000,
      "author": "You",
      "opsCount": 1,
      "source": "<!doctype html>..."
    }
  ],
  "intentHistory": [
    {
      "id": "prop-...",
      "note": "Refine introduction",
      "instruction": "Tighten the opening paragraph",
      "ops": [],
      "targetIds": ["intro"],
      "modelId": "antigravity/default",
      "providerId": "antigravity",
      "createdAt": 1795492800000,
      "status": "committed"
    }
  ]
}
```

- Preserved across folder moves, folder renames, soft-delete to `.trash/`, and restore.
- Removed automatically when a document is permanently deleted, auto-purged from Trash, or Trash is emptied.

### `.xdrive/chats/<threadId>.json`

Persisted Drive Chat threads managed via `/api/drive-chat/threads` and `/api/drive-chat/threads/$threadId`:

```json
{
  "id": "chat-a1b2c3d4e5f6",
  "title": "Summarize Research notes",
  "createdAt": "2026-11-25T04:00:00.000Z",
  "updatedAt": "2026-11-25T04:02:00.000Z",
  "modelId": "antigravity/default",
  "reasoningEffort": "high",
  "mode": "review",
  "pinned": false,
  "messages": []
}
```

### `.xdrive/doc-chats/<docId>.json`

Persisted per-document AI collaborator sidebar chat histories managed via `/api/ai/history` and `/api/ai/history/$docId` (plus the workspace-level `drive` key when collaborating from My Drive):

```json
{
  "docId": "doc-382feb8a-b87a-482a-9a10-9795c12936df",
  "updatedAt": "2026-11-25T04:00:00.000Z",
  "messages": []
}
```

- Preserved across folder moves, folder renames, soft-delete to `.trash/`, and restore.
- Removed automatically alongside `.xdrive/history/<docId>.json` when a document is permanently deleted, auto-purged from Trash, or Trash is emptied.

### `.xdrive/settings.json` (Schema v1)

Per-drive preferences that travel with the folder:

```json
{
  "version": 1,
  "trashRetentionDays": 30,
  "defaultModelId": "antigravity/default",
  "favoriteModelIds": ["antigravity/default"],
  "roleAssignments": {
    "implementation": "antigravity/default",
    "exploration": "antigravity/default",
    "review": "antigravity/default",
    "design": "antigravity/default"
  },
  "viewMode": "preview",
  "sortBy": "updated"
}
```

### `.trash/<slug>.mrbl` & `.trash/<slug>.meta.json` (Schema v2)

Soft-deleted documents live in `.trash/` until restored, manually deleted, or auto-purged after `retentionDays` (default 30 days):

```json
{
  "version": 2,
  "slug": "notes",
  "docId": "doc-382feb8a-b87a-482a-9a10-9795c12936df",
  "trashedAt": "2026-11-25T03:32:00.000Z",
  "purgeAt": "2026-12-25T03:32:00.000Z",
  "retentionDays": 30,
  "originalFolderPath": "Research",
  "meta": { "...": "original StoredDocumentMeta" }
}
```

## What Does _Not_ Live in the Drive Folder

- **Built-in templates** (`PREDEFINED_MARBLE_TEMPLATES`): read-only starter blueprints bundled with the app. Documents created from them are saved into `<XDRIVE_DRIVE_DIR>`.
- **Machine-local runtime caches & ephemeral temp dirs**: downloaded platform-specific ACP binaries (`~/.xdrive/acp/antigravity-acp`) and temporary LaTeX / ACP scratch workspaces (`xdrive-antigravity-acp-workspace`, `xdrive-opencode-acp-workspace`) in `os.tmpdir()`.
- **Secrets & credentials**: OpenCode credentials stay in OpenCode CLI's own auth store (`opencode auth login`), and optional fallback/server env vars (`OPENCODE_API_KEY`, `CLERK_SECRET_KEY`, etc.) remain in `.env.local` / environment variables and are never written into the Drive folder.

## Backward Compatibility (Migrate on Read)

Existing Drive folders remain fully compatible without manual migration:

- **v1 `.xdrive/metadata.json`** (missing `trash` block or `version: 1`): automatically upgraded to `version: 2` on read and written back atomically while preserving all existing folder and document entries.
- **Missing `.xdrive/` directory** (raw `.mrbl` files / folders only): discovered on read and indexed into `.xdrive/metadata.json`.
- **Missing `.xdrive/settings.json`, `.xdrive/history/<docId>.json`, `.xdrive/chats/`, or `.xdrive/doc-chats/`**: cleanly default to standard settings and empty histories/threads.
- **v1 `.trash/<slug>.meta.json`** (without `purgeAt` or `docId`): expiry is computed from `trashedAt + retentionDays`, and `docId` falls back to `meta.id`.
- **Legacy `localStorage` data**: favorite models (`xdrive.drive-chat.favorite-models.v1`) migrate once into `.xdrive/settings.json`, and legacy Drive Chat threads (`xdrive.drive-chat.threads.v1`) migrate once into `.xdrive/chats/`, after which both `localStorage` keys are removed.
