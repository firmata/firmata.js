function decode32BitSignedInteger(bytes) {
  let result = (bytes[0] & 0x7F) |
    ((bytes[1] & 0x7F) << 7) |
    ((bytes[2] & 0x7F) << 14) |
    ((bytes[3] & 0x7F) << 21) |
    ((bytes[4] & 0x07) << 28);

  if (bytes[4] >> 3) {
    result *= -1;
  }

  return result;
}


  /* -----------------------------------------------------
  * Report all encoders positions
  *
  * 0 START_SYSEX                (0xF0)
  * 1 ENCODER_DATA               (0x61)
  * 2 first enc. #  & first enc. dir. 
  * 3 first enc. position, bits 0-6
  * 4 first enc. position, bits 7-13
  * 5 first enc. position, bits 14-20
  * 6 first enc. position, bits 21-27
  * 7 second enc. #  & second enc. dir. 
  * ...
  * N END_SYSEX                  (0xF7)
  * -----------------------------------------------------
  */

  const buffer = new Buffer.from([0xF0, 0x61, 0x42, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x44, 0x00, 0x00, 0x00, 0x00, 0xF7]);
  // const buffer = new Buffer.from([0xF0, 0x61, 0x42, 0x00, 0x00, 0x00, 0x00, 0x43, 0x00, 0x00, 0x00, 0x00, 0xF7]);
  // const buffer = new Buffer.from([0xF0, 0x61, 0x42, 0x00, 0x00, 0x00, 0x00, 0xF7]);

  const pos = 4;

  buffer.writeUIntLE(pos, 3, 4);
  
  console.log(buffer);

  console.log(decode32BitSignedInteger(buffer.slice(3, 7)));

  // ----------- End Test ---------------

  const END_SYSEX = 0xF7;

  let end = buffer[7];
  let cursor = 2;
  let stop = 0;

  do {
    
    const numDir = buffer[cursor];

    const directionMask = 0x40; // B01000000
    const channelMask   = 0x3F; // B00111111 
    
    const encoderDirection = ( numDir & directionMask ) >> 6;
    const encoderNumber = numDir & channelMask;

    const encoderPosition = decode32BitSignedInteger(buffer.slice(cursor + 1, cursor + 5))

    console.log({ direction: encoderDirection, number: encoderNumber, position: encoderPosition });

    // update cursor and end 
    cursor = cursor + 5;
    end = buffer[cursor];

    stop = stop + 1;

    console.log(end.toString(16));

  } while (end != END_SYSEX);
