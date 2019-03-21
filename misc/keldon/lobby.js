/* eslint-disable */

"use strict";

function HanabiLobby() {
	var self = this;

	this.user_list = {};
	this.table_list = {};
	this.history_list = {};
	this.history_detail_list = [];

	this.username = null;
	this.pass = null;

	this.send_turn_notify = false;
	this.send_turn_sound = false;
	this.send_chat_notify = false;
	this.send_chat_sound = false;

	this.game = {
		name: "",
		num_players: 0,
		max_players: 0,
		our_index: 0,
		players: []
	};

	this.hide_lobby();
	this.hide_create_dialog();
	this.show_login();

	this.load_settings();

	$("#login-button").on("click", function(evt) {
		evt.preventDefault();

		var user = $("#user").val();
		var pass = $("#pass").val();

		if (!user || !pass) return;

		var shapass = hex_sha256("Hanabi password " + pass);

		setCookie("hanabiuser", user);
		setCookie("hanabipass", shapass);

		self.username = user;
		self.pass = shapass;

		self.send_login();
	});

	var input = $("#chat-input");

	input.on("keypress", function(evt) {
		if (evt.keyCode == 13)
		{
			if (!input.val()) return;
			self.send_msg({type: "chat", resp: {msg: input.val()}});
			input.val("");
		}
	});

	$("#create-table").on("click", function(evt) {
		evt.preventDefault();

		self.show_create_dialog();
	});

	$("#create-table").removeAttr("disabled");

	$("#create-game-submit").on("click", function(evt) {
		var game_name = $("#create-game-name").val();
		var max_players = parseInt($("#create-game-players").val());
		var variant = parseInt($("#create-game-variant").val());
		var allow_spec = document.getElementById("create-game-allow-spec").checked;

		evt.preventDefault();

		self.send_msg({type: "create_table", resp: {name: game_name, max: max_players, variant: variant, allow_spec: allow_spec}});

		self.hide_create_dialog();
	});

	$("#show-resources").on("click", function(evt) {
		self.show_resources();
	});

	$("#close-resources").on("click", function(evt) {
		self.hide_resources();
	});

	$("#show-settings").on("click", function(evt) {
		self.show_settings();
	});

	$("#close-settings").on("click", function(evt) {
		self.hide_settings();
	});

	$("#create-game-cancel").on("click", function(evt) {
		evt.preventDefault();

		self.hide_create_dialog();
	});

	$("#start-game").on("click", function(evt) {
		evt.preventDefault();

		self.send_msg({type: "start_game", resp: {}});
	});

	$("#leave-game").on("click", function(evt) {
		evt.preventDefault();

		self.send_msg({type: "leave_table", resp: {}});
	});

	$("#unattend-table").on("click", function(evt) {
		evt.preventDefault();

		$("#joined-table").hide();
		$("#table-area").show();

		self.send_msg({type: "unattend_table", resp: {}});
	});

	$("#show-history").on("click", function(evt) {
		evt.preventDefault();

		$("#table-area").hide();
		$("#game-history").show();

		self.draw_history();
	});

	$(".return-table").on("click", function(evt) {
		evt.preventDefault();

		$("#game-history-details").hide();
		$("#game-history").hide();
		$("#table-area").show();
	});

	$("#return-history").on("click", function(evt) {
		evt.preventDefault();

		$("#game-history-details").hide();
		$("#game-history").show();
	});

	$("body").on("contextmenu", "#game", function(e) { return false; });
}

HanabiLobby.prototype.reset_lobby = function() {
	this.user_list = {};
	this.table_list = {};
	this.history_list = {};
	this.history_detail_list = [];
	this.draw_users();
	this.draw_tables();
};

HanabiLobby.prototype.send_login = function() {
	$("#login-container").hide();
	$("#connecting").show();

	this.send_msg({type: "login", resp: {username: this.username, password: this.pass}});
};

HanabiLobby.prototype.login_failed = function(reason) {
	$("#login-container").show();
	$("#connecting").hide();

	$("#login-result").html("Login failed: " + reason);
};

