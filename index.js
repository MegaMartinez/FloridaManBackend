console.log(`Program Start: ${process.pid}\n`);

const { readFileSync } = require("fs");
const headlines = JSON.parse(readFileSync("headlines.json"));

const WebSocket = require("ws");
const Server = new WebSocket.Server({port : 7071});

const connections = new Map();
const servers = {}

Server.on("connection", ws => {
    const connectionTime = new Date();
    const ID = connectionTime.getTime();

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
            case "give true submission":
                servers[message.body.serverName].serverObj.giveTrueSubmission(message);
                break;
            case "give false submission":
                servers[message.body.serverName].serverObj.giveFalseSubmission(message);
                break;
            case "give vote":
                servers[message.body.serverName].serverObj.giveVote(ID, message);
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
        servers[message.body.serverName].serverObj.update();
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
    servers[message.body.serverName].serverObj.update();
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
            "mature": true
        }
        servers[message.body.serverName].serverObj.update();
    
        connections.get(ID).socket.send(JSON.stringify({
            "msg":"server created",
            "body": {
                "serverName": message.body.serverName
            }
        }))
    }
}

setInterval(function() {
    for(const key of Object.keys(servers)){
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
    constructor(name) {
        this.name = name;
        this.phase = "prepare"
        this.shuffleCount = 0;
        this.matchArr = [];
        this.matchArrL = [];
        this.matchArrR = [];
        this.liar = null;
        this.truther = null;
        this.truthSubmission = null;
        this.falseSubmission = null;
        this.truthIndex = -1;
        this.falseIndex = -1;
        this.voteCount = 0;
        this.correct = [];
        this.incorrect = [];
    }

    getRoundInfo(socket) {
        let res = {
            "msg":"round info",
            "body":{
                "phase": this.phase,
                "players": servers[this.name].players
            }
        }
        switch(this.phase){
            case "vote":
            case "points":
                res.body.truthIndex = this.truthIndex;
                res.body.falseIndex = this.falseIndex;
                res.body.truthSubmission = this.truthSubmission;
                res.body.falseSubmission = this.falseSubmission;
                res.body.voteCount = this.voteCount;
                res.body.correct = this.correct;
                res.body.incorrect = this.incorrect;
            case "headlines":
                res.body.liar = this.liar;
                res.body.truther = this.truther;
                break;
        }
        socket.send(JSON.stringify(res));
    }

    update() {
        for(let i = this.matchArr.length - 1; i >= 0; i--){
            if(!Object.keys(servers[this.name].players).includes(this.matchArr[i])){
                this.matchArr.splice(i);
            }
        }
        for(let i = this.matchArrL.length - 1; i >= 0; i--){
            if(!Object.keys(servers[this.name].players).includes(this.matchArrL[i])){
                this.matchArrL.splice(i);
            }
        }
        for(let i = this.matchArrR.length - 1; i >= 0; i--){
            if(!Object.keys(servers[this.name].players).includes(this.matchArrR[i])){
                this.matchArrR.splice(i);
            }
        }
        for(let i = this.correct.length - 1; i >= 0; i--){
            if(!Object.keys(servers[this.name].players).includes(this.correct[i])){
                this.correct.splice(i);
            }
        }
        for(let i = this.incorrect.length - 1; i >= 0; i--){
            if(!Object.keys(servers[this.name].players).includes(this.incorrect[i])){
                this.incorrect.splice(i);
            }
        }
        for(const player in Object.keys(servers[this.name].players)){
            if(!this.matchArrL.includes(player) && !this.matchArrR.includes(player) && !this.matchArr.includes(player)){
                this.matchArr.push(player);
            }
        }
        
        for(const player in servers[this.name].players){
            this.getRoundInfo(connections.get(parseInt(player)).socket);
        }
        
        let noTruth = false;
        let noLie = false;
        if(!Object.keys(servers[this.name].players).includes(this.liar)){
            this.liar = null;
            noLie = true;
        }
        if(!Object.keys(servers[this.name].players).includes(this.truther)){
            this.truther = null;
            noTruth = null;
        }
        if(!noLie && noTruth){
            this.matchArr.push(this.liar);
        } else if(noLie && !noTruth){
            this.matchArr.push(this.truther);
        }
        if(noLie || noTruth){
            return "redo";
        } else {
            return "continue"
        }
    }

    prepareMatch() {
        this.phase = "prepare"
        this.update();
        if(servers[this.name].playerCount < 3){
            setTimeout(this.prepareMatch, 5 * 1000);
        } else {
            if(this.shuffleCount <= 0 || this.matchArrL.length == 0 || this.matchArrR.length == 0){
                this.shuffleCount = (servers[this.name].playerCount - (servers[this.name].playerCount % 2)) / 2;
                this.matchArr = this.matchArr.concat(this.matchArrL);
                this.matchArr = this.matchArr.concat(this.matchArrR);
                this.matchArrL = []
                this.matchArrR = []
                shuffleArray(this.matchArr);
                for(let i = 0; i < this.matchArr.length; i++){
                    if(i % 2 == 0){
                        this.matchArrL.push(this.matchArr[i]);
                    } else {
                        this.matchArrR.push(this.matchArr[i]);
                    }
                }
                this.matchArr = [];
            }
            this.liar = this.matchArrL[0];
            this.matchArrL.splice(0);
            this.truther = this.matchArrR[0];
            this.matchArrR.splice(0);
        }
    }

    giveHeadlines() {
        this.phase = "headline"
        if(servers[this.name].mature){
            this.truthIndex = Math.floor(Math.random() * headlines.true.nomature.length + headlines.true.mature.length);
            this.falseIndex = Math.floor(Math.random() * headlines.false.nomature.length + headlines.false.mature.length);
        } else {
            this.truthIndex = Math.floor(Math.random() * headlines.true.nomature.length);
            this.falseIndex = Math.floor(Math.random() * headlines.false.nomature.length);
        }
        connections.get(parseInt(this.liar)).socket.send(JSON.stringify({
            "msg":"assignment",
            "body":{
                "role":2, // Lie
                "headline": this.falseIndex,
                "liar": this.liar,
                "truther": this.truther
            }
        }));
        connections.get(parseInt(this.truther)).socket.send(JSON.stringify({
            "msg":"assignment",
            "body":{
                "role":1, // Truth
                "headline": this.truthIndex,
                "liar": this.liar,
                "truther": this.truther
            }
        }));
        for(const player in this.matchArrL){
            connections.get(parseInt(player)).socket.send(JSON.stringify({
                "msg":"assignment",
                "body":{
                    "role":3, // Audience
                    "liar": this.liar,
                    "truther": this.truther
                }
            }));
        }
        for(const player in this.matchArrR){
            connections.get(parseInt(player)).socket.send(JSON.stringify({
                "msg":"assignment",
                "body":{
                    "role":3, // Audience
                    "liar": this.liar,
                    "truther": this.truther
                }
            }));
        }
        for(const player in this.matchArr){
            connections.get(parseInt(player)).socket.send(JSON.stringify({
                "msg":"assignment",
                "body":{
                    "role":3, // Audience
                    "liar": this.liar,
                    "truther": this.truther
                }
            }));
        }

        var waitTime = 0;
        const awaitAnswers = () => {
            if(update() === "redo"){
                this.truthSubmission = null;
                this.falseSubmission = null;
                this.truthIndex = -1;
                this.falseIndex = -1;
                this.voteCount = 0;
                this.correct = [];
                this.incorrect = [];
                this.prepareMatch();
                return;
            }

            if((this.truthSubmission != null && this.falseSubmission != null) || waitTime >= 120){
                this.startVoting();
            } else {
                waitTime += 3;
                setInterval(awaitAnswers, 3 * 1000);
            }
        }
        awaitAnswers();
    }

    startVoting() {
        this.phase = "vote"
        for(const player in Object.keys(servers[this.name].players)){
            connections[player].socket.send(JSON.stringify({
                "msg":"start voting",
                "body": {
                    "t_headline": this.truthIndex,
                    "f_headline": this.falseIndex,
                    "t_submission": this.truthSubmission,
                    "f_submission": this.falseSubmission
                }
            }));
        }

        var waitTime = 0;
        const checkVotes = () => {
            this.update();
            if(this.voteCount >= servers[this.name].playerCount - ((this.liar != null) + (this.truther != null)) || waitTime >= 90){
                this.assignPoints();
            } else {
                waitTime += 3;
                setInterval(checkVotes, 3 * 1000);
            }
        }
    }

    assignPoints() {
        this.phase = "points"
        let falsePoints = 0;
        let truthPoints = 0;
        for(const player in this.correct){
            truthPoints++;
            servers[this.name].players[player].score++;
            connections.get(parseInt(player)).socket.send(JSON.stringify({
                "msg": "points",
                "body": {
                    "result": 1
                }
            }));
        }
        for(const player in this.incorrect){
            falsePoints++;
            connections.get(parseInt(player)).socket.send(JSON.stringify({
                "msg": "points",
                "body": {
                    "result": 0
                }
            }));
        }

        if(truthPoints == falsePoints){
            servers[this.name].players[this.liar].score++;
            servers[this.name].players[this.truther].score++;
            connections.get(parseInt(this.liar)).socket.send(JSON.stringify({
                "msg":"points",
                "body": {
                    "result": 2
                }
            }));
            connections.get(parseInt(this.truther)).socket.send(JSON.stringify({
                "msg":"points",
                "body": {
                    "result": 2
                }
            }));
        } else if(truthPoints < falsePoints){
            servers[this.name].players[this.liar].score++;
            connections.get(parseInt(this.liar)).socket.send(JSON.stringify({
                "msg":"points",
                "body": {
                    "result": 1
                }
            }));
            connections.get(parseInt(this.truther)).socket.send(JSON.stringify({
                "msg":"points",
                "body": {
                    "result": 0
                }
            }));
        } else if(truthPoints > falsePoints){
            servers[this.name].players[this.truther].score++;
            connections.get(parseInt(this.liar)).socket.send(JSON.stringify({
                "msg":"points",
                "body": {
                    "result": 0
                }
            }));
            connections.get(parseInt(this.truther)).socket.send(JSON.stringify({
                "msg":"points",
                "body": {
                    "result": 1
                }
            }));
        }
        setInterval(() => {
            this.matchArr.push(this.liar);
            this.matchArr.push(this.truther);
            this.liar = null;
            this.truther = null;
            this.truthSubmission = null;
            this.falseSubmission = null;
            this.truthIndex = -1;
            this.falseIndex = -1;
            this.voteCount = 0;
            this.correct = [];
            this.incorrect = [];
            this.prepareMatch();
        }, 5 * 1000);
    }

    giveTrueSubmission(message){
        this.truthSubmission = message.body.submission;
    }
    giveFalseSubmission(message){
        this.falseSubmission = message.body.submission;
    }
    giveVote(ID, message){
        if(message.body.vote == 1){
            this.correct.push(ID);
        } else {
            this.incorrect.push(ID);
        }
        this.voteCount++;
    }
}

function shuffleArray(array){
    let currentIndex = array.length, randomIndex;
    while(currentIndex > 0){
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
}

process.on('exit', function () {
    const clear = (value, key, map) => {
        value.socket.send(JSON.stringify({
            "msg":"server shutdown",
            "body":{
                "code": 503
            }
        }))
        value.socket.close();
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
