import {
  Model,
  ModelKeys,
  ValidationMetadata,
  TypeMetadata,
  Primitives,
} from "@decaf-ts/decorator-validation";
import { z, ZodObject, ZodRawShape } from "zod";
import { Reflection } from "@decaf-ts/reflection";
import { ValidationKeys } from "@decaf-ts/decorator-validation";

Model.prototype.toZod = function <M extends Model>(this: M): ZodObject<any> {
  const constructorName = this.constructor.name;

  function zodify(type: string | string[]) {
    type = typeof type === "string" ? [type] : type;

    function innerZodify(type: string) {
      switch (type) {
        case Primitives.STRING:
          return z.string();
        case Primitives.NUMBER:
          return z.number();
        case Primitives.BIGINT:
          return z.bigint();
        case Primitives.BOOLEAN:
          return z.boolean();
        default:
          throw new Error(`Unzodifiable type: ${type}`);
      }
    }

    let zod: any;
    for (const t of type) {
      zod = zod ? zod.or(innerZodify(t)) : innerZodify(t);
    }
    return zod;
  }

  function zodifyValidation(zod: any, type: string, ...values: any[]) {
    if (
      [ValidationKeys.REQUIRED, ValidationKeys.TYPE, ModelKeys.TYPE].includes(
        type as any
      )
    )
      throw new Error(`Invalid validation zodify request`);
    switch (type) {
      case ValidationKeys.MIN:
      case ValidationKeys.MIN_LENGTH:
        return zod.min(values[0]);
      case ValidationKeys.MAX:
      case ValidationKeys.MAX_LENGTH:
        return zod.max(values[0]);
      case ValidationKeys.STEP:
        return zod.multipleOf(values[0]);
      case ValidationKeys.PATTERN:
      case ValidationKeys.URL:
      case ValidationKeys.EMAIL:
      case ValidationKeys.PASSWORD:
        return zod.regex(values[0]);
      case ValidationKeys.LIST: {
        const [t, clazz] = values;
        return t === Array.name
          ? zod.array(z.instanceof(clazz))
          : zod.set(z.instanceof(clazz));
      }
      case ValidationKeys.DATE:
        return zod.date();
      default:
        throw new Error(`Unsupported decorator: ${type}`);
    }
  }

  const result: { [key: string]: ZodRawShape } = {};

  for (const prop of Object.getOwnPropertyNames(this)) {
    if (
      typeof (this as any)[prop] === "function" ||
      prop.startsWith("_") ||
      prop === "constructor"
    ) {
      continue;
    }

    const allDecs = Reflection.getPropertyDecorators(
      ValidationKeys.REFLECT,
      this,
      prop,
      false,
      true
    );

    const decoratorData = Object.entries(allDecs).reduce(
      (accum: Record<string, ValidationMetadata>, [k, meta]) => {
        meta.forEach(({ key, props }) => {
          if (accum[key]) throw new Error(`Duplicate decorator: ${key}`);
          accum[key] = props as ValidationMetadata;
        });
        return accum;
      },
      {}
    );

    if (!Object.keys(decoratorData).length) {
      continue;
    }

    let zod: any;

    let typeData: TypeMetadata | ValidationMetadata =
      decoratorData[ValidationKeys.TYPE] || decoratorData[ModelKeys.TYPE];

    typeData = typeData as TypeMetadata;
    if (!typeData) throw new Error(`Missing type information`);

    if (typeData.customTypes) {
      zod = zodify(typeData.customTypes);
    }

    for (const [key, props] of Object.entries(decoratorData.decorators).filter(
      ([k]) =>
        [ValidationKeys.REQUIRED, ValidationKeys.TYPE, ModelKeys.TYPE].includes(
          k as any
        )
    )) {
      zod = zodifyValidation(zod, key, props.props);
    }

    if (!decoratorData[ValidationKeys.REQUIRED]) zod = zod.optional();
    result[prop] = zod;
  }

  return z.object(result);
};
