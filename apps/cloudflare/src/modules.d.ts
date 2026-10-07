// Wrangler bundles these as modules (see "rules" in wrangler.jsonc).
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}

declare module '*.ttf' {
  const data: ArrayBuffer;
  export default data;
}
