import { expect, it, vi } from "vitest";
import { z } from "./validation";

it("validates structured inputs without dynamic code generation", () => {
  const dynamicCode = vi
    .spyOn(globalThis, "Function")
    .mockImplementation(() => {
      throw Error("Dynamic code generation is forbidden by CSP");
    });
  try {
    const schema = z.object({
      size: z.number().positive(),
      points: z.array(z.number()).min(2),
    });
    expect(schema.parse({ size: 12, points: [1, 2] })).toEqual({
      size: 12,
      points: [1, 2],
    });
    expect(schema.safeParse({ size: -1, points: [] }).success).toBe(false);
    expect(dynamicCode).not.toHaveBeenCalled();
  } finally {
    dynamicCode.mockRestore();
  }
});