HanabiLobby.prototype.reset_login = function() {
	$("#login-container").show();
	$("#connecting").hide();

	$("#login-result").html("");
};

HanabiLobby.prototype.show_login = function() {
	$("#login").show();
};

HanabiLobby.prototype.hide_login = function() {
	$("#login").hide();
};

HanabiLobby.prototype.show_lobby = function() {
	$("#lobby").fadeIn(800);
};

HanabiLobby.prototype.hide_lobby = function() {
	$("#lobby").hide();
};

HanabiLobby.prototype.show_create_dialog = function() {
	$("#create-table-dialog").fadeIn(800);
};

HanabiLobby.prototype.hide_create_dialog = function() {
	$("#create-table-dialog").fadeOut(800);
};

HanabiLobby.prototype.show_resources = function() {
	$("#resources-dialog").fadeIn(800);
};

HanabiLobby.prototype.hide_resources = function() {
	$("#resources-dialog").fadeOut(800);
};

HanabiLobby.prototype.show_settings = function() {
	$("#settings-dialog").fadeIn(800);
};

HanabiLobby.prototype.hide_settings = function() {
	$("#settings-dialog").fadeOut(800);
};

HanabiLobby.prototype.show_history_details = function() {
	$("#game-history").hide();
	$("#game-history-details").show();

	this.history_detail_list = [];
	this.draw_history_details();
};

HanabiLobby.prototype.show_pregame = function() {
	$("#pregame").fadeIn(800);
};

HanabiLobby.prototype.hide_pregame = function() {
	$("#pregame").hide();
};

HanabiLobby.prototype.show_game = function() {
	$("#game").fadeIn(800);
};

HanabiLobby.prototype.hide_game = function() {
	$("#game").hide();
};

HanabiLobby.prototype.add_user = function(data) {
	this.user_list[data.id] = {name: data.name, seated: data.seated, playing: data.playing};
	this.draw_users();
};

HanabiLobby.prototype.remove_user = function(data) {
	delete this.user_list[data.id];
	this.draw_users();
};

HanabiLobby.prototype.draw_users = function() {
	var div = $("#user-list");
	var attrs;
	var i;

	div.html("");

	attrs = $("<ul>");
	attrs.append($("<li>").text("Name").addClass("table-attr user-name"));
	attrs.append($("<li>").text("Seated").addClass("table-attr user-seated"));
	attrs.append($("<li>").text("Playing").addClass("table-attr user-playing"));

	div.append($("<li>").addClass("table-header").append(attrs));

	for (i in this.user_list)
	{
		attrs = $("<ul>");
		attrs.append($("<li>").text(this.user_list[i].name).addClass("table-attr user-name"));
		attrs.append($("<li>").append($("<input>", {type: "checkbox"}).prop("checked", this.user_list[i].seated)).addClass("table-attr user-seated"));
		attrs.append($("<li>").append($("<input>", {type: "checkbox"}).prop("checked", this.user_list[i].playing)).addClass("table-attr user-playing"));

		div.append($("<li>").append(attrs));
	}

	$("#user-list :checkbox").click(function(e) { e.preventDefault(); });
};

HanabiLobby.prototype.add_table = function(data) {
	this.table_list[data.id] = {name: data.name, num_players: data.num_players, max_players: data.max_players, variant: data.variant, joined: data.joined, allow_spec: data.allow_spec, running: data.running, our_turn: data.our_turn, owned: data.owned};
	this.draw_tables();
};

HanabiLobby.prototype.remove_table = function(data) {
	delete this.table_list[data.id];
	this.draw_tables();
};

var variant_names = [
	"None",
	"Black Suit",
	"Black Suit (one of each rank)",
	"Multi-color Suit"
];

