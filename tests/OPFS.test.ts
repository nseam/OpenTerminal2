// Tests for the OPFS wrapper, run through Node.js.
//
// Node has no Origin Private File System, so `node-opfs` provides a real, filesystem-backed
// implementation of the same API. It is installed as `globalThis.navigator.storage` before the
// wrapper is imported, because the wrapper resolves the storage manager lazily on first use.
//
// Run with: npm run test:opfs
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { StorageManager } from "node-opfs";

const storageRoot = await mkdtemp(join(tmpdir(), "opfs-test-"));

Object.defineProperty(globalThis, "navigator", {
    value: { storage: new StorageManager(storageRoot) },
    configurable: true,
    writable: true,
});

const { OPFS } = await import("../src/api/OPFS.ts");
const { AccessDenied, InvalidPath, NotFound, Throwable, Unexpected } = await import("../src/api/Throwables.ts");

type ThrowableType = InstanceType<typeof Throwable>;
type ThrowableClass = new (...args: any[]) => ThrowableType;

/** Asserts that `action` rejects with the given throwable class. */
async function rejectsWith(action: () => Promise<unknown>, expected: ThrowableClass): Promise<ThrowableType> {
    try {
        await action();
    } catch (error) {
        const throwable = error as ThrowableType;

        assert.ok(throwable instanceof Throwable, `expected a Throwable, got ${throwable?.constructor?.name}: ${throwable?.message}`);
        assert.ok(throwable instanceof expected, `expected ${expected.name}, got ${throwable.constructor.name}: ${throwable.message}`);
        return throwable;
    }

    assert.fail(`expected ${expected.name}, but the call succeeded`);
}

/** Removes everything from the OPFS root so each test starts from a clean state. */
async function clearRoot(opfs: InstanceType<typeof OPFS>): Promise<void> {
    for (const file of await opfs.listFiles("", true)) {
        await opfs.removeFile(file.fullPath);
    }

    const root = await globalThis.navigator.storage.getDirectory();

    for await (const [name, handle] of root.entries()) {
        if (handle.kind === "directory") {
            await root.removeEntry(name, { recursive: true });
        }
    }
}

