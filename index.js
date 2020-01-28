const data = {
  rooms: {
    "123456": {
      admin: {
        username: "aUserName",
      },
      users: [
        // {
        //   username: "aUserName",
        //   vote: 20,
        //   connection: {},
        // },
        // {
        //   username: "flap",
        //   vote: 15
        // },
      ],
      chat: [
        {
          username: "aUserName",
          message: "hello",
        }
      ],
      password: 'passwordForUser',
      secret: "secretForAdmin",
      name: "descriptiveRoomName",
    }
  }
};

const bodyParser = require('body-parser');
const app = require('express')();
const expressWs = require('express-ws')(app);
const shortid = require('shortid');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(require('morgan')());

app.use(cors());


app.post('/', (req, res) => {
  const { roomName: name , password, username } = req.body;
  const roomId = shortid.generate();
  const secret = shortid.generate();

  data.rooms[roomId] = {
    admin: {
      username,
    },
    users: [],
    chat: [],
    name,
    password,
    roomId,
    secret,
  }
  console.log('create room', data.rooms[roomId]);

  return res.send({
    roomId, secret,
  });
});

const broadcast = (users, message) => {
  users.forEach(user => user.connection.send(message));
}

app.ws('/room', (ws, req, next) => {
  try {
      const rooms = data.rooms;
    
      const { roomId, password, username } = req.query;
      if (!roomId || !username) {
        ws.send(JSON.stringify({
          event: 'error',
          data: 'no room id or username specified',
        }));
        ws.terminate();
      }
      
      const currentRoom = rooms[roomId];
      if (!currentRoom || currentRoom.password && currentRoom.password !== password) {
        console.log(currentRoom);
        console.log("invalid room");
        ws.send(JSON.stringify({
          event: 'error',
          data:"Invalid room name or password",
        }))
        ws.terminate();
        return;
      }
    
      const user = currentRoom.users[username];
      if (!user) {
        token = shortid.generate(); // random token for user
        broadcast(currentRoom.users, JSON.stringify({
          event: 'join',
          data: {
            username,
          }
        }));
        broadcast(currentRoom.users, JSON.stringify({
          event: 'system',
          data: `${username} has joined the room`,
        }));  
        currentRoom.users.push({
          username,
          // token: generatedToken,
          vote: null,
          connection: ws,
        })
      } else {
        ws.send(JSON.stringify({
          event: 'error',
          data:"That username already exist",
        }))
        ws.terminate();
      }
      ws.send(JSON.stringify({
        event: 'info',
        data: {
          ...currentRoom,
          users: currentRoom.users.map(user => ({
            username: user.username,
            vote: null,
          }))
        }
      }));
    
      ws.on('message', (msg) => {
        msg = msg.trim();
        console.log(msg);
        try {
          const { type, payload } = JSON.parse(msg);
          let message;
          switch (type) {
            case 'chat':
              message = JSON.stringify({
                event: 'chat',
                data: {
                  username,
                  message: payload,
                }
              });
              currentRoom.chat.push({
                username,
                message: payload,
              })
              broadcast(currentRoom.users, message);
              break;
            case 'vote':
              currentRoom.users.forEach(roomMember => {
                if (roomMember.username === username) {
                  roomMember.vote = payload;
                }
              })
              ws.send(JSON.stringify({
                event: 'system',
                data: `you voted ${payload}`,
              }));
              break;
            case 'reveal':
              message = JSON.stringify(
                {
                  event: 'reveal',
                  data: currentRoom.users.map(roomMember => {
                    const { username, vote } = roomMember;
                    return { username, vote };
                  })
                }
              );
              broadcast(currentRoom.users, message);
              broadcast(currentRoom.users, JSON.stringify({
                event: 'system',
                data: 'vote revealed! discuss now',
              }));
              break; // broadcast 
            case 'nextRound':
              console.log('next')
              message = JSON.stringify(
                {
                  event: 'nextRound',
                  data: currentRoom.users.map(roomMember => {
                    const { username } = roomMember;
                    return { username };
                  })
                }
              );
              broadcast(currentRoom.users, message);
              broadcast(currentRoom.users, JSON.stringify({
                event: 'system',
                data: 'next round started',
              }));
              break;
            case 'info':
              message = JSON.stringify({
                event: 'info',
                data: {
                  ...currentRoom,
                  users: currentRoom.users.map(user => ({
                    username: user.username,
                    vote: null,
                  }))
                }
              });
              ws.send(message);
              break;
          }
    
        } catch (err) {
          console.error(err)
          console.log('bad json', msg);
          return;
        }
      })
    
      ws.on('close', () => {
        console.log('bye');
        const idx = currentRoom.users.findIndex(roomMember => roomMember.connection == ws);
        if (idx !== -1) currentRoom.users.splice(idx, 1);
        broadcast(currentRoom.users, JSON.stringify({
          event: 'leave',
          data: {
            username,
          }
        }))
      })
  } catch (err) {
    console.error(err);
  }
})
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`port ${PORT}`))