HanabiLobby.prototype.draw_tables = function() {
	var self = this;
	var div = $("#table-list");
	var table, attrs, button, name, turn;
	var i;

	div.html("");

	for (i in this.table_list)
	{
		table = $("<li>").addClass("table-item");
		attrs = $("<ul>");
		attrs.append($("<li>").text(this.table_list[i].name).addClass("table-attr table-name"));

		attrs.append($("<li>").text(this.table_list[i].num_players + "/" + this.table_list[i].max_players).addClass("table-attr table-players"));

		attrs.append($("<li>").text("Variant: " + variant_names[this.table_list[i].variant]).addClass("table-attr table-variant"));

		turn = "Not Started";

		if (this.table_list[i].running && !this.table_list[i].joined)
		{
			turn = "Running";
		}
		else if (this.table_list[i].running)
		{
			if (this.table_list[i].our_turn)
			{
				turn = "<b>Your Turn</b>";
			}
			else
			{
				turn = "Waiting";
			}
		}

		attrs.append($("<li>").html(turn).addClass("table-attr table-turn"));

		if (!this.table_list[i].joined && this.table_list[i].allow_spec && this.table_list[i].running)
		{
			button = $("<button>").text("Spectate").attr("type", "button");
			button.attr("id", "spectate-" + i);

			button.on("click", function(evt) {
				evt.preventDefault();

				var id = parseInt(this.id.slice(9));

				self.send_msg({type: "spectate_table", resp: {table_id: id}});

				self.draw_tables();
			});
		}
		else if (!this.table_list[i].joined)
		{
			button = $("<button>").text("Join").attr("type", "button");
			button.attr("id", "join-" + i);

			if (this.table_list[i].num_players >= this.table_list[i].max_players)
			{
				button.attr("disabled", "disabled");
			}

			button.on("click", function(evt) {
				evt.preventDefault();

				var id = parseInt(this.id.slice(5));

				self.send_msg({type: "join_table", resp: {table_id: id}});

				self.draw_tables();
			});
		}
		else
		{
			button = $("<button>").text("Resume").attr("type", "button");
			button.attr("id", "resume-" + i);

			button.on("click", function(evt) {
				evt.preventDefault();

				var id = parseInt(this.id.slice(7));

				self.send_msg({type: "reattend_table", resp: {table_id: id}});

				self.draw_tables();
			});
		}

		attrs.append($("<li>").append(button).addClass("table-attr table-join"));

		if (this.table_list[i].joined && (this.table_list[i].owned || this.table_list[i].running))
		{
			button = $("<button>").html("&nbsp;").attr("type", "button").addClass("abandon");

			button.attr("id", "abandon-" + i);

			button.on("click", function(evt) {
				evt.preventDefault();

				var id = parseInt(this.id.slice(8));

				if (self.table_list[id].running)
				{
					if (!confirm("Really abandon game?  This will cancel the game for all players."))
					{
						return;
					}
				}

				self.send_msg({type: "abandon_table", resp: {table_id: id}});

			});

			attrs.append($("<li>").append(button).addClass("table-attr table-abandon"));
		}

		table.append(attrs);
		div.append(table);
	}
};

HanabiLobby.prototype.add_chat = function(data) {
	var chat = $("#chat");
	var line;

	if (data.who)
	{
		line = "<i>" + new Date().toLocaleTimeString() + "</i>&nbsp;&nbsp;<b>" + data.who + ":</b> " + $("<a>").text(data.msg).html() + "<br>";
	}
	else
	{
		line = "<b>" + $("<a>").text(data.msg).html() + "</b><br>";
	}

	chat.finish();
	chat.append(line);
	chat.animate({scrollTop: chat[0].scrollHeight}, 1000);

	var r = new RegExp(this.username, "i");

	if (data.who && r.test(data.msg))
	{
		if (this.send_chat_notify)
		{
			this.send_notify(data.who + " mentioned you in chat", "chat");
		}

		if (this.send_chat_sound)
		{
			this.play_sound("chat");
		}
	}
};

HanabiLobby.prototype.add_history = function(data) {
	this.history_list[data.id] = {id: data.id, num_players: data.num_players, score: data.score, variant: data.variant, num_scores: data.num_similar};
};

