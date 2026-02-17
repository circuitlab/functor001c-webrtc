import { librariesLoaded } from './bootstrap.js';

import Stats from "three/examples/jsm/libs/stats.module.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { OrbitControls } from "three/examples/jsm/Addons.js";

import { GPUComputationRenderer } from "three/examples/jsm/Addons.js";

import { Loader3DTiles, PointCloudColoring } from 'three-loader-3dtiles';

import { TextureSender } from "./texture-sender.js";

import emojiFS from "./emojiFS.frag";
import emojiVS from "./emojiVS.vert";
import fragmentShaderPosition from "./FragmentShaderPosition.frag";
import fragmentShaderVelocity from "./FragmentShaderVelocity.frag";

/* TEXTURE WIDTH FOR SIMULATION */
const WIDTH = 128;

const queryParams = new URLSearchParams( document.location.search );

let container, stats;
let camera, scene, renderer, controls;
let mouseX = 0, mouseY = 0;

let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;

const BOUNDS = 800, BOUNDS_HALF = BOUNDS / 2;

let last = performance.now();

let shibuya;

let gpuCompute;
let velocityVariable;
let positionVariable;
let positionUniforms;
let velocityUniforms;
let birdUniforms;

let tilesRuntime = null;
const clock = new THREE.Clock();

const copyrightElement = document.querySelector( "#credit" );

let textureSender = null;
const canvasElement = document.getElementById( 'textureCanvas' );

await librariesLoaded;

init();

function init() {

  container = document.createElement( 'div' );
  document.body.appendChild( container );

  camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 1000000 );
  camera.position.z = 150;
  camera.position.y = 50;

  scene = new THREE.Scene();
  //scene.background = new THREE.Color( 0xffffff );
  //scene.fog = new THREE.Fog( 0xffffff, 100, 1000 );

  renderer = new THREE.WebGLRenderer( {
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setAnimationLoop( animate );
  container.appendChild( renderer.domElement );

  controls = new OrbitControls( camera, container );
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.1;

  initComputeRenderer();

  stats = new Stats();
  container.appendChild( stats.dom );
  stats.dom.style.display = 'none';

  container.style.touchAction = 'none';
  container.addEventListener( 'pointermove', onPointerMove );

  window.addEventListener( 'resize', onWindowResize );

  const gui = new GUI();

  const effectController = {
    separation: 10.0,
    alignment: 20.0,
    cohesion: 20.0,
    freedom: 0.75,
    scale: 10,
    x: 656,
    y: -1000,
    z: 1000,
    visible: false,
  };

  initBirds();

  if ( canvasElement ) {
    try {
      textureSender = new TextureSender();
      textureSender.init( canvasElement, renderer, gpuCompute, positionVariable, velocityVariable, WIDTH );

      const peer = new Peer(
        'functor001bboids', {
        config: {
          'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
          ]
        }
      } );

      peer.on( 'open', () => {
        const conn = peer.connect( 'functor001bboidreceiver' );

        conn.on( 'open', () => {
          // Receive messages
          conn.on( 'data', ( data ) => {
            console.log( 'Received', data );
          } );

          // Send messages
          conn.send( 'Hello!' );

          const call = peer.call( 'functor001bboidreceiver', canvasElement.captureStream( 30 ) );

          const videoSender = call.peerConnection.getSenders().filter( function ( s ) {
            return s.track && s.track.kind == "video";
          } )[0];

          if ( videoSender ) {
            const parameters = videoSender.getParameters();

            console.log( videoSender, parameters );

            if ( !parameters.encodings ) {
              parameters.encodings = [{ maxBitrate: 0 }];
            }

            parameters.encodings[0].maxBitrate = 10000000; // 5 Mbps

            videoSender.setParameters( parameters )
              .then( () => {
                console.log( "Max bitrate set to 10 Mbps" );
              } )
              .catch( e => {
                console.error( "Error setting bitrate:", e );
              } );
          }

          call.on( "stream", ( answer ) => {
            console.log( "on stream", answer );
          } );
        } );
      } );
    } catch ( err ) {
      console.warn( 'Could not initialize texture visualizer:', err );
    }
  }

  document.addEventListener( "click", () => {
    if ( navigator.wakeLock ) {
      try {
        navigator.wakeLock.request( "screen" )
          .then( () => {
            console.log( "wakeLock: on" );
          } );
      } catch ( err ) {
        console.log( 'wakeLock: ' + `${err.name}, ${err.message}` );
      }
    }
  } );

  document.addEventListener( 'keydown', ( event ) => {
    if ( event.key === 's' ) {
      const downloadLink = document.createElement( 'a' );

      downloadLink.href = renderer.domElement.toDataURL();
      downloadLink.download = 'myCanvasImage.png';
      downloadLink.click();
    } else if ( event.key === 'f' ) {
      console.log( "full screeeen" );
      if ( !document.fullscreenElement ) {
        document.body.requestFullscreen();
      } else {
        document.exitFullscreen?.();
      }
    }
  } );

  const valuesChanger = function () {

    velocityUniforms['separationDistance'].value = effectController.separation;
    velocityUniforms['alignmentDistance'].value = effectController.alignment;
    velocityUniforms['cohesionDistance'].value = effectController.cohesion;
    velocityUniforms['freedomFactor'].value = effectController.freedom;
  };

  gui.add( effectController, 'separation', 0.0, 100.0, 1.0 ).onChange( valuesChanger );
  gui.add( effectController, 'alignment', 0.0, 100, 0.001 ).onChange( valuesChanger );
  gui.add( effectController, 'cohesion', 0.0, 100, 0.025 ).onChange( valuesChanger );
  gui.add( effectController, 'freedom', 0.0, 100, 0.025 ).onChange( valuesChanger );

  gui.hide();

  valuesChanger();

  const getViewport = () => {
    return {
      width: document.body.clientWidth,
      height: document.body.clientHeight,
      devicePixelRatio: window.devicePixelRatio
    };
  };

  Loader3DTiles.load( {
    url: "https://tile.googleapis.com/v1/3dtiles/root.json",
    viewport: getViewport(),
    options: {
      googleApiKey: queryParams.get( 'key' ),
      dracoDecoderPath: 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco',
      basisTranscoderPath: 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis',
      pointCloudColoring: PointCloudColoring.RGB,
      maximumScreenSpaceError: queryParams.get( 'sse' ) ?? 48
    }
  } )
    .then( ( result ) => {
      const model = result.model;
      const runtime = result.runtime;

      const demoLat = queryParams.get( 'lat' ) ?? 35.6740679;
      const demoLong = queryParams.get( 'long' ) ?? 139.7108025;
      const demoHeight = queryParams.get( 'height' ) ?? 60;

      tilesRuntime = runtime;

      scene.add( model );
      scene.add( runtime.getTileBoxes() );

      runtime.orientToGeocoord( {
        lat: Number( demoLat ),
        long: Number( demoLong ),
        height: Number( demoHeight )
      } );
    } );

  setInterval( () => {
    if ( velocityUniforms['separationDistance'].value == 15 ) {
      velocityUniforms['separationDistance'].value = 40;
    } else {
      velocityUniforms['separationDistance'].value = 15;
    }
  }, 30000 );
}

