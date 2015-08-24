var Board = require("../lib/firmata").Board;
var board = new Board("/dev/tty.usbmodem14531");

board.on("ready", function() {
  console.log("READY");

  var SW_SERIAL0 = board.SERIAL_PORT_IDs.SW_SERIAL0;

  board.serialConfig({
    portId: SW_SERIAL0,
    baud: 9600,
    bytesToRead: 4,
    rxPin: 10,
    txPin: 11
  });

  board.serialRead(SW_SERIAL0, function(data) {
    console.log(new Buffer(data).toString("ascii"));
  });
});
