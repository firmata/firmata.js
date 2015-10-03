var Board = require("../lib/firmata").Board;
var board = new Board("/dev/cu.usbmodem14531");

board.on("ready", function() {
  console.log("READY");

  var SW_SERIAL0 = board.SERIAL_PORT_IDs.SW_SERIAL0;
  var maxBytesToRead = 4;

  board.serialConfig({
    portId: SW_SERIAL0,
    baud: 9600,
    rxPin: 10,
    txPin: 11
  });

  board.serialRead(SW_SERIAL0, maxBytesToRead, function(data) {
    console.log(new Buffer(data).toString("ascii"));
  });
});
