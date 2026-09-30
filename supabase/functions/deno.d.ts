declare namespace Deno {
  export function serve(handler: (req: Request) => Promise<Response> | Response): void;
  export namespace env {
    export function get(key: string): string | undefined;
  }
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js';
}
