var Board = require("../lib/firmata").Board;
var board = new Board("/dev/cu.usbmodem14531");

board.on("ready", function() {
  console.log("READY");

  var HW_SERIAL1 = board.SERIAL_PORT_IDs.HW_SERIAL1;

  board.serialConfig({
    portId: HW_SERIAL1,
    baud: 9600,
    //bytesToRead: 1
  });

  board.serialRead(HW_SERIAL1, function(data) {
    console.log(new Buffer(data).toString("ascii"));
  });

  for (var pin in board.pins) {
    var modes = board.pins[pin].supportedModes;
    for (var mode in modes) {
      if (modes[mode] === board.MODES.SERIAL) {
        console.log("serial pin: " + pin);
      }
    }
  }

});
