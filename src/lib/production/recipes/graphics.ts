/** Preserve authored graphics properties, including the explicit layout version.
 * Missing layoutVersion intentionally keeps historical recipes on their old layout. */
export function recipeGraphicProps(step: object): Record<string, unknown> & { title: string } {
    const values = step as Record<string, unknown>;
    return Object.fromEntries(['layoutVersion', 'title', 'subtitle', 'brandName', 'eyebrow', 'feature', 'detail', 'index', 'callToAction', 'url', 'accentColor', 'backgroundColor', 'textColor']
        .filter(key => values[key] !== undefined).map(key => [key, values[key]])) as Record<string, unknown> & { title: string };
}
