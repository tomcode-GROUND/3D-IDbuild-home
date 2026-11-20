import * as T from "three";
import { expect, it } from "vitest";
import { fitOverview } from "./cameraFit";

it.each([0.4, 1, 2.5])(
  "fits small and large translated scenes at aspect %s",
  (aspect) => {
    for (const size of [
      new T.Vector3(4, 2.85, 1.5),
      new T.Vector3(88, 12, 65),
    ]) {
      const bounds = new T.Box3(
        new T.Vector3(23, 0, -12),
        new T.Vector3(23, 0, -12).add(size),
      );
      const camera = new T.PerspectiveCamera(60, aspect, 0.05, 100);
      expect(fitOverview(camera, bounds).toArray()).toEqual(
        bounds.getCenter(new T.Vector3()).toArray(),
      );
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const point = new T.Vector3(x, y, z).project(camera);
            expect(Math.abs(point.x)).toBeLessThan(1);
            expect(Math.abs(point.y)).toBeLessThan(1);
            expect(Math.abs(point.z)).toBeLessThan(1);
          }
    }
  },
);
