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
  description,
  list,
} from "@decaf-ts/decorator-validation";
import { Zod } from "../../src";
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
    const asZod: ZodObject<any> = model.toZod();
    expect(asZod.shape).toEqual(z.object({}).shape);
  });

  it("converts password Model to Zod", () => {
    const model = new PasswordTestModel();
    const asZod = model.toZod();

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
    let model: TestModel = new TestModel();
    try {
      model = new TestModel();
    } catch (e: unknown) {
      throw new Error(`Failed to create model: ${e}`);
    }
    let asZod: any;
    try {
      asZod = model.toZod();
    } catch (e: unknown) {
      throw new Error(`Failed to convert model to zod: ${e}`);
    }

    const innerModel = new InnerTestModel();

    const innerZod = innerModel.toZod();

    expect(JSON.stringify(asZod.shape)).toEqual(
      JSON.stringify(
        z.object({
          prop: innerZod.optional(),
        }).shape
      )
    );
  });

  it("can be sourced from Zod", () => {
    let asZod: any;
    try {
      asZod = Zod.fromModel(TestModel);
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
