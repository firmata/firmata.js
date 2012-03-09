/**
 * Sample script to control an LED
 */
var Board = require('../lib/firmata').Board;
var theLed = require('../plugins/led');
console.log(theLed);
var board = new Board('/dev/tty.usbmodemfd121',function(err){
	console.log(theLed);
	board.plugin(theLed);
	var led = new board.LED(2);
	led.blink(200);
	//blink for 2 seconds
	setTimeout(function(){
		led.stopBlinking();
		//on and off twice
		setTimeout(function(){		
			led.on();
			led.off();
			led.on();
			led.off();	
		},2000)
	},2000)
});