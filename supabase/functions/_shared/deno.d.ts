// The few Deno APIs our Edge Functions use. Deno has them built in; this file only lets
// `npm run typecheck` check the functions without Deno installed. Deno itself never reads it.
declare namespace Deno {
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown
  const env: {
    get(key: string): string | undefined
    toObject(): Record<string, string>
  }
}
