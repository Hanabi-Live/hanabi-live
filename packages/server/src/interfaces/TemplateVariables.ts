export interface TemplateVariables {
  // From the `getTemplateVariables` function.
  readonly projectName: string;
  readonly isDev: boolean;
  readonly version: number;

  // Needed by all templates.
  readonly title: string;

  // Needed by the "main" template.
  readonly domain?: string;

  // Needed by the "missing-scores" template.
  readonly namesTitle?: string;
  readonly advancedFiltersActive?: boolean;
  /** JSON, since the template engine does not accept arrays. */
  readonly playersJSON?: string;
  /** JSON, since the template engine does not accept arrays. */
  readonly rowsJSON?: string;
  readonly excludeVariants?: string;
  readonly minEfficiency?: string;
  readonly maxEfficiency?: string;
}
