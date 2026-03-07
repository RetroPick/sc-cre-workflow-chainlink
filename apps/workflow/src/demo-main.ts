/**
 * Demo CRE workflow entry — thin wrapper so CRE finds tmp.wasm in src/.
 * Delegates to demo/main-demo.ts. The CRE expects the WASM binary in the same
 * directory as the workflow entry; using src/ ensures it finds src/tmp.wasm.
 */
export { main } from "../demo/main-demo";
