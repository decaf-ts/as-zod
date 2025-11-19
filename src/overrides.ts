import {
  Model,
  ModelBuilder,
  AttributeBuilder,
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
  ExtendedMetadata,
} from "@decaf-ts/decorator-validation";
import { Metadata, Constructor } from "@decaf-ts/decoration";
import { z, ZodAny } from "zod";
import { ValidationKeys } from "@decaf-ts/decorator-validation";

const ReservedKeys = [
  ValidationKeys.REQUIRED,
  ValidationKeys.TYPE,
  ValidationKeys.DATE,
  ModelKeys.TYPE,
] as const;

function isReservedKey(el: string) {
  return ReservedKeys.includes(el as any);
}

type DecoratorData = Record<string, any>;

class ZodAttributeBuilder<
  M extends Model,
  N extends keyof M,
> extends AttributeBuilder<M, N, Constructor | undefined> {
  private readonly decoratorData: DecoratorData;
  private readonly attributeDescription?: string;

  constructor(
    parent: ModelBuilder<M>,
    attr: N,
    declaredType: Constructor | undefined,
    decoratorData: DecoratorData,
    description?: string
  ) {
    super(parent, attr, declaredType as Constructor | undefined);
    this.decoratorData = decoratorData;
    this.attributeDescription = description;
  }

  private safeInvoke(value: unknown) {
    if (typeof value !== "function") {
      return value;
    }
    if ((value as { prototype?: unknown }).prototype) {
      return value;
    }
    try {
      return (value as () => unknown)();
    } catch {
      return value;
    }
  }

  private typeName(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "function") {
      return value.name || value.toString();
    }
    if (value && typeof value === "object" && "name" in (value as any)) {
      const name = (value as { name?: string }).name;
      if (name) return name;
    }
    return String(value);
  }

  private normalizeTypes(input: TypeMetadata["customTypes"]): string[] {
    const asArray = Array.isArray(input) ? input : [input];
    return asArray.map((entry) => {
      const resolved = this.safeInvoke(entry);
      return this.typeName(resolved);
    });
  }

  private resolveListTypes(listMeta: ListMetadata) {
    const classes = Array.isArray(listMeta.clazz)
      ? listMeta.clazz
      : [listMeta.clazz];
    return classes.map((clazz) => {
      const resolved = this.safeInvoke(clazz);
      return this.typeName(resolved);
    });
  }

  buildSchema() {
    if (!Object.keys(this.decoratorData).length) {
      return undefined;
    }

    const typeData = this.decoratorData[ValidationKeys.TYPE] as
      | TypeMetadata
      | undefined;

    if (!typeData) {
      throw new Error(`Missing type information`);
    }

    let zodSchema = zodify(
      this.normalizeTypes(typeData.customTypes),
      this.decoratorData[ValidationKeys.LIST]
        ? zodify(
            this.resolveListTypes(
              this.decoratorData[ValidationKeys.LIST] as ListMetadata
            )
          )
        : ZodAny
    );

    for (const [key, props] of Object.entries(this.decoratorData).filter(
      ([k]) => !isReservedKey(k)
    )) {
      zodSchema = zodifyValidation(zodSchema, key, props);
    }

    if (!this.decoratorData[ValidationKeys.REQUIRED]) {
      zodSchema = zodSchema.optional();
    }

    if (this.attributeDescription) {
      zodSchema = zodSchema.describe(this.attributeDescription);
    }

    return zodSchema;
  }
}

class ZodModelBuilder<
  M extends Model,
  META extends ExtendedMetadata<M>,
> extends ModelBuilder<M> {
  constructor(
    private readonly target: Constructor<M>,
    private readonly metadata: META
  ) {
    super();
  }

  private decoratorDataFor(prop: keyof M) {
    const validations =
      ((this.metadata.validation as Record<keyof M, DecoratorData>) ??
        ({} as Record<keyof M, DecoratorData>))[prop] ?? {};
    const decoratorData: DecoratorData = { ...validations };

    if (!decoratorData[ValidationKeys.TYPE]) {
      const designType = (
        this.metadata.properties as
          | Record<string, Constructor | { name?: string }>
          | undefined
      )?.[prop as string];
      const typeName =
        typeof designType === "function"
          ? designType.name
          : typeof designType?.name === "string"
            ? designType.name
            : undefined;
      if (typeName) {
        decoratorData[ValidationKeys.TYPE] = {
          customTypes: [typeName],
          message: DEFAULT_ERROR_MESSAGES.TYPE,
          description: "defines the accepted types for the attribute",
        } as unknown as TypeMetadata;
      }
    }

    return decoratorData;
  }

  toZodObject() {
    const result: Record<string, any> = {};
    const properties = Model.getAttributes(this.target);
    if (Array.isArray(properties) && properties.length) {
      for (const prop of properties) {
        if (
          typeof prop !== "string" ||
          prop === "constructor" ||
          prop.startsWith("_")
        ) {
          continue;
        }

        if (typeof (this.target as any)[prop] === "function") {
          continue;
        }

        const decoratorData = this.decoratorDataFor(prop as keyof M);
        if (!Object.keys(decoratorData).length) continue;

        const attributeBuilder = new ZodAttributeBuilder(
          this as ModelBuilder<M>,
          prop as keyof M,
          (this.metadata.properties as Record<string, Constructor>)?.[
            prop as string
          ],
          decoratorData,
          Metadata.description(this.target as any, prop as any) ??
            (this.metadata.description as Record<string, string> | undefined)?.[
              prop as string
            ]
        );
        const schema = attributeBuilder.buildSchema();
        if (schema) {
          result[prop] = schema;
        }
      }
    }

    const description =
      Metadata.description(this.target as any) ??
      (this.metadata.description as Record<string, string> | undefined)?.class;
    const objectSchema = z.object(result);
    return description ? objectSchema.describe(description) : objectSchema;
  }
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
      case Set.name.toLowerCase(): {
        const setSchema = z.set(zz);
        if (typeof (setSchema as any).valueSchema === "undefined") {
          Object.defineProperty(setSchema, "valueSchema", {
            get: () => (setSchema as any)._def?.valueType,
            enumerable: false,
            configurable: true,
          });
        }
        return setSchema;
      }
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
      // DATE decorator is handled via @type(Date) and parsing; do not re-wrap here
      throw new TypeError("DATE validator cannot be applied as a refinement");
    default:
      return zod;
  }
}

export function modelToZod<M extends Model, META extends ExtendedMetadata<M>>(
  model: M | Constructor<M>
) {
  const ctor =
    model instanceof Model ? (model.constructor as Constructor<M>) : model;
  const fullMeta: META | undefined = Metadata.get(ctor as any) as META;
  const builder = new ZodModelBuilder(
    ctor as Constructor<M>,
    (fullMeta ?? { validation: {}, properties: {}, description: {} }) as META
  );

  return builder.toZodObject();
}

const descriptor = Object.getOwnPropertyDescriptor(z, "from" as keyof typeof z);

if (!descriptor || descriptor.configurable) {
  Object.defineProperty(z, "from", {
    value: <M extends Model>(model: Constructor<M>) => {
      return modelToZod(model) as any;
    },
  });
}
