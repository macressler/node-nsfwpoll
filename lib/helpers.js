var crypto	= require('crypto');

exports.urlencode_rfc3986 = function(str) {
  return encodeURIComponent(str).replace(/\!/g, '%21').replace(/\'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

exports.encodeBase64 = function(str, input_encoding) {
	return new Buffer(str, input_encoding || 'utf8').toString('base64');
}

exports.decodeBase64 = function(str, output_encoding) {
	return new Buffer(str, 'base64').toString(output_encoding || 'utf8');
}

exports.makeSafeBase64 = function(str) {
	return str.replace(/\+/g, '_').replace(/\//g, '.').replace(/=/g, '');
}

exports.encodeIpAddress = function(ip, encoding) {
	return ip.split('.').map(function(o) { return parseInt(o, 10).toString(encoding || 36); }).join('');
};

exports.uniqid = function(prefix) {
	var ret = 	(+new Date()).toString(36)
				+ Math.floor(Math.random() * 0x3b9ac9ff).toString(36).substr(0, 7)
				+ (+(Math.random() * 10).toFixed(10).replace('.', '')).toString(36);

	return (prefix || '') + ((ret.length < 22) ? Array(1 + (22 - ret.length)).join('0') + ret : ret);
}

exports.encrypt = function(algo, data, key, input_encoding, output_encoding) {
	input_encoding = input_encoding || 'utf8';
	output_encoding = output_encoding || 'base64';

	var cipher = crypto.createCipher(algo, key);
	cipher.update(data, input_encoding, output_encoding);
	return cipher.final(output_encoding);
};

exports.hash = function(algo, data, encoding) {
	return crypto.createHash(algo).update(data).digest(encoding || 'base64');
};

exports.hmac = function(algo, data, key, encoding) {
	return crypto.createHmac(algo, key).update(data).digest(encoding || 'base64');
};
