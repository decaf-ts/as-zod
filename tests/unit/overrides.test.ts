import "../../src";
import {
  MaxLengthValidatorOptions,
  MaxValidatorOptions,
  MinLengthValidatorOptions,
  MinValidatorOptions,
  Model,
  ModelArg,
  model,
  PatternValidatorOptions,
  required,
  StepValidatorOptions,
  type,
  ValidatorOptions,
  ValidationKeys,
  list,
  minlength,
  maxlength,
} from "@decaf-ts/decorator-validation";
import { description } from "@decaf-ts/decoration";
import { Reflection } from "@decaf-ts/reflection";
import { z } from "zod";
import { modelToZod, zodify, zodifyValidation } from "../../src/overrides";

describe("zodify", () => {
  it("creates schemas for primitives, containers, and unions", () => {
    const stringSchema = zodify("string");
    expect(stringSchema).toBeInstanceOf(z.ZodString);
    expect(stringSchema.safeParse("hello").success).toBe(true);

    const dateSchema = zodify(ValidationKeys.DATE);
    expect(dateSchema).toBeInstanceOf(z.ZodDate);

    const bigintSchema = zodify("bigint");
    expect(bigintSchema).toBeInstanceOf(z.ZodBigInt);
    expect(bigintSchema.safeParse(BigInt(42)).success).toBe(true);

    const booleanSchema = zodify("boolean");
    expect(booleanSchema).toBeInstanceOf(z.ZodBoolean);
    expect(booleanSchema.safeParse(false).success).toBe(true);

    const arraySchema = zodify("array", z.string());
    expect(arraySchema).toBeInstanceOf(z.ZodArray);
    expect(arraySchema.element).toBeInstanceOf(z.ZodString);

    const setSchema = zodify("set", z.number());
    expect(setSchema).toBeInstanceOf(z.ZodSet);

    const unionSchema = zodify(["string", "number"]);
    expect(unionSchema.safeParse("value").success).toBe(true);
    expect(unionSchema.safeParse(5).success).toBe(true);
    expect(unionSchema.safeParse(true).success).toBe(false);
  });

  it("maps registered models and reports errors", () => {
    @model()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    class BasicModel extends Model {
      constructor(arg?: ModelArg<BasicModel>) {
        super(arg);
      }
    }

    const modelSchema = zodify("BasicModel");
    expect(modelSchema).toBeInstanceOf(z.ZodObject);

    expect(() => zodify("UnknownModel")).toThrow(
      /Unzodifiable type: UnknownModel/
    );
  });

  it("wraps conversion failures from model instances", () => {
    @model()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    class ExplodingModel extends Model {
      constructor() {
        super();
        throw new Error("Explosion");
      }
    }

    expect(() => zodify("ExplodingModel")).toThrow(
      /Failed to zodify model ExplodingModel: Error: Explosion/
    );
  });
});

describe("zodifyValidation", () => {
  it("applies numeric and length constraints", () => {
    const minSchema = zodifyValidation(z.number(), ValidationKeys.MIN, {
      [ValidationKeys.MIN]: 3,
    } as MinValidatorOptions);
    expect(minSchema.safeParse(4).success).toBe(true);
    expect(minSchema.safeParse(2).success).toBe(false);

    const maxSchema = zodifyValidation(z.number(), ValidationKeys.MAX, {
      [ValidationKeys.MAX]: 10,
    } as MaxValidatorOptions);
    expect(maxSchema.safeParse(11).success).toBe(false);

    const minLengthSchema = zodifyValidation(
      z.string(),
      ValidationKeys.MIN_LENGTH,
      {
        [ValidationKeys.MIN_LENGTH]: 2,
      } as MinLengthValidatorOptions
    );
    expect(minLengthSchema.safeParse("a").success).toBe(false);

    const maxLengthSchema = zodifyValidation(
      z.string(),
      ValidationKeys.MAX_LENGTH,
      {
        [ValidationKeys.MAX_LENGTH]: 4,
      } as MaxLengthValidatorOptions
    );
    expect(maxLengthSchema.safeParse("12345").success).toBe(false);
  });

  it("applies step, pattern, and delegated validators", () => {
    const stepSchema = zodifyValidation(z.number(), ValidationKeys.STEP, {
      [ValidationKeys.STEP]: 2,
    } as StepValidatorOptions);
    expect(stepSchema.safeParse(6).success).toBe(true);
    expect(stepSchema.safeParse(7).success).toBe(false);

    const patternSchema = zodifyValidation(z.string(), ValidationKeys.PATTERN, {
      [ValidationKeys.PATTERN]: "^test$",
    } as PatternValidatorOptions);
    expect(patternSchema.safeParse("test").success).toBe(true);
    expect(patternSchema.safeParse("tester").success).toBe(false);

    const emailSchema = zodifyValidation(z.string(), ValidationKeys.EMAIL, {
      [ValidationKeys.PATTERN]: "^.+@example\\.com$",
    } as PatternValidatorOptions);
    expect(emailSchema.safeParse("user@example.com").success).toBe(true);
    expect(emailSchema.safeParse("user@elsewhere.com").success).toBe(false);
  });

  it("creates date schemas and leaves unknown validators untouched", () => {
    expect(() =>
      zodifyValidation(
        zodify(ValidationKeys.DATE),
        ValidationKeys.DATE,
        {} as ValidatorOptions
      )
    ).toThrow(TypeError);

    const original = z.string();
    const unchanged = zodifyValidation(
      original,
      "non-existent" as ValidationKeys,
      {} as ValidatorOptions
    );
    expect(unchanged).toBe(original);
  });
});

