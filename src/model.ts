import { ZodObject } from "zod";

declare module "@decaf-ts/decorator-validation" {
  interface Model {
    toZod(): ZodObject<any>;
  }

  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Model {
    function toZod(): ZodObject<any>;
  }
}
