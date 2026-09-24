// PLACEHOLDER avatar (to be replaced by the full R6-style avatar with animations).
// Contract: createAvatar(charDef, faceImage, skinHex) -> Avatar
//   avatar.object3d      THREE.Group, origin at the feet, facing +Z
//   avatar.headTop       THREE.Object3D positioned just above the head (name tags, carried items)
//   avatar.update(dt, s) s = {time, speed, onGround, vy, carrying:null|'seed'|'plant', stunned, swing (0..1 or -1),
//                              celebrating, invisible (0..1 alpha), isLocal}
//   avatar.setCarry(object3d|null)  attach an item above the head
//   avatar.setFace(image, skin)
//   avatar.dispose()
import * as THREE from 'three';
import { faceTexture } from './faces.js';

export function createAvatar(char, faceImage, skin) {
  const group = new THREE.Group();
  const col = new THREE.Color(char.look.shirtColor);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshLambertMaterial({ color: col }));
  body.position.y = 3;
  body.castShadow = true;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshLambertMaterial({ color: char.look.pants }));
  legs.position.y = 1;
  legs.castShadow = true;
  const headMat = [0, 1, 2, 3, 4, 5].map(() => new THREE.MeshLambertMaterial({ color: skin }));
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(faceImage, skin) });
  headMat[4] = faceMat;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), headMat);
  head.position.y = 4.8;
  head.castShadow = true;
  group.add(body, legs, head);
  const headTop = new THREE.Object3D();
  headTop.position.y = 6;
  group.add(headTop);
  let carry = null;
  return {
    object3d: group,
    headTop,
    update(dt, s) {
      group.visible = (s.invisible ?? 1) > 0.05;
      head.rotation.z = s.stunned ? Math.sin(s.time * 20) * 0.3 : 0;
    },
    setCarry(obj) {
      if (carry) headTop.remove(carry);
      carry = obj;
      if (obj) headTop.add(obj);
    },
    setFace(img, sk) {
      faceMat.map?.dispose();
      faceMat.map = faceTexture(img, sk || skin);
      faceMat.needsUpdate = true;
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
    },
  };
}
