var five = require("johnny-five");
var board = new five.Board();

board.on("ready", function () {

  board.io.encoderAttach({
    encoderNum: 1,
    encoderPin1: 2,
    encoderPin2: 4,
 	});

  board.io.on('encoder-position-1', (event)=>{
    console.log(event);
  });

  board.io.encoderEnableReporting(false)

  // setInterval(() =>{
  //   board.io.encoderReport(1, (event)=>{
  //     console.log(event);
  //   });
  // }, 500)

  this.repl.inject({
    report: ( num ) => {
      this.io.encoderReport(num, (event) => {
      	console.log(event);
    	});
    },
		reportAll: () => {
			this.io.encoderReportAll((event) => {
      	console.log(event);
    	})
    },
    reset: (num) => {
			this.io.encoderResetToZero(num, true)
    },
    enableReporting: (enable) => {
      this.io.encoderEnableReporting(enable);
    }
  });

});
