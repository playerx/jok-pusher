var http = require('http');


module.exports = { 
	GETONLINEFRIENDS_URL: 'http://old.jok.ge/node/OnlineFriends',
	LOGOUT_URL: 'http://old.jok.ge/node/logout',
	LOGIN_URL: 'http://old.jok.ge/node/login2',
	CHECKLOGIN_URL: 'http://old.jok.ge/node/checklogin',
	RESETSTATUSES_URL: 'http://old.jok.ge/node/resetuserstatuses',

	processingLoginsCount: 0,

	resetUserStatuses: function() {
		http.get(this.RESETSTATUSES_URL).on('error', function(e) {
			console.log('resetUserStatuses: error ' + e.message);
		});
	},

	checkLogin: function(sid, ipaddress, callback) {
		this.processingLoginsCount++;

		var _this = this;

		http.get(this.CHECKLOGIN_URL + '?sid=' + sid + '&ipaddress=' + ipaddress, function(res) {

			res.on('data', function(data) {
				callback(data > 0, parseInt(data));

				_this.processingLoginsCount--;
			});
		})
		.on('error', function(e) {
			console.log('login: error ' + e.message);
			callback(false, 0);

			_this.processingLoginsCount--;
		});
	},

	login: function(userid, ipaddress) {

		http.get(this.LOGIN_URL +'?userid=' + userid + '&ipaddress=' + ipaddress).on('error', function(e) {
			console.log('logout: error ' + e.message);
		});
	},

	logout: function(userid) {

		http.get(this.LOGOUT_URL +'?userid=' + userid).on('error', function(e) {
			console.log('logout: error ' + e.message);
		});
	},

	getOnlineFriends: function(userid, callback) {
		var url = this.GETONLINEFRIENDS_URL + '?id=' + userid;
		http.get(url, function(res) {

			res.on('data', function(data) {
				try
				{
					callback(JSON.parse(data.toString()));
				}
				catch (ex)
				{
					console.log('getOnlineFriends: json parse failed ' + ex);
					console.log('url: ', url)
					callback([]);
				}
			});
		})
		.on('error', function(e) {
			console.log('getOnlineFriends: error ' + e.message);
			callback([]);
		});
	}
}