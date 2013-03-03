var http = require('http')


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
            // 100-100 ცალის დამუშავება, პორციებად
            var proceedCount = _this.nextStepItems.length > 100 ? 100 : _this.nextStepItems.length;
            
            for (var i = 0; i < proceedCount; i++) {
                _this.pendingItems.push(_this.nextStepItems[i]);
            }
            
            _this.nextStepItems.splice(0, proceedCount);
            
            
            
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
                res.on('end', function () {
                    var items = JSON.parse(response);
                    
                    _this.proceedItemsStatused.call(_this, items);
                   
                });
            }).on('error', function(e) {
                console.log('problem with request: ' + e.message);
                _this.proceedItemsStatused.call(_this, []);
            });
            
            var send_data = [];
            for (var j = 0; j < _this.pendingItems.length; j++) {
                send_data.push([_this.pendingItems[j].operation_type, _this.pendingItems[j].sid, _this.pendingItems[j].ipaddress, _this.pendingItems[j].gameid].join(_this.subSplitter));
            }
            
            var ttData = send_data.join(_this.splitter);
            
            req.write(ttData);
            req.end();
            
        }, 1000);
    },
    
    proceedItemsStatused: function(items){
        
//        console.log('DATA RECEIVED', items.length);
        
        for (var j = 0; j < this.pendingItems.length; j++) {
            
            var pendingItem = this.pendingItems[j];
            
            var userid = 0;
            
            for (var i = 0; i < items.length; i++) {
                if (pendingItem.sid == items[i].SID){
                    
                    if (items[i].UserID)
                        userid = items[i].UserID;
                    
                    break;
                }
            }
            
            if (pendingItem.callback)
                pendingItem.callback(userid != 0, userid);
        }
        
        this.pendingItems.splice(0, this.pendingItems.length);
        
    },

	resetUserStatuses: function() {
        try {
            var req = http.request({
                hostname: 'api.jok.ge',
                port: 80,
                path: '/portal/0/ResetUsersStatus',
                method: 'POST'
            });
            
            req.end();
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
            gameid: gameid || 0
        });
	},

	login: function(sid, ipaddress, gameid) {

		this.nextStepItems.push({
            sid: sid,
            ipaddress: ipaddress,
            operation_type: 2,
            gameid: gameid || 0
        });
	},

	logout: function(sid, ipaddress, gameid) {

		this.nextStepItems.push({
            sid: sid,
            ipaddress: ipaddress,
            operation_type: 3,
            gameid: gameid || 0
        })
	},

	getOnlineFriends: function(userid, callback) {
        
		var url = 'http://api.jok.ge/user/'+userid+'/onlinefriends';
        
		http.get(url, function(res) {
            
            var response = '';
            
            
			res.on('data', function(data) {
                
                response += data;
                
			});
            
            res.on('end', function() {
                
    			try
				{
					callback(JSON.parse(response));
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
