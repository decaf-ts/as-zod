import { Metadata } from "@decaf-ts/decoration";

export * from "./zod";
export * from "./overrides";

/**
 * @description Current version of the reflection package
 * @summary Stores the semantic version number of the package
 * @const VERSION
 * @memberOf module:as-zod
 */
export const VERSION = "##VERSION##";

Metadata.registerLibrary("@decaf-ts/as-zod", VERSION);
