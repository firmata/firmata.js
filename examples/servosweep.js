var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }
  var board = new Board(port.comName);

  board.on("ready", function() {
    var degrees = 10;
    var incrementer = 10;
    board.pinMode(9, board.MODES.SERVO);
    board.servoWrite(9, 0);
    setInterval(function() {
      if (degrees >= 180 || degrees === 0) {
        incrementer *= -1;
      }
      degrees += incrementer;
      board.servoWrite(9, degrees);
    }, 500);
  });
});
