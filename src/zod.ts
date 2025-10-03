import type { Constructor, Model } from "@decaf-ts/decorator-validation";
import { ZodObject } from "zod";

declare module "zod" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace z {
    function from<M extends Model>(model: Constructor<M>): ZodObject<any>;
  }
}
