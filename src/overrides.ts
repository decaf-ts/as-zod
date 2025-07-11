import {
  Model,
  ModelKeys,
  ListMetadata,
  ValidationMetadata,
  TypeMetadata,
  Primitives,
} from "@decaf-ts/decorator-validation";
import { z, ZodAny, ZodObject, ZodRawShape } from "zod";
import { Reflection } from "@decaf-ts/reflection";
import {
  ValidationKeys,
  DEFAULT_PATTERNS,
} from "@decaf-ts/decorator-validation";

Model.prototype.toZod = function <M extends Model>(
  this: M
): ZodObject<any> {
  const constructorName = this.constructor.name;

  const shape: ZodRawShape = {};

  // Get all properties including those from the prototype chain
  const properties = Object.getOwnPropertyNames(this);

  function zodify(type: string | string[]) {
    type = typeof type === "string" ? [type] : type

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
      zod = zod ? zod.or(innerZodify(t)) : innerZodify(t)
    }
    return zod;
  }


  function zodifyValidation(zod: any, type: string, ...values: any[]) {
    if ([ValidationKeys.REQUIRED, ValidationKeys.TYPE, ModelKeys.TYPE].includes(type as any))
      throw new Error(`Invalid validation zodify request`)
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
      case ValidationKeys.LIST:
        const [t, clazz] = values;
        return t === Array.name
          ? zod.array(z.instanceof(clazz))
          : zod.set(z.instanceof(clazz));
      case ValidationKeys.DATE:
        return zod.date();
      default:
        throw new Error(`Unsupported decorator: ${type}`)
      }
    }
  }


  for (const prop of properties) {
    // Skip methods, internal properties, and constructor
    if (
      typeof (this as any)[prop] === "function" ||
      prop.startsWith("_") ||
      prop === "constructor"
    ) {
      continue;
    }

    const decoratorData = Object.entries(Reflection.getPropertyDecorators(
      ValidationKeys.REFLECT,
      this,
      prop,
      false,
      true
    )).reduce((accum: Record<string, ValidationMetadata>, [k, meta]) => {
      meta.forEach(({key, props}) => {
        if (accum[key])
          throw new Error(`Duplicate decorator: ${key}`)
        accum[key] = props as ValidationMetadata
      })
      return accum;
    }, {});

    if (!Object.keys(decoratorData).length) {
      continue;
    }

    // Process decorators to build Zod schema
    let schema: ZodAny | null = null;
    let isRequired = false;
    let isArray = false;
    let isSet = false;
    let type: string | undefined;

    let zod: any

    let typeData: TypeMetadata | ValidationMetadata = decoratorData[ValidationKeys.TYPE] || decoratorData[ModelKeys.TYPE]

    typeData = typeData as TypeMetadata
    if (!typeData)
      throw new Error(`Missing type information`)

    if (typeData.customTypes){
      zod = zodify(typeData.customTypes);
    }

    for (const [key, props] of Object.entries(decoratorData.decorators)
      .filter(([k]) => [ValidationKeys.REQUIRED, ValidationKeys.TYPE, ModelKeys.TYPE].includes(k as any))) {
      switch (key){
        case: ValidationKeys.MIN:
          zod = zod.min(props.min);
          break;
        case: ValidationKeys.MAX:
        case: ValidationKeys.MIN_LENGTH:
        case: ValidationKeys.MAX_LENGTH:
        case: ValidationKeys.STEP:

        default:
          throw new Error(`Unknown decorator: ${key}`)
      }

    }

    if (!decoratorData[ValidationKeys.REQUIRED])
      zod = zod.optional()


    // First, determine the base type
    for (const decorator of decoratorData.decorators) {
      if (decorator.key === ValidationKeys.REQUIRED) {
        isRequired = true;
      }
      switch (decorator.key) {
        case ValidationKeys.REQUIRED:
          isRequired = true;
          break
        case ModelKeys.TYPE:
          if (type)
            break;
        case ValidationKeys.TYPE:
          type = decorator.props.type as string;
          break;
        case ValidationKeys.LIST:
          isArray = (decorator.props as unknown as ListMetadata).type === Array.name;
          isSet = (decorator.props as unknown as ListMetadata).type === Set.name;
          break;
        case ValidationKeys.MIN:
        case ValidationKeys.MAX:
        case ValidationKeys.STEP:
        case ValidationKeys.MIN_LENGTH:
        case ValidationKeys.MAX_LENGTH:
        default:
          throw new Error(`Unknown decorator: ${decorator.key}`);
      }

      if (decorator.key === ValidationKeys.TYPE) {
        const typeInfo = decorator.props;

        if (typeInfo) {
          // Handle union types
          if (Array.isArray(typeInfo.types)) {
            const unionSchemas: ZodTypeAny[] = [];
            for (const type of typeInfo.types) {
              if (type === "string") unionSchemas.push(z.string());
              else if (type === "number") unionSchemas.push(z.number());
              else if (type === "boolean") unionSchemas.push(z.boolean());
              else unionSchemas.push(z.any());
            }
            schema = z.union(unionSchemas);
          }
          // Handle custom types
          else if (typeInfo.customTypes) {
            const customType = Array.isArray(typeInfo.customTypes)
              ? typeInfo.customTypes[0]
              : typeInfo.customTypes;

            if (customType) {
              try {
                const CustomClass =
                  Object.getPrototypeOf(this).constructor.name === customType
                    ? Object.getPrototypeOf(this).constructor
                    : eval(customType);

                schema = z.instanceof(CustomClass);
              } catch (e) {
                schema = z.any();
              }
            }
          }
        }
      } else if (decorator.key === "design:type") {
        if (!schema) {
          // Only set if not already set by ValidationKeys.TYPE
          const typeInfo = decorator.props;

          if (typeInfo) {
            const typeName = typeInfo.name;

            if (typeName === "String") schema = z.string();
            else if (typeName === "Number") schema = z.number();
            else if (typeName === "Boolean") schema = z.boolean();
            else if (typeName === "Date") schema = z.date();
            else if (typeName === "Object") schema = z.object({});
            else if (typeName === "Array") {
              isArray = true;
              schema = z.array(z.string()); // Default to string array, will be refined later
            } else if (typeName && (this as any)[prop] instanceof Model) {
              schema = z.instanceof(typeInfo);
            }
          }
        }
      } else if (decorator.key === ValidationKeys.LIST) {
        isArray = true;
        const itemType = decorator.props.class;
        let itemSchema: ZodTypeAny;

        if (itemType === "String") itemSchema = z.string();
        else if (itemType === "Number") itemSchema = z.number();
        else if (itemType === "Boolean") itemSchema = z.boolean();
        else if (itemType === "Date") itemSchema = z.date();
        else itemSchema = z.any();

        schema = z.array(itemSchema);
      }
    }

    // If no type was determined, default based on the property value
    if (!schema) {
      const value = (this as any)[prop];

      if (typeof value === "string") schema = z.string();
      else if (typeof value === "number") schema = z.number();
      else if (typeof value === "boolean") schema = z.boolean();
      else if (value instanceof Date) schema = z.date();
      else if (Array.isArray(value)) {
        isArray = true;
        schema = z.array(z.any());
      } else if (value instanceof Model) {
        schema = z.instanceof(Object.getPrototypeOf(value).constructor);
      } else {
        schema = z.any();
      }
    }

    // Apply additional validations
    for (const decorator of decoratorData.decorators) {
      // Min/Max validations for numbers
      if (decorator.key === ValidationKeys.MIN && !isArray) {
        schema = schema.min(decorator.props.min);
      } else if (decorator.key === ValidationKeys.MAX && !isArray) {
        schema = schema.max(decorator.props.max);
      }

      // Step validation for numbers
      else if (decorator.key === ValidationKeys.STEP) {
        schema = schema.multipleOf(decorator.props.step);
      }

      // Min/Max length validations
      else if (decorator.key === ValidationKeys.MIN_LENGTH) {
        if (isArray) {
          schema = (schema as z.ZodArray<any>).min(decorator.props.minlength);
        } else {
          schema = schema.min(decorator.props.minlength);
        }
      } else if (decorator.key === ValidationKeys.MAX_LENGTH) {
        if (isArray) {
          schema = (schema as z.ZodArray<any>).max(decorator.props.maxlength);
        } else {
          schema = schema.max(decorator.props.maxlength);
        }
      }

      // Pattern validation for strings
      else if (decorator.key === ValidationKeys.PATTERN) {
        const pattern = decorator.props.pattern;
        if (pattern instanceof RegExp) {
          schema = schema.regex(pattern);
        } else if (typeof pattern === "string") {
          schema = schema.regex(new RegExp(pattern));
        }
      }

      // Email validation
      else if (decorator.key === ValidationKeys.EMAIL) {
        schema = z.email();
      }

      // URL validation
      else if (decorator.key === ValidationKeys.URL) {
        schema = z.url();
      }

      // Password validation
      else if (decorator.key === ValidationKeys.PASSWORD) {
        schema = z
          .string()
          .regex(DEFAULT_PATTERNS.PASSWORD.CHAR8_ONE_OF_EACH)
          .describe("the password");
      }
    }

    // Add description
    if (schema && !schema.description) {
      schema = schema.describe(`the ${prop}`);
    }

    // Make optional if not required
    if (!isRequired) {
      schema = schema.optional();
    }

    // Add to shape
    shape[prop] = schema;
  }

  return z.object(shape);
};
