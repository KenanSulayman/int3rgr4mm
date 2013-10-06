var microtime = require("microtime-x"),
repl = require("repl"),
hl = require("hyperlevel"),
svblvl = require("level-sublevel"),
lvlver = require("level-version"),
http = require("http"),
util = require("util"),
fs = require("fs"),
ez = require("echtzeit");

var db = (function() {
	var lru = {};

	return function(c) {
		c = c.replace(/[^\000-\177]/g, "");

		return c in lru ? lru[c] : (lru[c] = hl("./logs/irc-" + c + ".db"));
	}
})();

var dhash = function () {
	return ~~(Date.now()/86400000);
};

var spawn = function (dh, channel) {
	var svbdb = svblvl(db(channel));

	return lvlver(svbdb.sublevel(dh), {defaultVersion: microtime, delimiter: "\u9999"});
}

var push = function ( plain, cb, cn ) {
	(cn instanceof Array ? cn : [ cn ]).forEach(function (cn) {
		var dh = dhash();
		spawn(dh, cn).put("", plain, cb && cb);
	});
};

var read = function ( cn, dh, cb, end ) {
	spawn(dh, cn).createVersionStream("").on("data", cb).on("end", end)
};

var pshim = function ( plain, channel ) {
	push(JSON.stringify(plain), void 0, channel);
}

var config = {
	server: "kornbluth.freenode.net",
	botName: "int3rgr4mm",
	delimiter: "!",
	debug: true
};

var opts = {
	channels: ["#int3rgr4mm", "#node.js"],
	userName: "int3rgr4mm",
	realName: "int3rgr4mm",
	showErrors: true,
	sep: "\u9999",
	debug: true
};

var irc = require("irc"),
bot = new irc.Client(config.server, config.botName, opts);

bot.addListener("registered", function() {
	setTimeout(function () {
		bot.send("mode", "pr0log", "+i")
	}, 500);
});

bot.addListener("join", function (channel, who) {
	pshim({type: "join", target: who}, channel)
})

bot.addListener("nick", function (who, newnick, channel) {
	pshim({type: "nick", target: who, payload: newnick}, channel)
})

bot.addListener("part", function (channel, who, reason) {
	pshim({type: "part", target: who, reason: reason}, channel)
})

bot.addListener("quit", function (who, reason, channel, message) {
	pshim({type: "quit", target: who, payload: reason}, channel)
})

bot.addListener("kick", function (channel, who, by, reason) {
	pshim({type: "kick", target: who, by: by, payload: reason}, channel);
})

bot.addListener("message", function(from, to, text, message) {
	pshim({type: "message", target: from, payload: text}, to);
});

bot.addListener("error", console.log);

var stamp = function ( ver ) {
	var datum = new Date(ver/1000);

	var h = datum.getUTCHours(),
	    m = datum.getUTCMinutes(),
	    s = datum.getUTCSeconds();

	return (h > 9 ? h : "0" + h) + ":" + (m > 9 ? m : "0" + m) + ":" + (s > 9 ? s : "0" + s)
};

var transform = function( str ) {
	str = str || "";

	var x = "";

	for(var i = 0; i < str.length; ++i)
		if (str[i].charCodeAt(0) > 127)
			x += '&#' + str[i].charCodeAt(0) + ';';
		else
			x += str[i]

	return x;
};

var _style = "<style type=\"text/css\">*{font-family:\"Segoe UI\", Arial, Helvetica, sans-serif;font-size:10pt}body,html{margin:0;padding:0}a:hover,a:active,a:focus{color:red}ul{padding:0 0 0 2em}div.navigation{background:#eee;height:1.5em;left:0;padding:.333em .666em;position:fixed;top:0;width:100%}div.navigation span.title{color:#444;font-weight:700}div.index,div.log{margin:2.5em 0 0;padding:0 .333em 1em}div.channels{margin:1.5em 0 0;padding:0 .333em 1em}table.log{border-collapse:collapse}table.log tr td{border:0;padding:.1em .5em;vertical-align:top}table.log tr td.time{border-right:1px solid #eee}table.log tr td.time a{color:#444;text-decoration:none}table.log tr td.time a.time-anchor{position:relative;top:-2.5em;visibility:hidden}table.log tr.kick td.content{color:red;font-style:italic}table.log tr.message td.content{color:#000}table.log tr.message td.content span.inverse{background-color:#000;color:#FFF}table.log tr.message td.content a.inverse{background-color:#000}table.log tr.message td.content .italic{font-style:italic}table.log tr.message td.content .monospace{font-family:monospace;white-space:pre}a,a:visited,table.log tr.message td.nick{color:#c50}div.navigation span.nolink,table.log tr.action td.nick,table.log tr.join td.nick,table.log tr.quit td.nick,table.log tr.part td.nick,table.log tr.kick td.nick,table.log tr.nick td.nick,table.log tr.topic td.nick{color:#444}table.log tr td.time a:hover,table.log tr.message td.content .underline{text-decoration:underline}table.log tr.action td.content,table.log tr.join td.content,table.log tr.quit td.content,table.log tr.part td.content,table.log tr.nick td.content,table.log tr.topic td.content{color:#444;font-style:italic}table.log tr.kick td.content span.victim,table.log tr.nick td.content span.new_nick,table.log tr.topic td.content span.topic,table.log tr.message td.content .bold{font-weight:700}</style>";

