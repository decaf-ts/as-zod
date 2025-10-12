import "../../src";
import {
  date as dateDecorator,
  email,
  list,
  max,
  maxlength,
  min,
  minlength,
  Model,
  model,
  ModelArg,
  password,
  pattern,
  required,
  set,
  step,
  type,
  url,
} from "@decaf-ts/decorator-validation";
import { description } from "@decaf-ts/decoration";
import { z } from "zod";

@model()
@description("Complex decorated model")
class DecoratedModel extends Model {
  @description("unique code")
  @required()
  @type(String.name)
  @pattern(/^[A-Z]{3}\d{3}$/)
  @minlength(6)
  @maxlength(6)
  code!: string;

  @description("scored number")
  @required()
  @type(Number.name)
  @min(0)
  @max(100)
  @step(5)
  score!: number;

  @description("launch date")
  @required()
  @type(Date.name)
  @dateDecorator("yyyy-MM-dd")
  @min(new Date("2022-01-01"))
  @max(new Date("2030-12-31"))
  launchDate!: Date;

  @description("contact email")
  @required()
  @type(String.name)
  @email()
  contactEmail!: string;

  @description("homepage url")
  @required()
  @type(String.name)
  @url()
  homepage!: string;

  @description("account password")
  @required()
  @type(String.name)
  @password()
  secret!: string;

  constructor(arg?: ModelArg<DecoratedModel>) {
    super(arg);
  }
}

@model()
class Address extends Model {
  @required()
  street!: string;

  constructor(arg?: ModelArg<Address>) {
    super(arg);
  }
}

@model()
class Preference extends Model {
  @required()
  key!: string;

  @required()
  value!: string;

  constructor(arg?: ModelArg<Preference>) {
    super(arg);
  }
}

@model()
@description("Container with nested collections")
class CollectionModel extends Model {
  @required()
  @type([String.name, Number.name])
  unionId!: string | number;

  @required()
  @type(Address.name)
  primaryAddress!: Address;

  @required()
  @type(Array.name)
  @list(Address)
  addressHistory!: Address[];

  @required()
  @type(Set.name)
  @set(Preference)
  preferenceSet!: Set<Preference>;

  @required()
  @type(Array.name)
  @list([Address, () => Preference])
  relatedItems!: Array<Address | Preference>;

  @type(Boolean.name)
  isActive?: boolean;

  constructor(arg?: ModelArg<CollectionModel>) {
    super(arg);
  }
}

describe("Model as Zod with complex models", () => {
  it("applies all decorator-driven validations", () => {
    const schema = z.from(DecoratedModel);

    expect(schema.description).toBe("Complex decorated model");
    const { code, score, launchDate, contactEmail, homepage, secret } =
      schema.shape;

    expect(code.description).toBe("unique code");
    const codeChecks = (code as z.ZodString)._def.checks;
    expect(codeChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "min", value: 6 }),
        expect.objectContaining({ kind: "max", value: 6 }),
        expect.objectContaining({ kind: "regex" }),
      ])
    );

    expect(score.description).toBe("scored number");
    const numberChecks = (score as z.ZodNumber)._def.checks;
    expect(numberChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "min", value: 0 }),
        expect.objectContaining({ kind: "max", value: 100 }),
        expect.objectContaining({ kind: "multipleOf", value: 5 }),
      ])
    );

    expect(launchDate.description).toBe("launch date");
    expect(launchDate).toBeInstanceOf(z.ZodDate);
    const dateChecks = (launchDate as z.ZodDate)._def.checks;
    expect(dateChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "min",
          value: new Date("2022-01-01").getTime(),
        }),
        expect.objectContaining({
          kind: "max",
          value: new Date("2030-12-31").getTime(),
        }),
      ])
    );

    expect(contactEmail.description).toBe("contact email");
    const emailChecks = (contactEmail as z.ZodString)._def.checks;
    expect(emailChecks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "regex" })])
    );

    expect(homepage.description).toBe("homepage url");
    const urlChecks = (homepage as z.ZodString)._def.checks;
    expect(urlChecks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "regex" })])
    );

    expect(secret.description).toBe("account password");
    const passwordChecks = (secret as z.ZodString)._def.checks;
    expect(passwordChecks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "regex" })])
    );
  });

  it("builds schemas for unions, nested models, arrays, sets, and optional values", () => {
    const schema = z.from(CollectionModel);
    expect(schema.description).toBe("Container with nested collections");

    const {
      unionId,
      primaryAddress,
      addressHistory,
      preferenceSet,
      relatedItems,
      isActive,
    } = schema.shape;

    expect(unionId).toBeInstanceOf(z.ZodUnion);
    const unionOptions = (unionId as z.ZodUnion<any>)._def.options;
    expect(
      unionOptions.map((option: z.ZodTypeAny) => option.constructor)
    ).toEqual(expect.arrayContaining([z.ZodString, z.ZodNumber]));

    expect(primaryAddress).toBeInstanceOf(z.ZodObject);

    expect(addressHistory).toBeInstanceOf(z.ZodArray);
    const addressElement = (addressHistory as z.ZodArray<any>)._def.type;
    expect(addressElement).toBeInstanceOf(z.ZodObject);

    expect(preferenceSet).toBeInstanceOf(z.ZodSet);
    const setValueSchema = (preferenceSet as z.ZodSet<any>).valueSchema;
    expect(setValueSchema).toBeInstanceOf(z.ZodObject);

    expect(relatedItems).toBeInstanceOf(z.ZodArray);
    const relatedElement = (relatedItems as z.ZodArray<any>)._def.type;
    expect(relatedElement).toBeInstanceOf(z.ZodUnion);

    expect(isActive).toBeInstanceOf(z.ZodOptional);
    const optionalInner = (isActive as z.ZodOptional<any>)._def.innerType;
    expect(optionalInner).toBeInstanceOf(z.ZodBoolean);
  });
});
