// See https://kit.svelte.dev/docs/types#app
declare global {
  namespace App {
    interface Locals {
      /** The language resolved for this request. See hooks.server.ts. */
      locale: 'en' | 'fr';
    }
  }
}
export {};