function initComputeRenderer() {
  gpuCompute = new GPUComputationRenderer( WIDTH, WIDTH, renderer );

  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  fillPositionTexture( dtPosition );
  fillVelocityTexture( dtVelocity );

  velocityVariable = gpuCompute.addVariable( 'textureVelocity', fragmentShaderVelocity, dtVelocity );
  positionVariable = gpuCompute.addVariable( 'texturePosition', fragmentShaderPosition, dtPosition );

  gpuCompute.setVariableDependencies( velocityVariable, [positionVariable, velocityVariable] );
  gpuCompute.setVariableDependencies( positionVariable, [positionVariable, velocityVariable] );

  positionUniforms = positionVariable.material.uniforms;
  velocityUniforms = velocityVariable.material.uniforms;

  positionUniforms['time'] = { value: 0.0 };
  positionUniforms['delta'] = { value: 0.0 };
  velocityUniforms['time'] = { value: 1.0 };
  velocityUniforms['delta'] = { value: 0.0 };
  velocityUniforms['testing'] = { value: 1.0 };
  velocityUniforms['separationDistance'] = { value: 1.0 };
  velocityUniforms['alignmentDistance'] = { value: 1.0 };
  velocityUniforms['cohesionDistance'] = { value: 1.0 };
  velocityUniforms['freedomFactor'] = { value: 1.0 };
  velocityUniforms['predator'] = { value: new THREE.Vector3() };
  velocityVariable.material.defines.BOUNDS = BOUNDS.toFixed( 2 );

  velocityVariable.wrapS = THREE.RepeatWrapping;
  velocityVariable.wrapT = THREE.RepeatWrapping;
  positionVariable.wrapS = THREE.RepeatWrapping;
  positionVariable.wrapT = THREE.RepeatWrapping;

  const error = gpuCompute.init();

  if ( error !== null ) {
    console.error( error );
  }
}

