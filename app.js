
/**
 * Module dependencies.
 */

var express = require('express'),
	redis	= require('redis'),
	utils	= require('./lib/helpers');

var app = module.exports = express.createServer();

var redis_client = redis.createClient(),
/**
 * Configuration
 */
	vote_limit = { max: 5, time: 60 },
	valid_subjects = [1, 2],
	decay_time = 120,
	vote_scale = 10,
	trim_votes_timer = {};

/**
 * App settings
 */
app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.set('cache views', true);
  app.set('view options', { layout: 'nsfw_poll_layout' });
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(require('stylus').middleware({ src: __dirname + '/public' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

//If we are in a development environment, print debugging information
app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

//No error messages displayed in production
app.configure('production', function(){
  app.use(express.errorHandler());
});

//Catch redis errors
redis_client.on('error', function (err) {
	console.log('Redis Error ' + err);
});

/**
 * Routes
 */

//Root path
app.get('/', function(req, res){
  res.render('nsfw_poll_index', {
    title: 'NSFW Live Opinion Poll'
  });
});

/**
 * API Routes
 */

//adding a vote
app.post('/poll/vote', function(req, res) {
	var sub = parseInt(req.param('subject', -1), 10),
		vote = parseInt(req.param('vote', -1), 10),
		now = +new Date,
		encoded_ip = utils.encodeIpAddress(req.connection.remoteAddress),
		encoded_time = now.toString(36),
		vote_limit_key = 'poll:vote_lim:' + encoded_ip;

	//test to make sure the send params are valid
	if(valid_subjects.indexOf(sub) == -1 || [1, 2].indexOf(vote) == -1)
		res.send('Invalid request.', 400);
	else //find out how many times this client has voted
		redis_client.get(vote_limit_key, function(err, result) {
			result = (!result ? 0 : parseInt(result, 10));
			//send error if the client has exceeded the number of votes allowed
			if(result >= vote_limit.max)
			{
				res.send('Vote limit exceeded.', 400);
				return;
			}

			if(!result) //if they have not voted, add the key to redis with a value of 1
				redis_client.setex(vote_limit_key, vote_limit.time, 1);
			else //otherwise, increment the key
				redis_client.incr(vote_limit_key);

			//add their vote to the correct subject
			redis_client.zadd('poll:vote_' + sub.toString(), vote + '.' + now, encoded_ip + encoded_time);

			//set a timer to remove any old entries
			if(typeof trim_votes_timer.p_1 == 'undefined')
				trim_votes_timer.p_1 = setTimeout(function() { removeOldVotes(); delete trim_votes_timer.p_1; }, (decay_time * 2) * 1000);

			//return a status indicating success, with the number of votes they have remaining
			res.send({ status: 'voted', votes_remaining: vote_limit.max - (result + 1) });
		});
});

//getting the current results
app.get('/poll/results', function(req, res) {
	var score_higher = +new Date,
		score_lower = score_higher - (decay_time * 1000),
		multi_commands = [];

	valid_subjects.forEach(function(e, i) {
		multi_commands.push(
			['zcount', 'poll:vote_' + parseInt(e, 10), '1.' + score_lower, '1.' + score_higher],
			['zcount', 'poll:vote_' + parseInt(e, 10), '2.' + score_lower, '2.' + score_higher]
		);
	});
	redis_client.multi(multi_commands).exec(function(err, results) {
		var return_list = [];
		for (i = 0; i < (results.length/2); i++)
		{
			var neg = results[i * 2],
				pos = results[i * 2 + 1],
				total = pos + neg;
			return_list.push(((total == 0) ? 0 : ((pos == 0) ? (-1 * vote_scale) : ((pos / total) * (vote_scale * 2)) - vote_scale)));
		}
		res.send(return_list);
	});
});

//this method is called on a timeout, and removes old data points that are no longer used in calculations
function removeOldVotes() {
	var score_higher = +new Date - (decay_time * 1000),
		multi_commands = [];

	valid_subjects.forEach(function(e, i) {
		multi_commands.push(
			['zremrangebyscore', 'poll:vote_' + parseInt(e, 10), '1', '1.' + score_higher],
			['zremrangebyscore', 'poll:vote_' + parseInt(e, 10), '2', '2.' + score_higher]
		);
	});
	redis_client.multi(multi_commands).exec();
}


// Only listen on $ node app.js

if (!module.parent) {
  app.listen(3000);
  console.log("Express server listening on port %d", app.address().port);
}
