export class Pigeon {
  constructor( endpoint, roomAddress, pigeonId ) {
    this.pigeons = {};
    this.pigeonsSet = new Set();
    this.clockDelta = 0;
    this.synced = false;
    this.pigeonRoomEndpoint = endpoint;
    this.roomAddress = roomAddress;
    this.pigeonId = pigeonId;

    this.connectToServer();
  }

  connectToServer() {
    try {
      this.ws = new WebSocket( this.pigeonRoomEndpoint + "?address=" + this.roomAddress + ( this.pigeonId ? `&initas=${this.pigeonId}` : "" ) );

      this.ws.addEventListener( 'message', ( e ) => {
        const receivedMsg = JSON.parse( e.data )
          , { to = undefined, body, type, from = undefined, timestamp } = receivedMsg;

        if ( type == 'init' ) {
          this.id = body.id;

          for ( const id of body.clients ) {
            if ( id != body.id ) {
              this.pigeonsSet.add( id );
            }
          }

          this.clockDelta = Date.now() - timestamp;

          this.synced = true;

          console.log( "start" );
          const event = new CustomEvent( "emojistart", { detail: body } );
          document.dispatchEvent( event );
        } else if ( type == 'ipad' ) {
          const event = new CustomEvent( "ipad", { detail: body } );
          document.dispatchEvent( event );
        } else if ( type == 'emojicloud' ) {
          const event = new CustomEvent( "emojicloud", { detail: body } );
          document.dispatchEvent( event );
        }

        if ( type == 'clientOpen' ) {
          this.pigeonsSet.add( body.id );

          console.log( "start" );

          setTimeout( () => {
            const event = new CustomEvent( "emojistart", { detail: body } );
            document.dispatchEvent( event );
          }, 5000 );
        }

        if ( type == 'clientClose' ) {
          this.pigeonsSet.delete( body.id );
        }

        if ( type == 'ping' ) {
          if ( from === undefined ) this.pong( 'all' );
          if ( from === 'host' ) this.pong( 'host' );
        }
      } );

      this.ws.addEventListener( 'open', ( e ) => {
      } );

      this.ws.addEventListener( 'close', ( e ) => {
        if ( this.ws.readyState != 0 ) {
          this.connectToServer();
        }
      } );

      this.ws.addEventListener( 'error', ( e ) => {
        if ( this.ws.readyState != 0 ) {
          this.connectToServer();
        }
      } );
    } catch ( err ) {
      console.log( err, "Failed to connect to server ... exiting" );
    }
  }

  sendMsg( _msg ) {
    const msg = _msg;
    if ( !Array.isArray( msg.to ) ) msg.to = new Array( msg.to );
    try {
      const msgString = JSON.stringify( msg );
      this.ws.send( msgString );
    }
    catch ( error ) {
      return false;
    }
  }

  ping( to ) {
    this.sendMsg( {
      to: to,
      type: 'ping',
      body: ''
    } );
  }

  pong( to ) {
    this.sendMsg( {
      to: to,
      type: 'pong',
      body: ''
    } );
  }
}