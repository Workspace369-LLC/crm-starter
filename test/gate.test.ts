import { describe, expect, it } from "vitest";
import { basicPassword, checkAccess } from "@/lib/gate";

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;

describe("checkAccess", () => {
  it("stays open locally when no password is set", () => {
    expect(checkAccess({ authorization: null, password: undefined, production: false })).toBe("allow");
  });
  it("serves nothing in production until a password is set", () => {
    expect(checkAccess({ authorization: null, password: undefined, production: true })).toBe("unconfigured");
    expect(checkAccess({ authorization: basic("a", ""), password: "", production: true })).toBe("unconfigured");
  });
  it("asks for the password when it is missing or wrong", () => {
    for (const production of [true, false]) {
      expect(checkAccess({ authorization: null, password: "s3cret", production })).toBe("challenge");
      expect(checkAccess({ authorization: basic("me", "wrong"), password: "s3cret", production })).toBe("challenge");
      expect(checkAccess({ authorization: basic("me", "s3cre"), password: "s3cret", production })).toBe("challenge");
      expect(checkAccess({ authorization: "Bearer s3cret", password: "s3cret", production })).toBe("challenge");
    }
  });
  it("lets the right password in, with any user name", () => {
    expect(checkAccess({ authorization: basic("", "s3cret"), password: "s3cret", production: true })).toBe("allow");
    expect(checkAccess({ authorization: basic("anyone", "s3cret"), password: "s3cret", production: true })).toBe("allow");
  });
  it("handles colons and non-ASCII in the password", () => {
    expect(checkAccess({ authorization: basic("u", "a:b:ł🙂"), password: "a:b:ł🙂", production: true })).toBe("allow");
  });
});

describe("basicPassword", () => {
  it("returns null for malformed headers", () => {
    expect(basicPassword(null)).toBeNull();
    expect(basicPassword("Basic !!!")).toBeNull();
    expect(basicPassword(`Basic ${Buffer.from("nocolon").toString("base64")}`)).toBeNull();
  });
});
