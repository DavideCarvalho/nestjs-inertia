export interface TemplateEngineAdapter {
  extension: string;
  packageName: string;
  compile(
    templateSource: string,
    absPath: string,
  ): (locals: Record<string, unknown>) => string | Promise<string>;
}
