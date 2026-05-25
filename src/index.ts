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

/**
 * @description Represents the current commit hash of the module build.
 * @summary Stores the current git commit hash for the package. The build replaces
 * the placeholder with the actual commit hash at publish time.
 * @const COMMIT
 */
export const COMMIT = "##COMMIT##";

/**
 * @description Represents the full version string of the module.
 * @summary Stores the semver version and commit hash for the package.
 * The build replaces the placeholder with the actual `<version>-<commit>` value at publish time.
 * @const FULL_VERSION
 */
export const FULL_VERSION = "##FULL_VERSION##";


Metadata.registerLibrary("@decaf-ts/as-zod", VERSION);
