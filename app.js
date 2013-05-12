/*
 *   Jok.ge - Pusher Service
 *  -------------------------
 *   პორტალის მომხმარებლების კომუნიკაცია, თამაშების შეთავაზება და აქტური
 *   ონლაინ მეგობრების შესახებ ინფორმაციის მიწოდება
 *  -------------------------
 *   It's node time :)
 */


/* [Modules Import] */
var http = require('http')
  , express = require('express')
  , app = express()
  , server = http.createServer(app)
  , io = require('socket.io').listen(server)
  , path = require('path')
  , uuid = require('node-uuid')
  , db = require('./lib/db');





/* [Configuration] */
app.configure(function(){
    app.set('port', process.env.PORT || 8082);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    // app.use(express.logger('dev'));
    
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
    
    // io.enable('browser client minification');
    // io.enable('browser client gzip');          // gzip the file
    io.enable('browser client etag');          // apply etag caching logic based on version number
    
    io.set('log level', 0);                    // reduce logging
    io.set('heartbeat timeout', 15);
    io.set('heartbeat interval', 10);
    io.set('close timeout', 20);
    io.set('polling duration', 10);
    io.set('authorization', function (handshakeData, callback) {
        try {
            var ipaddress = handshakeData.address.address;
            var sid = handshakeData.query.sid;
            
            if (!sid) { callback(null, false);  return; }
            
            if (sid.length != 36) {
                callback(null, false);
                return;
            }
            
            
            handshakeData.sid = sid;
            
            process.stats.processingLoginsCount++;
            
            var gameid = handshakeData.query.gameid || 0;
            
            db.checkLogin(sid, ipaddress, gameid, function(isSuccess, userid, isAdmin) {
                
                process.stats.processingLoginsCount--;
                
                handshakeData.isAdmin = isAdmin;
                
                if (isSuccess)
                    handshakeData.userid = userid;
                
                callback(null, isSuccess);
            });
		}
		catch (err) {
			console.log(err);
		}
	});

    io.set('transports', [
        // 'websocket',
        // 'flashsocket',
        'xhr-polling',
        // 'htmlfile',
        'jsonp-polling'
    ]);
});

app.configure('development', function(){
    app.use(express.errorHandler());
});






process.stats = { processingLoginsCount: 0, connectionsCount: 0, startTime: new Date(), invitesSent: 0, invitesAccepted: 0, invitesDeclined: 0, invitesTimout: 0 };

/* Routing */
app.get('/', function(req, res) {
	try {
        res.render('index', { 
            title: 'Express', 
            sid: req.query.sid, 
            room: req.query.room 
        });
	} catch(ex) {
        res.end(JSON.stringify(ex));
	}
});
app.get('/stats', function(req, res) {
    res.writeHead(200, {
     'content-type': 'application/json'
    });

    var uptime = Math.round((new Date() - process.stats.startTime) / 60000);
    var memUsage = process.memoryUsage();

    var usersCount = 0;
    for (var i in io.sockets.manager.rooms) {
        if (i.indexOf('user/') > -1)
            usersCount++;
    }

    res.write(JSON.stringify({
        Common: {
            NextStepItems: db.nextStepItems.length,
            PendingItems: db.pendingItems.length
        },
        Stats: {
            ProcessingLogins: process.stats.processingLoginsCount,
            UsersCount: usersCount,
            UserConnectionsCount: io.sockets.clients().length
        },
        Memory: {
            RSS: Math.round(memUsage.rss / (1024 * 1024)),
            HeapUsed: Math.round(memUsage.heapUsed / (1024 * 1024)),
            HeapTotal: Math.round(memUsage.heapTotal / (1024 * 1024))
        },
        Usage: {
            Sent: process.stats.invitesSent,
            Timout: process.stats.invitesTimout,
            Accept: process.stats.invitesAccepted,
            Decline: process.stats.invitesDeclined
        },
        StartTime: process.stats.startTime,
        Uptime: uptime
    }));
    res.end();
});
app.get('/stats/rooms', function(req, res) {
    res.writeHead(200, {
        'content-type': 'text/html'
    });

    try {
        var roomsCount = 0;
        for (var i in io.manager.rooms) {
            roomsCount++;
        }
        
        res.write('Rooms (' + roomsCount + '):<br/>');
        for (var j in io.manager.rooms) {
            res.write(j +' - ' + io.manager.rooms[j].length + '<br/>');
        }
    }
    catch (err) { res.write(err); }

    res.end();
});
app.get('/stats/test', function(req, res) {
    res.writeHead(200, {
        'content-type': 'text/html'
    });

    try {
        var friendUser = io.sockets(getUserIDInRoom(32));
        res.write(friendUser);
    }
    catch (err) { res.write(err); }

    res.end();
});
app.get('/UpdateTrackInfo/:channel/:track', function(req, res) {
    
    try {
        io.sockets.emit('MusicChannelUpdate', req.params.channel, req.params.track);
    }
    catch(err) {
		res.end('0');
    }

    res.end('1');
});




setInterval(function() {
    
    if (io.sockets.clients('admin').length === 0) return; 
    
    
    var usersCount = 0;
    for (var i in io.sockets.manager.rooms) {
        if (i.indexOf('user/') > -1)
            usersCount++;
    }


    io.sockets.in('admin').emit('RealtimeStatistics', process.memoryUsage(), process.stats, usersCount, io.sockets.clients().length);
}, 3000);




