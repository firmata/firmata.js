var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }

  var board = new Board(port.comName);

  board.on("ready", function() {
    console.log("READY");

    var HW_SERIAL1 = board.SERIAL_PORT_IDs.HW_SERIAL1;

    board.serialConfig({
      portId: HW_SERIAL1,
      baud: 9600
    });

    board.serialRead(HW_SERIAL1, function(data) {
      console.log(new Buffer(data).toString("ascii"));
    });

    board.on("string", function (message) {
      console.log(message);
    });

    // log serial pin numbers
    for (var pin in board.pins) {
      var modes = board.pins[pin].supportedModes;
      for (var mode in modes) {
        if (modes[mode] === board.MODES.SERIAL) {
          console.log("serial pin: " + pin);
        }
      }
    }

  });
});
