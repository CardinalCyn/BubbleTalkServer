
module.exports=(https,searchUserByUsername,getUsersInRoom,uploadMessage)=>{
    const io= require('socket.io')(https,{
        cors:{
            origin:"https://192.168.1.192:3000",
        }
    });
    //necessary for handling the socket io disconnections, since the server only has access to the socket io when a user disconnects/ closes tab. used to emit user has disconnected to rooms that they were in
    const users={};
    io.on('connection',(socket)=>{
        socket.on("connected",(username)=>{
            users[socket.id]={[username]:[]};
        })
        socket.on("enterRoom",(username,roomLink)=>{
            socket.join(roomLink);
            if(users[socket.id]){
                if(!users[socket.id][username].includes(roomLink)){
                    users[socket.id]={[username]:[...users[socket.id][username],roomLink]}
                }
            }else{
                users[socket.id]={[username]:[roomLink]}
            }
            socket.emit("enterRoomSuccessful",roomLink);
        })
        socket.on('leaveRoom',async(username,roomLink)=>{
            socket.leave(roomLink);
            if(!users[socket.id]||!users[socket.id][username]){
                io.to(socket.id).emit("socketError");
            }else{
                users[socket.id][username]=users[socket.id][username].filter(roomLinkVal=>roomLinkVal!==roomLink);
                io.to(roomLink).emit('receiveLeaveMessage',roomLink);
            }
        })
        socket.on("sendMessage",async(username,roomLink,message)=>{
            try{
                if(!roomLink||!username){
                    io.to(socket.id).emit("socketError");
                }else{
                    await uploadMessage(username,roomLink,message);
                    const searchUserResults=await searchUserByUsername(username);
                    const userProfilePicPath=searchUserResults[0].userProfilePic;
                    const imageLink=process.env.AWS_IMG_LINK+userProfilePicPath;
                    io.to(roomLink).emit("receiveMessage",username,roomLink,message,imageLink);
                }
            }catch(err){
                console.error(err);
                io.to(socket.id).emit("socketError");
            }
        })
        socket.on('getOnlineOfflineUsers',async(roomLink)=>{
            try{
                //gets all users usernames and pfps that are subscribed to room, online or offline
                const usersInRoom=await getUsersInRoom(roomLink);
                //holds all socketIds connected to room
                const clients = io.sockets.adapter.rooms.get(roomLink);
                if(clients){
                    const usernamesOnlineInRoom=[];
                    //checks array of users to find which socketId belongs to what username
                    for(const socketId of clients){
                        if(Object.keys(users[socketId])){
                            usernamesOnlineInRoom.push(Object.keys(users[socketId])[0]);
                        }
                    }
                    let offlineUsers=[];
                    let onlineUsers=[];
                    //get image data of all users, if theyre online push to online, offline to offline
                    usersInRoom.forEach(user=>{
                        const imageLink=process.env.AWS_IMG_LINK+user["userProfilePic"];
                        user["userProfilePic"]=imageLink;
                        if(usernamesOnlineInRoom.includes(user["userUsername"])){
                            onlineUsers.push(user);
                        }else{
                            offlineUsers.push(user);
                        }
                    })
                    io.to(roomLink).emit("receiveOnlineOfflineUsers",roomLink,onlineUsers,offlineUsers);
                }
            }catch(err){
                console.error(err);
                io.to(socket.id).emit("socketError");
            }
        })
        socket.on('disconnect',()=>{
            if(users[socket.id]){
                const roomsUserWasIn=Object.values(users[socket.id])[0];
                roomsUserWasIn.forEach(room=>{
                    io.to(room).emit('receiveDisconnect',room);
                    socket.leave(room);
                })
                delete users[socket.id];
            }
            socket.removeAllListeners();
        })
    })
    const emitUpdateSocketRoom=(emitTarget)=>{
        if(emitTarget["roomLink"]){
            io.to(emitTarget["roomLink"]).emit("updateSocketRooms");
        }else{
            for (const [id, userInfo] of Object.entries(users)) {
                const [username, rooms] = Object.entries(userInfo)[0];
                if (username===emitTarget["username"]) {
                    io.to(id).emit("updateSocketRooms");
                    break;
                }
            }
        } 
    }

    return emitUpdateSocketRoom;
};
