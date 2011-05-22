###
Module dependencies.
###

express		= require 'express'
redis 		= require 'redis'
utils 		= require './lib/helpers'

app = module.exports = express.createServer();

redis_client	= redis.createClient()

###
Configuration
###
vote_limit = { max: 5, time: 60}
valid_subjects = [1, 2]
decay_time = 120
vote_scale = 10
trim_votes_timer = {}

###
App settings
###
app.configure ->
	app.set 'views', __dirname + '/views'
	app.set 'view engine', 'ejs'
	app.set 'cache views', true
	app.set 'view options', { layout: 'nsfw_poll_layout' }
	app.use express.bodyParser()
	app.use express.methodOverride()
	app.use require('stylus').middleware { src: __dirname + '/public' }
	app.use app.router
	app.use express.static __dirname + '/public'

#If we are in a development environment, print debugging information
app.configure 'development', ->
	app.use express.errorHandler { dumpExceptions: true, showStack: true }

#No error messages displayed in production
app.configure 'production', ->
	app.use express.errorHandler()

#Catch redis errors
redis_client.on 'error', (err) ->
	console.log 'Redis Error ' + err

###
Routes
###

#Root path
app.get '/', (req, res) ->
	res.render 'nsfw_poll_index', { title: 'NSFW Live Opinion Poll' }

###
API Routes
###

#adding a vote
app.post '/poll/vote', (req, res) ->
	sub 			= parseInt req.param('subject', -1), 10
	vote 			= parseInt req.param('vote', -1), 10
	now				= parseInt +new Date, 10
	encoded_ip		= utils.encodeIpAddress req.connection.remoteAddress
	encoded_time 	= now.toString 36
	vote_limit_key	= "poll:vote_lim:#{ encoded_ip }"

	#test to make sure the send params are valid
	return res.send 'Invalid request.', 400 if valid_subjects.indexOf(sub) == -1 or [1,2].indexOf(vote) == -1
	#find out how many times this client has voted
	redis_client.get vote_limit_key, (err, result) ->
		result = if result then parseInt(result, 10) else 0
		#send error if the client has exceeded the number of votes allowed
		return res.send 'Vote limit exceeded.', 400 if result >= vote_limit.max

		#if they have not voted, add the key to redis with a value of 1
		if !result
			redis_client.setex vote_limit_key, vote_limit.time, 1
		#otherwise, increment the key
		else
			redis_client.incr vote_limit_key

		#add their vote to the correct subject
		redis_client.zadd "poll:vote_#{ sub.toString() }", "#{ vote }.#{ now }", encoded_ip + encoded_time

		#set a timer to remove any old entries
		trim_votes_timer.p_1 = setTimeout ->
			removeOldVotes()
			delete trim_votes_timer.p_1
		, (decay_time * 2) * 1000 if not trim_votes_timer.p_1?

		#return a status indicating success, with the number of votes they have remaining
		res.send { status: 'voted', votes_remaining: vote_limit.max - (result + 1) }

#getting the current results
app.get '/poll/results', (req, res) ->
	score_higher	= parseInt +new Date
	score_lower		= score_higher - (decay_time * 1000)
	multi_commands 	= []

	for sub in valid_subjects
		multi_commands.push(
			['zcount', "poll:vote_#{ parseInt sub, 10 }", "1.#{ score_lower }", "1.#{ score_higher }"],
			['zcount', "poll:vote_#{ parseInt sub, 10 }", "2.#{ score_lower }", "2.#{ score_higher }"]
		)
	redis_client.multi(multi_commands).exec (err, results) ->
		res.send(for j,i in results by 2
			do ->
				neg = j
				pos = results[i + 1]
				total = pos + neg
				return if !total then 0 else if !pos then -10 else (pos / total) * (vote_scale * 2) - vote_scale
		)

#this method is called on a timeout, and removes old data points that are no longer used in calculations
removeOldVotes = ->
	score_higher	= parseInt(+new Date, 10) - (decay_time * 1000)
	multi_commands 	= []

	for sub in valid_subjects
		multi_commands.push(
			['zremrangebyscore', "poll:vote_#{ parseInt sub, 10 }", '1', "1.#{ score_higher }"],
			['zremrangebyscore', "poll:vote_#{ parseInt sub, 10 }", '2', "2.#{ score_higher }"]
		)
	redis_client.multi(multi_commands).exec()

if !module.parent
	app.listen 3000
	console.log "Express server listening on port %d", app.address().port
