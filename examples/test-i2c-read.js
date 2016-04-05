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

    this.i2cConfig();
    this.i2cRead(0x0A, 1, function() {
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
