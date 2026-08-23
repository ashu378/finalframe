type LogContext = Record<string, unknown>;

function serialize(context?: LogContext) {
    if (!context) return undefined;
    return Object.fromEntries(
        Object.entries(context).filter(([key]) => !/token|secret|key|password|authorization/i.test(key)),
    );
}

function write(level: 'info' | 'warn' | 'error', message: string, context?: LogContext) {
    const payload = { timestamp: new Date().toISOString(), level, message, context: serialize(context) };
    if (level === 'error') console.error(JSON.stringify(payload));
    else if (level === 'warn') console.warn(JSON.stringify(payload));
    else console.info(JSON.stringify(payload));
}

export const logger = {
    info: (message: string, context?: LogContext) => write('info', message, context),
    warn: (message: string, context?: LogContext) => write('warn', message, context),
    error: (message: string, context?: LogContext) => write('error', message, context),
};
