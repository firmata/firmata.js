var Board = require('../lib/firmata').Board
   ,async = require('async')
   ,temperatureCommand = 0x03
   ,humidityCommand = 0x05
   ,clockPin = 8
   ,dataPin = 9
   ,MSBFIRST= 1;
var getData16SHT = function(board,callback){
	board.pinMode(dataPin,board.MODES.INPUT);
	board.pinMode(clockPin,board.MODES.OUTPUT);
	//lsb
	board.shiftIn(dataPin,clockPin,MSBFIRST,function(lsb){
		lsb*=256;
		//ack
		board.pinMode(dataPin,board.MODES.OUTPUT);
		board.digitalWrite(dataPin,board.HIGH);
		board.digitalWrite(dataPin,board.LOW);
		board.digitalWrite(clockPin,board.HIGH);
		board.digitalWrite(clockPin,board.LOW);
		//msb
		board.pinMode(dataPin,board.INPUT);
		board.shiftIn(dataPin,clockPin,MSBFIRST,function(msb){
			callback(lsb|=msb);
		});

	});
};
var skipCRCSHT = function(board,callback){
	board.pinMode(dataPin,board.MODES.OUTPUT);
	board.pinMode(clockPin,board.MODES.OUTPUT);
	board.digitalWrite(dataPin,board.HIGH);
	board.digitalWrite(clockPin,board.HIGH);
	board.digitalWrite(clockPin,board.LOW);
};
var board = new Board('/dev/tty.usbmodemfd121',function(){
	var ackCallback;
	var ackCount = 0;
	var acks = [
	   function(ack,callback){
			if(ack!=board.LOW){
				board.digitalWrite(clockPin,board.HIGH);
				callback(false);
			} else{
				board.digitalWrite(clockPin,board.LOW);
				callback(true);
			}
	   }
	   ,function(ack,callback){
	   		if(ack!=board.HIGH){
	   			callback(true);
	   		} else{
	   			callback(true);
	   		}
	   		acks[2](ack,callback);
	   	
	   }
	   ,function(ack,callback){
	   	    var count = 0;
	   		var intervalId = setInterval(function(){
	   			if(count > 100){
	   				clearInterval(intervalId);
	   				callback(false);
	   			} else if (board.pins[dataPin].value == board.LOW){
	   			    clearInterval(intervalId);
	   				callback(true);
	   			}
	   			count++
	   		},20);
	   	
	   }
	];
	board.digitalRead(dataPin,function(data){
		if(ackCallback){
			if(ackCount < 2){
				acks[ackCount](data,function(result){
					if(result && ackCount == 2 || !result){

						ackCount = 0;
						var tempCallback = ackCallback;
						ackCallback = null;
						tempCallback(result);
					} else {
						ackCount++;
					}
				});
			}
		}
	});
	var sendCommandSHT = function(command,callback){
		board.pinMode(dataPin,board.MODES.OUTPUT);
		board.pinMode(clockPin,board.MODES.OUTPUT);
		board.digitalWrite(dataPin,board.HIGH);
		board.digitalWrite(clockPin,board.HIGH);
	    board.digitalWrite(dataPin,board.LOW);
	    board.digitalWrite(dataPin,board.LOW);
	    board.digitalWrite(clockPin,board.HIGH);
	    board.digitalWrite(dataPin,board.HIGH);
	    board.digitalWrite(clockPin,board.LOW);
	    
	    board.shiftOut(dataPin,clockPin,MSBFIRST,command);
	    board.digitalWrite(clockPin,board.HIGH);
	    board.pinMode(dataPin,board.MODES.INPUT);

	    ackCallback = callback;
	};
	board.on('string',function(string){
		console.log(string);
	});
	var ack = '';
	async.whilst(
		function(){ return true;}
	   ,function(callback){
	   	 setTimeout(function(){
		     sendCommandSHT(humidityCommand,function(ack){
		     	if(ack){
					getData16SHT(board,function(value){
						skipCRCSHT(board);
						console.log('hum: '+(-4.0 + 0.0405 * value + -0.0000028 * value * value));	
						//console.log("temp: "+(value * 0.01 - 40));
						setTimeout(function(){
							sendCommandSHT(temperatureCommand,function(humack){
								if(humack){
									getData16SHT(board,function(humValue){
										skipCRCSHT(board);
										//console.log('hum: '+(-4.0 + 0.0405 * humValue + -0.0000028 * humValue * humValue));	
										console.log("temp: "+(humValue * 0.01 - 40));
									});
								} else {
									console.log('hum ack');
									callback();
								}
							});
						},1000);
					});
				} else {
					//console.log('nack');
				}
				callback();
			 }); 
		 },1000);	  
	   }
	   ,function(){ }
	);
});