var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }

  var board = new Board(port.comName);

  board.on("close", function() {
    // Unplug the board to see this event!
    console.log("Closed!");
  });
});
