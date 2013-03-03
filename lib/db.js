var http = require('http');


module.exports = { 

	processingLoginsCount: 0,
    
	nextStepItems: [], // შემდეგ გაგზავნაზე ვინც უნდა გაიგზავნოს
	pendingItems: [], // განაგზავნები
    
	splitter: '|',
	subSplitter: '!',
    
	init: function(){
        
        var _this = this;
        
        setInterval(function(){
            
            if (_this.nextStepItems.length == 0) { return; }
            
            if (_this.pendingItems.length > 0) { return; }
            
            
            // ყველა მათგანის pending-ებში გადატანა
            for (var i = 0; i < _this.nextStepItems.length; i++) {
                _this.pendingItems.push(_this.nextStepItems[i]);
            }
            
            _this.nextStepItems.splice(0, _this.nextStepItems.length);
            
            
            
            var options = {
                hostname: 'api.jok.ge',
                port: 80,
                path: '/portal/0/UpdateUsersStatus',
                method: 'POST'
            }
            
            var req = http.request(options, function(res) {
                var response = '';
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    response += chunk;
                });
                res.on('end', function (chunk) {
                    var items = JSON.parse(response);
                    
                    _this.proceedItemsStatused.call(_this, items);
                   
                });
            }).on('error', function(e) {
                console.log('problem with request: ' + e.message);
                _this.proceedItemsStatused.call(_this, []);
            });
            
            var send_data = [];
            for (var i = 0; i < _this.pendingItems.length; i++) {
                send_data.push([_this.pendingItems[0].operation_type, _this.pendingItems[0].sid, _this.pendingItems[0].ipaddress, _this.pendingItems[0].gameid].join(_this.subSplitter));
            }
            
            var ttData = send_data.join(_this.splitter);
            console.log('DATA SENT' + ttData);
            req.write(ttData);
            req.end();
            
        }, 1000);
    },
    
    proceedItemsStatused: function(items){
        
        
        for (var j = 0; j < this.pendingItems.length; j++) {
            for (var i = 0; i < items.length; i++) {
                if (this.pendingItems[j].sid == items[i].SID && this.pendingItems[j].callback){
                                
                    this.pendingItems[j].callback(items[i].UserID && items[i].UserID != 0, items[i].UserID)
                    
                    break;
                }
            }
            
            if (this.pendingItems[j].callback)
                this.pendingItems[j].callback(false);
        }
        
        this.pendingItems.splice(0, this.pendingItems.length);
        
    },

	resetUserStatuses: function() {
        try {
            http.request({
                hostname: 'api.jok.ge',
                port: 80,
                path: '/portal/0/ResetUsersStatus',
                method: 'POST'
            });
        }
        catch(err) {
            console.log(err);
        }
	},

	checkLogin: function(sid, ipaddress, gameid, callback) {
        
        this.nextStepItems.push({
            sid: sid,
            ipaddress: ipaddress,
            callback: callback,
            operation_type: 1,
            gameid: gameid
        });
	},

	login: function(sid, ipaddress, gameid) {

		this.nextStepItems.push({
            sid: sid,
            ipaddress: ipaddress,
            operation_type: 2,
            gameid: gameid
        });
	},

	logout: function(sid, ipaddress, gameid) {

		this.nextStepItems.push({
            sid: sid,
            ipaddress: ipaddress,
            operation_type: 3,
            gameid: gameid
        })
	},

	getOnlineFriends: function(userid, callback) {
        
		var url = 'http://api.jok.ge/user/'+userid+'/onlinefriends';
        
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
