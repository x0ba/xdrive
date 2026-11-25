# xDrive URL Scheme

Every navigable view, folder, `.mrbl` document, Drive Chat thread, AI collaborator panel tab, settings provider section, and destination modal in xDrive has a stable, human-readable, shareable URL managed by TanStack Router (`src/routes/`).

All navigation controls render real HTML links (`<a>` / TanStack Router `<Link>`), so standard browser behaviors work everywhere:

- `Cmd`/`Ctrl`+click and middle-click open any folder, document, tab, chat thread, settings section, or destination modal in a new browser tab.
- Browser Back/Forward (`history.back()` / `history.forward()`) and the workspace toolbar arrows share the same history stack.
- Hard reload (`F5` / `Cmd+R`) or opening a bookmarked/shared deep link restores the exact view via TanStack Start + Nitro SSR (`200 OK`).
- All `/api/*` server routes remain untouched.

---

## Route Table

| Route Pattern                  | Route File (`src/routes/`)                   | View / Purpose                                                                                                                                                              | Path Params        | Validated Search Params            | Example URL                                                                            |
| ------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------- | -------------------------------------------------------------------------------------- |
| `/`                            | `index.tsx`                                  | Canonical home redirect -> `/drive` (preserves global search params)                                                                                                        | —                  | Global (`ai`, `modal`, `shareDoc`) | `/` -> `/drive`                                                                        |
| `/drive`                       | `_workspace/drive.tsx`                       | My Drive root folder browser                                                                                                                                                | —                  | Global + `view`, `sort`, `q`       | `/drive?view=list&sort=title&q=qec`                                                    |
| `/f/$folderId`                 | `_workspace/f/$folderId/index.tsx`           | Folder short-link -> redirects to `/f/$folderId/$slug` (404 if missing)                                                                                                     | `folderId`         | Global + `view`, `sort`, `q`       | `/f/folder-papers` -> `/f/folder-papers/papers`                                        |
| `/f/$folderId/$slug`           | `_workspace/f/$folderId/$slug.tsx`           | Nested folder browser; looks up by `folderId` only, canonicalizes wrong `slug`, 404 if missing                                                                              | `folderId`, `slug` | Global + `view`, `sort`, `q`       | `/f/folder-papers-qec/surface-codes?view=icon`                                         |
| `/d/$docId`                    | `_workspace/d/$docId/index.tsx`              | Document short-link (also resolves legacy `/d/<slug>` share links) -> redirects to `/d/$docId/$slug`                                                                        | `docId`            | Global + `mode`, `node`, `role`    | `/d/ws-logical-memory-spec` -> `/d/ws-logical-memory-spec/logical-memory-architecture` |
| `/d/$docId/$slug`              | `_workspace/d/$docId/$slug.tsx`              | Open `.mrbl` document (Docs, Notes, Slides, LaTeX, Matrix, Sandbox, Custom, Evergreen refs, Editable templates); canonicalizes wrong `slug`; handles trashed & missing docs | `docId`, `slug`    | Global + `mode`, `node`, `role`    | `/d/tpl-latex-studio/latex-studio?mode=source&node=sec-abstract&ai=ops`                |
| `/starred`                     | `_workspace/starred.tsx`                     | Starred / Favorites file browser                                                                                                                                            | —                  | Global + `view`, `sort`, `q`       | `/starred?sort=size`                                                                   |
| `/shared`                      | `_workspace/shared.tsx`                      | Shared files & visitor role simulator launcher                                                                                                                              | —                  | Global                             | `/shared`                                                                              |
| `/trash`                       | `_workspace/trash.tsx`                       | Trash view with 30-day retention, restore, and permanent delete                                                                                                             | —                  | Global + `q`                       | `/trash?q=ablation`                                                                    |
| `/templates`                   | `_workspace/templates.tsx`                   | Saved & premade `.mrbl` template gallery (backed by `Templates/` folder)                                                                                                    | —                  | Global                             | `/templates`                                                                           |
| `/chat`                        | `_workspace/chat/index.tsx`                  | Drive Chat landing / new thread composer + thread list                                                                                                                      | —                  | Global + `history`, `q`, `scope`   | `/chat?scope=folder-papers`                                                            |
| `/chat/$threadId`              | `_workspace/chat/$threadId.tsx`              | Specific Drive Chat thread (404 view if thread ID does not exist)                                                                                                           | `threadId`         | Global + `history`, `q`, `scope`   | `/chat/chat-a1b2c3d4e5f6`                                                              |
| `/settings`                    | `_workspace/settings/index.tsx`              | Redirects to `/settings/models`                                                                                                                                             | —                  | Global                             | `/settings` -> `/settings/models`                                                      |
| `/settings/models`             | `_workspace/settings/models/index.tsx`       | Settings — Models & Providers (defaults to `antigravity`)                                                                                                                   | —                  | Global                             | `/settings/models`                                                                     |
| `/settings/models/$providerId` | `_workspace/settings/models/$providerId.tsx` | Settings — Models & Providers focused on a specific provider (`antigravity`, `opencode-go`, `openai`, `claude`, `xai`); 404 for unknown provider                            | `providerId`       | Global                             | `/settings/models/opencode-go`                                                         |
| `/settings/$`                  | `_workspace/settings/$.tsx`                  | Unknown settings section 404 view inside workspace shell                                                                                                                    | `_splat`           | Global                             | `/settings/billing` -> 404                                                             |
| `/$`                           | `_workspace/$.tsx`                           | Catch-all 404 view inside workspace shell                                                                                                                                   | `_splat`           | Global                             | `/does-not-exist` -> 404                                                               |

