var Board = require('../lib/firmata').Board;
var latchPin = 8
   ,clockPin = 12
   ,dataPin = 11
   ,MSBFIRST = 1;
var board = new Board('/dev/tty.usbmodemfd121',function(){
	console.log('ready');
	board.pinMode(latchPin,board.MODES.OUTPUT);
	board.pinMode(clockPin,board.MODES.OUTPUT);
	board.pinMode(dataPin,board.MODES.OUTPUT);
	var value = 1;
	//board.digitalWriteRegister=function(pinNumber,inOrOut){
	setInterval(function(){
		board.digitalWrite(latchPin,board.LOW);
		if(value == 1){
			board.shiftOut(dataPin,clockPin,MSBFIRST,0);	
			value = 0;
	    } else {
			board.shiftOut(dataPin,clockPin,MSBFIRST,1);	
			value = 1;
		}
		board.digitalWrite(latchPin,board.HIGH);
	},1000);

});