import type { Task } from "./Task";

// Details for creating a Throwable.
export type ThrowableDetails = {
    message: string;
    task?: Task;
    scope?: string;
};

//
// Base class for all throwables (errors and exceptions) in the system.
//
export class Throwable extends Error
{
    // Task associated with the error, if any (for example, if the error is caused by a task cancellation).
    public readonly task: Task | undefined;

    // Scope where error happened, if any.
    public readonly scope: string | undefined;

    // Stack trace at the moment of error creation, if available.
    public readonly stack: string | undefined;

    // Constructor.
    constructor(details: ThrowableDetails) {
        super(details.message);

        this.task = details.task;
        this.scope = details.scope;
        this.stack = (new Error(details.message)).stack;
        this.name = this.constructor.name;
    }
}

export class TaskCancelled extends Throwable {
    constructor(details: ThrowableDetails) {
        super(details);
    }
}

export class NotFound extends Throwable {
    constructor(details: ThrowableDetails) {
        super(details);
    }
}

export class Misconfiguration extends Throwable {
    constructor(details: ThrowableDetails) {
        super(details);
    }
}

export class TypeError extends Throwable {
    constructor(details: ThrowableDetails) {
        super(details);
    }
}

export class AccessDenied extends Throwable {
    constructor(details: ThrowableDetails) {
        super(details);
    }
}

export class AbstractCallError extends Throwable {
    constructor(details: Partial<ThrowableDetails> = { message: '' }) {
        super({ ...details, message: `Tried to call abstract method` });
    }
}

export class NotImplemented extends Throwable {
    constructor(details: Partial<ThrowableDetails> = { message: '' }) {
        super({ ...details, message: `Requested functionality is not yet implemented` });
    }
}

export class RpcCallError extends Throwable {
    constructor(details: Partial<ThrowableDetails> = { message: '' }) {
        super({ ...details, message: `Tried to call Rpc method which does not exist or is not accessible. Call stack: ${new Error().stack}` });
    }
}

export class Unexpected extends Throwable {
    constructor(details: Partial<ThrowableDetails> = { message: '' }) {
        super({ ...details, message: `Unexpected error happened` });
    }
}

export class Void extends Throwable {
    constructor(details: Partial<ThrowableDetails> = {}) {
        super({ ...details, message: `We should never reach this code path` });
    }
}

export class ConnectionError extends Throwable {
    constructor(details: Partial<ThrowableDetails> = { message: '' }) {
        super({ ...details, message: `Connection error` });
    }
}
