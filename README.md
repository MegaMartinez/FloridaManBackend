# Florida Man Backend

Do 'npm start' to run normally (output goes to serverLog)\
Do 'npm test' to run test mode (output goes to terminal)

## API

```
{
    "msg":"header"
    "body": {
        "Contents here": 123
    }
}
```

#### Client-Originiated Headers
- set name
    - name: {self-chosen name}
- make server
    - serverName: {a unique server name}
- get servers
    - no body
- join server
    - serverName: {name of server you want to join}
- leave server
    - serverName: {server you're leaving}
- give true submission
    - serverName: {server you're playing in}
    - submission: {your submitted indicies of factoids}
- give false submission
    - serverName: {server you're playing in}
    - submission: {your submitted indicies of factoids}
- give vote
    - serverName: {server you're playing in}
    - vote: {the id of the one you're voting for (0 incorrect, 1 correct, player doesn't know)}

#### Server-Originated Headers
- err
    - code: {response code}
- get name
    - no body
- name accepted
    - code: 200
- recv servers
    - servers: {list of server names and player counts}
- server joined
    - body === {all server info}
- left server
    - code: 200
- server created
    - serverName: {server's name}
- round info
    - body === {all round info from server}
- assignment
    - role: {role id}
    - headline: {headline index} (optional: dependent on role)
    - liar: {liar id}
    - truther: {truther id}
- start voting
    - t_headline: {true headline index}
    - f_headline: {false headline index}
    - t_submission: {true factoid submissions}
    - f_submission: {false factoid submissions}
- points
    - resut: {result id}
- server shutdown
    - code: 503