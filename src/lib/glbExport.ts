import * as T from "three";

// Export a copy: renderer-only ambient light has no glTF representation, and
// glTF punctual lights use local -Z rather than Three.js target objects.
export function prepareGlbExport(source: T.Object3D): T.Object3D {
  source.updateWorldMatrix(true, true);
  const result = source.clone(true);
  result.updateWorldMatrix(true, true);
  const originals: T.Object3D[] = [],
    copies: T.Object3D[] = [];
  source.traverse((object) => originals.push(object));
  result.traverse((object) => copies.push(object));
  let meshes = 0;
  originals.forEach((original, index) => {
    const copy = copies[index];
    let visible = true;
    for (
      let parent: T.Object3D | null = original;
      parent;
      parent = parent.parent
    )
      visible &&= parent.visible;
    if (
      original instanceof T.Mesh &&
      visible &&
      original.geometry.getAttribute("position")?.count
    )
      meshes++;
    if (
      original instanceof T.Light &&
      !(original instanceof T.DirectionalLight) &&
      !(original instanceof T.SpotLight) &&
      !(original instanceof T.PointLight)
    )
      copy.removeFromParent();
    if (
      original instanceof T.DirectionalLight ||
      original instanceof T.SpotLight
    ) {
      const light = copy as T.DirectionalLight | T.SpotLight;
      light.lookAt(original.target.getWorldPosition(new T.Vector3()));
      light.target = new T.Object3D();
      light.target.position.set(0, 0, -1);
      light.add(light.target);
    }
  });
  if (!meshes) throw Error("There is no visible geometry to export.");
  return result;
}
