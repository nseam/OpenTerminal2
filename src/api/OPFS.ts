import {
    AccessDenied,
    ConnectionError,
    InvalidPath,
    NotFound,
    QuotaExceeded,
    Throwable,
    Unexpected,
} from "./Throwables";

/**
 * A single file stored in the Origin Private File System.
 */
export type OPFSFile = {
    /** Discriminator that tells files and directories apart. */
    kind: "file";
    /** The standard OPFS `File` object. */
    file: File;
    /** Name of the file including its extension, without the parent path. */
    name: string;
    /** Full path of the file, relative to the OPFS root, without a leading slash. */
    fullPath: string;
    /** File name without the extension and without the parent path. */
    fileNameWithoutExtension: string;
    /** File extension without the leading dot, or an empty string when the file has none. */
    extension: string;
    /** Size of the file in bytes. */
    size: number;
    /** Creation/modification date of the file. */
    date: Date;
};

/**
 * A directory stored in the Origin Private File System.
 */
export type OPFSDirectory = {
    /** Discriminator that tells files and directories apart. */
    kind: "directory";
    /** Name of the directory, without the parent path. */
    name: string;
    /** Full path of the directory, relative to the OPFS root, without a leading slash. */
    fullPath: string;
};

/** A direct child of an OPFS directory: either a file or a subdirectory. */
export type OPFSEntry = OPFSFile | OPFSDirectory;

/**
 * Description of a change made to the OPFS contents.
 */
export interface OPFSChange {
    /** Name of the operation that changed the OPFS, e.g. `storeFile`. */
    operation: string;
    /** Path the operation was applied to, relative to the OPFS root. */
    path: string;
}

/** Called after an operation changed the OPFS contents. */
export type OPFSChangeListener = (change: OPFSChange) => void;

/**
 * Wrapper around the browser's Origin Private File System (OPFS).
 *
 * All paths are relative to the OPFS root and use `/` as the separator, e.g. `ticks/EURUSD.csv`.
 * A leading slash is accepted and ignored. Every method rejects with a `Throwable` from
 * `Throwables.ts` instead of a raw `DOMException`.
 */
export class OPFS {

    /** Cached promise of the OPFS root directory handle. */
    private rootHandle: Promise<FileSystemDirectoryHandle> | null = null;

    /** Listeners notified after an operation changed the OPFS contents. */
    private changeListeners = new Set<OPFSChangeListener>();

    /**
     * Registers a listener that is called after an operation changed the OPFS contents.
     *
     * Lets the UI keep its OPFS listings in sync (e.g. the file explorer and the tick source
     * selector) without every caller having to refresh them by hand.
     *
     * @returns A function that unregisters the listener.
     */
    public onChange(listener: OPFSChangeListener): () => void {
        this.changeListeners.add(listener);

        return () => {
            this.changeListeners.delete(listener);
        };
    }

    /**
     * Notifies the registered listeners that an operation changed the OPFS contents.
     *
     * A failing listener must not break the operation that changed the OPFS, so its error is only
     * logged.
     */
    private notifyChange(operation: string, path: string): void {
        if (this.changeListeners.size === 0) {
            return;
        }

        const change: OPFSChange = { operation, path };

        for (const listener of [...this.changeListeners]) {
            try {
                listener(change);
            } catch (error) {
                console.error(`OPFS change listener failed after "${operation}".`, error);
            }
        }
    }

    /**
     * Returns the OPFS root directory handle.
     *
     * @throws {ConnectionError} When the browser does not support OPFS.
     */
    private getRoot(): Promise<FileSystemDirectoryHandle> {
        if (!this.rootHandle) {
            this.rootHandle = (async () => {
                const storage = globalThis.navigator?.storage;

                if (!storage || typeof storage.getDirectory !== "function") {
                    throw new ConnectionError({
                        message: `Origin Private File System is not available in this browser`,
                        scope: "OPFS.getRoot",
                    });
                }

                try {
                    return await storage.getDirectory();
                } catch (error) {
                    throw this.toThrowable(error, "OPFS.getRoot");
                }
            })();

            // Do not cache a failed lookup, so a later call can retry.
            this.rootHandle.catch(() => {
                this.rootHandle = null;
            });
        }

        return this.rootHandle;
    }

    /**
     * Splits a path into its segments, rejecting paths that try to escape the OPFS root.
     *
     * @throws {InvalidPath} When the path is not a valid OPFS path.
     */
    private splitPath(path: string, scope: string): string[] {
        if (typeof path !== "string") {
            throw new InvalidPath({ message: `Path must be a string`, scope });
        }

        const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".");

        if (segments.some((segment) => segment === "..")) {
            throw new InvalidPath({ message: `Path "${path}" must not contain ".." segments`, scope });
        }