HanabiLobby.prototype.draw_history = function() {
	var self = this;
	var ids;

	var div = $("#history-list");
	var history, attrs, button;
	var i;

	div.html("");

	ids = Object.keys(this.history_list);
	ids.sort(function(a, b) { return parseInt(a) - parseInt(b); });
	ids.reverse();

	for (i = 0; i < ids.length; i++)
	{
		history = $("<li>").addClass("table-item");

		attrs = $("<ul>");
		attrs.append($("<li>").text("#" + ids[i]).addClass("table-attr history-id"));

		attrs.append($("<li>").text(this.history_list[ids[i]].num_players + " players").addClass("table-attr history-players"));

		attrs.append($("<li>").text(this.history_list[ids[i]].score + "/" + (this.history_list[ids[i]].variant ? 30 : 25) + " points").addClass("table-attr history-score"));

		attrs.append($("<li>").text("Variant: " + variant_names[this.history_list[ids[i]].variant]).addClass("table-attr history-variant"));

		attrs.append($("<li>").text("Other scores: " + (this.history_list[ids[i]].num_scores - 1)).addClass("table-attr history-others"));

		button = $("<button>").text("Compare Scores").attr("type", "button");
		button.attr("id", "history-details-" + ids[i]);

		button.on("click", function(evt) {
			evt.preventDefault();

			var id = parseInt(this.id.slice(16));

			self.send_msg({type: "history_details", resp: {id: id}});

			self.show_history_details();
		});

		attrs.append($("<li>").append(button).addClass("table-attr"));

		history.append(attrs);

		div.append(history);
	}
};

HanabiLobby.prototype.add_history_detail = function(data) {
	this.history_detail_list.push({id: data.id, score: data.score, us: data.you, ts: data.ts.split("T")[0]});
	this.draw_history_details();
};

HanabiLobby.prototype.draw_history_details = function() {
	var self = this;

	var div = $("#history-details-list");
	var detail, attrs, button;
	var variant = 0;
	var i;

	if (!this.history_detail_list.length)
	{
		div.html("<li>Loading...</li>");
		return;
	}

	div.html("");

	for (i = 0; i < this.history_detail_list.length; i++)
	{
		if (this.history_list[this.history_detail_list[i].id])
		{
			variant = this.history_list[this.history_detail_list[i].id].variant;
		}
	}

	for (i = 0; i < this.history_detail_list.length; i++)
	{
		detail = $("<li>").addClass("table-item");

		attrs = $("<ul>");

		if (this.history_detail_list[i].us) attrs.addClass("detail-us");

		attrs.append($("<li>").text("#" + this.history_detail_list[i].id).addClass("table-attr history-id"));

		attrs.append($("<li>").text(this.history_detail_list[i].score + "/" + (variant ? 30 : 25) + " points").addClass("table-attr history-score"));

		attrs.append($("<li>").text(this.history_detail_list[i].ts).addClass("table-attr history-ts"));

		button = $("<button>").text("Watch Replay").attr("type", "button");
		button.attr("id", "replay-" + this.history_detail_list[i].id);

		button.on("click", function(evt) {
			evt.preventDefault();

			var id = parseInt(this.id.slice(7));

			self.send_msg({type: "start_replay", resp: {id: id}});
		});

		attrs.append($("<li>").append(button).addClass("table-attr"));

		detail.append(attrs);

		div.append(detail);
	}
};

HanabiLobby.prototype.table_joined = function(data) {
	this.draw_tables();

	$("#table-area").hide();
	$("#joined-table").show();

	this.show_joined();
};

HanabiLobby.prototype.table_left = function(data) {
	this.draw_tables();

	$("#table-area").show();
	$("#joined-table").hide();
};

HanabiLobby.prototype.set_game = function(data) {
	this.game.name = data.name;
	this.game.num_players = data.num_players;
	this.game.max_players = data.max_players;
	this.game.variant = data.variant;
	this.game.running = data.running;
	this.game.allow_spec = data.allow_spec;

	this.game.players.length = this.game.num_players;

	this.show_joined();
};

HanabiLobby.prototype.set_game_player = function(data) {
	this.game.players[data.index] = {
		name: data.name,
		games_started: data.started,
		games_finished: data.finished,
		best_score: data.best_score,
		present: data.present
	};

	if (data.you) this.game.our_index = data.index;

	this.show_joined();
};

