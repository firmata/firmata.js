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
      stepSize: board.STEPPER.STEP_SIZE.WHOLE
    });

    board.accelStepperConfig({
      deviceNum: 1,
      type: board.STEPPER.TYPE.FOUR_WIRE,
      motorPin1: 9,
      motorPin2: 10,
      motorPin3: 11,
      motorPin4: 12,
      stepSize: board.STEPPER.STEP_SIZE.HALF
    });

    board.accelStepperSpeed(0, 400);
    board.accelStepperSpeed(1, 400);

    board.multiStepperConfig({
      groupNum: 0,
      devices: [0, 1]
    });

    board.multiStepperTo(0, [2000, 3000], function() {

      board.accelStepperReportPosition(0, function(value) {
        console.log("Stepper 0 position: " + value);
      });

      board.accelStepperReportPosition(1, function(value) {
        console.log("Stepper 1 position: " + value);
      });

    });

  });
});
