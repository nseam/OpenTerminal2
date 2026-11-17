# General Information

This is a front-end Vue application located at `/home/mx/ea/fx/FX31337-tester` that displays charts and allow configuration of charts and indicators that are parts of the chart.

There is no back-end application. The front-end is using Emscripten library that located at `/home/mx/ea/fx/FX31337-wasm`. Such library exports e.g. `Tester` class.

The application is to be ran fully in the browser. There are no routing and no server endpoint.

We are storing app's roaming state in the browser's local storage.

For bigger data storage we store it in the browser's Origin Private File System (OPFS).

There is `src/api/Throwables.ts` file that provides classes of which instances should be used to throw errors. Skip providing a `Task` instances as we don't uses Tasks in this project.

In order to test chart on real ticks you have to use "Upload Ticks" widget's functionality and upload ticks e.g., under:
- Folder name: Forex
- Symbol name: EURUSD
- Tick files: select all files under `/home/mx/ea/fx/FX31337-wasm/tests/data` folder.
And then select "Forex / EURUSD" in the Charts / Ticks selector.

When you want to check the browser output then use `http://localhost:5173/` address instead of spawning another server.

## Origin Private File System (OPFS)

All access to the browser's Origin Private File System goes through the `OPFS` class in `src/api/OPFS.ts`. Do not call `navigator.storage.getDirectory()` or the `FileSystem*Handle` APIs directly from components or other modules — the wrapper normalizes paths, creates missing directories, and converts raw `DOMException`s into the project's `Throwable` types.

Import the shared instance rather than constructing a new one:

```ts
import { opfs } from "@shared/api/OPFS";
```

### Paths

Paths are relative to the OPFS root and use `/` as the separator, e.g. `ticks/EURUSD/2024.csv`. A leading slash is accepted and ignored, so `/ticks/a.csv` and `ticks/a.csv` are the same file. Empty segments and `.` are dropped. `..` segments are rejected with `InvalidPath` so a path can never escape the root. An empty path (`""`) refers to the root directory itself.

### API

| Method | Description |
| --- | --- |
| `listFiles(path, recursively = false)` | Returns `OPFSFile[]` for the given directory. Only direct children unless `recursively` is `true`. |
| `listEntries(path)` | Returns `OPFSEntry[]` (files **and** subdirectories) for the direct children of a directory. Use this to render a tree. |
| `getEntryKind(path)` | Returns `"file"`, `"directory"` or `null` when nothing is stored at the path. |
| `getFile(path)` | Returns the standard OPFS `File` object. |
| `storeFile(path, data)` | Writes a `string` or `ArrayBuffer`, creating missing parent directories and overwriting an existing file. |
| `createFolder(path)` | Creates a directory, including missing parents. |
| `copyEntry(from, to)` | Copies a file or a whole directory tree. |
| `moveEntry(from, to)` | Moves a file or a whole directory tree. |
| `removeFolder(path)` | Removes a directory and everything inside it. |
| `removeFile(path)` | Removes a single file. |
| `getDiskUsed()` | Bytes currently used by this origin. |
| `getDiskFree()` | Bytes still available (`quota - usage`). |
| `onChange(listener)` | Registers a listener called after an operation changed the OPFS contents. Returns a function that unregisters it. |

### Change notifications

`storeFile`, `createFolder`, `removeFolder` and `removeFile` notify every listener registered with
`onChange` once they succeeded. Read-only operations (`listFiles`, `listEntries`, `getFile`,
`getEntryKind`, `getDiskUsed`, `getDiskFree`) never notify. A listener receives an `OPFSChange`:

```ts
type OPFSChange = {
    operation: string;  // "storeFile", "createFolder", "removeFolder" or "removeFile"
    path: string;       // path the operation was applied to
};
```

Use this instead of refreshing OPFS views by hand, so every view stays in sync no matter which
part of the app changed the storage:

```ts
const unsubscribe = opfs.onChange(() => refreshMyListing());

// Later, e.g. in `unmounted()`.
unsubscribe();
```

A single operation may emit many changes (moving a folder emits one per file), so listeners that
walk the tree should debounce their refresh. A listener that throws is logged and does not affect
the operation or the other listeners. `VOPFSExplorer` and the tick source selector in `VApp.vue`
both subscribe this way.

`OPFSFile` describes a stored file:

