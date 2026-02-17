import { Pigeon } from "./Pigeon";

export class TextureSender {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.renderer = null;
    this.gpuCompute = null;
    this.variable = null;
    this.isInitialized = false;
    this.pixelBuffer = null;
    this.imageData = null;
    this.size = 0;
    this.pigeon = new Pigeon( "wss://202.213.135.84:3001/pigeon/", "functor" );
    this.current = 0;
    this.slicesize = 10000;
  }

  // size を明示的に受け取るように修正
  init( canvasElement, renderer, gpuCompute, variable, size ) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext( '2d' );
    this.renderer = renderer;
    this.gpuCompute = gpuCompute;
    this.variable = variable;
    this.size = size;

    this.canvas.width = this.size;
    this.canvas.height = this.size;

    // GPGPU は通常 FloatType なので Float32Array を使用
    this.pixelBuffer = new Float32Array( this.size * this.size * 4 );

    // Canvas に出力するための ImageData
    this.imageData = this.ctx.createImageData( this.size, this.size );

    this.isInitialized = true;
  }

  // 外部(landscape.js)から毎フレーム呼ばれる
  update() {
    if ( !this.isInitialized ) return;

    const renderTarget = this.gpuCompute.getCurrentRenderTarget( this.variable );

    // 1. GPU からピクセルデータを読み出す
    this.renderer.readRenderTargetPixels(
      renderTarget,
      0, 0, this.size, this.size,
      this.pixelBuffer
    );

    const array = this.pixelBuffer.slice( this.current, this.current + this.slicesize );

    this.pigeon.sendMsg( {
      to: 'others',
      type: 'emojicloud',
      body: {
        start: this.current,
        end: this.current + array.length,
        // Float32Arrayを通常の配列に変換してからJSON送信
        pixelbuffer: Array.from( array )
      }
    } );

    if ( this.current + this.slicesize >= this.pixelBuffer.length ) {
      this.current = 0;
    } else {
      this.current += this.slicesize;
    }
  }
}