describe("modelToZod", () => {
  @model()
  @description("Child holder")
  class ChildModel extends Model {
    @required()
    @type("string")
    name!: string;

    constructor(arg?: ModelArg<ChildModel>) {
      super(arg);
    }
  }

  @model()
  @description("Complex model")
  class ComplexModel extends Model {
    @description("username field")
    @required()
    @minlength(3)
    @maxlength(5)
    username!: string;

    @description("optional tags")
    @list(String)
    tags?: string[];

    @description("optional children")
    @list(() => ChildModel)
    @type(ChildModel.name)
    children?: ChildModel[];

    helper() {
      return "noop";
    }

    constructor(arg?: ModelArg<ComplexModel>) {
      super(arg);
    }
  }

  it("translates decorated models into described Zod schemas", () => {
    const schema = modelToZod(new ComplexModel());
    expect(schema).toBeInstanceOf(z.ZodObject);

    const shape = schema.shape;
    expect(shape.username).toBeInstanceOf(z.ZodString);

    const tags = shape.tags;
    expect(tags).toBeInstanceOf(z.ZodOptional);
    const tagArray = (tags as z.ZodOptional<any>)._def.innerType;
    expect(tagArray).toBeInstanceOf(z.ZodArray);
    const tagSchema = tagArray.element;
    expect(tagSchema).toBeInstanceOf(z.ZodString);

    const children = shape.children;
    expect(children).toBeInstanceOf(z.ZodOptional);
    const childSchema = (children as z.ZodOptional<any>)._def.innerType;
    expect(childSchema).toBeInstanceOf(z.ZodObject);

    const parsed = schema.parse({
      username: "user",
      tags: ["child"],
      children: { name: "child" },
    });
    expect(parsed).toEqual({
      username: "user",
      tags: ["child"],
      children: { name: "child" },
    });
  });

  it("skips undecorated properties before building zod", () => {
    @model()
    class IgnoredPropertyModel extends Model {
      @required()
      @type("string")
      included!: string;

      @required()
      @type("string")
      ignored!: string;

      constructor(arg?: ModelArg<IgnoredPropertyModel>) {
        super(arg);
      }
    }

    const original = Reflection.getPropertyDecorators.bind(Reflection);
    const skipSpy = jest
      .spyOn(Reflection, "getPropertyDecorators")
      .mockImplementation(
        (prefix, target, property, ignoreType, recursive, accumulator) => {
          if (property === "ignored") {
            return { prop: "ignored", decorators: [] } as any;
          }
          return original(
            prefix,
            target,
            property,
            ignoreType as boolean | undefined,
            recursive as boolean | undefined,
            accumulator
          );
        }
      );

    const schema = modelToZod(new IgnoredPropertyModel());
    expect(schema.shape).toHaveProperty("included");
    expect(schema.shape).not.toHaveProperty("ignored");

    skipSpy.mockRestore();
  });

  it("omits internal fields and fails without type metadata", () => {
    @model()
    class HiddenModel extends Model {
      @required()
      @type("string")
      visible!: string;

      @required()
      @type("string")
      _hidden!: string;

      constructor(arg?: ModelArg<HiddenModel>) {
        super(arg);
      }
    }

    const schema = modelToZod(new HiddenModel());
    expect(schema.shape).toHaveProperty("visible");
    expect(schema.shape).not.toHaveProperty("_hidden");

    @model()
    class MissingTypeModel extends Model {
      @required()
      field!: string;

      constructor(arg?: ModelArg<MissingTypeModel>) {
        super(arg);
      }
    }

    const reflectionSpy = jest.spyOn(Reflection, "getPropertyDecorators");
    reflectionSpy.mockReturnValue({
      prop: "field",
      decorators: [
        {
          key: ValidationKeys.REQUIRED,
          props: { message: "", async: false },
        },
      ],
    } as any);

    expect(() => modelToZod(new MissingTypeModel())).toThrow(
      /Missing type information/
    );

    reflectionSpy.mockRestore();
  });
});