describe("OPFS", () => {
    let opfs: InstanceType<typeof OPFS>;

    before(() => {
        opfs = new OPFS();
    });

    beforeEach(async () => {
        await clearRoot(opfs);
    });

    after(async () => {
        await rm(storageRoot, { recursive: true, force: true });
    });

    describe("storeFile() and getFile()", () => {
        it("stores and reads back a string", async () => {
            await opfs.storeFile("notes.txt", "hello world");

            const file = await opfs.getFile("notes.txt");

            assert.ok(file instanceof File);
            assert.equal(file.name, "notes.txt");
            assert.equal(await file.text(), "hello world");
        });

        it("stores and reads back binary data", async () => {
            const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
            await opfs.storeFile("blob.bin", bytes.buffer);

            const file = await opfs.getFile("blob.bin");

            assert.equal(file.size, bytes.length);
            assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
        });

        it("creates missing parent directories", async () => {
            await opfs.storeFile("a/b/c/deep.txt", "deep");

            assert.equal(await (await opfs.getFile("a/b/c/deep.txt")).text(), "deep");
        });

        it("overwrites an existing file", async () => {
            await opfs.storeFile("over.txt", "a much longer original content");
            await opfs.storeFile("over.txt", "short");

            const file = await opfs.getFile("over.txt");

            assert.equal(await file.text(), "short");
            assert.equal(file.size, 5);
        });

        it("accepts a leading slash", async () => {
            await opfs.storeFile("/lead.txt", "x");

            assert.equal(await (await opfs.getFile("/lead.txt")).text(), "x");
        });

        it("rejects a missing file with NotFound", async () => {
            await rejectsWith(() => opfs.getFile("missing.txt"), NotFound);
        });

        it("rejects a path pointing at a directory with InvalidPath", async () => {
            await opfs.storeFile("dir/file.txt", "x");

            await rejectsWith(() => opfs.getFile("dir"), InvalidPath);
        });

        it("rejects a path escaping the root with InvalidPath", async () => {
            await rejectsWith(() => opfs.getFile("../escape.txt"), InvalidPath);
            await rejectsWith(() => opfs.storeFile("a/../../escape.txt", "x"), InvalidPath);
        });

        it("rejects an empty path with InvalidPath", async () => {
            await rejectsWith(() => opfs.getFile(""), InvalidPath);
        });
    });

    describe("listFiles()", () => {
        beforeEach(async () => {
            await opfs.storeFile("flat.txt", "12345");
            await opfs.storeFile("tree/a.txt", "a");
            await opfs.storeFile("tree/sub/b.bin", new Uint8Array([1, 2, 3]).buffer);
            await opfs.storeFile("tree/sub/deep/c.tar.gz", "gz");
        });

        it("lists only direct children when not recursive", async () => {
            const files = await opfs.listFiles("tree");

            assert.deepEqual(files.map((file) => file.fullPath).sort(), ["tree/a.txt"]);
        });

        it("lists nested files when recursive", async () => {
            const files = await opfs.listFiles("tree", true);

            assert.deepEqual(
                files.map((file) => file.fullPath).sort(),
                ["tree/a.txt", "tree/sub/b.bin", "tree/sub/deep/c.tar.gz"],
            );
        });

        it("lists the whole root recursively", async () => {
            const files = await opfs.listFiles("", true);

            assert.deepEqual(
                files.map((file) => file.fullPath).sort(),
                ["flat.txt", "tree/a.txt", "tree/sub/b.bin", "tree/sub/deep/c.tar.gz"],
            );
        });

        it("returns an empty list for an empty directory", async () => {
            await opfs.storeFile("empty/sub/.keep", "");
            await opfs.removeFile("empty/sub/.keep");
            await opfs.removeFolder("empty/sub");

            assert.deepEqual(await opfs.listFiles("empty"), []);
            assert.deepEqual(await opfs.listFiles("empty", true), []);
        });

        it("describes every file with the OPFSFile fields", async () => {
            const [file] = await opfs.listFiles("tree");

            assert.ok(file.file instanceof File);
            assert.equal(file.fullPath, "tree/a.txt");
            assert.equal(file.fileNameWithoutExtension, "a");
            assert.equal(file.extension, "txt");
            assert.equal(file.size, 1);
            assert.ok(file.date instanceof Date);
            assert.ok(!Number.isNaN(file.date.getTime()));
            // `Date` stores whole milliseconds, while some implementations report a fractional
            // `lastModified`, so compare the truncated value.
            assert.equal(file.date.getTime(), Math.floor(file.file.lastModified));
        });

        it("reports the size of binary files", async () => {
            const files = await opfs.listFiles("tree", true);
            const binary = files.find((file) => file.fullPath === "tree/sub/b.bin");

            assert.equal(binary?.size, 3);
        });

        it("splits only the last extension of a multi-dot name", async () => {
            const files = await opfs.listFiles("tree", true);
            const archive = files.find((file) => file.fullPath === "tree/sub/deep/c.tar.gz");

            assert.equal(archive?.fileNameWithoutExtension, "c.tar");
            assert.equal(archive?.extension, "gz");
        });

        it("reports an empty extension for a file without one", async () => {
            await opfs.storeFile("tree/README", "x");

            const files = await opfs.listFiles("tree");
            const readme = files.find((file) => file.fullPath === "tree/README");

            assert.equal(readme?.fileNameWithoutExtension, "README");
            assert.equal(readme?.extension, "");
        });

        it("rejects a missing directory with NotFound", async () => {
            await rejectsWith(() => opfs.listFiles("nope"), NotFound);
            await rejectsWith(() => opfs.listFiles("nope", true), NotFound);
        });

        it("rejects a path pointing at a file with InvalidPath", async () => {
            await rejectsWith(() => opfs.listFiles("flat.txt"), InvalidPath);
        });
    });

    describe("listEntries()", () => {
        beforeEach(async () => {
            await opfs.storeFile("flat.txt", "12345");
            await opfs.storeFile("tree/a.txt", "a");
            await opfs.storeFile("tree/sub/b.bin", new Uint8Array([1, 2, 3]).buffer);
        });

        it("lists files and directories of a directory", async () => {
            const entries = await opfs.listEntries("tree");

            assert.deepEqual(
                entries.map((entry) => `${entry.kind}:${entry.fullPath}`).sort(),
                ["directory:tree/sub", "file:tree/a.txt"],
            );
        });

        it("lists the root", async () => {
            const entries = await opfs.listEntries("");

            assert.deepEqual(
                entries.map((entry) => `${entry.kind}:${entry.fullPath}`).sort(),
                ["directory:tree", "file:flat.txt"],
            );
        });

        it("describes files with the OPFSFile fields", async () => {
            const entries = await opfs.listEntries("tree");
            const file = entries.find((entry) => entry.kind === "file");

            assert.ok(file && file.kind === "file");
            assert.equal(file.name, "a.txt");
            assert.equal(file.fileNameWithoutExtension, "a");
            assert.equal(file.extension, "txt");
            assert.equal(file.size, 1);
            assert.ok(file.file instanceof File);
        });

        it("describes directories with their name and path", async () => {
            const entries = await opfs.listEntries("tree");
            const directory = entries.find((entry) => entry.kind === "directory");

            assert.ok(directory && directory.kind === "directory");
            assert.equal(directory.name, "sub");
            assert.equal(directory.fullPath, "tree/sub");
        });

        it("rejects a missing directory with NotFound", async () => {
            await rejectsWith(() => opfs.listEntries("nope"), NotFound);
        });

        it("rejects a path pointing at a file with InvalidPath", async () => {
            await rejectsWith(() => opfs.listEntries("flat.txt"), InvalidPath);
        });
    });

    describe("createFolder()", () => {
        it("creates a folder and its missing parents", async () => {
            await opfs.createFolder("a/b/c");

            const entries = await opfs.listEntries("a/b");

            assert.deepEqual(entries.map((entry) => `${entry.kind}:${entry.fullPath}`), ["directory:a/b/c"]);
        });

        it("is idempotent for an existing folder", async () => {
            await opfs.createFolder("a/b");
            await opfs.createFolder("a/b");

            assert.deepEqual((await opfs.listEntries("a")).map((entry) => entry.fullPath), ["a/b"]);
        });

        it("rejects an empty path with InvalidPath", async () => {
            await rejectsWith(() => opfs.createFolder(""), InvalidPath);
            await rejectsWith(() => opfs.createFolder("/"), InvalidPath);
        });

        it("rejects a path pointing at a file with InvalidPath", async () => {
            await opfs.storeFile("file.txt", "x");

            await rejectsWith(() => opfs.createFolder("file.txt"), InvalidPath);
        });
    });

    describe("getEntryKind()", () => {
        it("reports files, directories and missing entries", async () => {
            await opfs.storeFile("tree/a.txt", "a");

            assert.equal(await opfs.getEntryKind("tree/a.txt"), "file");
            assert.equal(await opfs.getEntryKind("tree"), "directory");
            assert.equal(await opfs.getEntryKind(""), "directory");
            assert.equal(await opfs.getEntryKind("missing.txt"), null);
            assert.equal(await opfs.getEntryKind("missing/deep.txt"), null);
        });
    });

    describe("copyEntry()", () => {
        it("copies a file", async () => {
            await opfs.storeFile("a.txt", "content");

            await opfs.copyEntry("a.txt", "copy.txt");

            assert.equal(await (await opfs.getFile("a.txt")).text(), "content");
            assert.equal(await (await opfs.getFile("copy.txt")).text(), "content");
        });

        it("copies a directory tree", async () => {
            await opfs.storeFile("tree/a.txt", "a");
            await opfs.storeFile("tree/sub/b.txt", "b");

            await opfs.copyEntry("tree", "backup/tree");

            assert.deepEqual(
                (await opfs.listFiles("backup", true)).map((file) => file.fullPath).sort(),
                ["backup/tree/a.txt", "backup/tree/sub/b.txt"],
            );
            assert.equal(await (await opfs.getFile("backup/tree/sub/b.txt")).text(), "b");
        });

        it("keeps the source in place", async () => {
            await opfs.storeFile("tree/a.txt", "a");

            await opfs.copyEntry("tree", "tree-copy");

            assert.deepEqual((await opfs.listFiles("tree", true)).map((file) => file.fullPath), ["tree/a.txt"]);
        });

        it("rejects a missing source with NotFound", async () => {
            await rejectsWith(() => opfs.copyEntry("missing.txt", "copy.txt"), NotFound);
        });

        it("rejects copying a directory into itself with InvalidPath", async () => {
            await opfs.storeFile("tree/a.txt", "a");

            await rejectsWith(() => opfs.copyEntry("tree", "tree/inner"), InvalidPath);
        });

        it("rejects copying the root with InvalidPath", async () => {
            await rejectsWith(() => opfs.copyEntry("", "copy"), InvalidPath);
        });
    });

    describe("moveEntry()", () => {
        it("moves a file", async () => {
            await opfs.storeFile("a.txt", "content");

            await opfs.moveEntry("a.txt", "moved/a.txt");

            assert.equal(await (await opfs.getFile("moved/a.txt")).text(), "content");
            await rejectsWith(() => opfs.getFile("a.txt"), NotFound);
        });

        it("moves a directory tree", async () => {
            await opfs.storeFile("tree/a.txt", "a");
            await opfs.storeFile("tree/sub/b.txt", "b");

            await opfs.moveEntry("tree", "moved");

            assert.deepEqual(
                (await opfs.listFiles("moved", true)).map((file) => file.fullPath).sort(),
                ["moved/a.txt", "moved/sub/b.txt"],
            );
            await rejectsWith(() => opfs.listFiles("tree"), NotFound);
        });

        it("rejects a missing source with NotFound", async () => {
            await rejectsWith(() => opfs.moveEntry("missing.txt", "moved.txt"), NotFound);
        });

        it("rejects moving a directory into itself with InvalidPath", async () => {
            await opfs.storeFile("tree/a.txt", "a");

            await rejectsWith(() => opfs.moveEntry("tree", "tree/inner"), InvalidPath);
        });
    });

    describe("removeFile()", () => {
        it("removes a single file", async () => {
            await opfs.storeFile("keep.txt", "keep");
            await opfs.storeFile("drop.txt", "drop");

            await opfs.removeFile("drop.txt");

            assert.deepEqual((await opfs.listFiles("")).map((file) => file.fullPath), ["keep.txt"]);
            await rejectsWith(() => opfs.getFile("drop.txt"), NotFound);
        });

        it("rejects a missing file with NotFound", async () => {
            await rejectsWith(() => opfs.removeFile("missing.txt"), NotFound);
        });

        it("rejects a directory path with InvalidPath", async () => {
            await opfs.storeFile("dir/file.txt", "x");

            await rejectsWith(() => opfs.removeFile("dir"), InvalidPath);
        });
    });

    describe("removeFolder()", () => {
        it("removes a folder with all of its contents", async () => {
            await opfs.storeFile("tree/a.txt", "a");
            await opfs.storeFile("tree/sub/b.txt", "b");
            await opfs.storeFile("tree/sub/deep/c.txt", "c");
            await opfs.storeFile("other.txt", "keep");

            await opfs.removeFolder("tree");

            await rejectsWith(() => opfs.listFiles("tree"), NotFound);
            assert.deepEqual((await opfs.listFiles("", true)).map((file) => file.fullPath), ["other.txt"]);
        });

        it("removes an empty folder", async () => {
            await opfs.storeFile("empty/.keep", "");
            await opfs.removeFile("empty/.keep");

            await opfs.removeFolder("empty");

            await rejectsWith(() => opfs.listFiles("empty"), NotFound);
        });

        it("rejects a missing folder with NotFound", async () => {
            await rejectsWith(() => opfs.removeFolder("missing"), NotFound);
        });

        it("rejects removing the root with InvalidPath", async () => {
            await rejectsWith(() => opfs.removeFolder(""), InvalidPath);
            await rejectsWith(() => opfs.removeFolder("/"), InvalidPath);
        });
    });

    describe("getDiskUsed() and getDiskFree()", () => {
        it("reports non-negative byte counts", async () => {
            const used = await opfs.getDiskUsed();
            const free = await opfs.getDiskFree();

            assert.equal(typeof used, "number");
            assert.equal(typeof free, "number");
            assert.ok(used >= 0, `used was ${used}`);
            assert.ok(free > 0, `free was ${free}`);
        });

        it("reports more used space after storing data", async () => {
            const before = await opfs.getDiskUsed();

            await opfs.storeFile("big.bin", new Uint8Array(64 * 1024).buffer);

            const after = await opfs.getDiskUsed();

            assert.ok(after > before, `expected usage to grow from ${before}, got ${after}`);
        });
    });

    describe("onChange()", () => {
        it("notifies listeners about operations that change the OPFS", async () => {
            const changes: { operation: string; path: string }[] = [];
            const unsubscribe = opfs.onChange(change => changes.push(change));

            try {
                await opfs.storeFile("a.txt", "x");
                await opfs.createFolder("folder");
                await opfs.removeFile("a.txt");
                await opfs.removeFolder("folder");
            }
            finally {
                unsubscribe();
            }

            assert.deepEqual(changes, [
                { operation: "storeFile", path: "a.txt" },
                { operation: "createFolder", path: "folder" },
                { operation: "removeFile", path: "a.txt" },
                { operation: "removeFolder", path: "folder" },
            ]);
        });

        it("stops notifying after the listener is unregistered", async () => {
            let count = 0;
            const unsubscribe = opfs.onChange(() => count++);

            await opfs.storeFile("before.txt", "x");
            unsubscribe();
            await opfs.storeFile("after.txt", "x");

            assert.equal(count, 1);
        });

        it("does not notify about read-only operations", async () => {
            await opfs.storeFile("read.txt", "x");

            let count = 0;
            const unsubscribe = opfs.onChange(() => count++);

            try {
                await opfs.listFiles("");
                await opfs.listEntries("");
                await opfs.getFile("read.txt");
                await opfs.getEntryKind("read.txt");
            }
            finally {
                unsubscribe();
            }

            assert.equal(count, 0);
        });

        it("keeps working when a listener throws", async () => {
            const seen: string[] = [];
            const unsubscribeThrowing = opfs.onChange(() => {
                throw new Error("listener failure");
            });
            const unsubscribeRecording = opfs.onChange(change => seen.push(change.path));

            try {
                await opfs.storeFile("resilient.txt", "x");
            }
            finally {
                unsubscribeThrowing();
                unsubscribeRecording();
            }

            assert.deepEqual(seen, ["resilient.txt"]);
        });
    });

    describe("error handling", () => {
        it("throws Throwable instances, not raw DOMExceptions", async () => {
            const error = await rejectsWith(() => opfs.getFile("missing.txt"), NotFound);

            assert.ok(error instanceof Throwable);
            assert.ok(!(error instanceof DOMException));
            assert.equal(error.name, "NotFound");
            assert.equal(error.scope, "OPFS.getFile");
            assert.match(error.message, /missing\.txt/);
        });

        it("maps a directory/file type mismatch to InvalidPath", async () => {
            await opfs.storeFile("dir/file.txt", "x");

            const error = await rejectsWith(() => opfs.listFiles("dir/file.txt"), InvalidPath);

            assert.equal(error.name, "InvalidPath");
        });

        it("exposes the throwable classes used by the wrapper", () => {
            for (const type of [NotFound, InvalidPath, AccessDenied, Unexpected]) {
                assert.ok(Object.prototype.isPrototypeOf.call(Throwable, type), `${type.name} must extend Throwable`);
            }
        });
    });
});
