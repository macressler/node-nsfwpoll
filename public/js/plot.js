jQuery(document).ready(function($) {
	var updateInterval = 10000, data = [[], []], totalPoints = 40, yMultiplier = 2, nameMap = [ 'Brian', 'Justin' ];
	// setup plot
	var options = {
		grid: { hoverable: true },
		series: { shadowSize: 4 },
		yaxis: { min: -10, max: 10 },
		xaxis: { min: 0, max: totalPoints * yMultiplier, show: false }
	};
	var plot = $.plot($("#placeholder"), [
			{
				'label': nameMap[0],
				'data': data[0]
			},
			{
				'label': nameMap[1],
				'data': data[1]
			}
		], options);

	function getCurrentValuesFromServer()
	{
		var dfd = $.Deferred();

		$.get('/poll/results', function(data) {
			dfd.resolve(data);
		}, 'json');

		return dfd.promise();
	}
	function update() {
		getCurrentValuesFromServer().done(function(values) {
			appendNewValue(data[0], values[0]);
			appendNewValue(data[1], values[1]);
			plot.setData([ makeXY(data[0]), makeXY(data[1]) ]);
			plot.draw();
			setTimeout(update, updateInterval);
		});
	}

	function appendNewValue(data, newValue)
	{
		if(data.length > totalPoints)
			data.shift();
		data.push(newValue);
		return data;
	}

	function makeXY(data)
	{
		var res = [];
		for (var i = 0; i < data.length; ++i)
			res.push([i * yMultiplier, data[i]])
		return res;
	}
	
	//initial data
	update();
	
	var resetVotes = undefined;
	$('.upVote, .downVote').click(function() {
		var vote = ($(this).hasClass('downVote') ? 1 : 2),
			subject = $(this).data('sub-id');
		$.post('/poll/vote', { 'vote': vote, 'subject': subject }, function(data) {
			if(data.status == 'voted')
			{
				if(resetVotes == undefined)
					resetVotes = window.setTimeout(function() { $('#votesRemaining').text('5'); $('.upVote, .downVote').css('visibility', 'visible'); resetVotes = undefined; }, 60000);
				$('#votesRemaining').text(data.votes_remaining);
				if(data.votes_remaining == 0)
					$('.upVote, .downVote').css('visibility', 'hidden');
			}
		}, 'json');
		return false;
	});
});