HanabiLobby.prototype.show_joined = function() {
	var self = this;
	var html = "<p>" + $("<a>").text(this.game.name).html() + "</p>";
	var div, select, option;
	var i, j;

	html += "<p>Players: " + this.game.num_players + "/" + this.game.max_players + "</p>";

	html += "<p>Variant: " + variant_names[this.game.variant] + "</p>";

	html += "<p>Allow Spectators: " + (this.game.allow_spec ? "Yes" : "No") + "</p>";

	$("#joined-desc").html(html);

	for (i = 0; i < 5; i++)
	{
		div = $("#show-player-" + (i + 1).toString());

		if (!this.game.players[i])
		{
			div.html("");
			continue;
		}

		html = '<div class="player-name">' + this.game.players[i].name + "</div>";

		html += '<div class="player-details">';

		html += "<p></p>";
		html += "<div>Games started: " + this.game.players[i].games_started + "</div>";
		html += "<div>Games finished: " + this.game.players[i].games_finished + "</div>";
		html += "<div>Best score: " + this.game.players[i].best_score + "</div>";

		if (!this.game.players[i].present)
		{
			html += "<p></p><div><b>AWAY</b></div>";
		}

		div.html(html);
	}
};

HanabiLobby.prototype.set_table_ready = function(data) {
	if (data.ready)
	{
		$("#start-game").removeAttr("disabled");
	}
	else
	{
		$("#start-game").attr("disabled", "disabled");
	}
};

HanabiLobby.prototype.game_started = function(data) {
	if (!data.replay)
	{
		$("#joined-table").hide();
		$("#table-area").show();
	}

	this.hide_pregame();
	this.show_game();

	this.ui = new HanabiUI(this);

	this.ui.set_backend(this.conn);
};

HanabiLobby.prototype.game_ended = function(data) {
	this.ui.destroy();

	this.hide_game();
	this.show_pregame();

	this.ui = null;
};

HanabiLobby.prototype.listen_conn = function(conn) {
	var self = this;

	conn.on("message", function(msg) {
		var msgType = msg.type;
		var msgData = msg.resp;

		console.log(msg);

		if (msgType == "hello")
		{
			self.hide_login();
			self.reset_lobby();
			self.show_lobby();
		}

		else if (msgType == "denied")
		{
			self.login_failed(msgData.reason);
		}

		else if (msgType == "error")
		{
			alert("Error: " + msgData.error);
		}

		else if (msgType == "user")
		{
			self.add_user(msgData);
		}

		else if (msgType == "user_left")
		{
			self.remove_user(msgData);
		}

		else if (msgType == "table")
		{
			self.add_table(msgData);
		}

		else if (msgType == "table_gone")
		{
			self.remove_table(msgData);
		}

		else if (msgType == "chat")
		{
			self.add_chat(msgData);
		}

		else if (msgType == "joined")
		{
			self.table_joined(msgData);
		}

		else if (msgType == "left")
		{
			self.table_left(msgData);
		}

		else if (msgType == "game")
		{
			self.set_game(msgData);
		}

		else if (msgType == "game_player")
		{
			self.set_game_player(msgData);
		}

		else if (msgType == "table_ready")
		{
			self.set_table_ready(msgData);
		}

		else if (msgType == "game_start")
		{
			self.game_started(msgData);
		}

		else if (msgType == "game_history")
		{
			self.add_history(msgData);
		}

		else if (msgType == "history_detail")
		{
			self.add_history_detail(msgData);
		}

		else if (msgType == "game_error")
		{
			alert("Server error");
			self.game_ended(msgData);
		}

		else if (self.ui)
		{
			self.ui.handle_message(msg);
		}
	});
};

