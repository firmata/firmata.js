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
      motorPin1: 5,
      motorPin2: 6,
      motorPin3: 7,
      motorPin4: 8,
      stepType: board.STEPPER.STEPTYPE.WHOLE
    });

    board.accelStepperSpeed(0, 400);
    board.accelStepperAcceleration(0, 100);
    board.accelStepperStep(0, 2000);

    board.on("stepper-done-0", function(position) {
      console.log("Current position: " + position);
    });

  });
});
