import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { findVariant, furnitureCatalog } from "../shared/catalog.js";
import type { Placement, Room } from "../shared/contracts.js";
import {
  floorPoint,
  floorPlacement,
  characterHeight,
} from "../shared/room-layout.js";

type Callbacks = {
  project: () => void;
  selectFurniture: (id: string) => void;
  moveFurniture: (
    id: string,
    patch: { x: number; y: number },
    revision: number,
  ) => void;
  message: (message: string) => void;
};
export class RoomView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 80);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private sprites = new Map<string, THREE.Sprite>();
  private furniture = new Map<string, THREE.Group>();
  private models = new Map<string, THREE.Group>();
  private textures = new Map<string, THREE.Texture>();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ring: THREE.Mesh;
  private sign: THREE.Mesh | null = null;
  private observer: ResizeObserver;
  private lights: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private state: Room | null = null;
  private selection: string | null = null;
  private editing = true;
  private frame = 0;
  private lost = false;
  private disposed = false;
  private drag: {
    id: string;
    pointer: number;
    startX: number;
    startY: number;
    x: number;
    z: number;
    revision: number;
    moved: boolean;
  } | null = null;

  constructor(
    private stage: HTMLElement,
    private images: Record<string, string>,
    private callbacks: Callbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3Dの部屋。キャラと家具の操作は右側の一覧からもできます。",
    );
    this.stage.prepend(this.renderer.domElement);
    this.scene.add(this.root);
    this.lights = new THREE.HemisphereLight(0xbfc3ff, 0x2c1828, 1.05);
    this.keyLight = new THREE.DirectionalLight(0xffd8b5, 2.5);
    this.keyLight.position.set(-3, 6, 5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(this.keyLight.shadow.camera, {
      left: -5,
      right: 5,
      top: 5,
      bottom: -5,
    });
    this.keyLight.shadow.bias = -0.001;
    this.scene.add(this.lights, this.keyLight);
    const blue = new THREE.PointLight(0x76cfff, 14, 10);
    blue.position.set(1, 2.7, -2.7);
    const lavender = new THREE.PointLight(0xb273ff, 8, 9);
    lavender.position.set(2.5, 2, -2);
    this.scene.add(blue, lavender);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.405, 48),
      new THREE.MeshBasicMaterial({
        color: 0x8ee5f1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 22;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minAzimuthAngle = -Math.PI / 3;
    this.controls.maxAzimuthAngle = Math.PI / 3;
    this.controls.addEventListener("change", () => this.invalidate());
    this.resetCamera();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(stage);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.pointerDown, true);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
      callbacks.message(
        "3D表示が一時停止しました。復帰しない場合は再読み込みしてください。",
      );
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.invalidate();
      callbacks.message("3D表示が復帰しました。");
    });
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.resize();
  }
  async load(encoded: Record<string, string>) {
    const loader = new GLTFLoader();
    for (const [file, base64] of Object.entries(encoded)) {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const gltf = await loader.parseAsync(bytes.buffer, "");
      if (this.disposed) return;
      gltf.scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = !file.startsWith("room");
          node.receiveShadow = true;
        }
      });
      this.models.set(file, gltf.scene);
    }
    this.root.add(this.models.get("room.glb")!);
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 512;
    signCanvas.height = 256;
    const ctx = signCanvas.getContext("2d")!;
    ctx.textAlign = "center";
    ctx.fillStyle = "#e4bbff";
    ctx.shadowColor = "#aa63ff";
    ctx.shadowBlur = 12;
    ctx.font = "48px sans-serif";
    ctx.fillText("だらだらで", 256, 102);
    ctx.fillText("いいよ。", 256, 173);
    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;
    this.textures.set("wall-sign", signTexture);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.85),
      new THREE.MeshBasicMaterial({
        map: signTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    sign.position.set(2.6, 3.0, -2.88);
    this.sign = sign;
    this.root.add(sign);

    if (this.state) this.update(this.state, this.selection, this.editing);
    this.invalidate();
  }
  update(room: Room, selection: string | null, editing: boolean) {
    this.state = room;
    this.selection = selection;
    this.editing = editing;
    const mode = room.scene.backgroundId;
    this.scene.background = new THREE.Color(
      mode === "day" ? 0x8e91ae : mode === "plain" ? 0x252237 : 0x090b1a,
    );
    this.root.visible = mode !== "plain";
    this.lights.intensity = mode === "day" ? 3.4 : 1.05;
    this.keyLight.intensity = mode === "day" ? 5 : 2.5;
    const ids = new Set(room.scene.placements.map((item) => item.id));
    for (const [id, sprite] of this.sprites)
      if (!ids.has(id)) {
        this.scene.remove(sprite);
        sprite.material.dispose();
        this.sprites.delete(id);
      }
    for (const item of room.scene.placements) {
      const file = findVariant(item.characterId, item.variantId)!.image;
      const textureKey = file + String(item.flipped);
      let texture = this.textures.get(textureKey);
      if (!texture) {
        texture = new THREE.TextureLoader().load(
          this.images[file],
          () => {
            if (this.state)
              this.update(this.state, this.selection, this.editing);
          },
          undefined,
          () =>
            this.callbacks.message(
              "キャラ画像を読み込めませんでした。再読み込みしてください。",
            ),
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        if (item.flipped) {
          texture.repeat.x = -1;
          texture.offset.x = 1;
        }
        this.textures.set(textureKey, texture);
      }
      let sprite = this.sprites.get(item.id);
      if (!sprite) {
        sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            transparent: true,
            alphaTest: 0.03,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        sprite.center.set(0.5, 0);
        this.scene.add(sprite);
        this.sprites.set(item.id, sprite);
      }
      const h = characterHeight(item);
      const image = texture.image as HTMLImageElement | undefined;
      const aspect = image?.naturalWidth
        ? image.naturalWidth / image.naturalHeight
        : item.characterId === "mochipan"
          ? 1312 / 1199
          : 2 / 3;
      sprite.scale.set(h * aspect, h, 1);
      sprite.material.map = texture;
      sprite.material.needsUpdate = true;
      const point = floorPoint(item);
      sprite.position.set(point.x, 0.07, point.z);
    }
    const furnitureIds = new Set(room.scene.furniture.map((item) => item.id));
    for (const [id, obj] of this.furniture)
      if (!furnitureIds.has(id)) {
        this.scene.remove(obj);
        this.furniture.delete(id);
      }
    for (const item of room.scene.furniture) {
      let obj = this.furniture.get(item.id);
      if (obj && obj.userData.furnitureId !== item.furnitureId) {
        this.scene.remove(obj);
        this.furniture.delete(item.id);
        obj = undefined;
      }
      const template = this.models.get(
        furnitureCatalog.find((value) => value.id === item.furnitureId)!.model,
      );
      if (!obj && template) {
        obj = template.clone(true);
        obj.userData.placementId = item.id;
        obj.userData.furnitureId = item.furnitureId;
        this.scene.add(obj);
        this.furniture.set(item.id, obj);
      }
      if (obj) {
        const point = floorPoint(item);
        obj.position.set(point.x, 0.05, point.z);
        obj.rotation.y = (item.rotation * Math.PI) / 180;
        obj.scale.setScalar(item.scale);
      }
    }
    const item = [...room.scene.placements, ...room.scene.furniture].find(
      (item) => item.id === selection,
    );
    this.ring.visible = !!item && editing;
    if (item) {
      const point = floorPoint(item);
      this.ring.position.set(point.x, 0.06, point.z);
      this.ring.scale.setScalar(
        "size" in item ? 1 : item.furnitureId === "sofa" ? 2 : 1.4,
      );
    }
    this.invalidate();
  }
  previewPlacement(item: Placement) {
    const sprite = this.sprites.get(item.id);
    if (!sprite) return;
    const point = floorPoint(item);
    sprite.position.set(point.x, 0.07, point.z);
    const aspect = sprite.scale.x / sprite.scale.y;
    const height = characterHeight(item);
    sprite.scale.set(height * aspect, height, 1);
    this.ring.position.set(point.x, 0.06, point.z);
    this.invalidate();
  }
  project(item: Placement) {
    const point = floorPoint(item);
    const h = characterHeight(item);
    const base = new THREE.Vector3(point.x, 0.07, point.z);
    const up = new THREE.Vector3(0, h, 0).applyQuaternion(
      this.camera.quaternion,
    );
    const top = base.clone().add(up).project(this.camera);
    const foot = base.clone().project(this.camera);
    const height = (Math.abs(top.y - foot.y) * this.stage.clientHeight) / 2;
    const sprite = this.sprites.get(item.id);
    const aspect = sprite ? Math.abs(sprite.scale.x / sprite.scale.y) : 2 / 3;
    return {
      left: (foot.x + 1) * 50,
      top: (1 - foot.y) * 50,
      height,
      width: height * aspect,
      visible: foot.z < 1 && foot.z > -1,
    };
  }
  floorDelta(startX: number, startY: number, x: number, y: number) {
    const start = this.floorAt(startX, startY),
      end = this.floorAt(x, y);
    return start && end ? { x: end.x - start.x, z: end.z - start.z } : null;
  }
  private floorAt(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    return this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
  }
  private pointerDown = (event: PointerEvent) => {
    if (!this.editing || event.button !== 0 || !this.state) return;
    this.floorAt(event.clientX, event.clientY);
    const hit = this.raycaster.intersectObjects(
      [...this.furniture.values()],
      true,
    )[0];
    if (!hit) return;
    let obj: THREE.Object3D | null = hit.object;
    while (obj && !obj.userData.placementId) obj = obj.parent;
    if (!obj) return;
    const id = obj.userData.placementId as string;
    this.drag = {
      id,
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: obj.position.x,
      z: obj.position.z,
      revision: this.state.revision,
      moved: false,
    };
    this.controls.enabled = false;
    event.stopImmediatePropagation();
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.callbacks.selectFurniture(id);
  };
  private pointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const delta = this.floorDelta(
      drag.startX,
      drag.startY,
      event.clientX,
      event.clientY,
    );
    if (!delta) return;
    drag.moved ||=
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3;
    const point = floorPoint(
      floorPlacement(drag.x + delta.x, drag.z + delta.z),
    );
    this.furniture.get(drag.id)?.position.set(point.x, 0.05, point.z);
    this.ring.position.set(point.x, 0.06, point.z);
    this.invalidate();
  };
  private pointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const obj = this.furniture.get(drag.id);
    this.drag = null;
    this.controls.enabled = true;
    this.renderer.domElement.releasePointerCapture(event.pointerId);
    if (drag.moved && obj)
      this.callbacks.moveFurniture(
        drag.id,
        floorPlacement(obj.position.x, obj.position.z),
        drag.revision,
      );
  };
  private pointerCancel = () => {
    this.drag = null;
    this.controls.enabled = true;
    if (this.state) this.update(this.state, this.selection, this.editing);
  };
  resetCamera() {
    this.camera.position.set(8, 6.5, 10.5);
    this.controls.target.set(0, 1.1, 0);
    this.controls.update();
    this.invalidate();
  }
  rotate(amount: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += amount;
    this.camera.position.copy(
      new THREE.Vector3().setFromSpherical(spherical).add(this.controls.target),
    );
    this.controls.update();
    this.invalidate();
  }
  zoom(factor: number) {
    this.camera.position
      .sub(this.controls.target)
      .multiplyScalar(factor)
      .add(this.controls.target);
    this.controls.update();
    this.invalidate();
  }
  private resize() {
    if (!this.stage.clientWidth || !this.stage.clientHeight) return;
    this.camera.aspect = this.stage.clientWidth / this.stage.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(
      this.stage.clientWidth,
      this.stage.clientHeight,
      false,
    );
    this.invalidate();
  }
  private visibilityChanged = () => {
    if (!document.hidden) this.invalidate();
  };
  private invalidate() {
    if (this.frame || this.disposed || this.lost || document.hidden) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.camera.updateMatrixWorld();
      this.renderer.render(this.scene, this.camera);
      this.callbacks.project();
    });
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    for (const texture of this.textures.values()) texture.dispose();
    for (const sprite of this.sprites.values()) sprite.material.dispose();
    for (const model of this.models.values())
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          materials.forEach((m) => m.dispose());
        }
      });
    this.sign?.geometry.dispose();
    (this.sign?.material as THREE.Material | undefined)?.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
