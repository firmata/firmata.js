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
      type: board.STEPPER.TYPE.FOUR_WIRE,
      motorPin1: 4,
      motorPin2: 5,
      motorPin3: 6,
      motorPin4: 7,
      stepType: board.STEPPER.STEPTYPE.WHOLE
    });

    board.accelStepperSpeed(0, 300);
    board.accelStepperAcceleration(0, 100);
    board.accelStepperStep(0, 2000, function(position) {
      console.log("Current position: " + position);
    });
  });
});
