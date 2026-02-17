import './bootstrap.js';
import { Pigeon } from "./Pigeon.js";

AFRAME.registerComponent( "pigeon-receiver", {
  init() {
    this.pigeon = new Pigeon( "wss://202.213.135.84:3001/pigeon/", 'functor' );

    document.addEventListener( "ipad", ( e ) => {
      const quaternion = new THREE.Quaternion( e.detail.x, e.detail.y, e.detail.z, e.detail.w );

      this.el.object3D.setRotationFromQuaternion( quaternion );
    } );
  },
  tick() {
  }
} );