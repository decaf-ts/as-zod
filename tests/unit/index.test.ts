import { Metadata } from "@decaf-ts/decoration";
import * as entry from "../../src";

describe("package entrypoint", () => {
  it("re-exports symbols and registers the library", () => {
    expect(entry.VERSION).toBe("##VERSION##");
    expect(typeof entry.zodify).toBe("function");

    expect(() =>
      Metadata.registerLibrary("@decaf-ts/as-zod", "0.0.0-test")
    ).toThrow(/Library already @decaf-ts\/as-zod registered with version 0.0.0-test/);
  });
});