```ts
type OPFSFile = {
    kind: "file";                   // discriminator
    file: File;                     // standard OPFS File object
    name: string;                   // "2024.csv"
    fullPath: string;               // e.g. "ticks/EURUSD/2024.csv"
    fileNameWithoutExtension: string; // "2024"
    extension: string;              // "csv", or "" when the name has no dot
    size: number;                   // bytes
    date: Date;                     // creation/modification date
};
```

`OPFSDirectory` describes a stored directory, and `OPFSEntry` is their union:

```ts
type OPFSDirectory = {
    kind: "directory";
    name: string;                   // "EURUSD"
    fullPath: string;               // "ticks/EURUSD"
};

type OPFSEntry = OPFSFile | OPFSDirectory;
```

Only the last dot is treated as the extension separator, so `c.tar.gz` yields `fileNameWithoutExtension: "c.tar"` and `extension: "gz"`. A leading dot is not an extension separator, so `.keep` yields `fileNameWithoutExtension: ".keep"` and `extension: ""`.

### Example

```ts
import { opfs } from "@shared/api/OPFS";

// Store tick data, creating "ticks/EURUSD" if needed.
await opfs.storeFile("ticks/EURUSD/2024.csv", csvText);

// List every stored file below "ticks", including nested folders.
for (const entry of await opfs.listFiles("ticks", true)) {
    console.log(entry.fullPath, entry.size, entry.date);
}

// Read it back.
const file = await opfs.getFile("ticks/EURUSD/2024.csv");
const text = await file.text();

// Walk the tree, keeping folders visible.
for (const entry of await opfs.listEntries("ticks")) {
    console.log(entry.kind, entry.fullPath);
}

// Copy a whole folder, then move it elsewhere.
await opfs.copyEntry("ticks/EURUSD", "backup/EURUSD");
await opfs.moveEntry("backup/EURUSD", "archive/EURUSD");

// Clean up.
await opfs.removeFile("ticks/EURUSD/2024.csv");
await opfs.removeFolder("ticks");
```

### File explorer

`src/components/data/opfs/VOPFSExplorer.vue` is a Midnight Commander style two-panel browser for the
OPFS tree. It is mounted in `VApp.vue` below the chart configuration list and only talks to OPFS
through the `opfs` instance. Keyboard shortcuts: arrows/PageUp/PageDown/Home/End move the selection,
`Enter` opens a folder or previews a file, `Backspace` goes up, `Tab` switches panels, `F2` rename,
`F3` view, `F5` copy, `F6` move, `F7` new folder, `F8` delete, `Ctrl+R` refresh and `Escape` closes a
dialog.

### Errors

Every method rejects with a `Throwable` from `src/api/Throwables.ts`, never a raw `DOMException`. Each error carries a `scope` such as `"OPFS.getFile"` and, where relevant, the offending path in its `message`.

| Raw error | Thrown as |
| --- | --- |
| `NotFoundError` | `NotFound` |
| `NotAllowedError`, `NoModificationAllowedError`, `SecurityError` | `AccessDenied` |
| `TypeMismatchError` | `InvalidPath` |
| `QuotaExceededError` | `QuotaExceeded` |
| `InvalidStateError`, `NetworkError` | `ConnectionError` |
| anything else | `Unexpected` |

`InvalidPath` is also thrown for `..` segments, an empty path where a file is expected, removing the root, copying or moving an entry into itself, and a path whose entry kind does not match the operation (e.g. `removeFile` on a directory). `ConnectionError` is thrown when the browser does not expose OPFS or `navigator.storage.estimate()`.

Catch these types rather than inspecting `error.name`:

```ts
import { NotFound } from "@shared/api/Throwables";

try {
    const file = await opfs.getFile("ticks/EURUSD/2024.csv");
} catch (error) {
    if (error instanceof NotFound) {
        // Nothing stored yet.
    } else {
        throw error;
    }
}
```

### Testing

`npm run test:opfs` runs `tests/OPFS.test.ts` through Node's built-in test runner. Node has no OPFS, so the suite installs `node-opfs` (a filesystem-backed implementation of the same API) as `globalThis.navigator.storage` before importing the wrapper, and points it at a temporary directory that is deleted afterwards. `tests/ts-resolve-hook.mjs` lets Node's native TypeScript support follow the project's extensionless relative imports. Add new OPFS behavior to this suite rather than testing it through the UI.

