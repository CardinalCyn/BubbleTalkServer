const mysql=require("mysql");
//used to filter out the original user's name when sending a directmessage roomname to the client.
const filterRoom=require('./utils/filterString')
const filterRoomName=filterRoom.filterRoomName;
//configures
const config={
    connectionLimit:process.env.DB_CONNECTION_LIMIT,
    connectTimeout  : 60 * 1000,
    acquireTimeout  : 60 * 1000,
    timeout         : 60 * 1000,
    host:process.env.DB_HOST,
    port:process.env.DB_PORT,
    user:process.env.DB_USER,
    password:process.env.DB_PASSWORD,
}

const db=mysql.createPool(config);
db.getConnection((error, connection) => {
  if (error) {
    console.error("Error connecting to the database:", error);
  } else {
    console.log("Successfully connected to the database!");
    // Release the connection back to the pool
    connection.release();
  }
});
//given insertID, returns user info in db
const searchUserByInsertID=(insertId)=>{
    return new Promise((resolve,reject)=>{
        const searchPrefix="SELECT * FROM usertable WHERE userID = ?";
        const sqlSearchQuery=mysql.format(searchPrefix,[insertId]);
        db.query(sqlSearchQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result);
        })
    })
}
//given username, returns user info in db
const searchUserByUsername=(username)=>{
    return new Promise((resolve,reject)=>{
        const searchPrefix="SELECT * FROM usertable WHERE userUsername = ?"
        const sqlSearchQuery=mysql.format(searchPrefix,[username]);
        db.query(sqlSearchQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result);  
        })
    })
}
//given username or email, returns user info in db
const searchUserByUsernameAndEmail=(username,email)=>{
    return new Promise((resolve,reject)=>{
        const searchPrefix="SELECT * FROM usertable WHERE userUsername = ? OR userEmail = ?"
        const sqlSearchQuery=mysql.format(searchPrefix,[username,email]);
        db.query(sqlSearchQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result);
        })
    })
}
//creates user in db given user info
const createUser=(email,username,hashedPassword,pfpLink,aboutMeBio)=>{
    return new Promise((resolve,reject)=>{
        const insertPrefix="INSERT INTO usertable VALUES (0,?,?,?,?,?)";
        const sqlInsertQuery=mysql.format(insertPrefix,[email,username,hashedPassword,pfpLink,aboutMeBio]);
        db.query(sqlInsertQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result);
        })
    })
}
//updates aboutmeBio of user given their username
const updateAboutMeBio=(username,aboutMeBio)=>{
    return new Promise((resolve,reject)=>{
        const updatePrefix="UPDATE userTable SET aboutMeBio = ? WHERE userUsername = ?";
        const updateQuery=mysql.format(updatePrefix,[aboutMeBio,username]);
        db.query(updateQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result);
        })
    })
}
//updates profile picture of user given their username
const updateProfilePicture=(username,profilePicturePath)=>{
    return new Promise((resolve,reject)=>{
        const updatePrefix="UPDATE userTable SET userProfilePic= ? WHERE userUsername = ?";
        const updateQuery=mysql.format(updatePrefix,[profilePicturePath,username]);
        db.query(updateQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result);
        })
    })
}
//checks if the room of roomLink exists in the database already
const checkValidRoomLink=(roomLink)=>{
    return new Promise((resolve,reject)=>{
        const searchPrefix="SELECT * FROM rooms WHERE roomLink= ?";
        const searchQuery=mysql.format(searchPrefix,[roomLink]);
        db.query(searchQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result);
        })
    })
}
//generates valid roomlink, returns obj if unique, otherwise recursively calls itself
const generateValidRoomLink=async()=>{
    let roomLink="";
    //generates an 8 letter string with random letters and capitalized randomly
    for(let i=0;i<8;i++){
        const randomCase=Math.random();
        if(randomCase<.5){
            roomLink+=String.fromCharCode(65+Math.floor(26*Math.random()));
        }else{
            roomLink+=String.fromCharCode(97+Math.floor(26*Math.random()));
        }
    }
    try{
        //checks if a room of this roomLink exists already, regenerates if already, otherwise sends back success
        const checkValidRoomLinkResults=await checkValidRoomLink(roomLink);
        if(checkValidRoomLinkResults.length===0){
            return {status:"success",roomLink:roomLink};
        }else{
            return generateValidRoomLink();
        }
    }catch(err){
        return ({status:"error",error:err})
    }
}
//gets row associated with a userID and roomID
const checkUserInRoom=(userID,roomID)=>{
    return new Promise((resolve,reject)=>{
        const searchUserRoomsJoinedPrefix="SELECT * FROM userroomsjoined WHERE roomID = ? AND userID= ?";
        const searchUserRoomsJoinedQuery=mysql.format(searchUserRoomsJoinedPrefix,[roomID,userID]);
        db.query(searchUserRoomsJoinedQuery,async(err,result)=>{
            if(err) return reject(err)
            return resolve(result);
        })
    })
}
//creates room and joins it
const createRoom=async(username,roomName,roomType)=>{
    try{
        //generates roomlink
        const generateRoomLinkRequest=await generateValidRoomLink();
        if(generateRoomLinkRequest["status"]!=="success"){
            return generateRoomLinkRequest["error"];
        }
        const roomLink=generateRoomLinkRequest["roomLink"];
        //gets user id
        const usernameSearch=await searchUserByUsername(username);
        const userID=usernameSearch[0].userID;
        //inserts the roomname, roomlink,roomtype to be created
        const insertRoomPrefix="INSERT INTO rooms VALUES (0,?,?,?)";
        const insertRoomQuery=mysql.format(insertRoomPrefix,[roomName,roomLink,roomType]);
        //inserts the userid and roomid into userroomsjoined
        const insertUserRoomsJoinedPrefix="INSERT INTO userroomsjoined VALUES (?,?)";

        return new Promise((resolve,reject)=>{
            //transaction, rollsback if any fail or are unneeded to create the room like if the room already exists
            db.getConnection((err,connection)=>{
                if(err) return reject(err);
                connection.beginTransaction(err=>{
                    if(err) return reject(err);
                    connection.query(insertRoomQuery,async(err,result)=>{
                        if(err){
                            return connection.rollback((err)=>{
                                return reject(err);
                            });
                        }
                        const roomID=result.insertId;
                        const insertUserRoomsJoinedQuery=mysql.format(insertUserRoomsJoinedPrefix,[roomID,userID]);
                        connection.query(insertUserRoomsJoinedQuery,async(err,result)=>{
                            if(err){
                                return(connection.rollback((err)=>{
                                    connection.release();
                                    return reject(err);
                                }))
                            }
                            connection.commit((err)=>{
                                if(err){
                                    return connection.rollback(()=>{
                                        connection.release();
                                        return reject(err);
                                    })
                                }
                                connection.release();
                                return resolve({status:"success",roomName:roomName,roomLink:roomLink});
                            })
                        })
                    })
                })
            })
        })
    }catch(err){
        console.error(err);
        return reject(err);
    }
}
//checks directMessageRooms to see if there is a duplicate dm or not. if there is a dm, and the user is in it, itll return already created, otherwise inserts row
const searchDirectRoom=async(roomName,userID)=>{
    return new Promise((resolve,reject)=>{
        //searches for rooms where the roomname is roomname, and the roomtype is directmessages
        const searchRoomsPrefix = "SELECT * FROM rooms WHERE roomName = ? AND roomType = 'direct'"
        const searchRoomsQuery=mysql.format(searchRoomsPrefix,[roomName]);
        db.query(searchRoomsQuery,async(err,result)=>{
            if(err) return reject(err);
            //if there wasn't any rooms of this name, returns creatable, so dm room will be created
            if(result.length===0) return resolve("creatable");
            const roomID=result[0]["roomID"];
            const roomLink=result[0]["roomLink"];
            //searches for rows with the roomid and userid
            const searchUserRoomsPrefix = "SELECT * FROM userroomsjoined WHERE roomID = ? AND userID= ?";
            const searchUserRoomsQuery=mysql.format(searchUserRoomsPrefix,[roomID,userID]);
            db.query(searchUserRoomsQuery,[roomID,userID],async(err,result)=>{
                if(err) return reject(err);
                //if the result.length is 0, it returns that they're already in room, otherwise, it'll insert them into the room. this is if they leave the dm room, or if they join someone elses
                if(result.length!==0) return resolve({status:"userAlreadyInRoom",roomLink:roomLink});
                const insertUserRoomsJoinedPrefix="INSERT INTO userroomsjoined VALUES(?,?)";
                const insertUserRoomsJoinedQuery=mysql.format(insertUserRoomsJoinedPrefix,[roomID,userID]);
                db.query(insertUserRoomsJoinedQuery,async(err,result)=>{
                    if(err) return reject(err);
                    return resolve({status:"joinedExistingDm",roomLink:roomLink});
                })
            })
        })
    })
}
//creates directMessageRoom named after the users. checks if an existing dm exists or not, then creates room, then inserts user
const createDirectRoom=async(userUsername,usernameToDm)=>{
    try{
        const userUsernameSearch=await searchUserByUsername(userUsername);
        const userUserID=userUsernameSearch[0].userID;
        const usernameToDmSearch=await searchUserByUsername(usernameToDm);
        const userToDmID=usernameToDmSearch[0].userID;
        //creates unique name based on the usernames for the roomname. this roomname will be filtered out later so clientside will just show the other person's name
        const sortedUsernames = [userUsername, usernameToDm].sort();
        const roomName = sortedUsernames.join('/');
        const searchResults=await searchDirectRoom(roomName,userUserID);
        if(searchResults["status"]==="userAlreadyInRoom"||searchResults["status"]==="joinedExistingDm"){
            return {status:searchResults,roomLink:searchResults["roomLink"]};
        }

        const generateRoomLinkRequest=await generateValidRoomLink();
        if(generateRoomLinkRequest["status"]!=="success"){
            return generateRoomLinkRequest["error"];
        }
        const roomLink=generateRoomLinkRequest["roomLink"];

        const insertRoomPrefix="INSERT INTO rooms VALUES (0,?,?,?)";
        const insertRoomQuery=mysql.format(insertRoomPrefix,[roomName,roomLink,"direct"]);
        const insertUserRoomsJoinedPrefix="INSERT INTO userroomsjoined VALUES (?,?),(?,?)";

        return new Promise(async(resolve,reject)=>{
            db.getConnection((err,connection)=>{
                if(err) return reject(err);
                connection.beginTransaction(err=>{
                    if(err) return reject(err);
                    connection.query(insertRoomQuery,async(err,result)=>{
                        if(err){
                            connection.rollback();
                            connection.release();
                            return reject(err);
                        }
                        const roomID=result.insertId;
                        const insertUserRoomsJoinedQuery=mysql.format(insertUserRoomsJoinedPrefix,[roomID,userUserID,roomID,userToDmID]);
                        connection.query(insertUserRoomsJoinedQuery,async(err,result)=>{
                            if(err){
                                connection.rollback();
                                connection.release();
                                return reject(err);
                            }
                            connection.commit((err)=>{
                                if(err){
                                    connection.rollback();
                                    connection.release();
                                    return reject(err);
                                }
                                connection.release();
                                return resolve({status:"success",roomLink:roomLink});
                            })
                        })
                    })
                })
            })
        })
    }catch(err){
        console.error(err);
        return "directRoomNotCreated";
    }
}
//converts room to group, done when a 3rd person joins a dm
const convertRoomToGroup=(roomID)=>{
    return new Promise((resolve,reject)=>{
        const convertPrefix="UPDATE rooms SET roomType= ? WHERE roomID= ?";
        const convertQuery=mysql.format(convertPrefix,["group",roomID]);
        db.query(convertQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve("converted");
        })
    })
}
//user joins room
const joinRoom=async(username,roomLink)=>{
    return new Promise(async(resolve,reject)=>{
        try{
            const roomLinkValid=await checkValidRoomLink(roomLink);
            if(roomLinkValid.length===0){
                return resolve({status:"invalidRoom"})
            }
            const roomID=roomLinkValid[0]["roomID"];
            const usernameValid=await searchUserByUsername(username);
            const userID=usernameValid[0]["userID"];
            const roomType=roomLinkValid[0]["roomType"];
            let convertedToGroup=false;
            if(roomType==="direct"){
                try{
                    await convertRoomToGroup(roomID);
                    convertedToGroup=true;
                }catch(err){
                    console.error(err);
                    return reject(err);
                }
            }
            const validRoom= await checkUserInRoom(userID,roomID);
            if(validRoom.length){
                return resolve({status:"userAlreadyInRoom"});
            }
        
            const insertUserRoomsJoinedPrefix="INSERT INTO userroomsjoined VALUES(?,?)";
            const insertUserRoomsJoinedQuery=mysql.format(insertUserRoomsJoinedPrefix,[roomID,userID]);
            db.query(insertUserRoomsJoinedQuery,async(err,result)=>{
                if(err) return reject(err);
                return resolve({status:"userJoinedRoom",roomLink:roomLink,roomName:roomLinkValid[0]["roomName"],convertedToGroup:convertedToGroup});
            })
        }catch(err){
            console.error(err);
            return reject(err);
        }
    })
}
//deletes room, used when no more users in room
const deleteRoom=async(roomID)=>{
    return new Promise((resolve,reject)=>{
        db.getConnection((err,connection)=>{
            if(err) return reject(err);
            connection.beginTransaction(err=>{
                if(err) return reject(err);
                const deleteMessagesPrefix="DELETE FROM messages WHERE roomID= ?";
                const deleteMessagesQuery=mysql.format(deleteMessagesPrefix,[roomID]);
                connection.query(deleteMessagesQuery,async(err,result)=>{
                    if(err){
                        connection.rollback();
                        connection.release();
                        return reject(err);
                    }
                    const deleteRoomPrefix="DELETE FROM rooms WHERE roomID= ?";
                    const deleteRoomQuery=mysql.format(deleteRoomPrefix,[roomID]);
                    connection.query(deleteRoomQuery,async(err,result)=>{
                        if(err){
                            connection.rollback();
                            connection.release();
                            return reject(err);
                        }
                        connection.commit((err)=>{
                            if(err){
                                return connection.rollback((err)=>{
                                    connection.release();
                                    return reject(err);
                                })
                            }
                            connection.release();
                            return resolve({status:"success"});
                        })
                    })
                })
            })
        })
    })
}
//user is removed from room
const leaveRoom=async(username,roomLink)=>{
    try{
        const usernameIDResults=await(searchUserByUsername(username));
        const userID=usernameIDResults[0]["userID"]
        const room=await(checkValidRoomLink(roomLink));
        const roomID= room[0]["roomID"]
    
        return new Promise((resolve,reject)=>{
            const deleteUserRoomsRowPrefix="DELETE FROM userroomsjoined WHERE userID= ? AND roomID= ?";
            const deleteUserRoomsRowQuery=mysql.format(deleteUserRoomsRowPrefix,[userID,roomID]);
            db.query(deleteUserRoomsRowQuery,async(err,result)=>{
                if(err) return reject(err);
                const userCountInRoomPrefix= "SELECT COUNT(*) AS numUsers FROM userroomsjoined WHERE roomID= ?";
                const userCountInRoomQuery=mysql.format(userCountInRoomPrefix,[roomID]);
                db.query(userCountInRoomQuery,async(err,result)=>{
                    if(err) return reject(err);
                    const userCount=result[0]["numUsers"];
                    if(userCount===0){
                        try{
                            const deleteRoomRequest=await deleteRoom(roomID);
                            if(deleteRoomRequest["status"]==="success") return resolve("userLeft");
                            return reject("userLeftErr");

                        }catch(err){
                            return reject(err);
                        }
                    }
                    return resolve("userLeft");
                })
            })
        })
    }catch(err){
        return {status:"userLeftFailed"};
    }
}
//gets room info from roomid
const getRoomFromRoomID=(roomID)=>{
    return new Promise((resolve,reject)=>{
        const selectRoomPrefix="SELECT * FROM rooms WHERE roomID= ?";
        const selectRoomQuery=mysql.format(selectRoomPrefix,[roomID]);
        db.query(selectRoomQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result[0]);
        })
    })
}
//gets all rooms related to user based on userid, returns array of rooms associated with user
const getRoomsJoined=async(username)=>{
    const userNameResults=await searchUserByUsername(username);
    const userID= userNameResults[0]["userID"];
    return new Promise((resolve,reject)=>{
        const searchUserRoomsJoinedPrefix="SELECT * FROM userroomsjoined WHERE userID= ?";
        const searchUserRoomsJoinedQuery=mysql.format(searchUserRoomsJoinedPrefix,[userID]);
        db.query(searchUserRoomsJoinedQuery,async(err,result)=>{
            if(err) return reject(err);
            let arrRooms=[];
            for(let i=0;i<result.length;i++){
                const getRoom=await getRoomFromRoomID(result[i]["roomID"]);
                let roomObjWithoutID;
                if(getRoom["roomType"]==="direct"){
                    roomObjWithoutID={roomName:filterRoomName(getRoom["roomName"],username),roomLink:getRoom["roomLink"],roomType:getRoom["roomType"]};
                }else{
                    roomObjWithoutID={roomName:getRoom["roomName"],roomLink:getRoom["roomLink"],roomType:getRoom["roomType"]}
                }
                arrRooms.push(roomObjWithoutID);
            }
            return resolve(arrRooms);
        })
    })
}
//gets all users in room, returns their profile pic and username
const getUsersInRoom=async(roomLink)=>{
    return new Promise((resolve,reject)=>{
        if(!roomLink) return reject("no roomlink");
        const searchUsersInRoomPrefix="SELECT usertable.userProfilePic, usertable.userUsername FROM usertable JOIN userroomsjoined ON usertable.userID = userroomsjoined.userID JOIN rooms ON userroomsjoined.roomID = rooms.roomID WHERE rooms.roomLink = ?";
        const searchUsersInRoomQuery=mysql.format(searchUsersInRoomPrefix,roomLink);
        db.query(searchUsersInRoomQuery,async(err,result)=>{
            if(err) return reject(err);
            return resolve(result);
        })
    })
}
//saves message to db
const uploadMessage=(username,roomLink,message)=>{
    return new Promise(async(resolve,reject)=>{
        try{
            const roomCheckResults=await checkValidRoomLink(roomLink);
            if(!roomCheckResults.length) return reject("roomInvalid");
            const roomID=roomCheckResults[0]["roomID"];
            const searchUserResults=await searchUserByUsername(username);
            const userID=searchUserResults[0]["userID"];
            const uploadMessagePrefix="INSERT INTO messages VALUES (0,?,?,?,NOW())";
            const uploadMessageQuery=mysql.format(uploadMessagePrefix,[message,roomID,userID]);
            db.query(uploadMessageQuery,(err,result)=>{
                if(err) return reject(err);
                return resolve(result);
            })
        }catch(err){
            console.error(err);
            return reject(err);
        }
        
    })
}
//returns messages ordered by time inserted, has an offset so that based on how far user has scrolled, they'll get different messages
const getMessagesInRoom=(roomLink,offset)=>{
    return new Promise(async(resolve,reject)=>{
        const roomCheckResults=await checkValidRoomLink(roomLink);
        if(!roomCheckResults.length) return reject("noRoomFound");
        const roomID=roomCheckResults[0]["roomID"];
        const searchMessagesPrefix="SELECT * from messages WHERE roomID= ? ORDER BY messageID DESC LIMIT 50 OFFSET ?";
        const searchMessagesQuery=mysql.format(searchMessagesPrefix,[roomID,offset]);
        db.query(searchMessagesQuery,(err,result)=>{
            if(err) return reject(err);
            return resolve(result);
        })
    })
}
module.exports={db,searchUserByInsertID,searchUserByUsername,searchUserByUsernameAndEmail,createUser,updateProfilePicture,createRoom,createDirectRoom,joinRoom,leaveRoom,getRoomsJoined,getUsersInRoom,getMessagesInRoom,uploadMessage,getMessagesInRoom,updateAboutMeBio}
