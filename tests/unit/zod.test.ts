import "../../src";
import {
  maxlength,
  minlength,
  Model,
  model,
  ModelArg,
  required,
  type,
  password,
  DEFAULT_PATTERNS,
  list,
} from "@decaf-ts/decorator-validation";
import { description } from "@decaf-ts/decoration";
import { z, ZodObject } from "zod";

@model()
class InnerTestModel extends Model {
  constructor() {
    super();
  }
}

@model()
class TestModel extends Model {
  @type(InnerTestModel.name)
  prop?: InnerTestModel;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
@model()
@description("A simple password model")
class PasswordTestModel extends Model {
  @description("the password attribute")
  @required()
  @password()
  @minlength(8)
  password!: string;

  constructor(arg?: ModelArg<PasswordTestModel>) {
    super(arg);
  }
}

@model()
class ListModelTest extends Model {
  @list(String)
  @maxlength(2)
  @minlength(1)
  @required()
  strings!: string[];

  constructor(model?: ModelArg<ListModelTest>) {
    super();
    Model.fromModel(this, model);
  }
}

describe("Model as Zod", function () {
  it("converts Empty Model to Zod", () => {
    const asZod = z.from(InnerTestModel);
    expect(asZod.shape).toEqual(z.object({}).shape);
  });

  it("converts password Model to Zod", () => {
    const asZod = z.from(PasswordTestModel);

    const regexp = DEFAULT_PATTERNS.PASSWORD.CHAR8_ONE_OF_EACH;
    const passwordSchema = asZod.shape.password;
    expect(passwordSchema).toBeInstanceOf(z.ZodString);
    expect(passwordSchema.description).toBe("the password attribute");
    expect(passwordSchema.safeParse("short").success).toBe(false);
    const expectedRegex = new RegExp(regexp.toString(), "g");
    expect(passwordSchema._def.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "min",
          value: 8,
        }),
        expect.objectContaining({
          kind: "regex",
          regex: expectedRegex,
        }),
      ])
    );
  });

  it("converts list Model to Zod", () => {
    const asZod = z.from(ListModelTest);
    const stringsSchema = asZod.shape.strings;
    expect(stringsSchema).toBeInstanceOf(z.ZodArray);
    expect(() => asZod.parse({ strings: ["a"] })).not.toThrow();
    expect(() => asZod.parse({ strings: [] })).toThrow();
    expect(() => asZod.parse({ strings: ["a", "b", "c"] })).toThrow();
  });

  it("converts test Model to Zod", () => {
    const asZod = z.from(TestModel);
    const propSchema = asZod.shape.prop;
    expect(propSchema).toBeInstanceOf(z.ZodOptional);
    const innerSchema = (propSchema as z.ZodOptional<any>)._def.innerType;
    expect(innerSchema).toBeInstanceOf(z.ZodObject);
    expect(asZod.safeParse({}).success).toBe(true);
    expect(asZod.safeParse({ prop: {} }).success).toBe(true);
  });

  it("Adds to Class Method", () => {
    @description("A simple password model")
    class PasswordTestModel2 extends Model {
      @description("the password attribute")
      @required()
      @password()
      @minlength(8)
      password!: string;

      constructor(arg?: ModelArg<PasswordTestModel>) {
        super(arg);
        Model.fromObject(this, arg);
      }
    }

    const asZod = z.from(PasswordTestModel2);
    const passwordSchema = asZod.shape.password;
    expect(passwordSchema.description).toBe("the password attribute");
    expect(asZod.safeParse({ password: "invalid" }).success).toBe(false);
  });

  it("can be sourced from Zod", () => {
    const asZod = z.from(TestModel);
    expect(typeof z.from).toBe("function");
    expect(asZod.safeParse({}).success).toBe(true);
    expect(asZod.safeParse({ prop: {} }).success).toBe(true);
  });
});