---

## Search Param Reference

All search params are validated with Zod v4 via TanStack Router `validateSearch` and omitted from the URL when at their default/empty state so URLs stay clean.

### Global Workspace Search Params (inherited by every route under `_workspace`)

| Param      | Type / Allowed Values                      | Default (omitted)           | Meaning                                                                                                                                                                    |
| ---------- | ------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai`       | `'chat' \| 'ops' \| 'history'`             | `undefined` (closed)        | Opens the right-hand AI Collaborator sidebar (`CursorAISidebar`) to the specified tab (`Chat`, `Diff`, or `History`). Works on any document or workspace view.             |
| `modal`    | `'new-agent' \| 'new-template' \| 'share'` | `undefined` (none)          | Opens a destination modal: `new-agent` (**New > Build with AI agent**), `new-template` (**New > New from template**), or `share` (**Share document**).                     |
| `shareDoc` | `string` (document ID)                     | active `$docId` on `/d/...` | Target document ID when `modal=share` is opened from a non-document route (e.g. `/drive?modal=share&shareDoc=ws-qec-threshold`). Omitted on `/d/$docId/$slug?modal=share`. |

### Drive / Folder / Starred Search Params (`/drive`, `/f/$folderId/$slug`, `/starred`)

| Param  | Type / Allowed Values                       | Default (omitted)            | Meaning                        |
| ------ | ------------------------------------------- | ---------------------------- | ------------------------------ |
| `view` | `'preview' \| 'icon' \| 'list'`             | saved preference (`preview`) | File browser layout mode.      |
| `sort` | `'updated' \| 'title' \| 'size' \| 'nodes'` | saved preference (`updated`) | File sort order.               |
| `q`    | `string`                                    | `undefined` (`''`)           | Live file/folder filter query. |

### Trash Search Params (`/trash`)

| Param | Type / Allowed Values | Default (omitted)  | Meaning                      |
| ----- | --------------------- | ------------------ | ---------------------------- |
| `q`   | `string`              | `undefined` (`''`) | Live search filter in Trash. |

### Document Search Params (`/d/$docId`, `/d/$docId/$slug`)

| Param  | Type / Allowed Values                                                                               | Default (omitted)     | Meaning                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `mode` | `'direct' \| 'select' \| 'sketch' \| 'source'`                                                      | `'direct'`            | Canvas interaction mode (`Edit`, `Select`, `Sketch`, `Source`).                             |
| `node` | `string` (comma-separated `data-marble-id` values)                                                  | `undefined`           | Currently selected `.mrbl` element ID(s) for AI targeting or source inspection.             |
| `role` | `'view_only' \| 'comment_annotate' \| 'edit_no_ai' \| 'edit_with_ai_byok' \| 'edit_with_ai_shared'` | `undefined` (`owner`) | Simulated visitor permission role (used by `/shared` role buttons and Share modal preview). |

### Drive Chat Search Params (`/chat`, `/chat/$threadId`)

| Param     | Type / Allowed Values | Default (omitted)      | Meaning                                                    |
| --------- | --------------------- | ---------------------- | ---------------------------------------------------------- |
| `history` | `'0'`                 | `undefined` (open)     | Collapses the left thread history sidebar when set to `0`. |
| `q`       | `string`              | `undefined` (`''`)     | Thread sidebar search filter.                              |
| `scope`   | `string` (folder ID)  | `undefined` (My Drive) | Scopes a new/empty Drive Chat thread to a specific folder. |

---

## Design Decisions & Rationale

### 1. Why `/f/$folderId/$slug` and `/d/$docId/$slug` (two segments, ID-first)?

- **Resilient to renames and moves:** Folders and documents in xDrive can be freely renamed and moved between parent folders at any nesting depth. A hierarchy-mirroring path like `/drive/research/design-patterns` breaks every bookmark, shared link, and open browser tab whenever a folder or any ancestor is renamed or moved. With `/f/$folderId/$slug` and `/d/$docId/$slug`, lookup uses **only** the stable immutable ID (`folderId` / `docId`), so links survive renames and arbitrary moves across the tree.
- **Why two segments instead of `/d/<id>-<slug>`?** Existing xDrive document IDs (`doc-382feb8a-b87a-482a-9a10-9795c12936df`, `ws-week-12-ablations`, `tpl-latex-studio`) and folder IDs (`folder-papers-qec`, `folder-cae6ddd42477`) already contain multiple hyphens. Using a slash separator (`/d/$docId/$slug` and `/f/$folderId/$slug`) keeps `$docId` and `$folderId` 100% unambiguous without delimiter escaping or lookup-dependent parsing, gives first-class typed params in TanStack Router, and naturally supports short-links (`/d/$docId`, `/f/$folderId`) that redirect to the canonical slug.
- **Canonicalization & legacy link compatibility:**
  - Visiting `/f/$folderId` or `/f/$folderId/wrong-slug` replaces the URL with `/f/$folderId/<canonicalSlug>` (preserving search params).
  - Visiting `/d/$docId` or `/d/$docId/wrong-slug` replaces the URL with `/d/$docId/<canonicalSlug>` (preserving search params).
  - Visiting a legacy slug-only share link like `/d/quantum-error-correction` resolves by matching `doc.slug` when no `doc.id` matches, and redirects to the canonical `/d/$docId/$slug`.
  - All disk-backed documents, folders, and editable templates (both premade seeded templates and user-created templates in `Templates/`) canonicalize once workspace metadata hydrates.

### 2. Pathless Layout Route (`_workspace.tsx`) & In-App Tab Strip

- All workspace routes share a single pathless layout route (`src/routes/_workspace.tsx`) that keeps `XDriveWorkspace` mounted across navigations.
- **Active tab = URL:** The active `.mrbl` document tab is always driven by `/d/$docId/$slug` (while `/drive`, `/f/...`, `/starred`, `/shared`, `/trash`, `/templates`, `/settings/...` select the Drive tab, and `/chat` / `/chat/$threadId` select the Chat tab).
- **Other open tabs:** Non-active open document tabs (`openTabIds`) remain in local workspace state so opening/switching/closing tabs stays instant and URLs stay clean instead of serializing a list of background tabs into every link. Opening any document URL automatically ensures that document is present in the tab strip; closing the active tab navigates to the previous open tab (or `/drive` if none remain).

### 3. Trashed Documents & 404 Handling

- **Trashed documents (`/d/$docId/$slug`):** If `$docId` exists in Trash (`doc.trashedAt != null`), xDrive renders a dedicated **Document is in Trash** view inside the workspace shell showing its title, original location, auto-delete countdown, a **Restore & Open** button, and a link to `/trash`.
- **Missing IDs (`/d/$docId/...`, `/f/$folderId/...`, `/chat/$threadId`, `/settings/models/$providerId`, `/settings/$`, `/$`):** Renders a dedicated **Not Found (404)** view inside the workspace shell with recovery links back to `/drive`, `/chat`, `/trash`, or `/settings/models`.

### 4. What Is Intentionally _Not_ URL-Addressable (and Why)

- **Ephemeral single-step action dialogs & confirmations:** New/Rename Folder dialog, Move File dialog, Duplicate File name prompt, Permanent Delete / Empty Trash confirmation dialogs, and the Command Palette (`⌘K`) are transient workflows tied to an in-progress action rather than shareable destinations.
- **Background open tabs (`openTabIds`):** Only the active tab is encoded in the URL; secondary open tabs live in local session state so shared links don't carry one user's private tab clutter.
- **In-app editor sub-state:** Unsaved composer draft text, freehand sketch stroke history (`sketches`/`strokes`), live AI diff preview animations, scroll positions, per-app internal editor state (e.g. Docs find-and-replace bar, active Slides filmstrip zoom, LaTeX compile log panel, Notes formatting popover), and sidebar folder expand/collapse tree disclosure state remain in local component state.
- **Workspace theme toggle (`dark`/`light`):** Kept as local UI preference rather than polluting every shared URL.
