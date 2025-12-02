import * as wasm from "./adblock_bg.wasm";
export * from "./adblock_bg.js";
import { __wbg_set_wasm } from "./adblock_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
