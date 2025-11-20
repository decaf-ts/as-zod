import type { Model } from "@decaf-ts/decorator-validation";
import type { Constructor } from "@decaf-ts/decoration";
import type {
  ZodArray,
  ZodBigInt,
  ZodBoolean,
  ZodDate,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodSet,
  ZodString,
  ZodTypeAny,
} from "zod";

// Base mapping (non-optional, non-nullable) from property types to Zod schema types
// Keep recursion shallow by using ZodTypeAny for nested collections/models
type BaseZodSchemaFor<T> =
  // primitives
  T extends string
    ? ZodString
    : T extends number
      ? ZodNumber
      : T extends boolean
        ? ZodBoolean
        : T extends bigint
          ? ZodBigInt
          : T extends Date
            ? ZodDate
            : // collections (use any to avoid deep recursion)
              T extends any[]
              ? ZodArray<ZodTypeAny>
              : T extends Set<any>
                ? ZodSet<ZodTypeAny>
                : // nested models (object shape as any)
                  T extends Model
                  ? ZodObject<any>
                  : // fallback
                    ZodTypeAny;

// Handle null and undefined to reflect optional/nullable schemas
export type ZodSchemaFor<T> = undefined extends T
  ? ZodOptional<BaseZodSchemaFor<Exclude<T, undefined>>>
  : null extends T
    ? ZodNullable<BaseZodSchemaFor<NonNullable<T>>>
    : BaseZodSchemaFor<T>;

// Derive a Zod object shape from a Model instance type
export type ZodShapeFor<M> = {
  // drop function members from the shape
  [K in keyof M as M[K] extends (...args: any[]) => any
    ? never
    : K]: ZodSchemaFor<M[K]>;
};

// Public helper for the inferred Zod object type for a Model constructor
export type ZodFrom<M extends Model> = ZodObject<ZodShapeFor<M>>;

// Utility helpers to explicitly specify element types for collections in TS
export type ListOf<T> = T[];
export type SetOf<T> = Set<T>;

declare module "zod" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace z {
    function from<M extends Model>(model: Constructor<M>): ZodFrom<M>;
  }
}
