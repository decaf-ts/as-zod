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
    const asZod: ZodObject<any> = z.from(InnerTestModel);
    expect(asZod.shape).toEqual(z.object({}).shape);
  });

  it("converts password Model to Zod", () => {
    const asZod = z.from(PasswordTestModel);

    const regexp = DEFAULT_PATTERNS.PASSWORD.CHAR8_ONE_OF_EACH;
    const comparison = z.object({
      password: z.string().min(8).regex(regexp),
    });
    //
    // expect(JSON.stringify(asZod.shape)).toEqual(
    //   JSON.stringify(comparison.shape)
    // );
  });

  it("converts list Model to Zod", () => {
    const asZod = z.from(ListModelTest);
    expect(JSON.stringify(asZod.shape)).toEqual(
      JSON.stringify(
        z.object({
          strings: z.array(z.string()).min(1).max(2),
        }).shape
      )
    );
  });

  it("converts test Model to Zod", () => {
    let asZod: any;
    try {
      asZod = z.from(TestModel);
    } catch (e: unknown) {
      throw new Error(`Failed to convert model to zod: ${e}`);
    }

    const innerZod = z.from(InnerTestModel);

    expect(JSON.stringify(asZod.shape)).toEqual(
      JSON.stringify(
        z.object({
          prop: innerZod.optional(),
        }).shape
      )
    );
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

    let asZod: any;
    try {
      const a = PasswordTestModel2;
      const b = Model;
      asZod = z.from(a);
    } catch (e: unknown) {
      throw new Error(`Failed to convert model to zod: ${e}`);
    }

    expect(JSON.stringify(asZod.shape)).toEqual(
      JSON.stringify(
        z.object({
          password: z
            .string()
            .min(8)
            .regex(DEFAULT_PATTERNS.PASSWORD.CHAR8_ONE_OF_EACH)
            .describe("the password attribute"),
        }).shape
      )
    );
  });

  it("can be sourced from Zod", () => {
    let asZod: any;
    try {
      asZod = z.from(TestModel);
    } catch (e: unknown) {
      throw new Error(`Failed to convert model to zod: ${e}`);
    }

    expect(JSON.stringify(asZod.shape)).toEqual(
      JSON.stringify(
        z.object({
          prop: z.object({}).optional(),
        }).shape
      )
    );
  });
});
