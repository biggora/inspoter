import { describe, expect, it } from "vitest";
import { validateNewPassword } from "@/lib/auth/password";

describe("new password policy", () => {
  it("requires twelve characters", () => {
    expect(() => validateNewPassword("short")).toThrow(/at least 12/u);
  });

  it("rejects common passwords and accepts a strong local password", () => {
    expect(() => validateNewPassword("password1234")).toThrow(/less common/u);
    expect(() => validateNewPassword("correct-horse-7")).not.toThrow();
  });
});
