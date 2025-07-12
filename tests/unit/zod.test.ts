import "../../src";
import {
  email,
  max,
  maxlength,
  min,
  minlength,
  Model,
  model,
  ModelArg,
  pattern,
  prop,
  required,
  step,
  type,
  url,
  password,
  DEFAULT_PATTERNS,
  description,
  list,
} from "@decaf-ts/decorator-validation";
import "../../src";
import { z, ZodObject } from "zod";

@model()
class InnerTestModel extends Model {
  constructor() {
    super();
  }
}

@model()
class TestModel extends Model {
  @type(["string", "number"])
  @required()
  id!: string | number;

  @prop()
  irrelevant?: string;

  @required()
  @max(100)
  @step(5)
  @min(0)
  prop1!: number;

  @maxlength(10)
  @minlength(5)
  prop2?: string;

  @pattern(/^\w+$/g)
  prop3?: string;

  @email()
  prop4?: string;

  @pattern("^\\w+$")
  prop5?: string;

  @url()
  prop6?: string;

  @type(InnerTestModel.name)
  prop7?: InnerTestModel;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
@description("A simple password model")
@model()
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
    const model = new InnerTestModel();
    const asZod: ZodObject = model.toZod();
    expect(asZod.shape).toEqual({});
  });

  it("converts password Model to Zod", () => {
    const model = new PasswordTestModel();
    const asZod = model.toZod();
    expect(JSON.stringify(asZod.shape)).toEqual(
      JSON.stringify(
        z.object({
          password: z
            .string()
            .min(8)
            .regex(DEFAULT_PATTERNS.PASSWORD.CHAR8_ONE_OF_EACH),
        }).shape
      )
    );
  });

  it("converts list Model to Zod", () => {
    const model = new ListModelTest();
    const asZod = model.toZod();
    expect(JSON.stringify(asZod.shape)).toEqual(
      JSON.stringify(
        z.object({
          strings: z.array(z.string()).min(1).max(2),
        }).shape
      )
    );
  });

  it("converts test Model to Zod", () => {
    const model = new TestModel();
    const asZod = model.toZod();
    expect(asZod.shape).toEqual(
      z.object({
        id: z.union([z.string(), z.number()]),
        irrelevant: z.string().optional(),
        prop1: z.number().min(0).max(100).multipleOf(5),
        prop2: z.string().max(10).min(5).optional(),
        prop3: z.string().regex(/^\w+$/g).optional(),
        prop4: z.email().optional(),
        prop5: z.url().optional(),
        prop6: z.instanceof(InnerTestModel).optional(),
      }).shape
    );
  });
});
