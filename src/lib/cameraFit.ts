import * as T from "three";

export function fitOverview(camera: T.PerspectiveCamera, bounds: T.Box3) {
  if (bounds.isEmpty()) return new T.Vector3();
  const center = bounds.getCenter(new T.Vector3());
  const radius = Math.max(0.25, bounds.getSize(new T.Vector3()).length() / 2);
  const vertical = T.MathUtils.degToRad(camera.fov) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.12;
  camera.position
    .copy(center)
    .addScaledVector(new T.Vector3(1, 1.2, 1).normalize(), distance);
  camera.far = Math.max(100, distance + radius * 2);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return center;
}
