var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }

  var board = new Board(port.comName);

  console.log(__filename);
  console.log("------------------------------");

  board.on("open", function() {
    console.log("  ✔ open");
  });

  board.on("reportversion", function() {
    console.log("  ✔ reportversion");
  });

  board.on("queryfirmware", function() {
    console.log("  ✔ queryfirmware");
  });

  board.on("capability-query", function() {
    console.log("  ✔ capability-query");
  });

  board.on("ready", function() {
    console.log("  ✔ ready");
    clearTimeout(timeout);

    var SW_SERIAL0 = this.SERIAL_PORT_IDs.SW_SERIAL0;

    this.serialConfig({
      portId: SW_SERIAL0,
      baud: 9600,
      rxPin: 2,
      txPin: 3
    });

    this.serialRead(SW_SERIAL0, function(data) {
      console.log("  ✔ received data (exiting)");
      console.log("------------------------------");
      process.exit();
    });
  });

  var timeout = setTimeout(function() {
    console.log(board.currentBuffer);
    console.log(">>>>>>>>>>>>>>TIMEOUT<<<<<<<<<<<<<<");
    console.log("------------------------------");
    process.exit();
  }, 10000);
});