// თუ ერთ მომხმარებელს აქვს გახსნილი 20 კონექშენზე მეტი, შევკვეცოთ
var checkConnectionsLimit = function(userid) {
	var roomFullName = ['user/', userid].join('');
	var room = io.sockets.manager.rooms[roomFullName];

	if (room && room.length >= 4) {
		for (var i = room.length; i >= 0; i--) {
			if (!io.sockets.sockets[room[0]]) continue;

			io.sockets.sockets[room[0]].disconnect('unauthorized');
		}
	}
};

var getUserIDInRoom = function(userid) {
    return 'user/' + userid;
};


/* [Service] */
io.on('connection', function(socket){
    
    db.login(socket.handshake.sid, socket.handshake.address.address, socket.handshake.query.gameid);
    
    var userid = socket.handshake.userid;
	
	checkConnectionsLimit(userid);

    socket.userid = userid;
	socket.join(getUserIDInRoom(socket.userid));
    
    if (socket.handshake.isAdmin){
        socket.join('admin');
    }
    
	// მეგობრებისთვის ინფოს გაგზავნა
	db.getOnlineFriends(userid, function(friends) {
        if (socket === null) return;
        
		// მეგობრების სიის გაგზავნა
//		socket.emit('OnlineFriends', friends);
        
        
		// თუ არცერთი მეგობარი არაა ონლაინში გამოსვლა
        if (friends.length === 0) return;
        
        
		// მეგობრებისთვის ინფორმაციის გაგზავნა
		for (var i = 0; i < friends.length; i++) {
            
            socket.emit('FriendCameOnline', friends[i].UserID);
            
			var friendUser = io.sockets.in(getUserIDInRoom(friends[i].UserID));
			if (friendUser) {
                friendUser.emit('FriendCameOnline', userid);
			}
			friendUser = null;
		}
	});
    
    
    
    
	socket.on('SendGameOffer', function(userid, gamekey, options) {
		var offerUser = io.sockets.in(getUserIDInRoom(userid));
		if (!offerUser) return;
        
		offerUser.emit('GameOffer', socket.userid, gamekey, options);
		offerUser = null;
        
        process.stats.invitesSent++;
	});

	socket.on('AcceptGameOffer', function(userid, gamekey, options) {
		var offerUser = io.sockets.in(getUserIDInRoom(userid));
		if (!offerUser) return;
        
        
		var tableid = uuid.v4();
        
		socket.emit('GameOfferAccepted', socket.userid, gamekey, options, tableid);
		offerUser.emit('GameOfferAccepted', socket.userid, gamekey, options, tableid);
		offerUser = null;
        
        process.stats.invitesAccepted++;
	});

	socket.on('DeclineGameOffer', function(userid, gamekey, options) {
		var offerUser = io.sockets.in(getUserIDInRoom(userid));
		if (!offerUser) return;


		offerUser.emit('GameOfferDeclined', socket.userid, gamekey);
		offerUser = null;
        
        process.stats.invitesDeclined++;
	});

	socket.on('CancelGameOffer', function(userid) {
		var offerUser = io.sockets.in(getUserIDInRoom(userid));
		if (!offerUser) return;


		offerUser.emit('GameOfferCanceled', socket.userid);
		offerUser = null;
        
        process.stats.invitesTimout++;
	});
    
    
    socket.on('ChatRequest', function(partnerUserID) {
        var offerUser = io.sockets.in(getUserIDInRoom(partnerUserID));
        if (!offerUser) return;
        
		var cid = uuid.v4();
        
		offerUser.emit('ChatStart', cid, false, socket.userid);
		socket.emit('ChatStart', cid, true, partnerUserID);
		offerUser = null;
	});
    
    socket.on('ChatJoin', function(cid) {
        socket.join('chat/'+cid);
	});

	socket.on('ChatLeave', function(cid) {
		socket.leave('chat/'+cid);
	});

	socket.on('ChatMessage', function(cid, msg) {

		var channel = io.sockets.in('chat/'+cid);
		if (!channel) return;

		try {
			msg = msg.replace('javascript', 'java_script');
			if (msg.length > 100) {
				msg = msg.substring(0, 99);
			}
		}
		catch (err) {
			msg = '';
		}

		// ნაჩატავების შენახვა სერვერზე
		if (socket.logging) {
			// todo
		}

		channel.emit('ChatReceiveMessage', cid, socket.handshake.userid, msg);
	});
    
    
    
    socket.on('disconnect', function() {
        db.logout(socket.handshake.sid, socket.handshake.address.address, socket.handshake.query.gameid);
        
        // ონლაინ მეგობრებისთვის ინფორმაციის გაგზავნა მისი გასვლის შესახებ
        db.getOnlineFriends(userid, (function(friends) {
            
			for (var i = 0; i < friends.length; i++) {
				var friendUser = io.sockets.in(getUserIDInRoom(friends[i].UserID));
				if (friendUser)
					friendUser.emit('FriendGoneOffline', userid);
                    
				friendUser = null;
			}
            
		}).bind(this));
    });
});



/* Start */
server.listen(app.get('port'), function(){
    console.log("Express server listening on port " + app.get('port'));
	// db.resetUserStatuses();
    
	// db.init();
});