var _render = function ( cn, dh, cb ) {
	var d = new Date(dh * 86400000),
	    h = d.getUTCFullYear(),
	    m = d.getUTCMonth() + 1,
	    s = d.getUTCDate();

	var dstamp = (h > 9 ? h : "0" + h) + "-" + (m > 9 ? m : "0" + m) + "-" + (s > 9 ? s : "0" + s)

	var _nav = "<div class=\"navigation\"><span class=\"title\">" + cn + " " + dstamp + "</span> | <a href=\"/\">index</a> | <a href=\"" + ( dh - 1 ) + "\">previous (" + dstamp + ")</a> | <span class=\"nolink\">next (none)</span> | <span class=\"nolink\">latest</span></div>";
	var x = "<!DOCTYPE html><html lang=\"en\"><head><title>" + cn + " logs - " + dstamp + "</title>" + _style + "</head><body>" + _nav + "<div class=\"log\"><table class=\"log\"><tbody>";
	var y = [];

	process.nextTick(function () {
		read( cn, dhash(), function (a) {
			var entry = JSON.parse(a.value),
			    _stmp = stamp(a.version),
			    _svbs = ~~(((a.version/1000)%1)*1000);

			var _e = "<tr class=\"" + entry.type + "\">";
			    _e += "<td class=\"time\"><a href=\"#" + _stmp + "." + _svbs + "\">" + _stmp + "</a><a name=\"" + _stmp + "." + _svbs + "\" class=\"time-anchor\">&nbsp;</a></td>";

			if (~["part", "quit", "join"].indexOf(entry.type)) {
				_e += "<td class=\"nick\">*  " + entry.target + "</td>"
				
				if ( entry.type !== "join" ) {
					_e += "<td class=\"content\">" + entry.type + "<span class=\"reason\">" + (entry.payload ? " (" + transform(entry.payload) + ")" : "") + "</span></td></tr>";
				} else {
					_e += "<td class=\"content\">joined</td></tr>";
				}
			} else if ( entry.type === "nick" ) {
				_e += "<td class=\"nick\">" + entry.target + "</td>"
				_e += "<td class=\"content\">changed nick to <span class=\"new_nick\">" + transform(entry.payload) + "</span></td></tr>";
			} else {
				_e += "<td class=\"nick\">&lt;" + entry.target + "&gt;</td>"
				_e += "<td class=\"content\">" + transform(entry.payload) + "</td></tr>";
			}

			y.push(_e);
		}, function () {
			x += y.reverse().join("\n");
			x += "</tbody></table></div></body><script src=\"client.js\"></script></html>";
			
			cb(x)
		})
	});
};

var client = fs.readFileSync("./client.js"),
lruc = {}, cindex = "";

opts.channels.forEach(function(v) {
	return lruc[v.split("#").join("")] = v
});

cindex =  "<!DOCTYPE html><html lang=\"en\">" + _style + "<head><title>channel index</title></head><body>"
	+ "<div class=\"channels\"><ul>"
		+ Object.keys(lruc).map(function (v) {
			return "<li><a href=\"" + v + "/latest\">" + lruc[v] + "</a> (<a href=\"" + v + "/index\">index</a> | <a href=\"" + v + "/latest\">latest</a>)</li>"
		}).join("")
	+ "</ul></div></body></html>"

var srv = http.createServer(function (request, response) {
	if ( request.url === "/client.js" )
		return response.end(client);

	process.nextTick(function () {
		var swap;

		if ( request.url === "/" ) {
			return response.end( cindex );
		}

		if ( request.url.substr(1) in lruc ) {
			return response.writeHead(307, {
				"Location": request.url + "/latest"
			}), response.end();
		}

		if ( (swap = request.url.substr(1, request.url.indexOf("/latest") - 1)) in lruc ) {
			return _render( lruc[swap], dhash(), function (v) {
				response.writeHead(200,{ "Connection": "yolo"}), response.end(v)
			})
		}

		return response.end();
	});
}), by = new ez.NodeAdapter({mount: '/echtzeit'});

by.attach(srv);

srv.listen(8123, "87.106.69.16");
