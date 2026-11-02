/** Next's proxy can preserve escaped path segments in dynamic params.
 * Decode at the route boundary, before looking up canonical external IDs.
 * Authorization still belongs to the Convex project access guards.
 */
export function decodeProjectRouteId(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        // Invalid URI input must become a normal unavailable-project response,
        // rather than exposing a URIError to the user.
        return value;
    }
}
