export class ShutdownRejectedError extends Error {
  override readonly name = "ShutdownRejectedError";
  readonly statusCode: 400 | 503;

  constructor(
    message: string,
    options?: ErrorOptions & { readonly statusCode?: 400 | 503 },
  ) {
    super(message, options);
    this.statusCode = options?.statusCode ?? 400;
  }
}
