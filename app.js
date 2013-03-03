/*
 *	Jok.ge - Portal Service
 *  -------------------------
 *	 პორტალის მომხმარებლების კომუნიკაცია, თამაშების შეთავაზება და აქტური
 *   ონლაინ მეგობრების შესახებ ინფორმაციის მიწოდება
 *  -------------------------
 *   It's node time :)
 */


/* [Modules] */
var http = require('http')
  , express = require('express')
  , app = express()
  , server = http.createServer(app)
  , io = require('socket.io').listen(server)
  , path = require('path')
  , uuid = require('node-uuid')
  , db = require('./lib/db')


/* [Configuration & Run] */
app.configure(function(){
  app.set('port', process.env.PORT || 8082);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  // app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);

  // io.enable('browser client minification');
  io.enable('browser client etag');          // apply etag caching logic based on version number
  // io.enable('browser client gzip');          // gzip the file
  io.set('log level', 0);                    // reduce logging
  io.set('heartbeat timeout', 15);
  io.set('heartbeat interval', 10);
  io.set('close timeout', 20);
  io.set('polling duration', 10);
});

app.configure('development', function(){
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.errorHandler());
});

app.configure('production', function(){
});


process.stats = { processingLoginsCount: 0, connectionsCount: 0, startTime: new Date() };

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
})
app.get('/stats', function(req, res) {
    res.writeHead(200, {
     'content-type': 'text/html'
    });

    var uptime = Math.round((new Date() - process.stats.startTime) / 60000);
    var memUsage = process.memoryUsage();

    var usersCount = 0;
    for (var i in portal.manager.rooms) {
        if (i.indexOf('/portal/') > -1)
            usersCount++;
    }


    res.write('NextStepItems: ' + db.nextStepItems.length + '<br/>');
    res.write('PendingItems: ' + db.pendingItems.length + '<br/>');
    res.write('---------------------------<br/>');
    res.write('processing logins: ' + process.stats.processingLoginsCount + '<br/>');
    res.write('user count: ' + usersCount + '<br/>');
    res.write('user connections count: ' + io.sockets.clients().length + '<br/>');
    res.write('---------------------------<br/>');
    res.write('up time: ' + uptime + ' min.<br/>');
    res.write('<br/>');
    res.write('memory usage:<br/>');
    res.write('RSS - ' + Math.round(memUsage.rss / (1024 * 1024)) + ' MB<br/>');
    res.write('Heap Used - ' + Math.round(memUsage.heapUsed / (1024 * 1024)) + ' MB<br/>');
    res.write('Heap Total - ' + Math.round(memUsage.heapTotal / (1024 * 1024)) + ' MB<br/>');
    res.write('---------------------------<br/>');
    // res.write('sent    : ' + portalService.sendGameOffersCount + '<br/>');
    // res.write('cancel  : ' + portalService.cancelGameOffersCount + '<br/>');
    // res.write('accept  : ' + portalService.acceptGameOffersCount + '<br/>');
    // res.write('decline : ' + portalService.declineGameOffersCount + '<br/>');
    res.end();
})
app.get('/stats/rooms', function(req, res) {
    res.writeHead(200, {
        'content-type': 'text/html'
    });

    var roomsCount = 0;
    for (var i in portal.manager.rooms) {
        roomsCount++;
    }

    res.write('Rooms (' + roomsCount + '):<br/>');
    for (var i in portal.manager.rooms) {
        res.write(i +' - ' + portal.manager.rooms[i].length + '<br/>');
    }

    res.end();
})
app.get('/UpdateTrackInfo/:channel/:track', function(req, res) {
    try {
		portal.emit('music channel update', req.params.channel, req.params.track);
    }
    catch(err) {
		res.end('0');
    }

    res.end('1');
})





