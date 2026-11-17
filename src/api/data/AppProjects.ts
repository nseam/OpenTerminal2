import { opfs } from "../OPFS";
import { InvalidPath, NotFound, Unexpected } from "../Throwables";

/**
 * Folder under the OPFS root that holds the stored projects.
 *
 * Every project is a single JSON file named after the project, e.g. `projects/Hello.prj`.
 */
export const APP_PROJECTS_FOLDER = "projects";

/** Extension of a stored project file, without the leading dot. */
export const APP_PROJECT_EXTENSION = "prj";

/** A project stored in the OPFS. */
export interface AppProjectInfo {
    /** Name of the project, i.e. the file name without the extension. */
    name: string;
    /** Full path of the project file, e.g. `projects/Hello.prj`. */
    path: string;
    /** Size of the project file in bytes. */
    size: number;
    /** Creation/modification date of the project file. */
    date: Date;
}

/**
 * Normalizes a user supplied project name.
 *
 * Surrounding whitespace is dropped and a trailing `.prj` extension is removed, so typing
 * `Hello.prj` and `Hello` both address the same project.
 *
 * @throws {InvalidPath} When the name is empty or contains path separators.
 */
export function normalizeAppProjectName(name: string): string {
    const trimmed = (name ?? "").trim();
    const suffix = `.${APP_PROJECT_EXTENSION}`;
    const withoutExtension = trimmed.toLowerCase().endsWith(suffix)
        ? trimmed.slice(0, -suffix.length).trim()
        : trimmed;

    if (withoutExtension === "") {
        throw new InvalidPath({
            message: `Project name must not be empty`,
            scope: "AppProjects.normalizeName",
        });
    }

    if (withoutExtension === "." || withoutExtension === ".." || /[/\\]/.test(withoutExtension)) {
        throw new InvalidPath({
            message: `Project name "${name}" must not contain path separators`,
            scope: "AppProjects.normalizeName",
        });
    }

    return withoutExtension;
}

/**
 * Builds the OPFS path of the project file for the given project name.
 *
 * @throws {InvalidPath} When the name is not a valid project name.
 */
export function appProjectPath(name: string): string {
    return `${APP_PROJECTS_FOLDER}/${normalizeAppProjectName(name)}.${APP_PROJECT_EXTENSION}`;
}

/**
 * Lists the projects stored in the OPFS, sorted by name.
 *
 * @returns The stored projects, or an empty list when nothing has been saved yet.
 */
export async function listAppProjects(): Promise<AppProjectInfo[]> {
    let files;

    try {
        files = await opfs.listFiles(APP_PROJECTS_FOLDER);
    }
    catch (error) {
        // Nothing has been saved yet, so there is nothing to list.
        if (error instanceof NotFound)
            return [];

        throw error;
    }

    return files
        .filter(file => file.extension.toLowerCase() === APP_PROJECT_EXTENSION)
        .map(file => ({
            name: file.fileNameWithoutExtension,
            path: file.fullPath,
            size: file.size,
            date: file.date,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Stores the given data as the project with the given name, overwriting an existing project.
 *
 * @throws {InvalidPath} When the name is not a valid project name.
 * @throws {QuotaExceeded} When there is not enough space left in the OPFS.
 */
export async function saveAppProject(name: string, data: unknown): Promise<void> {
    await opfs.storeFile(appProjectPath(name), JSON.stringify(data, null, 2));
}

/**
 * Renames a stored project, moving its file in the OPFS.
 *
 * @param name Current name of the project.
 * @param newName New name of the project.
 * @returns The normalized new name, i.e. the name the project is stored under.
 * @throws {InvalidPath} When either name is not a valid project name, or when a project with the
 * new name already exists.
 * @throws {NotFound} When the project does not exist.
 */
export async function renameAppProject(name: string, newName: string): Promise<string> {
    const from = appProjectPath(name);
    const normalizedNewName = normalizeAppProjectName(newName);
    const to = appProjectPath(normalizedNewName);

    // Renaming to the same name is a no-op.
    if (from === to)
        return normalizedNewName;

    // A case-only rename may address the same file on a case-insensitive filesystem, where moving
    // would overwrite the source with itself. Reading the data first keeps it safe.
    if (from.toLowerCase() === to.toLowerCase()) {
        const data = await (await opfs.getFile(from)).arrayBuffer();

        await opfs.removeFile(from);
        await opfs.storeFile(to, data);

        return normalizedNewName;
    }

    // `moveEntry` overwrites an existing destination, so an existing project must be rejected
    // instead of being silently replaced.
    if (await opfs.getEntryKind(to) !== null) {
        throw new InvalidPath({
            message: `Project "${normalizedNewName}" already exists`,
            scope: "AppProjects.rename",
        });
    }

    await opfs.moveEntry(from, to);

    return normalizedNewName;
}

/**
 * Deletes a stored project.
 *
 * @param name Name of the project to delete.
 * @throws {InvalidPath} When the name is not a valid project name.
 * @throws {NotFound} When the project does not exist.
 */
export async function deleteAppProject(name: string): Promise<void> {
    await opfs.removeFile(appProjectPath(name));
}

/**
 * Reads the project with the given name.
 *
 * @returns The parsed project data.
 * @throws {NotFound} When the project does not exist.
 * @throws {Unexpected} When the stored file is not valid JSON.
 */
export async function loadAppProject(name: string): Promise<any> {
    const file = await opfs.getFile(appProjectPath(name));
    const text = await file.text();

    try {
        return JSON.parse(text);
    }
    catch (error) {
        throw new Unexpected({
            message: `Project "${name}" is not a valid project file: ${error instanceof Error ? error.message : String(error)}`,
            scope: "AppProjects.load",
        });
    }
}
