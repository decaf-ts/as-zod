import {
  Model,
  ModelKeys,
  TypeMetadata,
  Primitives,
  DEFAULT_ERROR_MESSAGES,
  ValidatorOptions,
  MinLengthValidatorOptions,
  MinValidatorOptions,
  MaxValidatorOptions,
  MaxLengthValidatorOptions,
  StepValidatorOptions,
  PatternValidatorOptions,
  ListMetadata,
  Constructor,
} from "@decaf-ts/decorator-validation";
import { Metadata } from "@decaf-ts/decoration";
import { z, ZodAny } from "zod";
import { Reflection } from "@decaf-ts/reflection";
import { ValidationKeys } from "@decaf-ts/decorator-validation";

const ReservedKeys = [
  ValidationKeys.REQUIRED,
  ValidationKeys.TYPE,
  ModelKeys.TYPE,
] as const;

function isReservedKey(el: string) {
  return ReservedKeys.includes(el as any);
}

export function zodify(type: string | string[], zz: any = ZodAny) {
  type = typeof type === "string" ? [type] : type;

  function innerZodify(type: string) {
    switch (type.toLowerCase()) {
      case Primitives.STRING:
        return z.string();
      case Primitives.NUMBER:
        return z.number();
      case Primitives.BIGINT:
        return z.bigint();
      case Primitives.BOOLEAN:
        return z.boolean();
      case ValidationKeys.DATE:
        return z.date();
      case Array.name.toLowerCase():
        return z.array(zz);
      case Set.name.toLowerCase():
        return z.set(zz);
      default: {
        const m = Model.get(type);
        if (!m) {
          throw new Error(`Unzodifiable type: ${type}`);
        }
        try {
          const zz = z.from(m);
          return zz;
        } catch (e: unknown) {
          throw new Error(`Failed to zodify model ${type}: ${e}`);
        }
      }
    }
  }

  let zod: any;
  for (const t of type) {
    zod = zod ? zod.or(innerZodify(t)) : innerZodify(t);
  }

  return zod;
}

export function zodifyValidation(
  zod: any,
  type: string,
  values: ValidatorOptions
) {
  switch (type) {
    case ValidationKeys.MIN:
      return zod.min((values as MinValidatorOptions)[ValidationKeys.MIN]);
    case ValidationKeys.MIN_LENGTH:
      return zod.min(
        (values as MinLengthValidatorOptions)[ValidationKeys.MIN_LENGTH]
      );
    case ValidationKeys.MAX:
      return zod.max((values as MaxValidatorOptions)[ValidationKeys.MAX]);
    case ValidationKeys.MAX_LENGTH:
      return zod.max(
        (values as MaxLengthValidatorOptions)[ValidationKeys.MAX_LENGTH]
      );
    case ValidationKeys.STEP:
      return zod.multipleOf(
        (values as StepValidatorOptions)[ValidationKeys.STEP]
      );
    case ValidationKeys.PATTERN:
    case ValidationKeys.URL:
    case ValidationKeys.EMAIL:
    case ValidationKeys.PASSWORD:
      return zod.regex(
        new RegExp(
          (values as PatternValidatorOptions)[ValidationKeys.PATTERN] as string,
          "g"
        )
      );
    case ValidationKeys.DATE:
      return zod.date();
    default:
      return zod;
  }
}

export function modelToZod<M extends Model>(model: M) {
  const result: { [key: string]: any } = {};

  const properties = Model.getAttributes(model);
  if (Array.isArray(properties) && !properties.length) return z.object({});
  for (const prop of properties) {
    if (
      typeof (model as any)[prop] === "function" ||
      prop.startsWith("_") ||
      prop === "constructor"
    ) {
      continue;
    }

    const allDecs = Reflection.getPropertyDecorators(
      ValidationKeys.REFLECT,
      model,
      prop,
      false,
      true
    );

    const decoratorData = allDecs.decorators.reduce(
      (accum: Record<string, any>, el) => {
        const { key, props } = el;
        if (key === ModelKeys.TYPE && !accum[ValidationKeys.TYPE]) {
          accum[ValidationKeys.TYPE] = {
            customTypes: [props.name as string],
            message: DEFAULT_ERROR_MESSAGES.TYPE,
            description: "defines the accepted types for the attribute",
          };
        } else {
          accum[key] = props;
        }
        return accum;
      },
      {}
    );

    if (!Object.keys(decoratorData).length) {
      continue;
    }

    let zod: any = ZodAny;

    const typeData: TypeMetadata = decoratorData[
      ValidationKeys.TYPE
    ] as TypeMetadata;

    if (!typeData) {
      throw new Error(`Missing type information`);
    }

    zod = zodify(
      (Array.isArray(typeData.customTypes)
        ? typeData.customTypes
        : [typeData.customTypes]
      ).map((c) => {
        if (typeof c === "function") return c();
        return c;
      }),
      decoratorData[ValidationKeys.LIST]
        ? zodify(
            (Array.isArray(
              (decoratorData[ValidationKeys.LIST] as ListMetadata).clazz
            )
              ? (decoratorData[ValidationKeys.LIST] as ListMetadata).clazz
              : [(decoratorData[ValidationKeys.LIST] as ListMetadata).clazz]
            ).map((c) => {
              if (typeof c === "function") {
                return c().name;
              }
              return c as string;
            })
          )
        : ZodAny
    );

    for (const [key, props] of Object.entries(decoratorData).filter(
      ([k]) => !isReservedKey(k)
    )) {
      zod = zodifyValidation(zod, key, props);
    }

    if (!decoratorData[ValidationKeys.REQUIRED]) {
      zod = zod.optional();
    }

    const description = Metadata.description(
      model.constructor as any,
      prop as any
    );

    if (description) {
      zod = zod.describe(description);
    }

    result[prop] = zod;
  }

  const description = Metadata.description(model.constructor as any);
  const res = z.object(result);
  if (description) {
    res.describe(description);
  }
  return res;
}

const descriptor = Object.getOwnPropertyDescriptor(z, "from" as keyof typeof z);

if (!descriptor || descriptor.configurable) {
  Object.defineProperty(z, "from", {
    value: <M extends Model>(model: Constructor<M>) => {
      const m = new model();
      if (!Metadata.constr(m.constructor as any)) Model.fromModel(m, {});
      return modelToZod(m) as any;
    },
  });
}