/* Socket.IO */
io.configure(function (){
  	io.set('authorization', function (handshakeData, callback) {
		try {
		    var ipaddress = handshakeData.address.address;

		    // parse sid cookie & try to login
			var cookies = {};

				try {
		      	var cookiesCol = handshakeData.headers.cookie.split(';');
		      	for (var i = 0; i < cookiesCol.length; i++) {
			        var keyVal = cookiesCol[i].split('=');
			        cookies[keyVal[0].trim()] = keyVal[1].trim();
		      	}
		    }
		    catch (err) { return; }

		    var sid = cookies['sid'];

		    if (!sid) { callback(null, false);  return; }

		    if (sid.length != 36) {
		    	callback(null, false);
		    	return;
		    }


            handshakeData.sid = sid;
            
		    process.stats.processingLoginsCount++;

            var gameid = handshakeData.query.gameid;

		    db.checkLogin(sid, ipaddress, gameid, function(isSuccess, userid) {

		    	process.stats.processingLoginsCount--;

		    	if (isSuccess)
		    		handshakeData.userid = userid;

		    	callback(null, isSuccess);
		    })
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
})


// თუ ერთ მომხმარებელს აქვს გახსნილი 20 კონექშენზე მეტი, შევკვეცოთ
var checkConnectionsLimit = function(userid) {
	var roomFullName = [portal.name, '/', userid].join('');
	var room = io.sockets.manager.rooms[roomFullName];

	if (room && room.length >= 4) {
		for (var i = room.length; i >= 0; i--) {
			if (!io.sockets.sockets[room[0]]) continue;

			io.sockets.sockets[room[0]].disconnect('unauthorized');
		}
	}
}

/* Portal Service */
io.on('connection', function(socket){
    
    db.login(socket.handshake.sid, socket.handshake.address.address, socket.handshake.query.gameid);
    
    socket.on('disconnect', function() {
        db.logout(socket.handshake.sid, socket.handshake.address.address, socket.handshake.query.gameid)
    });
})


var portal = io.of('/portal').on('connection', function (socket) {

	var userid = socket.handshake.userid;
	socket.userid = userid;

	checkConnectionsLimit(userid);

	socket.join(userid);



	// მეგობრებისთვის ინფოს გაგზავნა
	db.getOnlineFriends(userid, function(friends) {
		if (socket == null) return;

		// მეგობრების სიის გაგზავნა
		socket.emit('OnlineFriends', friends);


		// თუ არცერთი მეგობარი არაა ონლაინში გამოსვლა
		if (friends.length == 0) return;


		// მეგობრებისთვის ინფორმაციის გაგზავნა
		for (var i = 0; i < friends.length; i++) {
			var friendUser = portal.in(friends[i].UserID);
			if (friendUser)
				friendUser.emit('FriendCameOnline', userid);

			friendUser = null;
		}
	});


	socket.on('chat request', function(partnerUserID) {
		var offerUser = portal.in(partnerUserID);
		if (!offerUser) return;

		var cid = uuid.v4();

		offerUser.emit('chat start', cid, false, socket.userid);
		socket.emit('chat start', cid, true, partnerUserID);
		offerUser = null;
	})

	socket.on('SendGameOffer', function(userid, gamekey, options) {
		var offerUser = portal.in(userid);
		if (!offerUser) return;

		offerUser.emit('GameOffer', socket.userid, gamekey, options);
		offerUser = null;
	})

	socket.on('AcceptGameOffer', function(userid, gamekey, options) {
		var offerUser = portal.in(userid);
		if (!offerUser) return;


		var tableid = uuid.v4();

		socket.emit('GameOfferAccepted', socket.userid, gamekey, options, tableid);
		offerUser.emit('GameOfferAccepted', socket.userid, gamekey, options, tableid);
		offerUser = null;
	})

	socket.on('DeclineGameOffer', function(userid, gamekey, options) {
		var offerUser = portal.in(userid);
		if (!offerUser) return;


		offerUser.emit('GameOfferDeclined', socket.userid, gamekey);
		offerUser = null;
	})

	socket.on('CancelGameOffer', function(userid) {
		var offerUser = portal.in(userid);
		if (!offerUser) return;


		offerUser.emit('GameOfferCanceled', socket.userid);
		offerUser = null;
	})

	socket.on('disconnect', function() {

		var roomFullName = [portal.name, '/', userid].join('');
		var room = io.sockets.manager.rooms[roomFullName];

		// თუ ჯერ კიდევ არსებობს რომელიმე კონექშენი ამ მომხმარებელზე, ის ონლაინად ითვლება
		if (room && room.length > 1) return;

		// ონლაინ მეგობრებისთვის ინფორმაციის გაგზავნა მისი გასვლის შესახებ
		db.getOnlineFriends(userid, (function(friends) {

			for (var i = 0; i < friends.length; i++) {
				var friendUser = portal.in(friends[i].UserID);
				if (friendUser)
					friendUser.emit('FriendGoneOffline', userid);

				friendUser = null;
			}

		}).bind(this));
	})
});

/* Chat Service */
var chat = io.of('/chat').on('connection', function (socket) {

	socket.logging = false;

	socket.on('set logging', function(val) {
		socket.logging = (val == true);
	})

	socket.on('join', function(cid) {
		socket.join(cid);
	})

	socket.on('leave', function(cid) {
		socket.leave(cid);
	})

	socket.on('message', function(cid, msg) {

		var channel = chat.in(cid);
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

		channel.emit('receive message', cid, socket.handshake.userid, msg);
	})
});



/* Start */
server.listen(app.get('port'), function(){
  	console.log("Express server listening on port " + app.get('port'));
//	db.resetUserStatuses();
    
	db.init();
});