function initBirds() {
  const BIRD_COUNT = WIDTH * WIDTH;
  const emojis = ['😄', '😃', '😀', '😊', '☺', '😉', '😍', '😘', '😚', '😗', '😙', '😜', '😝', '😛', '😳', '😁', '😔', '😌', '😒', '😞', '😣', '😢', '😂', '😭', '😪', '😥', '😰', '😅', '😓', '😩', '😫', '😨', '😱', '😠', '😡', '😤', '😖', '😆', '😋', '😷', '😎', '😴', '😵', '😲', '😟', '😦', '😧', '😈', '👿', '😮', '😬', '😐', '😕', '😯', '😶', '😇', '😏', '😑', '👲', '👳', '👮', '👷', '💂', '👶', '👦', '👧', '👨', '👩', '👴', '👵', '👱', '👼', '👸', '😺', '😸', '😻', '😽', '😼', '🙀', '😿', '😹', '😾', '👹', '👺', '🙈', '🙉', '🙊', '💀', '👽', '🐶', '🐺', '🐱', '🐭', '🐹', '🐰', '🐸', '🐯', '🐨', '🐻', '🐷', '🐽', '🐮', '🐗', '🐵', '🐒', '🐴', '🐑', '🐘', '🐼', '🐧', '🐦', '🐤', '🐥', '🐣', '🐔', '🐍', '🐢', '🐛', '🐝', '🐜', '🐞', '🐌', '🐙', '🐚', '🐠', '🐟', '🐬', '🐳', '🐋', '🐄', '🐏', '🐀', '🐃', '🐅', '🐇', '🐉', '🐎', '🐐', '🐓', '🐕', '🐖', '🐁', '🐂', '🐲', '🐡', '🐊', '🐫', '🐪', '🐆', '🐈', '🐩'];
  const ATLAS_GRID_WIDTH = Math.ceil( Math.sqrt( emojis.length ) );
  const CELL_SIZE = 128;
  const canvas = document.createElement( 'canvas' );
  canvas.width = canvas.height = ATLAS_GRID_WIDTH * CELL_SIZE;
  const ctx = canvas.getContext( '2d' );
  ctx.font = `${CELL_SIZE * 0.9}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  for ( let i = 0; i < emojis.length; i++ ) {
    const x = ( i % ATLAS_GRID_WIDTH ) * CELL_SIZE + CELL_SIZE / 2;
    const y = Math.floor( i / ATLAS_GRID_WIDTH ) * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillText( emojis[i], x, y );
  }

  const atlasTexture = new THREE.CanvasTexture( canvas );
  atlasTexture.needsUpdate = true;

  atlasTexture.flipY = false;

  const geometry = new THREE.InstancedBufferGeometry();

  const baseVertices = new Float32Array( [0, 0, 0] );
  geometry.setAttribute( 'position', new THREE.BufferAttribute( baseVertices, 3 ) );

  const birdIndices = new Float32Array( BIRD_COUNT );
  for ( let i = 0; i < BIRD_COUNT; i++ ) {
    birdIndices[i] = i % emojis.length;
  }
  geometry.setAttribute( 'aBirdIndex', new THREE.InstancedBufferAttribute( birdIndices, 1 ) );

  geometry.instanceCount = BIRD_COUNT;

  const material = new THREE.ShaderMaterial( {
    uniforms: {
      'tBirdAtlas': { value: atlasTexture },
      'texturePosition': { value: null },
      'textureVelocity': { value: null },
      'uWidth': { value: WIDTH },
      'uAtlasWidth': { value: ATLAS_GRID_WIDTH }
    },
    vertexShader: emojiVS,
    fragmentShader: emojiFS,
    transparent: true
  } );

  birdUniforms = material.uniforms;

  const birds = new THREE.Points( geometry, material );
  birds.frustumCulled = false;
  scene.add( birds );
}

function fillPositionTexture( texture ) {
  const theArray = texture.image.data;

  for ( let k = 0, kl = theArray.length; k < kl; k += 4 ) {
    const x = Math.random() * BOUNDS - BOUNDS_HALF;
    const y = Math.random() * BOUNDS - BOUNDS_HALF;
    const z = Math.random() * BOUNDS - BOUNDS_HALF;

    theArray[k + 0] = 200 + x;
    theArray[k + 1] = 40 + ( y / 10 );
    theArray[k + 2] = 100 + z;
    theArray[k + 3] = 1;
  }
}

function fillVelocityTexture( texture ) {
  const theArray = texture.image.data;

  for ( let k = 0, kl = theArray.length; k < kl; k += 4 ) {
    const x = Math.random() - 0.5;
    const y = Math.random() - 0.5;
    const z = Math.random() - 0.5;

    theArray[k + 0] = x * 10;
    theArray[k + 1] = y * 10;
    theArray[k + 2] = z * 10;
    theArray[k + 3] = 1;
  }
}

function onWindowResize() {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );
}

function onPointerMove( event ) {
  if ( event.isPrimary === false ) return;

  mouseX = event.clientX - windowHalfX;
  mouseY = event.clientY - windowHalfY;
}

function animate() {
  render();
  stats.update();
  controls.update();
}

function render() {
  const now = performance.now();
  let delta = ( now - last ) / 1000;

  if ( delta > 1 ) delta = 1; // safety cap on large deltas
  last = now;

  positionUniforms['time'].value = now;
  positionUniforms['delta'].value = delta;
  velocityUniforms['time'].value = now;
  velocityUniforms['delta'].value = delta;

  velocityUniforms['predator'].value.set( 0.5 * mouseX / windowHalfX, - 0.5 * mouseY / windowHalfY, 0 );

  mouseX = 10000;
  mouseY = 10000;

  gpuCompute.compute();

  if ( textureSender ) {
    textureSender.update();
  }

  birdUniforms['texturePosition'].value = gpuCompute.getCurrentRenderTarget( positionVariable ).texture;
  birdUniforms['textureVelocity'].value = gpuCompute.getCurrentRenderTarget( velocityVariable ).texture;

  renderer.render( scene, camera );

  if ( tilesRuntime ) {
    const dt = clock.getDelta();
    tilesRuntime.update( dt, camera );
    copyrightElement.innerHTML = tilesRuntime.getDataAttributions();
  }
}