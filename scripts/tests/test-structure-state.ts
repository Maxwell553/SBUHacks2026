import assert from "node:assert/strict";
import * as THREE from "three";
import { ModelLibrary } from "../../lib/lowpoly/compiler";
import { normalizeModelDefinition } from "../../lib/schema/model";
const structure = normalizeModelDefinition({
  id: "test_structure",
  name: "Structural test",
  category: "building",
  placement: "ground",
  materials: [{ id: "stone", color: "#aabbcc", finish: "matte" }],
  parts: [
    { id: "wall", shape: "box", material: "stone", size: [4, 6, 0.4], position: [0, 3, 0] },
    { id: "roof", shape: "box", material: "stone", size: [4, 0.3, 4], position: [0, 6, 0] },
  ],
});
const figure = { ...structure, id: "test_figure", category: "figure" as const };
const intact = new ModelLibrary([structure, figure]);
const ruined = new ModelLibrary([structure, figure], undefined, true);
const second = new ModelLibrary([structure, figure], undefined, true);
try {
  assert(
    ruined.bounds(structure.id).height < intact.bounds(structure.id).height * 0.5,
    "Destruction must visibly lower the original structure",
  );
  assert.deepEqual(
    ruined.bounds(figure.id),
    intact.bounds(figure.id),
    "People must not be transformed into structural debris",
  );
  const positions = (library: ModelLibrary) => {
    const inst = library.instance(structure.id)!;
    const result: number[] = [];
    inst.object.traverse((o) => {
      if (o instanceof THREE.Mesh) result.push(...o.geometry.getAttribute("position").array);
    });
    inst.dispose();
    return result;
  };
  const first = positions(ruined);
  assert(first.length > 0 && first.every(Number.isFinite), "Ruin geometry must be finite and nonempty");
  assert.deepEqual(first, positions(second), "Saved and interactive renders must agree deterministically");
  assert.equal(structure.parts[0].position![1], 3, "The saved source model must remain unchanged");
  const inst = intact.instance(structure.id)!;
  let triangles = 0;
  inst.object.traverse((o) => {
    if (o instanceof THREE.Mesh) triangles += o.geometry.getAttribute("position").count / 3;
  });
  const box = new THREE.Box3().setFromObject(inst.object);
  inst.dispose();
  assert(triangles > 24, "A wall carries a window grid, not a blank face");
  assert(Math.abs(box.max.y - 6.15) < 0.05, "Windows stay on the wall and do not raise the roof");
  console.log(
    "PASS structural aftermath, living-subject preservation, deterministic geometry and immutable source models",
  );
} finally {
  intact.dispose();
  ruined.dispose();
  second.dispose();
}
