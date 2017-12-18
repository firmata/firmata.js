var Board = require("../");

Board.requestPort(function(error, port) {
  if (error) {
    console.log(error);
    return;
  }

  var board = new Board(port.comName);

  board.on("ready", function() {

    board.accelStepperConfig({
      deviceNum: 0,
      type: board.STEPPER.TYPE.THREE_WIRE,
      motorPin1: 2,
      motorPin2: 3,
      motorPin3: 4
    });

    board.accelStepperSpeed(0, 100);
    board.accelStepperStep(0, 1000, function(position) {
      console.log("Current position: " + position);
    });

  });
});
