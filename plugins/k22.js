/**
 * plugin to take readings from a k22 co2 sensor.
 * http://www.co2meter.com/collections/co2-sensors/products/k-22-oc-co2-sensor-module
 */
module.exports = function(board){
	board.sendI2CConfig();
	board.k22 = {};
	board.k22.getC02Reading = function(callback){
		board.sendI2CWriteRequest(0x68,[0x22,0x00,0x08,0x2A]);
		board.sendI2CReadRequest(0x68,4,function(data){
			var ppms = 0;
			ppms |= data[1] & 0xFF;
			ppms = ppms << 8;
			ppms |= data[2] & 0xFF;
			var checksum = data[0] + data[1] + data[2];
			if(checksum == data[3]){
				callback(null,ppms);
			} else {
				callback(new Error('Checksum failure'));
			}
		});
	};
}