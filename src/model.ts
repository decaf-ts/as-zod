import { ZodObject } from "zod";

declare module "@decaf-ts/decorator-validation" {
  interface Model {
    toZod(): ZodObject;
  }
}
