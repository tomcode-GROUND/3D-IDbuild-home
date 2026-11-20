import * as T from "three";
import { expect, it } from "vitest";
import { prepareGlbExport } from "./glbExport";

it("preserves sun direction in an export copy without changing the live scene", () => {
  const scene = new T.Group();
  scene.rotation.y = 0.3;
  const sun = new T.DirectionalLight();
  sun.position.set(8, 12, 4);
  sun.target.position.set(2, 0, 3);
  scene.add(
    sun,
    sun.target,
    new T.HemisphereLight(),
    new T.PointLight(),
    new T.Mesh(new T.BoxGeometry()),
  );
  const copy = prepareGlbExport(scene);
  const exported = copy.children.find(
    (o) => o instanceof T.DirectionalLight,
  ) as T.DirectionalLight;
  copy.updateWorldMatrix(true, true);
  const expected = sun.target
    .getWorldPosition(new T.Vector3())
    .sub(sun.getWorldPosition(new T.Vector3()))
    .normalize();
  const actual = new T.Vector3(0, 0, -1).transformDirection(
    exported.matrixWorld,
  );
  expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
  expect(exported.target.parent).toBe(exported);
  expect(exported.target.position.toArray()).toEqual([0, 0, -1]);
  expect(copy.children.some((o) => o instanceof T.HemisphereLight)).toBe(false);
  expect(copy.children.some((o) => o instanceof T.PointLight)).toBe(true);
  expect(sun.target.parent).toBe(scene);
  expect(sun.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  expect(scene.children.some((o) => o instanceof T.HemisphereLight)).toBe(true);
});

it("rejects empty and fully hidden geometry rather than reporting an empty export as success", () => {
  expect(() => prepareGlbExport(new T.Group())).toThrow("no visible geometry");
  const group = new T.Group();
  group.add(new T.Mesh(new T.BoxGeometry()));
  group.visible = false;
  expect(() => prepareGlbExport(group)).toThrow("no visible geometry");
});