HanabiLobby.prototype.set_conn = function(conn) {
	var self = this;

	this.conn = conn;

	this.listen_conn(conn);

	conn.on("connecting", function() {
		console.log("attempting to connect");
	});

	conn.on("connect_failed", function() {
		alert("Failed to connect to server");
	});

	conn.on("reconnect_failed", function() {
		alert("Lost connection to server, could not reconnect");
	});

	conn.on("error", function() {
	});

	conn.on("disconnect", function() {
		self.hide_lobby();
		self.hide_game();
		self.hide_create_dialog();
		self.show_pregame();
		self.reset_login();
		self.show_login();
	});

	this.username = getCookie("hanabiuser");
	this.pass = getCookie("hanabipass");

	var qs = (function(a) {
		if (a == "") return {};
		var b = {};
		for (var i = 0; i < a.length; ++i)
		{
			var p=a[i].split('=');
			if (p.length != 2) continue;
			b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
		}
		return b;
	})(window.location.search.substr(1).split('&'));

	if (qs["user"]) this.username = qs["user"];

	if (this.username)
	{
		$("#user").val(this.username);
	}

	var ready_login = function() {
		if (!document.hidden)
		{
			self.send_login();
			document.removeEventListener("visibilitychange", ready_login, false);
		}
	};

	if (this.username && this.pass)
	{
		if (!document.hidden)
		{
			this.send_login();
		}
		else
		{
			document.addEventListener("visibilitychange", ready_login, false);
		}
	}

	conn.on("reconnect", function() {
		console.log("attempting to reconnect");
		if (self.username && self.pass) self.send_login();
	});

	window.onerror = function(message, url, lineno, colno, error) {
		try
		{
			conn.emit("clienterror", {
				message: message,
				url: url,
				lineno: lineno,
				colno: colno,
				stack: error.stack,
				/*
				 * ATTENTION EXTENSION AUTHORS:
				 *
				 * Please change "modified" to true so that
				 * I won't chase down errors that may not
				 * exist in my code.
				 */
				modified: false
			});
		}
		catch (e)
		{
		}
	};
};

HanabiLobby.prototype.send_msg = function(msg) {
	this.conn.emit("message", msg);
};

HanabiLobby.prototype.load_settings = function() {
	var self = this;
	var settings_list = [
		[ "send-turn-notification", "send_turn_notify" ],
		[ "send-turn-sound", "send_turn_sound" ],
		[ "send-chat-notification", "send_chat_notify" ],
		[ "send-chat-sound", "send_chat_sound" ]
	];
	var i, val;

	for (i = 0; i < settings_list.length; i++)
	{
		val = localStorage[settings_list[i][1]];
		if (val !== undefined)
		{
			val = (val == "true");
			$("#" + settings_list[i][0]).attr("checked", val);
			this[settings_list[i][1]] = val;
		}

		$("#" + settings_list[i][0]).change(function() {
			var name = $(this).attr("id");
			var i;

			for (i = 0; i < settings_list.length; i++)
			{
				if (settings_list[i][0] == name)
				{
					self[settings_list[i][1]] = $(this).is(":checked");
					localStorage[settings_list[i][1]] = $(this).is(":checked");
				}
			}

			if (self.send_turn_notify || self.send_chat_notify)
			{
				self.test_notifications();
			}
		});
	}
};

HanabiLobby.prototype.test_notifications = function() {
	if (!("Notification" in window)) return;

	if (Notification.permission !== "default") return;

	Notification.requestPermission();
};

HanabiLobby.prototype.send_notify = function(msg, tag) {
	if (!("Notification" in window)) return;

	if (Notification.permission !== "granted") return;

	var n = new Notification("Hanabi: " + msg, { tag: tag });
};

HanabiLobby.prototype.play_sound = function(name) {
	var a = new Audio("sounds/" + name + ".mp3");
	a.play();
};

function getCookie(name)
{
	if (document.cookie === undefined) return;
	var i, x, y, cookies = document.cookie.split(";");

	for (i = 0; i < cookies.length; i++)
	{
		x = cookies[i].substr(0, cookies[i].indexOf("="));
		y = cookies[i].substr(cookies[i].indexOf("=") + 1);
		x = x.replace(/^\s+|\s+$/g, "");
		if (x == name) return unescape(y);
	}
}

function setCookie(name, val)
{
	if (document.cookie === undefined) return;
	var expire = new Date();
	expire.setDate(expire.getDate() + 365);
	var cookie = escape(val) + "; expires=" + expire.toUTCString();
	document.cookie = name + "=" + cookie;
}