        return segments;
    }

    /**
     * Resolves a directory handle for the given path.
     *
     * @param path Path relative to the OPFS root. An empty path resolves to the root itself.
     * @param create Whether missing directories should be created.
     */
    private async getDirectoryHandle(path: string, create: boolean, scope: string): Promise<FileSystemDirectoryHandle> {
        const segments = this.splitPath(path, scope);
        let directory = await this.getRoot();

        for (const segment of segments) {
            try {
                directory = await directory.getDirectoryHandle(segment, { create });
            } catch (error) {
                throw this.toThrowable(error, scope, path);
            }
        }

        return directory;
    }

    /**
     * Resolves a file handle for the given path.
     *
     * @param path Path of the file relative to the OPFS root.
     * @param create Whether missing parent directories and the file itself should be created.
     */
    private async getFileHandle(path: string, create: boolean, scope: string): Promise<FileSystemFileHandle> {
        const segments = this.splitPath(path, scope);
        const fileName = segments.pop();

        if (!fileName) {
            throw new InvalidPath({ message: `Path "${path}" does not point to a file`, scope });
        }

        const directory = await this.getDirectoryHandle(segments.join("/"), create, scope);

        try {
            return await directory.getFileHandle(fileName, { create });
        } catch (error) {
            throw this.toThrowable(error, scope, path);
        }
    }

    /**
     * Builds an `OPFSFile` description from a file handle.
     */
    private async describeFile(handle: FileSystemFileHandle, fullPath: string, scope: string): Promise<OPFSFile> {
        let file: File;

        try {
            file = await handle.getFile();
        } catch (error) {
            throw this.toThrowable(error, scope, fullPath);
        }

        const name = handle.name;
        const dotIndex = name.lastIndexOf(".");

        return {
            kind: "file",
            file,
            name,
            fullPath,
            fileNameWithoutExtension: dotIndex > 0 ? name.slice(0, dotIndex) : name,
            extension: dotIndex > 0 ? name.slice(dotIndex + 1) : "",
            size: file.size,
            date: new Date(file.lastModified),
        };
    }

    /**
     * Lists files stored under the given path.
     *
     * @param path Directory path relative to the OPFS root. An empty path lists the root.
     * @param recursively Whether files in nested directories should be included.
     * @returns Files found in the directory, in no particular order.
     * @throws {NotFound} When the directory does not exist.
     * @throws {InvalidPath} When the path points to a file.
     */
    public async listFiles(path: string, recursively: boolean = false): Promise<OPFSFile[]> {
        const scope = "OPFS.listFiles";
        const directory = await this.getDirectoryHandle(path, false, scope);
        const basePath = this.splitPath(path, scope).join("/");
        const files: OPFSFile[] = [];

        try {
            for await (const [name, handle] of directory.entries()) {
                const fullPath = basePath ? `${basePath}/${name}` : name;

                if (handle.kind === "file") {
                    files.push(await this.describeFile(handle as FileSystemFileHandle, fullPath, scope));
                } else if (recursively) {
                    files.push(...await this.listFiles(fullPath, true));
                }
            }
        } catch (error) {
            throw this.toThrowable(error, scope, path);
        }

        return files;
    }

    /**
     * Lists the direct children of a directory, both files and subdirectories.
     *
     * Unlike {@link listFiles}, this keeps the directory structure visible, which is what a file
     * explorer needs to render a tree.
     *
     * @param path Directory path relative to the OPFS root. An empty path lists the root.
     * @returns Entries found in the directory, in no particular order.
     * @throws {NotFound} When the directory does not exist.
     * @throws {InvalidPath} When the path points to a file.
     */
    public async listEntries(path: string): Promise<OPFSEntry[]> {
        const scope = "OPFS.listEntries";
        const directory = await this.getDirectoryHandle(path, false, scope);
        const basePath = this.splitPath(path, scope).join("/");
        const entries: OPFSEntry[] = [];

        try {
            for await (const [name, handle] of directory.entries()) {
                const fullPath = basePath ? `${basePath}/${name}` : name;

                if (handle.kind === "file") {
                    entries.push(await this.describeFile(handle as FileSystemFileHandle, fullPath, scope));
                } else {
                    entries.push({ kind: "directory", name, fullPath });
                }
            }
        } catch (error) {
            throw this.toThrowable(error, scope, path);
        }

        return entries;
    }

    /**
     * Creates a directory, including any missing parent directories.
     *
     * @param path Directory path relative to the OPFS root.
     * @throws {InvalidPath} When the path is empty or points at an existing file.
     */
    public async createFolder(path: string): Promise<void> {
        const scope = "OPFS.createFolder";

        if (this.splitPath(path, scope).length === 0) {
            throw new InvalidPath({ message: `Path "${path}" does not point to a folder`, scope });
        }

        await this.getDirectoryHandle(path, true, scope);

        this.notifyChange("createFolder", path);
    }

    /**
     * Tells whether a path exists and what kind of entry it points at.
     *
     * @param path Path relative to the OPFS root.
     * @returns The entry kind, or `null` when nothing is stored at the path.
     */
    public async getEntryKind(path: string): Promise<"file" | "directory" | null> {
        const scope = "OPFS.getEntryKind";
        const segments = this.splitPath(path, scope);
        const name = segments.pop();

        if (!name) {
            return "directory";
        }

        let parent: FileSystemDirectoryHandle;

        try {
            parent = await this.getDirectoryHandle(segments.join("/"), false, scope);
        } catch (error) {
            if (error instanceof NotFound) {
                return null;
            }

            throw error;
        }

        try {
            await parent.getFileHandle(name);

            return "file";
        } catch (error) {
            // A directory at this path makes `getFileHandle` fail with `TypeMismatchError`, while a
            // missing entry fails with `NotFoundError`; anything else is a real failure.
            if (!(error instanceof Error) || (error.name !== "TypeMismatchError" && error.name !== "NotFoundError")) {
                throw this.toThrowable(error, scope, path);
            }
        }

        try {
            await parent.getDirectoryHandle(name);

            return "directory";
        } catch (error) {
            if (error instanceof Error && error.name === "NotFoundError") {
                return null;
            }

            throw this.toThrowable(error, scope, path);
        }
    }

    /**
     * Copies a file or a whole directory tree to another path.
     *
     * @param from Source path relative to the OPFS root.
     * @param to Destination path relative to the OPFS root. Missing parents are created.
     * @throws {NotFound} When the source does not exist.
     * @throws {InvalidPath} When the destination is inside the source directory.
     */
    public async copyEntry(from: string, to: string): Promise<void> {
        const scope = "OPFS.copyEntry";
        const source = this.splitPath(from, scope).join("/");
        const destination = this.splitPath(to, scope).join("/");

        if (source === "") {
            throw new InvalidPath({ message: `Cannot copy the OPFS root directory`, scope });
        }

        if (destination === source) {
            return;
        }

        if (destination.startsWith(`${source}/`)) {
            throw new InvalidPath({ message: `Cannot copy "${from}" into itself`, scope });
        }

        const kind = await this.getEntryKind(source);

        if (kind === null) {
            throw new NotFound({ message: `OPFS operation failed for "${from}": entry does not exist`, scope });
        }

        if (kind === "file") {
            const file = await this.getFile(source);

            await this.storeFile(destination, await file.arrayBuffer());

            return;
        }

        await this.createFolder(destination);

        for (const entry of await this.listEntries(source)) {
            await this.copyEntry(entry.fullPath, `${destination}/${entry.name}`);
        }
    }

    /**
     * Moves a file or a whole directory tree to another path.
     *
     * @param from Source path relative to the OPFS root.
     * @param to Destination path relative to the OPFS root. Missing parents are created.
     * @throws {NotFound} When the source does not exist.
     * @throws {InvalidPath} When the destination is inside the source directory.
     */
    public async moveEntry(from: string, to: string): Promise<void> {
        const scope = "OPFS.moveEntry";
        const source = this.splitPath(from, scope).join("/");
        const destination = this.splitPath(to, scope).join("/");

        if (source === "") {
            throw new InvalidPath({ message: `Cannot move the OPFS root directory`, scope });
        }

        if (destination === source) {
            return;
        }

        if (destination.startsWith(`${source}/`)) {
            throw new InvalidPath({ message: `Cannot move "${from}" into itself`, scope });
        }

        const kind = await this.getEntryKind(source);

        if (kind === null) {
            throw new NotFound({ message: `OPFS operation failed for "${from}": entry does not exist`, scope });
        }

        if (kind === "file") {
            const file = await this.getFile(source);

            await this.storeFile(destination, await file.arrayBuffer());
            await this.removeFile(source);

            return;
        }

        await this.copyEntry(source, destination);
        await this.removeFolder(source);
    }

    /**
     * Reads a file stored at the given path.
     *
     * @param path Full path of the file relative to the OPFS root.
     * @returns The standard OPFS `File` object.
     * @throws {NotFound} When the file does not exist.
     */
    public async getFile(path: string): Promise<File> {
        const scope = "OPFS.getFile";
        const handle = await this.getFileHandle(path, false, scope);

        try {
            return await handle.getFile();
        } catch (error) {
            throw this.toThrowable(error, scope, path);
        }
    }

    /**
     * Stores data in a file at the given path, creating missing directories and overwriting
     * an existing file.
     *
     * @param path Full path of the file relative to the OPFS root.
     * @param data Text or binary data to store.
     * @throws {QuotaExceeded} When there is not enough space left.
     */
    public async storeFile(path: string, data: string | ArrayBuffer): Promise<void> {
        const scope = "OPFS.storeFile";
        const handle = await this.getFileHandle(path, true, scope);

        try {
            const writable = await handle.createWritable();

            try {
                await writable.write(data);
            } finally {
                await writable.close();
            }
        } catch (error) {
            throw this.toThrowable(error, scope, path);
        }

        this.notifyChange("storeFile", path);
    }

    /**
     * Removes a directory and everything it contains.
     *
     * @param path Directory path relative to the OPFS root.
     * @throws {InvalidPath} When the path is the OPFS root.
     * @throws {NotFound} When the directory does not exist.
     */
    public async removeFolder(path: string): Promise<void> {
        const scope = "OPFS.removeFolder";
        const segments = this.splitPath(path, scope);
        const folderName = segments.pop();

        if (!folderName) {
            throw new InvalidPath({ message: `Cannot remove the OPFS root directory`, scope });
        }

        const parent = await this.getDirectoryHandle(segments.join("/"), false, scope);

        try {
            // Resolving the handle first makes a file at this path fail with `TypeMismatchError`
            // instead of being silently removed by implementations that ignore the entry kind.
            await parent.getDirectoryHandle(folderName);
            await parent.removeEntry(folderName, { recursive: true });
        } catch (error) {
            throw this.toThrowable(error, scope, path);
        }

        this.notifyChange("removeFolder", path);
    }

    /**
     * Removes a single file.
     *
     * @param path Full path of the file relative to the OPFS root.
     * @throws {NotFound} When the file does not exist.
     */
    public async removeFile(path: string): Promise<void> {
        const scope = "OPFS.removeFile";
        const segments = this.splitPath(path, scope);
        const fileName = segments.pop();

        if (!fileName) {
            throw new InvalidPath({ message: `Path "${path}" does not point to a file`, scope });
        }

        const parent = await this.getDirectoryHandle(segments.join("/"), false, scope);

        try {
            // Resolving the handle first makes a directory at this path fail with
            // `TypeMismatchError` instead of being silently removed.
            await parent.getFileHandle(fileName);
            await parent.removeEntry(fileName);
        } catch (error) {
            throw this.toThrowable(error, scope, path);
        }

        this.notifyChange("removeFile", path);
    }

    /**
     * Returns the number of bytes currently used by this origin.
     *
     * @throws {ConnectionError} When the storage estimate is not available.
     */
    public async getDiskUsed(): Promise<number> {
        return (await this.estimate("OPFS.getDiskUsed")).usage;
    }

    /**
     * Returns the number of bytes still available to this origin.
     *
     * @throws {ConnectionError} When the storage estimate is not available.
     */
    public async getDiskFree(): Promise<number> {
        const { usage, quota } = await this.estimate("OPFS.getDiskFree");

        return Math.max(0, quota - usage);
    }

    /**
     * Reads the storage estimate and normalizes missing values to zero.
     */
    private async estimate(scope: string): Promise<{ usage: number; quota: number }> {
        const storage = globalThis.navigator?.storage;

        if (!storage || typeof storage.estimate !== "function") {
            throw new ConnectionError({
                message: `Storage estimate is not available in this browser`,
                scope,
            });
        }

        try {
            const estimate = await storage.estimate();

            return {
                usage: estimate.usage ?? 0,
                quota: estimate.quota ?? 0,
            };
        } catch (error) {
            throw this.toThrowable(error, scope);
        }
    }

    /**
     * Converts a raw error into a `Throwable` used by the application.
     */
    private toThrowable(error: unknown, scope: string, path?: string): Throwable {
        if (error instanceof Throwable) {
            return error;
        }

        const name = error instanceof Error ? error.name : "";
        const reason = error instanceof Error ? error.message : String(error);
        const message = path ? `OPFS operation failed for "${path}": ${reason}` : `OPFS operation failed: ${reason}`;
        const details = { message, scope };

        switch (name) {
            case "NotFoundError":
                return new NotFound(details);
            case "NotAllowedError":
            case "NoModificationAllowedError":
            case "SecurityError":
                return new AccessDenied(details);
            case "TypeMismatchError":
                return new InvalidPath(details);
            case "QuotaExceededError":
                return new QuotaExceeded(details);
            case "InvalidStateError":
            case "NetworkError":
                return new ConnectionError(details);
            default:
                return new Unexpected(details);
        }
    }
}

/** Shared OPFS instance used by the application. */
export const opfs = new OPFS();
