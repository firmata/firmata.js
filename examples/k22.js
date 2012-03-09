/**
 * Sample script to take readings from a k22 co2 sensor.
 * http://www.co2meter.com/collections/co2-sensors/products/k-22-oc-co2-sensor-module
 */
var Board = require('../lib/firmata').Board;
var k22 = require('../plugins/k22');
var board = new Board('/dev/tty.usbmodemfd121',function(){
	board.plugin(k22);
	board.on('string',function(string){
		console.log(string);
	});
	setInterval(function(){
		board.k22.getC02Reading(function(err,ppms){
			if(err) {
				console.log('error while reading c02');
			} else {
				console.log('C02 PPM : ' + ppms);	
			}
			
		});
	},2000);
});