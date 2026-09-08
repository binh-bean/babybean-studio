# Drive API fixtures

Recorded (anonymised) responses from Google Drive, so the sync tests never hit
the network. Owner: DEV-INT, task BB-012.

Needed files:

| File | Contents |
|---|---|
| `folder-50.json` | Small album, single page |
| `folder-1000.json` | Two pages, exercises `nextPageToken` |
| `folder-subfolders.json` | Two concept sub-folders, tests 2-level recursion |
| `folder-mixed.json` | Images plus `.DS_Store` and a Lightroom catalog, tests filtering |
| `error-403.json` | Folder not shared publicly |
| `error-429.json` | Rate limited, drives the backoff test |

Strip real file names, owner emails and any `permissions` block before saving.
Never commit a fixture that references a real customer's album.
