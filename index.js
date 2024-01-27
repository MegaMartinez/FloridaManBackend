import WebSocket from "ws";
const Server = WebSocket.Server({port : 7071});

const connections = new Map();
const servers = {}

console.log(`Program Start: ${process.pid}\n`);

Server.on("connection", ws => {
    const connectionTime = new Date();
    const ID = connectionTime.getMilliseconds();

    connections.set(ID, {
        "name": "Unnamed",
        "socket": ws
    });

    ws.send(JSON.stringify({"msg":"get name"}));
    
    ws.on("message", messageStr => {
        const message = JSON.parse(messageStr);
        switch(message.msg){
            case "set name":
                setname(ID, message);
                break;
            case "make server":
                makeServer(ID, message);
                break;
            case "get servers":
                getservers(ID);
                break;
            case "join server":
                joinServer(ID, message);
                break;
            case "leave server":
                leaveServer(ID, message)
                break;
            default:
                ws.send(JSON.stringify({
                    "msg":"err",
                    "body":{
                        "code": 400
                    }
                }))
                break;
        }
    });

    ws.on("error", err => {
        console.error(err);
        console.log();
        for(const key in Object.keys(servers)){
            if(ID in Object.keys(servers[key].players)){
                leaveServer(ID, null, true, key)
            }
        }
        if(connections.has(ID)){
            connections.delete(ID);
        }
    });

    ws.on("close", () => {
        for(const key in Object.keys(servers)){
            if(ID in Object.keys(servers[key].players)){
                leaveServer(ID, null, true, key)
            }
        }
        if(connections.has(ID)){
            connections.delete(ID);
        }
    })
});

function setname(ID, message){
    connections.get(ID).name = message.body.name;
    connections.get(ID).socket.send(JSON.stringify({
        "msg": "name accepted",
        "body": {
            "code": 200
        }
    }));
}

function getservers(ID){
    body = []
    for (const key in Object.keys(servers)){
        body.push([key, servers[key].playerCount]);
    }

    connections.get(ID).socket.send(JSON.stringify({
        "msg": "recv servers",
        "body": {
            "servers": body
        }
    }))
}

function joinServer(ID, message){
    if(message.body.serverName in servers){
        servers[message.body.serverName].players[ID] = {
            "name": connections.get(ID).name,
            "score": 0
        }
        servers[message.body.serverName].playerCount = Object.keys(servers[message.body.serverName].players).length;
        connections.get(ID).socket.send(JSON.stringify({
            "msg":"server joined",
            "body":servers[message.body.serverName]
        }))
    } else {
        connections.get(ID).socket.send(JSON.stringify({
            "msg":"err",
            "body":{
                "code":404
            }
        }))
    }
}

function leaveServer(ID, message, forced=false, name=null){
    if (!forced) delete servers[message.body.serverName].players[ID];
    else delete servers[name].players[ID];
    servers[message.body.serverName].playerCount = Object.keys(servers[message.body.serverName].players).length;
    if (!forced){
        connections.get(ID).socket.send(JSON.stringify({
            "msg":"left server",
            "body": {
                "code": 200
            }
        }))
    }
}

function makeServer(ID, message){
    if(message.body.serverName in servers){
        connections.get(ID).socket.send(JSON.stringify({
            "msg":"err",
            "body": {
                "code": 409
            }
        }))
    } else {
        servers[message.body.serverName] = {
            "serverObj": new gameServer(message.body.serverName),
            "emptyPasses": 0,
            "playerCount": 0,
            "players": {},
            "mature": true,
            "trueHeadline":null,
            "truePoints":[],
            "falseHeadline":null,
            "falsePoints":[],
        }
    
        connections.get(ID).socket.send(JSON.stringify({
            "msg":"server created",
            "body": {
                "serverName": message.body.serverName
            }
        }))
    }
}

setInterval(function() {
    for(const key in Object.keys(servers)){
        if(servers[key].playerCount == 0){
            servers[key].emptyPasses++;
            if(servers[key].emptyPasses >= 4){
                delete servers[key];
            }
        } else {
            servers[key].emptyPasses = 0;
        }
    }

    const now = new Date();
    console.log(`CHECK AT [${now.getFullYear()}:${now.getMonth()}:${now.getDate()}:${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}]\n`)
    console.log(connections);
    console.log();
    console.log(servers);
    console.log();
}, 30 * 1000);

class gameServer{
    // TODO: implement the game loop in this class

    constructor(name) {
        this.name = name;
    }
}


process.on('exit', function () {
    const clear = (value, key, map) => {
        value.ws.send(JSON.stringify({
            "msg":"server shutdown",
            "body":{
                "code": 503
            }
        }))
        value.ws.close();
    }
    connections.forEach(clear);
    console.log("Program Close");
});

process.on('SIGINT', function () {
    console.log('Ctrl-C...');
    process.exit(2);
});

process.on('uncaughtException', function(e) {
    console.log('Uncaught Exception...');
    console.log(e.stack);
    process.exit(99);
});
