import type { Model } from "@decaf-ts/decorator-validation";
import type { Constructor } from "@decaf-ts/decoration";
import type { ZodTypeAny } from "zod";
import { modelToZod, zodToModel } from "./overrides";
import type { ModelFromZod, ZodFrom } from "./zod";

/**
 * @description Zod's full API extended with decaf-ts model conversions.
 * @summary Since zod 4.6 the `z` export is frozen, so `from`/`toModel` can no
 * longer be attached to it. This module re-exports everything zod exposes and
 * adds both helpers; the package entrypoint exposes it as the `z` namespace.
 */
export * from "zod";

export function from<M extends Model>(model: Constructor<M>): ZodFrom<M> {
  return modelToZod(model) as unknown as ZodFrom<M>;
}

export function toModel<S extends ZodTypeAny, M extends Model = Model>(
  schema: S,
  name?: string
): ModelFromZod<S, M> {
  return zodToModel<M>(schema, name);
}
